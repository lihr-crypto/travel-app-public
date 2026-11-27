import CoreLocation
import MapKit

struct ApplePlacesSearchResult: Sendable {
  var providerPlaceId: String?
  var name: String
  var address: String?
  var latitude: Double
  var longitude: Double
  var regionLabel: String?
  var types: [String]
  var countryCode: String?
}

struct ApplePlacesReverseResult: Sendable {
  var providerPlaceId: String?
  var name: String?
  var formattedAddress: String?
  var regionLabel: String?
  var countryCode: String?
}

enum ApplePlacesClientError: Error, Sendable, Equatable {
  case invalidQuery
  case unsupportedCursor
  case placemarkNotFound
  case loadingThrottled
  case providerFailure(domain: String, code: Int)

  static func classify(_ error: Error) -> Self {
    if let clientError = error as? Self { return clientError }
    let nsError = error as NSError
    guard nsError.domain == MKError.errorDomain,
          nsError.code >= 0,
          let code = MKError.Code(rawValue: UInt(nsError.code)) else {
      return .providerFailure(domain: nsError.domain, code: nsError.code)
    }
    switch code {
    case .placemarkNotFound:
      return .placemarkNotFound
    case .loadingThrottled:
      return .loadingThrottled
    default:
      return .providerFailure(domain: nsError.domain, code: nsError.code)
    }
  }
}

private final class MainActorCancellationRelay<Operation: AnyObject>: @unchecked Sendable {
  private let operation: Operation
  private let cancelOperation: @MainActor @Sendable (Operation) -> Void

  init(
    operation: Operation,
    cancel: @escaping @MainActor @Sendable (Operation) -> Void
  ) {
    self.operation = operation
    cancelOperation = cancel
  }

  func cancel() {
    Task { @MainActor in cancelOperation(operation) }
  }
}

@available(iOS 16.4, *)
@MainActor
final class ApplePlacesClient {
  static let shared = ApplePlacesClient()

  func search(
    keyword: String,
    center: CLLocationCoordinate2D?,
    limit: Int,
    cursor: String?
  ) async throws -> [ApplePlacesSearchResult] {
    let keyword = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !keyword.isEmpty, limit > 0 else {
      throw ApplePlacesClientError.invalidQuery
    }
    if let cursor, !cursor.isEmpty {
      throw ApplePlacesClientError.unsupportedCursor
    }
    if let center, !CLLocationCoordinate2DIsValid(center) {
      throw ApplePlacesClientError.invalidQuery
    }

    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = keyword
    request.resultTypes = [.address, .pointOfInterest]
    if let center {
      // A center is a ranking hint. With no center we leave region unset so the
      // natural-language query, including explicit city/airport terms, stands alone.
      request.region = MKCoordinateRegion(
        center: center,
        span: MKCoordinateSpan(latitudeDelta: 0.35, longitudeDelta: 0.35)
      )
    }

    let search = MKLocalSearch(request: request)
    let cancellation = MainActorCancellationRelay(operation: search) { $0.cancel() }
    let response: MKLocalSearch.Response
    do {
      response = try await withTaskCancellationHandler {
        try await search.start()
      } onCancel: {
        cancellation.cancel()
      }
    } catch {
      if Task.isCancelled { throw CancellationError() }
      switch ApplePlacesClientError.classify(error) {
      case .placemarkNotFound:
        return []
      case let failure:
        throw failure
      }
    }

    return response.mapItems
      .prefix(min(limit, 25))
      .compactMap(searchResult(for:))
  }

  func reverseGeocode(
    latitude: Double,
    longitude: Double
  ) async throws -> ApplePlacesReverseResult? {
    guard CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(
      latitude: latitude,
      longitude: longitude
    )) else {
      throw ApplePlacesClientError.invalidQuery
    }
    let location = CLLocation(latitude: latitude, longitude: longitude)

    if #available(iOS 26.0, macOS 26.0, *) {
      guard let request = MKReverseGeocodingRequest(location: location) else {
        throw ApplePlacesClientError.invalidQuery
      }
      request.preferredLocale = Locale(identifier: "zh-CN")
      let cancellation = MainActorCancellationRelay(operation: request) { $0.cancel() }
      do {
        let mapItems = try await withTaskCancellationHandler {
          try await request.mapItems
        } onCancel: {
          cancellation.cancel()
        }
        guard let mapItem = mapItems.first else { return nil }
        let result = searchResult(for: mapItem)
        return ApplePlacesReverseResult(
          providerPlaceId: result?.providerPlaceId,
          name: result?.name,
          formattedAddress: result?.address,
          regionLabel: mapItem.addressRepresentations?.regionName
            ?? mapItem.addressRepresentations?.cityName,
          countryCode: mapItem.addressRepresentations?.region?.identifier
        )
      } catch {
        if Task.isCancelled { throw CancellationError() }
        switch ApplePlacesClientError.classify(error) {
        case .placemarkNotFound:
          return nil
        case let failure:
          throw failure
        }
      }
    }

#if os(iOS)
    let geocoder = CLGeocoder()
    do {
      let placemarks = try await withTaskCancellationHandler {
        try await geocoder.reverseGeocodeLocation(
          location,
          preferredLocale: Locale(identifier: "zh-CN")
        )
      } onCancel: {
        Task { @MainActor in geocoder.cancelGeocode() }
      }
      guard let placemark = placemarks.first else { return nil }
      return ApplePlacesReverseResult(
        providerPlaceId: nil,
        name: normalized(placemark.name),
        formattedAddress: formattedAddress(for: placemark),
        regionLabel: normalized(placemark.country)
          ?? normalized(placemark.locality)
          ?? normalized(placemark.administrativeArea),
        countryCode: normalized(placemark.isoCountryCode)
      )
    } catch {
      if Task.isCancelled { throw CancellationError() }
      switch ApplePlacesClientError.classify(error) {
      case .placemarkNotFound:
        return nil
        case let failure:
          throw failure
      }
    }
#else
    return nil
#endif
  }

  private func searchResult(for item: MKMapItem) -> ApplePlacesSearchResult? {
    let coordinate: CLLocationCoordinate2D
    let address: String?
    let regionLabel: String?
    let countryCode: String?

    if #available(iOS 26.0, macOS 26.0, *) {
      coordinate = item.location.coordinate
      address = normalized(item.addressRepresentations?.fullAddress(
        includingRegion: true,
        singleLine: true
      )) ?? normalized(item.address?.fullAddress)
      regionLabel = normalized(item.addressRepresentations?.cityName)
        ?? normalized(item.addressRepresentations?.regionName)
      countryCode = normalized(item.addressRepresentations?.region?.identifier)
    } else {
      let placemark = item.placemark
      coordinate = placemark.coordinate
      address = formattedAddress(for: placemark)
      regionLabel = normalized(placemark.locality)
        ?? normalized(placemark.administrativeArea)
        ?? normalized(placemark.country)
      countryCode = normalized(placemark.isoCountryCode)
    }
    guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }

    let name = normalized(item.name) ?? address ?? ""
    let category = item.pointOfInterestCategory?.rawValue
    return ApplePlacesSearchResult(
      providerPlaceId: mapItemIdentifier(item),
      name: name,
      address: address,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      regionLabel: regionLabel,
      types: category.map { [$0] } ?? [],
      countryCode: countryCode
    )
  }

  private func mapItemIdentifier(_ item: MKMapItem) -> String? {
    guard #available(iOS 18.0, macOS 15.0, *) else { return nil }
    return normalized(item.identifier?.rawValue)
  }

  private func formattedAddress(for placemark: CLPlacemark) -> String? {
    let street = [normalized(placemark.subThoroughfare), normalized(placemark.thoroughfare)]
      .compactMap { $0 }
      .joined(separator: " ")
    let cityLine = [normalized(placemark.postalCode), normalized(placemark.locality)]
      .compactMap { $0 }
      .joined(separator: " ")
    let components = [
      normalized(placemark.name),
      street.isEmpty ? nil : street,
      cityLine.isEmpty ? nil : cityLine,
      normalized(placemark.subAdministrativeArea),
      normalized(placemark.administrativeArea),
      normalized(placemark.country),
    ].compactMap { $0 }
    let uniqueComponents = components.reduce(into: [String]()) { values, component in
      if values.last != component { values.append(component) }
    }
    return uniqueComponents.isEmpty ? nil : uniqueComponents.joined(separator: ", ")
  }

  private func normalized(_ value: String?) -> String? {
    let value = value?.trimmingCharacters(in: .whitespacesAndNewlines)
    return value?.isEmpty == false ? value : nil
  }
}
