import Foundation

struct GooglePlacesHTTPPage: Codable, Sendable, Equatable {
  var places: [GooglePlacesHTTPPlace]
  var nextPageToken: String?

  enum CodingKeys: String, CodingKey {
    case places
    case nextPageToken
  }

  init(places: [GooglePlacesHTTPPlace] = [], nextPageToken: String? = nil) {
    self.places = places
    self.nextPageToken = nextPageToken
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    places = try container.decodeIfPresent([GooglePlacesHTTPPlace].self, forKey: .places) ?? []
    nextPageToken = try container.decodeIfPresent(String.self, forKey: .nextPageToken)
  }
}

struct GooglePlacesHTTPPlace: Codable, Sendable, Equatable {
  var id: String
  var displayName: GooglePlacesHTTPDisplayName
  var formattedAddress: String?
  var location: GooglePlacesHTTPLocation
  var types: [String]
  var attributions: [GooglePlacesHTTPAttribution]

  enum CodingKeys: String, CodingKey {
    case id
    case displayName
    case formattedAddress
    case location
    case types
    case attributions
  }

  init(
    id: String,
    displayName: GooglePlacesHTTPDisplayName,
    formattedAddress: String? = nil,
    location: GooglePlacesHTTPLocation,
    types: [String] = [],
    attributions: [GooglePlacesHTTPAttribution] = []
  ) {
    self.id = id
    self.displayName = displayName
    self.formattedAddress = formattedAddress
    self.location = location
    self.types = types
    self.attributions = attributions
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    displayName = try container.decode(GooglePlacesHTTPDisplayName.self, forKey: .displayName)
    formattedAddress = try container.decodeIfPresent(String.self, forKey: .formattedAddress)
    location = try container.decode(GooglePlacesHTTPLocation.self, forKey: .location)
    types = try container.decodeIfPresent([String].self, forKey: .types) ?? []
    attributions = try container.decodeIfPresent(
      [GooglePlacesHTTPAttribution].self,
      forKey: .attributions
    ) ?? []
  }
}

struct GooglePlacesHTTPDisplayName: Codable, Sendable, Equatable {
  var text: String
}

struct GooglePlacesHTTPLocation: Codable, Sendable, Equatable {
  var latitude: Double
  var longitude: Double
}

struct GooglePlacesHTTPAttribution: Codable, Sendable, Equatable {
  var provider: String?
  var providerUri: String?
}

enum GooglePlacesHTTPError: Error, Sendable, Equatable {
  case http(status: Int, message: String)
  case invalidResponse
}

enum GooglePlacesTextSearchHTTP {
  private static let endpoint = URL(string: "https://places.googleapis.com/v1/places:searchText")!
  private static let fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.types",
    "places.attributions",
    "nextPageToken",
  ].joined(separator: ",")

  static func search(
    query: String,
    city: String?,
    countryCode: String?,
    limit: Int,
    pageToken: String?,
    apiKey: String,
    bundleIdentifier: String,
    session: URLSession = .shared
  ) async throws -> GooglePlacesHTTPPage {
    let city = city?.trimmingCharacters(in: .whitespacesAndNewlines)
    let textQuery: String
    if let city, !city.isEmpty {
      textQuery = "\(query), \(city)"
    } else {
      textQuery = query
    }
    var body: [String: Any] = [
      "textQuery": textQuery,
      "pageSize": min(max(limit, 1), 20),
      "languageCode": "zh-CN",
    ]
    let regionCode = countryCode?.trimmingCharacters(in: .whitespacesAndNewlines)
      .uppercased()
    if let regionCode, !regionCode.isEmpty {
      body["regionCode"] = regionCode
    }
    let pageToken = pageToken?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let pageToken, !pageToken.isEmpty {
      body["pageToken"] = pageToken
    }

    var request = URLRequest(url: endpoint)
    request.timeoutInterval = 20
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(apiKey, forHTTPHeaderField: "X-Goog-Api-Key")
    request.setValue(bundleIdentifier, forHTTPHeaderField: "X-Ios-Bundle-Identifier")
    request.setValue(fieldMask, forHTTPHeaderField: "X-Goog-FieldMask")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await session.data(for: request)
    guard let response = response as? HTTPURLResponse else {
      throw GooglePlacesHTTPError.invalidResponse
    }
    guard (200..<300).contains(response.statusCode) else {
      let message = providerErrorMessage(from: data, apiKey: apiKey)
      throw GooglePlacesHTTPError.http(status: response.statusCode, message: message)
    }
    do {
      return try JSONDecoder().decode(GooglePlacesHTTPPage.self, from: data)
    } catch {
      throw GooglePlacesHTTPError.invalidResponse
    }
  }

  private static func providerErrorMessage(from data: Data, apiKey: String) -> String {
    struct ErrorEnvelope: Decodable {
      struct Details: Decodable {
        var message: String?
      }
      var error: Details?
    }

    let body = String(data: data, encoding: .utf8) ?? "Google Places returned an unreadable error."
    let providerMessage = (try? JSONDecoder().decode(ErrorEnvelope.self, from: data).error?.message)
      ?? body
    guard !apiKey.isEmpty else { return providerMessage }
    return providerMessage.replacingOccurrences(of: apiKey, with: "[REDACTED]")
  }
}
