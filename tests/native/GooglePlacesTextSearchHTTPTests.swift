import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

private struct StubResponse {
  var statusCode: Int
  var body: Data
}

private final class URLProtocolFixture: @unchecked Sendable {
  static let shared = URLProtocolFixture()

  private let lock = NSLock()
  private var response: StubResponse?
  private var capturedRequest: URLRequest?
  private var capturedBody: Data?

  func install(statusCode: Int, body: Data) {
    lock.lock()
    response = StubResponse(statusCode: statusCode, body: body)
    capturedRequest = nil
    capturedBody = nil
    lock.unlock()
  }

  func respond(to request: URLRequest) throws -> StubResponse {
    lock.lock()
    defer { lock.unlock() }
    capturedRequest = request
    capturedBody = readBody(from: request)
    guard let response else { throw URLError(.badServerResponse) }
    return response
  }

  func request() -> URLRequest? {
    lock.lock()
    defer { lock.unlock() }
    return capturedRequest
  }

  func requestBody() -> Data? {
    lock.lock()
    defer { lock.unlock() }
    return capturedBody
  }

  private func readBody(from request: URLRequest) -> Data? {
    if let httpBody = request.httpBody { return httpBody }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 1024)
    while stream.hasBytesAvailable {
      let count = stream.read(&buffer, maxLength: buffer.count)
      if count <= 0 { break }
      data.append(contentsOf: buffer.prefix(count))
    }
    return data
  }
}

private final class StubURLProtocol: URLProtocol {
  override class func canInit(with request: URLRequest) -> Bool { true }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      let fixture = try URLProtocolFixture.shared.respond(to: request)
      guard let url = request.url,
            let response = HTTPURLResponse(
              url: url,
              statusCode: fixture.statusCode,
              httpVersion: "HTTP/1.1",
              headerFields: ["Content-Type": "application/json"]
            ) else {
        throw URLError(.badServerResponse)
      }
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: fixture.body)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

private enum TestFailure: Error, CustomStringConvertible {
  case assertion(String)

  var description: String {
    switch self {
    case .assertion(let message): return message
    }
  }
}

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
  guard condition() else { throw TestFailure.assertion(message) }
}

private func makeSession() -> URLSession {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [StubURLProtocol.self]
  return URLSession(configuration: configuration)
}

@main
private struct GooglePlacesTextSearchHTTPTests {
  static func main() async throws {
    try await searchBuildsSecureUnboundedRequestAndDecodesPlace()
    try await searchClampsMinimumSizeAndUsesContinuationToken()
    try await missingPlacesDefaultsToEmpty()
    try await absentPlaceCollectionsDefaultToEmpty()
    try await providerErrorRedactsApiKey()
    try await malformedSuccessBodyIsRejected()
    print("GooglePlacesTextSearchHTTP: 6 tests passed")
  }

  private static func searchBuildsSecureUnboundedRequestAndDecodesPlace() async throws {
    let apiKey = "fixture-secret-key"
    let body = Data(
      #"{"places":[{"id":"places/tokyo-station","displayName":{"text":"东京站"},"formattedAddress":"日本东京都千代田区丸之内一丁目","location":{"latitude":35.6812,"longitude":139.7671},"types":["train_station","transit_station"],"attributions":[{"provider":"地图来源","providerUri":"https://example.test/provider"}]}],"nextPageToken":"next-page"}"#.utf8
    )
    URLProtocolFixture.shared.install(statusCode: 200, body: body)
    let session = makeSession()
    defer { session.invalidateAndCancel() }

    let page = try await GooglePlacesTextSearchHTTP.search(
      query: "车站",
      city: "东京",
      countryCode: " jp ",
      limit: 99,
      pageToken: nil,
      apiKey: apiKey,
      bundleIdentifier: "com.example.travel",
      session: session
    )

    guard let request = URLProtocolFixture.shared.request() else {
      throw TestFailure.assertion("The HTTP request was not captured.")
    }
    try expect(request.url?.absoluteString == "https://places.googleapis.com/v1/places:searchText", "The request URL must be the Text Search endpoint without query parameters.")
    try expect(request.url?.query == nil, "The request URL must not contain credentials or request fields.")
    try expect(request.httpMethod == "POST", "Text Search must use POST.")
    try expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json", "The JSON content type header is missing.")
    try expect(request.value(forHTTPHeaderField: "X-Goog-Api-Key") == apiKey, "The API key must be sent in its header.")
    try expect(request.value(forHTTPHeaderField: "X-Ios-Bundle-Identifier") == "com.example.travel", "The iOS bundle identifier header is missing.")
    let fieldMask = request.value(forHTTPHeaderField: "X-Goog-FieldMask") ?? ""
    for requiredField in ["places.id", "places.displayName", "places.formattedAddress", "places.location", "places.types", "places.attributions", "nextPageToken"] {
      try expect(fieldMask.split(separator: ",").contains(Substring(requiredField)), "The field mask is missing \(requiredField).")
    }

    guard let requestBody = URLProtocolFixture.shared.requestBody(),
          let json = try JSONSerialization.jsonObject(with: requestBody) as? [String: Any] else {
      throw TestFailure.assertion("The request body must be a JSON object.")
    }
    try expect(json["textQuery"] as? String == "车站, 东京", "The city must be included in the text query.")
    try expect(json["pageSize"] as? Int == 20, "The maximum page size must be 20.")
    try expect(json["languageCode"] as? String == "zh-CN", "The language code must be zh-CN.")
    try expect(json["regionCode"] as? String == "JP", "The region code should be normalized.")
    try expect(json["locationBias"] == nil && json["locationRestriction"] == nil, "Unbounded Text Search must omit both location bias fields.")
    try expect(!String(decoding: requestBody, as: UTF8.self).contains(apiKey), "The API key must not appear in the request body.")
    try expect(!request.url!.absoluteString.contains(apiKey), "The API key must never appear in the URL.")

    try expect(page.places.count == 1, "The place should decode.")
    let place = page.places[0]
    try expect(place.id == "places/tokyo-station", "The place ID should decode.")
    try expect(place.displayName.text == "东京站", "The localized place name should decode.")
    try expect(place.formattedAddress == "日本东京都千代田区丸之内一丁目", "The formatted address should decode.")
    try expect(place.location.latitude == 35.6812 && place.location.longitude == 139.7671, "Place coordinates should decode without axis changes.")
    try expect(place.types == ["train_station", "transit_station"], "Place types should decode.")
    try expect(place.attributions.first?.provider == "地图来源", "Attribution provider should decode.")
    try expect(place.attributions.first?.providerUri == "https://example.test/provider", "Attribution URI should decode.")
    try expect(page.nextPageToken == "next-page", "The continuation token should decode.")
  }

  private static func searchClampsMinimumSizeAndUsesContinuationToken() async throws {
    URLProtocolFixture.shared.install(statusCode: 200, body: Data(#"{"places":[]}"#.utf8))
    let session = makeSession()
    defer { session.invalidateAndCancel() }

    _ = try await GooglePlacesTextSearchHTTP.search(
      query: "咖啡馆",
      city: nil,
      countryCode: " ",
      limit: 0,
      pageToken: "page-token-2",
      apiKey: "fixture-key",
      bundleIdentifier: "com.example.travel",
      session: session
    )

    guard URLProtocolFixture.shared.request() != nil,
          let requestBody = URLProtocolFixture.shared.requestBody(),
          let json = try JSONSerialization.jsonObject(with: requestBody) as? [String: Any] else {
      throw TestFailure.assertion("The continuation request should be captured.")
    }
    try expect(json["pageSize"] as? Int == 1, "The minimum page size must be 1.")
    try expect(json["textQuery"] as? String == "咖啡馆", "An absent city should leave the query unchanged.")
    try expect(json["pageToken"] as? String == "page-token-2", "The continuation token must be sent.")
    try expect(json["regionCode"] == nil, "An empty country code should be omitted.")
    try expect(json["locationBias"] == nil && json["locationRestriction"] == nil, "Continuation requests must stay unbounded.")
  }

  private static func missingPlacesDefaultsToEmpty() async throws {
    URLProtocolFixture.shared.install(statusCode: 200, body: Data(#"{"nextPageToken":"next"}"#.utf8))
    let session = makeSession()
    defer { session.invalidateAndCancel() }

    let page = try await GooglePlacesTextSearchHTTP.search(
      query: "東京",
      city: nil,
      countryCode: nil,
      limit: 10,
      pageToken: nil,
      apiKey: "fixture-key",
      bundleIdentifier: "com.example.travel",
      session: session
    )
    try expect(page.places.isEmpty, "A response without places should produce an empty array.")
    try expect(page.nextPageToken == "next", "The next page token should still decode.")
  }

  private static func absentPlaceCollectionsDefaultToEmpty() async throws {
    let body = Data(
      #"{"places":[{"id":"places/tokyo-station","displayName":{"text":"东京站"},"location":{"latitude":35.6812,"longitude":139.7671}}]}"#.utf8
    )
    URLProtocolFixture.shared.install(statusCode: 200, body: body)
    let session = makeSession()
    defer { session.invalidateAndCancel() }

    let page = try await GooglePlacesTextSearchHTTP.search(
      query: "东京站",
      city: nil,
      countryCode: nil,
      limit: 10,
      pageToken: nil,
      apiKey: "fixture-key",
      bundleIdentifier: "com.example.travel",
      session: session
    )
    try expect(page.places.first?.types.isEmpty == true, "Absent place types should decode as an empty array.")
    try expect(page.places.first?.attributions.isEmpty == true, "Absent attributions should decode as an empty array.")
  }

  private static func providerErrorRedactsApiKey() async throws {
    let apiKey = "fixture-secret-key"
    let errorBody = try JSONSerialization.data(withJSONObject: [
      "error": ["message": "Access denied for key \(apiKey)"],
    ])
    URLProtocolFixture.shared.install(statusCode: 403, body: errorBody)
    let session = makeSession()
    defer { session.invalidateAndCancel() }

    do {
      _ = try await GooglePlacesTextSearchHTTP.search(
        query: "东京站",
        city: nil,
        countryCode: nil,
        limit: 10,
        pageToken: nil,
        apiKey: apiKey,
        bundleIdentifier: "com.example.travel",
        session: session
      )
      throw TestFailure.assertion("An HTTP error response should throw.")
    } catch let error as GooglePlacesHTTPError {
      guard case .http(let status, let message) = error else {
        throw TestFailure.assertion("HTTP errors should preserve their status.")
      }
      try expect(status == 403, "The HTTP status should be preserved.")
      try expect(message.contains("[REDACTED]"), "The provider message should identify the redacted credential.")
      try expect(!message.contains(apiKey), "The API key must not appear in the surfaced error message.")
    }
  }

  private static func malformedSuccessBodyIsRejected() async throws {
    URLProtocolFixture.shared.install(statusCode: 200, body: Data("{malformed".utf8))
    let session = makeSession()
    defer { session.invalidateAndCancel() }

    do {
      _ = try await GooglePlacesTextSearchHTTP.search(
        query: "东京站",
        city: nil,
        countryCode: nil,
        limit: 10,
        pageToken: nil,
        apiKey: "fixture-key",
        bundleIdentifier: "com.example.travel",
        session: session
      )
      throw TestFailure.assertion("A malformed success body should throw.")
    } catch let error as GooglePlacesHTTPError {
      try expect(error == .invalidResponse, "Malformed JSON should map to invalidResponse.")
    }
  }
}
