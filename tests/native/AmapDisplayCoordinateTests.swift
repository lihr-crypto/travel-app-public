private enum FixtureFailure: Error, CustomStringConvertible {
  case assertion(String)

  var description: String {
    switch self {
    case .assertion(let message): return message
    }
  }
}

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
  guard condition() else { throw FixtureFailure.assertion(message) }
}

private func expectThrows(
  _ expected: AmapDisplayCoordinateError,
  operation: () throws -> Void
) throws {
  do {
    try operation()
    throw FixtureFailure.assertion("Expected coordinate conversion to fail.")
  } catch let error as AmapDisplayCoordinateError {
    guard error == expected else {
      throw FixtureFailure.assertion("Unexpected coordinate conversion error: \(error).")
    }
  }
}

@main
private struct AmapDisplayCoordinateTests {
  static func main() throws {
    try invertsAForwardProjectionAndChecksItsResidual()
    try acceptsQuantizedForwardResidualAboveThePreviousThreshold()
    try identityForwardProjectionNeedsNoGeographicRegionHeuristic()
    try invalidCoordinatesAndForwardResultsFailExplicitly()
    try nonConvergentProjectionStopsAfterTheBoundedIterations()
    print("AmapDisplayCoordinateTests: 5 tests passed")
  }

  private static func invertsAForwardProjectionAndChecksItsResidual() throws {
    let expected = AmapDisplayCoordinate(latitude: 39.92, longitude: 116.39)
    let forward: (AmapDisplayCoordinate) -> AmapDisplayCoordinate = { coordinate in
      AmapDisplayCoordinate(
        latitude: coordinate.latitude + 0.002 + coordinate.latitude * 0.000001,
        longitude: coordinate.longitude + 0.003 - coordinate.longitude * 0.000001
      )
    }
    let gcj02 = forward(expected)
    var forwardCalls = 0
    let recovered = try AmapDisplayCoordinateConverter.toWGS84(gcj02) { coordinate in
      forwardCalls += 1
      return forward(coordinate)
    }
    let finalProjection = forward(recovered)

    try expect(abs(recovered.latitude - expected.latitude) < 1e-7, "Latitude should invert the injected forward projection.")
    try expect(abs(recovered.longitude - expected.longitude) < 1e-7, "Longitude should invert the injected forward projection.")
    try expect(
      max(abs(finalProjection.latitude - gcj02.latitude), abs(finalProjection.longitude - gcj02.longitude))
        <= AmapDisplayCoordinateConverter.maximumForwardResidualDegrees,
      "The returned coordinate must pass the forward residual check."
    )
    try expect(forwardCalls <= AmapDisplayCoordinateConverter.maximumIterations, "The solver must stay within its iteration bound.")
  }

  private static func acceptsQuantizedForwardResidualAboveThePreviousThreshold() throws {
    let gcj02 = AmapDisplayCoordinate(latitude: 0.0000002, longitude: 0.0000002)
    let quantizedForward: (AmapDisplayCoordinate) -> AmapDisplayCoordinate = { coordinate in
      AmapDisplayCoordinate(
        latitude: (coordinate.latitude * 1_000_000).rounded() / 1_000_000,
        longitude: (coordinate.longitude * 1_000_000).rounded() / 1_000_000
      )
    }
    let projected = quantizedForward(gcj02)
    let measuredResidualDegrees = max(
      abs(gcj02.latitude - projected.latitude),
      abs(gcj02.longitude - projected.longitude)
    )
    var forwardCalls = 0

    let display = try AmapDisplayCoordinateConverter.toWGS84(gcj02) { coordinate in
      forwardCalls += 1
      return quantizedForward(coordinate)
    }

    try expect(measuredResidualDegrees > 1e-7, "The fixture should exceed the previous threshold.")
    try expect(
      measuredResidualDegrees <= AmapDisplayCoordinateConverter.maximumForwardResidualDegrees,
      "The fixture's quantization residual should fit the measured threshold."
    )
    try expect(display == gcj02, "A quantized forward result within tolerance should be accepted.")
    try expect(forwardCalls == 1, "The accepted quantized result should not trigger extra retries.")
  }

  private static func identityForwardProjectionNeedsNoGeographicRegionHeuristic() throws {
    let coordinate = AmapDisplayCoordinate(latitude: 48.8566, longitude: 2.3522)
    let display = try AmapDisplayCoordinateConverter.toWGS84(coordinate) { $0 }
    try expect(display == coordinate, "An identity result from AMap's public converter should stay unchanged.")
  }

  private static func invalidCoordinatesAndForwardResultsFailExplicitly() throws {
    try expectThrows(.invalidInput) {
      _ = try AmapDisplayCoordinateConverter.toWGS84(
        AmapDisplayCoordinate(latitude: .nan, longitude: 116.39),
        forward: { $0 }
      )
    }
    try expectThrows(.invalidInput) {
      _ = try AmapDisplayCoordinateConverter.toWGS84(
        AmapDisplayCoordinate(latitude: 91, longitude: 116.39),
        forward: { $0 }
      )
    }
    try expectThrows(.invalidForwardResult) {
      _ = try AmapDisplayCoordinateConverter.toWGS84(
        AmapDisplayCoordinate(latitude: 39.92, longitude: 116.39),
        forward: { _ in AmapDisplayCoordinate(latitude: .infinity, longitude: 116.39) }
      )
    }
  }

  private static func nonConvergentProjectionStopsAfterTheBoundedIterations() throws {
    let coordinate = AmapDisplayCoordinate(latitude: 1, longitude: 1)
    var forwardCalls = 0
    do {
      _ = try AmapDisplayCoordinateConverter.toWGS84(coordinate) { candidate in
        forwardCalls += 1
        return AmapDisplayCoordinate(
          latitude: candidate.latitude * 2,
          longitude: candidate.longitude * 2
        )
      }
      throw FixtureFailure.assertion("A divergent forward projection should not produce a display coordinate.")
    } catch AmapDisplayCoordinateError.didNotConverge(let residualDegrees) {
      try expect(
        forwardCalls == AmapDisplayCoordinateConverter.maximumIterations,
        "The solver must stop exactly at the configured iteration limit."
      )
      try expect(residualDegrees == 1, "The error should retain the last measured residual in degrees.")
      try expect(errorMessageContainsResidual(residualDegrees), "The diagnostic message should include the residual value.")
    }
  }

  private static func errorMessageContainsResidual(_ residualDegrees: Double) -> Bool {
    AmapDisplayCoordinateError.didNotConverge(residualDegrees: residualDegrees)
      .message.contains(String(residualDegrees))
  }
}
