import Foundation
import CoreLocation
import ExpoModulesCore

struct ApplePlacesSearchCenter: Record {
  @Field var latitude: Double
  @Field var longitude: Double
}

struct ApplePlacesSearchQuery: Record {
  @Field var keyword: String
  @Field var center: ApplePlacesSearchCenter?
  @Field var limit: Int = 10
  @Field var cursor: String?
}

struct ApplePlacesReverseGeocodeQuery: Record {
  @Field var latitude: Double
  @Field var longitude: Double
}

final class ApplePlacesFailure: Exception, @unchecked Sendable {
  private let failureCode: String
  private let failureReason: String

  init(code: String, reason: String) {
    failureCode = code
    failureReason = reason
    super.init()
  }

  override var code: String { failureCode }
  override var reason: String { failureReason }
}

private func applePlacesFailure(for error: Error) -> ApplePlacesFailure {
  if let clientError = error as? ApplePlacesClientError {
    switch clientError {
    case .invalidQuery:
      return ApplePlacesFailure(
        code: "ERR_APPLE_PLACES_INVALID_QUERY",
        reason: "Apple Places search or coordinate is invalid."
      )
    case .unsupportedCursor:
      return ApplePlacesFailure(
        code: "ERR_APPLE_PLACES_INVALID_QUERY",
        reason: "Apple Places does not support search continuation cursors."
      )
    case .placemarkNotFound:
      return ApplePlacesFailure(
        code: "ERR_APPLE_PLACES_NO_RESULT",
        reason: "Apple Maps did not find a matching placemark."
      )
    case .loadingThrottled:
      return ApplePlacesFailure(
        code: "ERR_APPLE_PLACES_THROTTLED",
        reason: "Apple Maps is temporarily limiting place requests."
      )
    case .providerFailure(let domain, let code):
      return ApplePlacesFailure(
        code: "ERR_APPLE_PLACES_PROVIDER",
        reason: "Apple Places provider request failed (\(domain), code \(code))."
      )
    }
  }
  if error is CancellationError {
    return ApplePlacesFailure(
      code: "ERR_APPLE_PLACES_CANCELLED",
      reason: "Apple Places request was cancelled."
    )
  }
  let nsError = error as NSError
  return ApplePlacesFailure(
    code: "ERR_APPLE_PLACES_PROVIDER",
    reason: "Apple Places provider request failed (\(nsError.domain), code \(nsError.code))."
  )
}

private func nativeDictionary(for result: ApplePlacesSearchResult) -> [String: Any] {
  var value: [String: Any] = [
    "providerPlaceId": result.providerPlaceId.map { $0 as Any } ?? NSNull(),
    "name": result.name,
    "address": result.address.map { $0 as Any } ?? NSNull(),
    "latitude": result.latitude,
    "longitude": result.longitude,
    "regionLabel": result.regionLabel.map { $0 as Any } ?? NSNull(),
  ]
  if !result.types.isEmpty { value["types"] = result.types }
  if let countryCode = result.countryCode { value["countryCode"] = countryCode }
  return value
}

private func nativeDictionary(for result: ApplePlacesReverseResult) -> [String: Any] {
  var value: [String: Any] = [
    "providerPlaceId": result.providerPlaceId.map { $0 as Any } ?? NSNull(),
    "name": result.name.map { $0 as Any } ?? NSNull(),
    "formattedAddress": result.formattedAddress.map { $0 as Any } ?? NSNull(),
    "regionLabel": result.regionLabel.map { $0 as Any } ?? NSNull(),
  ]
  if let countryCode = result.countryCode { value["countryCode"] = countryCode }
  return value
}

public class ExpoApplePlacesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoApplePlaces")

    AsyncFunction("initializeAsync") { () async -> Bool in
      // MapKit is available without an API key or provider initialization.
      true
    }

    AsyncFunction("searchAsync") {
      (query: ApplePlacesSearchQuery) async throws -> [String: Any] in
      let center = query.center.map {
        CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)
      }
      let results: [ApplePlacesSearchResult]
      do {
        results = try await ApplePlacesClient.shared.search(
          keyword: query.keyword,
          center: center,
          limit: query.limit,
          cursor: query.cursor
        )
      } catch {
        throw applePlacesFailure(for: error)
      }
      return [
        "results": results.map(nativeDictionary),
        "nextCursor": NSNull(),
        "suggestions": [String](),
      ]
    }

    AsyncFunction("reverseGeocodeAsync") {
      (query: ApplePlacesReverseGeocodeQuery) async throws -> [String: Any]? in
      do {
        guard let result = try await ApplePlacesClient.shared.reverseGeocode(
          latitude: query.latitude,
          longitude: query.longitude
        ) else {
          return nil
        }
        return nativeDictionary(for: result)
      } catch {
        throw applePlacesFailure(for: error)
      }
    }
  }
}
