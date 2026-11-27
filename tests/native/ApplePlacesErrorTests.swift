import Foundation
import MapKit

private enum FixtureFailure: Error, CustomStringConvertible {
  case assertion(String)

  var description: String {
    switch self {
    case .assertion(let message): return message
    }
  }
}

private func expect(
  _ actual: ApplePlacesClientError,
  _ expected: ApplePlacesClientError,
  _ message: String
) throws {
  guard actual == expected else { throw FixtureFailure.assertion(message) }
}

@main
private struct ApplePlacesErrorTests {
  static func main() throws {
    try placemarkNotFoundIsAnEmptyResult()
    try loadingThrottledHasItsOwnTypedFailure()
    try mapKitServerFailureRetainsDomainAndCode()
    try unrelatedCodeFourIsNotAPlacemarkMiss()
    print("ApplePlacesErrorTests: 4 tests passed")
  }

  private static func placemarkNotFoundIsAnEmptyResult() throws {
    let placemarkNotFoundCode = Int(MKError.placemarkNotFound.rawValue)
    try expect(
      ApplePlacesClientError.classify(NSError(domain: MKError.errorDomain, code: 4)),
      .placemarkNotFound,
      "MKErrorDomain code 4 should be classified as placemarkNotFound."
    )
    guard placemarkNotFoundCode == 4 else {
      throw FixtureFailure.assertion("The SDK's placemarkNotFound constant should remain code 4.")
    }
    let error = NSError(
      domain: MKError.errorDomain,
      code: placemarkNotFoundCode,
      userInfo: [NSLocalizedDescriptionKey: "fixture query text must not be surfaced"]
    )
    try expect(
      ApplePlacesClientError.classify(error),
      .placemarkNotFound,
      "MapKit's placemarkNotFound code should be classified as no result."
    )
  }

  private static func loadingThrottledHasItsOwnTypedFailure() throws {
    let error = NSError(
      domain: MKError.errorDomain,
      code: Int(MKError.loadingThrottled.rawValue)
    )
    try expect(
      ApplePlacesClientError.classify(error),
      .loadingThrottled,
      "MapKit throttling should remain distinct from an ordinary provider failure."
    )
  }

  private static func mapKitServerFailureRetainsDomainAndCode() throws {
    let error = NSError(
      domain: MKError.errorDomain,
      code: Int(MKError.serverFailure.rawValue)
    )
    try expect(
      ApplePlacesClientError.classify(error),
      .providerFailure(domain: MKError.errorDomain, code: error.code),
      "A MapKit server failure must retain its domain and code."
    )
  }

  private static func unrelatedCodeFourIsNotAPlacemarkMiss() throws {
    let error = NSError(domain: "FixtureNetworkErrorDomain", code: 4)
    try expect(
      ApplePlacesClientError.classify(error),
      .providerFailure(domain: error.domain, code: error.code),
      "The placemark code is meaningful only inside MKErrorDomain."
    )
  }
}
