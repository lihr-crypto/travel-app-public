import ExpoModulesCore
import CoreLocation
import AMapFoundationKit
import AMapSearchKit

struct AmapSearchCenter: Record {
  @Field var latitude: Double
  @Field var longitude: Double
}

struct AmapDisplayCoordinateInput: Record {
  @Field var latitude: Double
  @Field var longitude: Double
}

/// ExpoModulesCore serializes `Exception.reason` to JavaScript, while the base
/// implementation always returns the literal "undefined reason" and ignores the
/// `description` passed to `Promise.reject(_:_:)`. Carrying the AMap failure text
/// on a subclass that overrides `reason` keeps provider errors diagnosable.
final class AmapSearchFailure: Exception {
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

struct AmapSearchQuery: Record {
  @Field var keyword: String
  @Field var city: String?
  @Field var center: AmapSearchCenter?
  @Field var limit: Int = 10
  @Field var page: Int = 1
}

private let travelPlaceSearchTypes = "风景名胜|住宿服务|餐饮服务|交通设施服务|科教文化服务|商务住宅|生活服务|购物服务|体育休闲服务|政府机构及社会团体|医疗保健服务|金融保险服务"

struct AmapReGeocodeQuery: Record {
  @Field var latitude: Double
  @Field var longitude: Double
  @Field var radius: Int = 1000
}

enum AmapSearchRuntimeConfiguration {
  static var privacyReady = false
  static var configured = false

  static var apiKey: String? {
    let key = Bundle.main.object(forInfoDictionaryKey: "AMapApiKey") as? String
    return key?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? key : nil
  }

  static func configurePrivacy(shown: Bool, includesAmap: Bool, agreed: Bool) -> Bool {
    AMapSearchAPI.updatePrivacyShow(
      AMapPrivacyShowStatus(rawValue: shown ? 1 : 0)!,
      privacyInfo: AMapPrivacyInfoStatus(rawValue: includesAmap ? 1 : 0)!
    )
    AMapSearchAPI.updatePrivacyAgree(
      AMapPrivacyAgreeStatus(rawValue: agreed ? 1 : 0)!
    )

    privacyReady = shown && includesAmap && agreed
    guard privacyReady, let apiKey else {
      configured = false
      return false
    }

    AMapServices.shared().apiKey = apiKey
    configured = true
    return true
  }
}

final class AmapSearchClient: NSObject, AMapSearchDelegate {
  /// AMapSearchAPI.h requires the iOS key to be set *before* the search entry
  /// point is initialized ("初始化之前请正确设置key，否则将无法正常使用搜索服务").
  /// Module construction happens before `setPrivacyStatusAsync` assigns the key,
  /// so the entry point is created lazily on the first request instead.
  private var search: AMapSearchAPI?
  private var pending: [ObjectIdentifier: Promise] = [:]
  private var pendingTips: [ObjectIdentifier: Promise] = [:]

  private func activeSearch() -> AMapSearchAPI? {
    if let search { return search }
    guard AmapSearchRuntimeConfiguration.configured,
          let apiKey = AmapSearchRuntimeConfiguration.apiKey else {
      return nil
    }
    // Re-assert the key immediately before the entry point is created so the
    // documented "key before init" order holds even if another AMap consumer
    // touched AMapServices first.
    AMapServices.shared().apiKey = apiKey
    let created = AMapSearchAPI()
    created?.delegate = self
    search = created
    return created
  }

  func search(query: AmapSearchQuery, promise: Promise) {
    guard let api = activeSearch() else {
      promise.reject(AmapSearchFailure(
        code: "ERR_AMAP_NOT_CONFIGURED",
        reason: "AMap Search requires an iOS key and accepted privacy status."
      ))
      return
    }

    let keyword = query.keyword.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !keyword.isEmpty else {
      promise.reject(AmapSearchFailure(
        code: "ERR_AMAP_INVALID_QUERY",
        reason: "AMap Search keyword is required."
      ))
      return
    }

    let request = AMapPOIKeywordsSearchRequest()
    request.keywords = keyword
    request.offset = min(max(query.limit, 1), 25)
    request.page = min(max(query.page, 1), 100)
    request.types = travelPlaceSearchTypes
    request.sortrule = 1

    if let city = normalized(query.city) {
      request.city = city
      request.cityLimit = true
    }
    if let center = query.center {
      request.location = AMapGeoPoint.location(
        withLatitude: center.latitude,
        longitude: center.longitude
      )
    }

    pending[ObjectIdentifier(request)] = promise
    api.aMapPOIKeywordsSearch(request)
  }

  func inputTips(query: AmapSearchQuery, promise: Promise) {
    guard let api = activeSearch() else {
      promise.reject(AmapSearchFailure(
        code: "ERR_AMAP_NOT_CONFIGURED",
        reason: "AMap Search requires an iOS key and accepted privacy status."
      ))
      return
    }

    let keyword = query.keyword.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !keyword.isEmpty else {
      promise.reject(AmapSearchFailure(
        code: "ERR_AMAP_INVALID_QUERY",
        reason: "AMap Search keyword is required."
      ))
      return
    }

    let request = AMapInputTipsSearchRequest()
    request.keywords = keyword
    request.types = travelPlaceSearchTypes
    if let city = normalized(query.city) {
      request.city = city
      request.cityLimit = true
    }
    if let center = query.center {
      request.location = "\(center.longitude),\(center.latitude)"
    }
    pendingTips[ObjectIdentifier(request)] = promise
    api.aMapInputTipsSearch(request)
  }

  func reverseGeocode(query: AmapReGeocodeQuery, promise: Promise) {
    guard let api = activeSearch() else {
      promise.reject(AmapSearchFailure(
        code: "ERR_AMAP_NOT_CONFIGURED",
        reason: "AMap Search requires an iOS key and accepted privacy status."
      ))
      return
    }

    guard query.latitude.isFinite,
          query.longitude.isFinite,
          (-90...90).contains(query.latitude),
          (-180...180).contains(query.longitude) else {
      promise.reject(AmapSearchFailure(
        code: "ERR_AMAP_INVALID_QUERY",
        reason: "AMap re-geocode coordinate is invalid."
      ))
      return
    }

    let request = AMapReGeocodeSearchRequest()
    request.location = AMapGeoPoint.location(
      withLatitude: query.latitude,
      longitude: query.longitude
    )
    request.radius = min(max(query.radius, 1), 3000)
    // POIs come back only when extension data is requested.
    request.requireExtension = true

    pending[ObjectIdentifier(request)] = promise
    api.aMapReGoecodeSearch(request)
  }

  func onPOISearchDone(
    _ request: AMapPOISearchBaseRequest!,
    response: AMapPOISearchResponse!
  ) {
    guard let request,
          let promise = pending.removeValue(forKey: ObjectIdentifier(request)) else {
      return
    }

    let results = (response?.pois ?? []).map(serialize)
    let suggestions = (response?.suggestion?.keywords ?? []).compactMap(normalized)
    promise.resolve([
      "results": results,
      "count": response?.count ?? results.count,
      "suggestions": suggestions,
    ])
  }

  func onInputTipsSearchDone(
    _ request: AMapInputTipsSearchRequest!,
    response: AMapInputTipsSearchResponse!
  ) {
    guard let request,
          let promise = pendingTips.removeValue(forKey: ObjectIdentifier(request)) else {
      return
    }
    promise.resolve((response?.tips ?? []).map(serialize))
  }

  func onReGeocodeSearchDone(
    _ request: AMapReGeocodeSearchRequest!,
    response: AMapReGeocodeSearchResponse!
  ) {
    guard let request,
          let promise = pending.removeValue(forKey: ObjectIdentifier(request)) else {
      return
    }

    guard let regeocode = response?.regeocode else {
      // The provider answered but had no address for this coordinate.
      promise.resolve(nil)
      return
    }
    promise.resolve(serialize(regeocode))
  }

  func aMapSearchRequest(_ request: Any!, didFailWithError error: Error!) {
    let identifier: ObjectIdentifier?
    if let searchRequest = request as? AMapPOISearchBaseRequest {
      identifier = ObjectIdentifier(searchRequest)
    } else if let tipsRequest = request as? AMapInputTipsSearchRequest {
      identifier = ObjectIdentifier(tipsRequest)
    } else if let reGeocodeRequest = request as? AMapReGeocodeSearchRequest {
      identifier = ObjectIdentifier(reGeocodeRequest)
    } else {
      identifier = nil
    }

    // AMap answers key/configuration failures without echoing the original
    // request object. Attribute such an answer to the only outstanding request
    // instead of dropping it, which would leave the promise unresolved forever.
    let promise = identifier.flatMap { pending.removeValue(forKey: $0) }
      ?? identifier.flatMap { pendingTips.removeValue(forKey: $0) }
      ?? takeSolePending()

    guard let promise else { return }
    promise.reject(AmapSearchFailure(
      code: "ERR_AMAP_PROVIDER",
      reason: describe(error)
    ))
  }

  private func takeSolePending() -> Promise? {
    guard pending.count + pendingTips.count == 1 else { return nil }
    if let entry = pending.first {
      pending.removeValue(forKey: entry.key)
      return entry.value
    }
    guard let entry = pendingTips.first else { return nil }
    pendingTips.removeValue(forKey: entry.key)
    return entry.value
  }

  private func describe(_ error: Error?) -> String {
    guard let error else { return "AMap Search failed." }
    let failure = error as NSError
    let message = failure.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !message.isEmpty, message != "(null)" else {
      return "\(failure.domain) (\(failure.code))"
    }
    return "\(failure.domain) (\(failure.code)): \(message)"
  }

  private func serialize(_ poi: AMapPOI) -> [String: Any] {
    var result: [String: Any] = [
      "name": poi.name ?? "",
      "latitude": Double(poi.location?.latitude ?? .nan),
      "longitude": Double(poi.location?.longitude ?? .nan),
    ]
    add(normalized(poi.uid), to: &result, key: "uid")
    add(normalized(poi.address), to: &result, key: "address")
    add(normalized(poi.province), to: &result, key: "province")
    add(normalized(poi.city), to: &result, key: "city")
    add(normalized(poi.district), to: &result, key: "district")
    add(normalized(poi.type), to: &result, key: "type")
    add(normalized(poi.typecode), to: &result, key: "typeCode")
    return result
  }

  private func serialize(_ tip: AMapTip) -> [String: Any] {
    var result: [String: Any] = ["name": tip.name ?? ""]
    add(normalized(tip.uid), to: &result, key: "uid")
    add(normalized(tip.address), to: &result, key: "address")
    add(normalized(tip.district), to: &result, key: "district")
    add(normalized(tip.typecode), to: &result, key: "typeCode")
    if let location = tip.location {
      result["latitude"] = Double(location.latitude)
      result["longitude"] = Double(location.longitude)
    }
    return result
  }

  private func serialize(_ regeocode: AMapReGeocode) -> [String: Any] {
    var result: [String: Any] = [:]

    if let component = regeocode.addressComponent {
      add(normalized(component.province), to: &result, key: "province")
      add(normalized(component.city), to: &result, key: "city")
      add(normalized(component.district), to: &result, key: "district")
      add(normalized(component.township), to: &result, key: "township")
      add(normalized(component.neighborhood), to: &result, key: "neighborhood")
      add(normalized(component.building), to: &result, key: "building")
      add(normalized(component.adcode), to: &result, key: "adcode")
    }

    add(normalized(regeocode.formattedAddress), to: &result, key: "formattedAddress")

    if let poi = regeocode.pois?.first {
      add(normalized(poi.name), to: &result, key: "poiName")
      add(normalized(poi.uid), to: &result, key: "poiUid")
      add(normalized(poi.type), to: &result, key: "poiType")
    }

    return result
  }

  private func normalized(_ value: String?) -> String? {
    let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
    return normalized?.isEmpty == false ? normalized : nil
  }

  private func add(_ value: String?, to result: inout [String: Any], key: String) {
    if let value {
      result[key] = value
    }
  }
}

public class ExpoAmapSearchModule: Module {
  private let client = AmapSearchClient()

  public func definition() -> ModuleDefinition {
    Name("ExpoAmapSearch")

    AsyncFunction("setPrivacyStatusAsync") {
      (shown: Bool, includesAmap: Bool, agreed: Bool) -> Bool in
      AmapSearchRuntimeConfiguration.configurePrivacy(
        shown: shown,
        includesAmap: includesAmap,
        agreed: agreed
      )
    }.runOnQueue(.main)

    Function("isConfigured") {
      AmapSearchRuntimeConfiguration.configured
        && AmapSearchRuntimeConfiguration.privacyReady
        && AmapSearchRuntimeConfiguration.apiKey != nil
    }

    AsyncFunction("convertCoordinatesToWgs84Async") {
      (coordinates: [AmapDisplayCoordinateInput]) throws -> [[String: Double]] in
      do {
        return try coordinates.map { coordinate in
          let converted = try AmapDisplayCoordinateConverter.toWGS84(
            AmapDisplayCoordinate(
              latitude: coordinate.latitude,
              longitude: coordinate.longitude
            ),
            forward: { candidate in
              let result = AMapCoordinateConvert(
                CLLocationCoordinate2D(
                  latitude: candidate.latitude,
                  longitude: candidate.longitude
                ),
                .GPS
              )
              return AmapDisplayCoordinate(
                latitude: result.latitude,
                longitude: result.longitude
              )
            }
          )
          return ["latitude": converted.latitude, "longitude": converted.longitude]
        }
      } catch let error as AmapDisplayCoordinateError {
        throw AmapSearchFailure(
          code: "ERR_AMAP_COORDINATE_CONVERSION",
          reason: error.message
        )
      }
    }

    AsyncFunction("searchAsync") {
      (query: AmapSearchQuery, promise: Promise) in
      client.search(query: query, promise: promise)
    }.runOnQueue(.main)

    AsyncFunction("inputTipsAsync") {
      (query: AmapSearchQuery, promise: Promise) in
      client.inputTips(query: query, promise: promise)
    }.runOnQueue(.main)

    AsyncFunction("reverseGeocodeAsync") {
      (query: AmapReGeocodeQuery, promise: Promise) in
      client.reverseGeocode(query: query, promise: promise)
    }.runOnQueue(.main)
  }
}
