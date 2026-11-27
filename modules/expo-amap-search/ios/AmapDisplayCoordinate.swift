struct AmapDisplayCoordinate: Equatable, Sendable {
  var latitude: Double
  var longitude: Double
}

enum AmapDisplayCoordinateError: Error, Equatable, Sendable {
  case invalidInput
  case invalidForwardResult
  case didNotConverge(residualDegrees: Double)

  var message: String {
    switch self {
    case .invalidInput:
      return "AMap display conversion requires finite valid coordinates."
    case .invalidForwardResult:
      return "AMap returned an invalid coordinate during display conversion."
    case .didNotConverge(let residualDegrees):
      return "AMap display conversion did not converge within 12 iterations (last forward residual \(residualDegrees) degrees)."
    }
  }
}

enum AmapDisplayCoordinateConverter {
  static let maximumIterations = 12
  static let maximumForwardResidualDegrees = 5e-7

  /// Inverts the public GPS-to-AMap conversion by solving for the WGS84 input
  /// whose forward projection matches the saved GCJ-02 coordinate.
  static func toWGS84(
    _ gcj02: AmapDisplayCoordinate,
    forward: (AmapDisplayCoordinate) -> AmapDisplayCoordinate
  ) throws -> AmapDisplayCoordinate {
    guard isValid(gcj02) else { throw AmapDisplayCoordinateError.invalidInput }

    var candidate = gcj02
    var lastResidualDegrees = Double.infinity
    for _ in 0..<maximumIterations {
      let projected = forward(candidate)
      guard isValid(projected) else {
        throw AmapDisplayCoordinateError.invalidForwardResult
      }

      let latitudeResidual = gcj02.latitude - projected.latitude
      let longitudeResidual = gcj02.longitude - projected.longitude
      lastResidualDegrees = max(abs(latitudeResidual), abs(longitudeResidual))
      if lastResidualDegrees <= maximumForwardResidualDegrees {
        return candidate
      }

      candidate.latitude += latitudeResidual
      candidate.longitude += longitudeResidual
      guard isValid(candidate) else {
        throw AmapDisplayCoordinateError.invalidForwardResult
      }
    }

    throw AmapDisplayCoordinateError.didNotConverge(residualDegrees: lastResidualDegrees)
  }

  private static func isValid(_ coordinate: AmapDisplayCoordinate) -> Bool {
    coordinate.latitude.isFinite
      && coordinate.longitude.isFinite
      && (-90...90).contains(coordinate.latitude)
      && (-180...180).contains(coordinate.longitude)
  }
}
