import ExpoModulesCore
import CoreLocation
import MAMapKit
import UIKit
import UIKit

enum AmapRuntimeConfiguration {
  static var privacyReady = false

  static var apiKey: String? {
    let key = Bundle.main.object(forInfoDictionaryKey: "AMapApiKey") as? String
    return key?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? key : nil
  }

  static func setPrivacyStatus(shown: Bool, includesAmap: Bool, agreed: Bool) {
    MAMapView.updatePrivacyShow(
      AMapPrivacyShowStatus(rawValue: shown ? 1 : 0)!,
      privacyInfo: AMapPrivacyInfoStatus(rawValue: includesAmap ? 1 : 0)!
    )
    MAMapView.updatePrivacyAgree(AMapPrivacyAgreeStatus(rawValue: agreed ? 1 : 0)!)
    privacyReady = shown && includesAmap && agreed
  }
}

struct AmapCoordinate: Record {
  @Field var latitude: Double
  @Field var longitude: Double

  var native: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
  }
}

struct AmapMarker: Record {
  @Field var id: String
  @Field var coordinate: AmapCoordinate
  @Field var ordinal: Int?
  @Field var label: String?
  @Field var variant: String
  @Field var sourceItemIds: [String]?
  @Field var clusterCount: Int?
}

struct AmapProjectionMarker: Record {
  @Field var id: String
  @Field var coordinate: AmapCoordinate
}

struct AmapMarkerProjectionRequest: Record {
  @Field var requestKey: String
  @Field var markers: [AmapProjectionMarker]
}

struct AmapPadding: Record {
  @Field var top: Double
  @Field var right: Double
  @Field var bottom: Double
  @Field var left: Double

  var native: UIEdgeInsets {
    UIEdgeInsets(
      top: CGFloat(top), left: CGFloat(left),
      bottom: CGFloat(bottom), right: CGFloat(right)
    )
  }
}

struct AmapScreenAnchor: Record {
  @Field var x: Double
  @Field var y: Double

  var native: CGPoint {
    CGPoint(x: CGFloat(x), y: CGFloat(y))
  }
}

struct AmapCameraRequest: Record {
  @Field var coordinates: [AmapCoordinate]
  @Field var padding: AmapPadding?
  @Field var requestKey: String
  @Field var screenAnchor: AmapScreenAnchor?
  @Field var animated: Bool = true
}

public class ExpoAmapMapModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoAmapMap")

    AsyncFunction("setPrivacyStatusAsync") {
      (shown: Bool, includesAmap: Bool, agreed: Bool) -> Bool in
      AmapRuntimeConfiguration.setPrivacyStatus(
        shown: shown, includesAmap: includesAmap, agreed: agreed
      )
      return AmapRuntimeConfiguration.privacyReady
        && AmapRuntimeConfiguration.apiKey != nil
    }.runOnQueue(.main)

    View(ExpoAmapMapView.self) {
      Prop("markers") { (view: ExpoAmapMapView, markers: [AmapMarker]) in
        view.setMarkers(markers)
      }

      Prop("cameraRequest") { (view: ExpoAmapMapView, request: AmapCameraRequest?) in
        view.setCameraRequest(request)
      }

      Prop("markerProjectionRequest") { (view: ExpoAmapMapView, request: AmapMarkerProjectionRequest?) in
        view.setMarkerProjectionRequest(request)
      }

      Events("onMarkerPress", "onMapPress", "onViewportChange", "onCameraSettled", "onMarkerProjection")
    }
  }
}
