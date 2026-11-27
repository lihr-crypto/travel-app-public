import ExpoModulesCore
import CoreLocation
import GoogleMaps
import GooglePlacesSwift

struct GooglePlacesSearchCenter: Record {
  @Field var latitude: Double
  @Field var longitude: Double
}

struct GooglePlacesSearchQuery: Record {
  @Field var keyword: String
  @Field var city: String?
  @Field var countryCode: String?
  @Field var center: GooglePlacesSearchCenter?
  @Field var limit: Int = 10
  @Field var cursor: String?
}

struct GoogleReverseGeocodeQuery: Record {
  @Field var latitude: Double
  @Field var longitude: Double
}

@MainActor
enum GooglePlacesRuntimeConfiguration {
  // Read by Expo functions that are explicitly dispatched to the main queue.
  nonisolated(unsafe) static var configured = false

  static var apiKey: String? {
    let key = Bundle.main.object(forInfoDictionaryKey: "GMSApiKey") as? String
    return key?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? key : nil
  }

  static func configure() -> Bool {
    if configured { return true }
    guard let apiKey else {
      configured = false
      return false
    }

    // react-native-maps config initializes GMSServices exactly once in AppDelegate.
    // This module owns only the Places client initialization.
    configured = PlacesClient.provideAPIKey(apiKey)
    return configured
  }

  static func isConfigured() -> Bool {
    configured && apiKey != nil
  }

  static func client() -> PlacesClient? {
    isConfigured() ? PlacesClient.shared : nil
  }
}

/// ExpoModulesCore serializes `Exception.reason` to JavaScript, while the base
/// implementation always returns the literal "undefined reason" and ignores the
/// `description` passed to `Promise.reject(_:_:)`. Carrying the provider failure
/// text on a subclass that overrides `reason` keeps Google errors diagnosable.
final class GooglePlacesFailure: Exception {
  private let failureCode: String
  private let failureReason: String

  init(
    code: String,
    reason: String,
    file: String = #fileID,
    line: UInt = #line,
    function: String = #function
  ) {
    self.failureCode = code
    self.failureReason = reason
    super.init(file: file, line: line, function: function)
  }

  override var code: String { failureCode }
  override var reason: String { failureReason }
}

final class GoogleGeocoderClient {
  private let geocoder = GMSGeocoder()

  func reverseGeocode(query: GoogleReverseGeocodeQuery, promise: Promise) {
    guard GooglePlacesRuntimeConfiguration.configured else {
      promise.reject(GooglePlacesFailure(
        code: "ERR_GOOGLE_PLACES_NOT_CONFIGURED",
        reason: "Google Maps reverse geocoding requires an initialized iOS key."
      ))
      return
    }
    guard query.latitude.isFinite,
          query.longitude.isFinite,
          (-90...90).contains(query.latitude),
          (-180...180).contains(query.longitude) else {
      promise.reject(GooglePlacesFailure(
        code: "ERR_GOOGLE_PLACES_INVALID_QUERY",
        reason: "Google Maps reverse-geocode coordinate is invalid."
      ))
      return
    }

    let coordinate = CLLocationCoordinate2D(
      latitude: query.latitude,
      longitude: query.longitude
    )
    geocoder.reverseGeocodeCoordinate(coordinate) { response, error in
      if let error {
        promise.reject(GooglePlacesFailure(
          code: "ERR_GOOGLE_PLACES_PROVIDER",
          reason: error.localizedDescription
        ))
        return
      }
      guard let address = response?.firstResult() else {
        promise.resolve(nil)
        return
      }
      promise.resolve(self.serialize(address))
    }
  }

  private func serialize(_ address: GMSAddress) -> [String: Any] {
    var result: [String: Any] = [:]
    let lines = address.lines?.compactMap(normalized) ?? []
    if !lines.isEmpty {
      result["formattedAddress"] = lines.joined(separator: ", ")
    }
    add(normalized(address.thoroughfare), to: &result, key: "thoroughfare")
    add(normalized(address.locality), to: &result, key: "locality")
    add(normalized(address.subLocality), to: &result, key: "subLocality")
    add(normalized(address.administrativeArea), to: &result, key: "administrativeArea")
    add(normalized(address.postalCode), to: &result, key: "postalCode")
    add(normalized(address.country), to: &result, key: "country")
    return result
  }

  private func normalized(_ value: String?) -> String? {
    let value = value?.trimmingCharacters(in: .whitespacesAndNewlines)
    return value?.isEmpty == false ? value : nil
  }

  private func add(_ value: String?, to result: inout [String: Any], key: String) {
    if let value { result[key] = value }
  }
}

private func providerException(_ error: PlacesError) -> Exception {
  let code: String
  switch error {
  case .keyInvalid, .keyExpired, .accessNotConfigured, .incorrectBundleIdentifier:
    code = "ERR_GOOGLE_PLACES_NOT_CONFIGURED"
  case .invalidRequest:
    code = "ERR_GOOGLE_PLACES_INVALID_QUERY"
  default:
    code = "ERR_GOOGLE_PLACES_PROVIDER"
  }
  return GooglePlacesFailure(
    code: code,
    reason: String(describing: error)
  )
}

private func searchSignature(_ query: GooglePlacesSearchQuery) -> String {
  var value: [String: Any] = [
    "keyword": query.keyword.trimmingCharacters(in: .whitespacesAndNewlines),
    "city": query.city ?? NSNull(),
    "countryCode": query.countryCode ?? NSNull(),
    "limit": query.limit,
  ]
  if let center = query.center {
    value["center"] = ["latitude": center.latitude, "longitude": center.longitude]
  } else {
    value["center"] = NSNull()
  }
  guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
        let signature = String(data: data, encoding: .utf8) else {
    return "invalid-query-signature"
  }
  return signature
}

/// Keeps the SDK's official Text Search pagination object behind an opaque,
/// one-query cursor. Place Search never exposes SDK state to JavaScript.
private actor GoogleSearchPaginationStore {
  private struct Entry: Sendable {
    let signature: String
    let response: SearchByTextResponse?
    let pageToken: String?
  }

  private var entries: [String: Entry] = [:]
  private var insertionOrder: [String] = []
  private let maximumRetainedCursors = 32

  func store(_ response: SearchByTextResponse, signature: String) -> String? {
    guard response.pagination?.hasNextPage == true else { return nil }
    let cursor = UUID().uuidString
    insert(Entry(signature: signature, response: response, pageToken: nil), for: cursor)
    return cursor
  }

  func fetchNext(
    cursor: String,
    signature: String
  ) async throws -> (response: SearchByTextResponse, nextCursor: String?) {
    guard let entry = entries[cursor], entry.signature == signature,
          let pagination = entry.response?.pagination, pagination.hasNextPage else {
      throw GooglePlacesFailure(
        code: "ERR_GOOGLE_PLACES_INVALID_QUERY",
        reason: "Google Places search cursor is invalid or belongs to another query."
      )
    }

    switch await pagination.fetchNextPage() {
    case .success(let response):
      entries.removeValue(forKey: cursor)
      insertionOrder.removeAll { $0 == cursor }
      let nextCursor = store(response, signature: signature)
      return (response, nextCursor)
    case .failure(let error):
      // Keep the cursor intact so the UI can retry without losing existing rows.
      throw error
    }
  }

  func storeHTTPToken(_ token: String?, signature: String) -> String? {
    guard let token, !token.isEmpty else { return nil }
    let cursor = "http:" + UUID().uuidString
    insert(Entry(signature: signature, response: nil, pageToken: token), for: cursor)
    return cursor
  }

  func httpToken(cursor: String, signature: String) throws -> String {
    guard let entry = entries[cursor], entry.signature == signature,
          let token = entry.pageToken else {
      throw GooglePlacesFailure(
        code: "ERR_GOOGLE_PLACES_INVALID_QUERY",
        reason: "Google Places search cursor is invalid or belongs to another query."
      )
    }
    return token
  }

  func consumeHTTPToken(_ cursor: String) {
    entries.removeValue(forKey: cursor)
    insertionOrder.removeAll { $0 == cursor }
  }

  private func insert(_ entry: Entry, for cursor: String) {
    entries[cursor] = entry
    insertionOrder.append(cursor)
    while insertionOrder.count > maximumRetainedCursors {
      entries.removeValue(forKey: insertionOrder.removeFirst())
    }
  }
}

private func searchGooglePlaces(
  query: GooglePlacesSearchQuery,
  client: PlacesClient,
  paginationStore: GoogleSearchPaginationStore
) async throws -> [String: Any] {
  let keyword = query.keyword.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !keyword.isEmpty else {
    throw GooglePlacesFailure(
      code: "ERR_GOOGLE_PLACES_INVALID_QUERY",
      reason: "Google Places keyword is required."
    )
  }
  let city = query.city?.trimmingCharacters(in: .whitespacesAndNewlines)
  let textQuery = city?.isEmpty == false ? "\(keyword), \(city!)" : keyword
  let countryCode = query.countryCode?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
  let signature = searchSignature(query)

  // The Swift SDK rejects rectangle biases wider than 180 degrees. A mainland
  // map has no WGS84 search center, so use official unbounded Text Search here.
  if query.center == nil || query.cursor?.hasPrefix("http:") == true {
    guard let apiKey = await GooglePlacesRuntimeConfiguration.apiKey else {
      throw GooglePlacesFailure(
        code: "ERR_GOOGLE_PLACES_NOT_CONFIGURED",
        reason: "Google Places requires an initialized iOS key."
      )
    }
    let token: String?
    if let cursor = query.cursor, !cursor.isEmpty {
      token = try await paginationStore.httpToken(cursor: cursor, signature: signature)
    } else {
      token = nil
    }
    do {
      let page = try await GooglePlacesTextSearchHTTP.search(
        query: keyword,
        city: city,
        countryCode: countryCode,
        limit: query.limit,
        pageToken: token,
        apiKey: apiKey,
        bundleIdentifier: Bundle.main.bundleIdentifier ?? ""
      )
      if let cursor = query.cursor { await paginationStore.consumeHTTPToken(cursor) }
      let next = await paginationStore.storeHTTPToken(page.nextPageToken, signature: signature)
      return [
        "results": page.places.map { serialize($0) },
        "nextCursor": next ?? NSNull(),
        "suggestions": [],
      ]
    } catch let error as GooglePlacesHTTPError {
      let code: String
      if case .http(let status, _) = error, status == 401 || status == 403 {
        code = "ERR_GOOGLE_PLACES_NOT_CONFIGURED"
      } else {
        code = "ERR_GOOGLE_PLACES_PROVIDER"
      }
      throw GooglePlacesFailure(code: code, reason: String(describing: error))
    } catch {
      throw GooglePlacesFailure(
        code: "ERR_GOOGLE_PLACES_PROVIDER",
        reason: error.localizedDescription.replacingOccurrences(of: apiKey, with: "[redacted]")
      )
    }
  }

  let response: SearchByTextResponse
  let nextCursor: String?
  var suggestions: [String] = []
  if let cursor = query.cursor, !cursor.isEmpty {
    (response, nextCursor) = try await paginationStore.fetchNext(
      cursor: cursor,
      signature: signature
    )
  } else {
    let bias: any CoordinateRegionBias
    if let center = query.center {
      bias = CircularCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: center.latitude, longitude: center.longitude),
        radius: 50_000
      )
    } else {
      throw GooglePlacesFailure(
        code: "ERR_GOOGLE_PLACES_INVALID_QUERY",
        reason: "Google Places centered search requires a WGS84 center."
      )
    }
    let request = SearchByTextRequest(
      textQuery: textQuery,
      placeProperties: [
        .placeID, .displayName, .formattedAddress, .coordinate, .types,
      ],
      locationBias: bias,
      maxResultCount: min(max(query.limit, 1), 20),
      isOpenNow: false,
      rankPreference: .relevance,
      regionCode: countryCode
    )
    switch await client.responseForSearchByText(with: request) {
    case .success(let value):
      response = value
      nextCursor = await paginationStore.store(value, signature: signature)
      if (response.places ?? []).isEmpty {
        let origin = query.center.map {
          CLLocation(latitude: $0.latitude, longitude: $0.longitude)
        }
        let filter = AutocompleteFilter(
          countries: countryCode.map { Set([$0]) },
          origin: origin,
          regionCode: countryCode
        )
        let autocomplete = AutocompleteRequest(
          query: textQuery,
          sessionToken: AutocompleteSessionToken(),
          filter: filter
        )
        if case .success(let predictions) = await client.fetchAutocompleteSuggestions(with: autocomplete) {
          suggestions = predictions.compactMap { prediction in
            guard case .place(let place) = prediction else { return nil }
            let text = String(place.attributedFullText.characters)
              .trimmingCharacters(in: .whitespacesAndNewlines)
            return text.isEmpty ? nil : text
          }
        }
      }
    case .failure(let error):
      throw providerException(error)
    }
  }

  return [
    "results": (response.places ?? []).map { serialize($0, regionLabel: nil) },
    "nextCursor": nextCursor ?? NSNull(),
    "suggestions": suggestions,
  ]
}

private func serialize(_ place: GooglePlacesHTTPPlace) -> [String: Any] {
  var result: [String: Any] = [
    "placeId": place.id,
    "name": place.displayName.text,
    "latitude": place.location.latitude,
    "longitude": place.location.longitude,
    "types": place.types,
  ]
  if let address = place.formattedAddress { result["address"] = address }
  let attributions = place.attributions.compactMap { value -> [String: Any]? in
    guard let text = value.provider, !text.isEmpty else { return nil }
    var attribution: [String: Any] = ["text": text]
    if let url = value.providerUri { attribution["url"] = url }
    return attribution
  }
  if !attributions.isEmpty { result["attributions"] = attributions }
  return result
}

private func serialize(
  _ place: GooglePlacesSwift.Place,
  regionLabel: String?
) -> [String: Any] {
  var result: [String: Any] = [
    "name": place.displayName ?? "",
    "latitude": place.location.latitude,
    "longitude": place.location.longitude,
    "types": place.types.map(\.rawValue).sorted(),
  ]
  if let placeID = place.placeID?.trimmingCharacters(in: .whitespacesAndNewlines),
     !placeID.isEmpty {
    result["placeId"] = placeID
  }
  if let address = place.formattedAddress?.trimmingCharacters(in: .whitespacesAndNewlines),
     !address.isEmpty {
    result["address"] = address
  }
  if let regionLabel = regionLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
     !regionLabel.isEmpty {
    result["regionLabel"] = regionLabel
  }
  if let attributions = place.attributions {
    let links = attributions.runs.compactMap { run -> [String: Any]? in
      let text = String(attributions[run.range].characters)
        .trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else { return nil }
      var attribution: [String: Any] = ["text": text]
      if let url = run.link {
        attribution["url"] = url.absoluteString
      }
      return attribution
    }
    if !links.isEmpty { result["attributions"] = links }
  }
  return result
}

public class ExpoGooglePlacesModule: Module {
  private let geocoder = GoogleGeocoderClient()
  private let paginationStore = GoogleSearchPaginationStore()

  public func definition() -> ModuleDefinition {
    Name("ExpoGooglePlaces")

    AsyncFunction("initializeAsync") { () async -> Bool in
      await GooglePlacesRuntimeConfiguration.configure()
    }

    AsyncFunction("isConfiguredAsync") { () async -> Bool in
      await GooglePlacesRuntimeConfiguration.isConfigured()
    }

    AsyncFunction("searchAsync") {
      (query: GooglePlacesSearchQuery) async throws -> [String: Any] in
      guard let client = await GooglePlacesRuntimeConfiguration.client() else {
        throw GooglePlacesFailure(
          code: "ERR_GOOGLE_PLACES_NOT_CONFIGURED",
          reason: "Google Places requires an initialized iOS key."
        )
      }
      return try await searchGooglePlaces(
        query: query,
        client: client,
        paginationStore: paginationStore
      )
    }

    AsyncFunction("reverseGeocodeAsync") {
      (query: GoogleReverseGeocodeQuery, promise: Promise) in
      geocoder.reverseGeocode(query: query, promise: promise)
    }.runOnQueue(.main)
  }
}
