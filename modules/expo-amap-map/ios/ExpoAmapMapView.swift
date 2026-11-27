import ExpoModulesCore
import AMapFoundationKit
import MAMapKit
import UIKit

private struct AmapVisibleMapGeometry {
  let rect: CGRect
  let screenAnchor: CGPoint
}

private final class ItemAnnotation: MAPointAnnotation {
  let itemId: String
  let variant: String
  let displayText: String?
  let isQuantityCluster: Bool

  init(marker: AmapMarker) {
    itemId = marker.id
    variant = marker.variant
    isQuantityCluster = (marker.clusterCount ?? 0) > 0
    if let count = marker.clusterCount, count > 0 {
      displayText = String(count)
    } else if let ordinal = marker.ordinal {
      displayText = String(ordinal)
    } else if marker.variant == "cluster", let count = marker.sourceItemIds?.count {
      displayText = String(count)
    } else {
      displayText = nil
    }
    super.init()
    coordinate = marker.coordinate.native
    title = marker.label
  }
}

class ExpoAmapMapView: ExpoView, MAMapViewDelegate {
  private let singlePlaceZoomLevel: CGFloat = 16
  private let mapCenterAnchor = CGPoint(x: 0.5, y: 0.5)
  let onMarkerPress = EventDispatcher()
  let onMapPress = EventDispatcher()
  let onViewportChange = EventDispatcher()
  let onCameraSettled = EventDispatcher()
  let onMarkerProjection = EventDispatcher()

  private var nativeMap: MAMapView?
  private var itemAnnotations: [ItemAnnotation] = []
  private var pendingCamera: AmapCameraRequest?
  private var appliedCameraKey: String?
  private var awaitingCameraSettlementRequest: AmapCameraRequest?
  private var hasMapInitCompleted = false
  private var markerProjectionRequest: AmapMarkerProjectionRequest?
  private var lastMarkerProjectionSignature: String?
  private var markerProjectionRevision = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    guard AmapRuntimeConfiguration.privacyReady else {
      showUnavailable("请先阅读并同意包含高德 SDK 条款的隐私告知")
      return
    }
    guard let key = AmapRuntimeConfiguration.apiKey else {
      showUnavailable("未配置高德 iOS 地图 Key")
      return
    }

    AMapServices.shared().apiKey = key
    let map = MAMapView(frame: .zero)
    map.delegate = self
    map.screenAnchor = mapCenterAnchor
    nativeMap = map
    addSubview(map)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    nativeMap?.frame = bounds
    applyCameraIfReady()
    if awaitingCameraSettlementRequest == nil { emitMarkerProjection() }
  }

  private func visibleMapGeometry(
    padding: AmapPadding?,
    bounds: CGRect
  ) -> AmapVisibleMapGeometry? {
    guard bounds.width.isFinite, bounds.height.isFinite,
          bounds.width > 0, bounds.height > 0 else {
      return nil
    }

    let topValue = padding?.top ?? 0
    let rightValue = padding?.right ?? 0
    let bottomValue = padding?.bottom ?? 0
    let leftValue = padding?.left ?? 0
    let insets = [topValue, rightValue, bottomValue, leftValue]
    guard insets.allSatisfy({ $0.isFinite && $0 >= 0 }) else { return nil }

    let top = CGFloat(topValue)
    let right = CGFloat(rightValue)
    let bottom = CGFloat(bottomValue)
    let left = CGFloat(leftValue)
    let visibleWidth = bounds.width - left - right
    let visibleHeight = bounds.height - top - bottom
    guard visibleWidth > 0, visibleHeight > 0 else { return nil }

    let rawX = (left + bounds.width - right) / (2 * bounds.width)
    let rawY = (top + bounds.height - bottom) / (2 * bounds.height)
    let screenAnchor = CGPoint(
      x: min(1, max(0, rawX)),
      y: min(1, max(0, rawY))
    )
    return AmapVisibleMapGeometry(
      rect: CGRect(
        x: bounds.minX + left,
        y: bounds.minY + top,
        width: visibleWidth,
        height: visibleHeight
      ),
      screenAnchor: screenAnchor
    )
  }

  private func isValid(_ coordinate: CLLocationCoordinate2D) -> Bool {
    CLLocationCoordinate2DIsValid(coordinate)
  }

  private func isValid(_ anchor: CGPoint) -> Bool {
    anchor.x.isFinite && anchor.y.isFinite
      && (0...1).contains(anchor.x) && (0...1).contains(anchor.y)
  }

  private func setMapScreenAnchor(_ anchor: CGPoint, on map: MAMapView) -> Bool {
    guard isValid(anchor), let status = map.getMapStatus() else { return false }
    status.screenAnchor = anchor
    map.setMapStatus(status, animated: false)
    return true
  }

  private func showUnavailable(_ message: String) {
    let label = UILabel(frame: bounds)
    label.text = message
    label.numberOfLines = 0
    label.textAlignment = .center
    label.textColor = .systemRed
    label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(label)
  }

  func setMarkers(_ markers: [AmapMarker]) {
    guard let nativeMap else { return }
    nativeMap.removeAnnotations(itemAnnotations)
    itemAnnotations = markers.map(ItemAnnotation.init(marker:))
    nativeMap.addAnnotations(itemAnnotations)

  }

  func setCameraRequest(_ request: AmapCameraRequest?) {
    pendingCamera = request
    if request == nil {
      awaitingCameraSettlementRequest = nil
    }
    applyCameraIfReady()
  }

  func setMarkerProjectionRequest(_ request: AmapMarkerProjectionRequest?) {
    guard markerProjectionRequest?.requestKey != request?.requestKey else { return }
    markerProjectionRequest = request
    lastMarkerProjectionSignature = nil
    if awaitingCameraSettlementRequest == nil { emitMarkerProjection() }
  }

  private func emitMarkerProjection() {
    guard hasMapInitCompleted, let nativeMap, let request = markerProjectionRequest,
          nativeMap.bounds.width > 0, nativeMap.bounds.height > 0,
          request.markers.allSatisfy({ isValid($0.coordinate.native) }) else { return }
    var points: [[String: Any]] = []
    for marker in request.markers {
      let point = nativeMap.convert(marker.coordinate.native, toPointTo: nativeMap)
      guard point.x.isFinite, point.y.isFinite else { return }
      points.append(["id": marker.id, "x": Double(point.x), "y": Double(point.y)])
    }
    var event: [String: Any] = [
      "requestKey": request.requestKey,
      "width": Double(nativeMap.bounds.width), "height": Double(nativeMap.bounds.height),
      "points": points,
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]),
          let signature = String(data: data, encoding: .utf8),
          signature != lastMarkerProjectionSignature else { return }
    lastMarkerProjectionSignature = signature
    markerProjectionRevision += 1
    event["revision"] = markerProjectionRevision
    onMarkerProjection(event)
  }

  private func applyCameraIfReady() {
    guard hasMapInitCompleted,
          let nativeMap,
          nativeMap.bounds.width.isFinite, nativeMap.bounds.height.isFinite,
          nativeMap.bounds.width > 0, nativeMap.bounds.height > 0,
          let request = pendingCamera,
          !request.requestKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          !request.coordinates.isEmpty,
          request.coordinates.allSatisfy({ isValid($0.native) }),
          request.requestKey != appliedCameraKey,
          let geometry = visibleMapGeometry(padding: request.padding, bounds: nativeMap.bounds),
          let first = request.coordinates.first else {
      return
    }

    if request.coordinates.count == 1 {
      guard let requestedAnchor = request.screenAnchor?.native,
            isValid(requestedAnchor),
            abs(requestedAnchor.x - geometry.screenAnchor.x) <= 0.002,
            abs(requestedAnchor.y - geometry.screenAnchor.y) <= 0.002,
            let status = nativeMap.getMapStatus() else {
        return
      }
      // Keep the provider-native GCJ-02 target untouched. MAMapStatus positions
      // that coordinate at the visible-rectangle anchor instead of shifting it.
      status.centerCoordinate = first.native
      status.zoomLevel = singlePlaceZoomLevel
      status.screenAnchor = geometry.screenAnchor
      appliedCameraKey = request.requestKey
      awaitingCameraSettlementRequest = request
      nativeMap.setMapStatus(status, animated: request.animated)
      return
    }

    guard setMapScreenAnchor(mapCenterAnchor, on: nativeMap) else { return }
    let annotations = request.coordinates.map { coordinate -> MAPointAnnotation in
      let annotation = MAPointAnnotation()
      annotation.coordinate = coordinate.native
      return annotation
    }
    appliedCameraKey = request.requestKey
    awaitingCameraSettlementRequest = request
    nativeMap.showAnnotations(
      annotations,
      edgePadding: request.padding?.native ?? .zero,
      animated: request.animated
    )
  }

  func mapInitComplete(_ mapView: MAMapView!) {
    hasMapInitCompleted = true
    applyCameraIfReady()
    if awaitingCameraSettlementRequest == nil { emitMarkerProjection() }
  }

  func mapView(_ mapView: MAMapView!, viewFor annotation: MAAnnotation!) -> MAAnnotationView! {
    guard let item = annotation as? ItemAnnotation else { return nil }

    let reuseId = "TravelItemMarker"
    guard let view = mapView.dequeueReusableAnnotationView(withIdentifier: reuseId)
      ?? MAAnnotationView(annotation: item, reuseIdentifier: reuseId) else {
      return nil
    }
    view.annotation = item
    view.canShowCallout = false
    let selected = item.variant == "selected"
    let frameSize = CGSize(width: selected ? 50 : 44, height: selected ? 56 : 48)
    let diameter: CGFloat = selected ? 34 : 28
    let tip = CGPoint(x: frameSize.width / 2, y: frameSize.height - 6)
    view.image = pinImage(size: frameSize, diameter: diameter, color: markerColor(item.variant), showsDot: item.displayText == nil, outlined: selected)
    view.bounds = CGRect(origin: .zero, size: frameSize)
    // The geographic coordinate belongs to the pin's tip, not the head centre.
    view.centerOffset = CGPoint(x: 0, y: frameSize.height / 2 - tip.y)
    view.backgroundColor = .clear
    view.layer.cornerRadius = 0
    view.layer.borderWidth = 0
    view.layer.borderColor = UIColor.clear.cgColor
    view.layer.zPosition = selected ? 10 : 0

    if item.isQuantityCluster {
      let badgeFrame: CGFloat = selected ? 52 : 48
      let badgeDiameter: CGFloat = selected ? 44 : 40
      view.image = nil
      view.bounds = CGRect(x: 0, y: 0, width: badgeFrame, height: badgeFrame)
      view.centerOffset = .zero
      view.backgroundColor = .clear
      let badge: UIView
      if let existing = view.viewWithTag(102) { badge = existing }
      else { badge = UIView(); badge.tag = 102; view.addSubview(badge) }
      badge.isHidden = false
      badge.frame = CGRect(x: 4, y: 4, width: badgeDiameter, height: badgeDiameter)
      badge.backgroundColor = Self.hex(0x4E7580)
      badge.layer.cornerRadius = badgeDiameter / 2
      badge.layer.borderWidth = selected ? 3 : 2
      badge.layer.borderColor = UIColor.white.cgColor
    } else {
      view.viewWithTag(102)?.isHidden = true
    }
    // Remove the former head-circle overlay from reused annotation views.
    view.viewWithTag(103)?.removeFromSuperview()

    let label: UILabel
    if let existing = view.viewWithTag(101) as? UILabel {
      label = existing
    } else {
      label = UILabel(frame: view.bounds)
      label.tag = 101
      label.textAlignment = .center
      label.textColor = .white
      view.addSubview(label)
    }
    label.frame = item.isQuantityCluster
      ? view.bounds.insetBy(dx: 5, dy: 5)
      : CGRect(x: (frameSize.width - diameter) / 2 + 2, y: 4, width: diameter - 4, height: diameter)
    label.font = .boldSystemFont(ofSize: item.isQuantityCluster ? (selected ? 17 : 16) : (selected ? 15 : 13))
    label.adjustsFontSizeToFitWidth = true
    label.minimumScaleFactor = 0.65
    label.isHidden = item.displayText == nil
    label.text = item.displayText
    view.bringSubviewToFront(label)
    view.accessibilityLabel = item.title
    return view
  }

  private func pinImage(size: CGSize, diameter: CGFloat, color: UIColor, showsDot: Bool, outlined: Bool) -> UIImage {
    let centre = CGPoint(x: size.width / 2, y: 4 + diameter / 2)
    let radius = diameter / 2
    let tip = CGPoint(x: centre.x, y: size.height - 6)
    return UIGraphicsImageRenderer(size: size).image { renderer in
      let path = UIBezierPath()
      path.move(to: tip)
      path.addCurve(
        to: CGPoint(x: centre.x - radius, y: centre.y),
        controlPoint1: CGPoint(x: centre.x - 6, y: tip.y - 7),
        controlPoint2: CGPoint(x: centre.x - radius, y: centre.y + radius * 0.8)
      )
      path.addArc(withCenter: centre, radius: radius, startAngle: .pi, endAngle: 0, clockwise: true)
      path.addCurve(
        to: tip,
        controlPoint1: CGPoint(x: centre.x + radius, y: centre.y + radius * 0.8),
        controlPoint2: CGPoint(x: centre.x + 6, y: tip.y - 7)
      )
      path.close()
      renderer.cgContext.saveGState()
      renderer.cgContext.setShadow(offset: CGSize(width: 0, height: 1), blur: 2, color: UIColor.black.withAlphaComponent(0.18).cgColor)
      color.setFill()
      path.fill()
      renderer.cgContext.restoreGState()
      if outlined {
        renderer.cgContext.saveGState()
        path.addClip()
        path.lineWidth = 4
        UIColor.white.setStroke()
        path.stroke()
        renderer.cgContext.restoreGState()
      }
      if showsDot {
        UIColor.black.withAlphaComponent(0.24).setFill()
        UIBezierPath(ovalIn: CGRect(x: centre.x - 3.5, y: centre.y - 3.5, width: 7, height: 7)).fill()
      }
    }
  }

  func mapView(_ mapView: MAMapView!, didSelect view: MAAnnotationView!) {
    guard let item = view.annotation as? ItemAnnotation else { return }
    onMarkerPress(["id": item.itemId])
    mapView.deselectAnnotation(item, animated: false)
  }

  func mapView(_ mapView: MAMapView!, didSingleTappedAt coordinate: CLLocationCoordinate2D) {
    onMapPress(["latitude": coordinate.latitude, "longitude": coordinate.longitude])
  }

  func mapView(
    _ mapView: MAMapView!,
    regionWillChangeAnimated animated: Bool,
    wasUserAction: Bool
  ) {
    if wasUserAction {
      awaitingCameraSettlementRequest = nil
    }
  }

  func mapView(
    _ mapView: MAMapView!,
    regionDidChangeAnimated animated: Bool,
    wasUserAction: Bool
  ) {
    let region = mapView.region
    var viewportEvent: [String: Any] = [
      "latitude": region.center.latitude,
      "longitude": region.center.longitude,
      "latitudeDelta": region.span.latitudeDelta,
      "longitudeDelta": region.span.longitudeDelta
    ]
    if wasUserAction, let appliedCameraKey {
      viewportEvent["userActionRequestKey"] = appliedCameraKey
    }
    onViewportChange(viewportEvent)
    defer { emitMarkerProjection() }
    guard !wasUserAction,
          let request = awaitingCameraSettlementRequest,
          let geometry = visibleMapGeometry(padding: request.padding, bounds: mapView.bounds) else {
      awaitingCameraSettlementRequest = nil
      return
    }

    awaitingCameraSettlementRequest = nil
    let targetProjections = request.coordinates.enumerated().map { index, target in
      let point = mapView.convert(target.native, toPointTo: mapView)
      let isFinite = point.x.isFinite && point.y.isFinite
      return [
        "index": index,
        "targetCoordinate": [
          "latitude": target.latitude,
          "longitude": target.longitude,
        ],
        "screenPoint": ["x": Double(point.x), "y": Double(point.y)],
        "insideVisibleMapRect": isFinite && geometry.rect.contains(point),
      ] as [String: Any]
    }
    onCameraSettled([
      "requestKey": request.requestKey,
      "latitude": region.center.latitude,
      "longitude": region.center.longitude,
      "latitudeDelta": region.span.latitudeDelta,
      "longitudeDelta": region.span.longitudeDelta,
      "visibleMapRect": [
        "x": Double(geometry.rect.minX),
        "y": Double(geometry.rect.minY),
        "width": Double(geometry.rect.width),
        "height": Double(geometry.rect.height),
      ],
      "targetProjections": targetProjections,
    ])
  }

  /// Kept in sync by hand with `src/theme/tokens.ts` → `markerColors`; the two
  /// cannot share constants across the JS/native boundary.
  private func markerColor(_ variant: String) -> UIColor {
    switch variant {
    case "selected": return Self.hex(0x4E7580)
    case "unscheduled": return Self.hex(0x85928D)
    case "cluster": return Self.hex(0x4E7580)
    default: return Self.hex(0x4E7580)
    }
  }

  private static func hex(_ value: UInt32) -> UIColor {
    UIColor(
      red: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: 1
    )
  }
}
