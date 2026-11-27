internal import Expo
import React
import ReactAppDependencyProvider

// @generated begin react-native-maps-import - expo prebuild (DO NOT MODIFY) sync-<SYNC_HASH>
#if canImport(GoogleMaps)
import GoogleMaps
#endif
// @generated end react-native-maps-import
@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

// @generated begin react-native-maps-init - expo prebuild (DO NOT MODIFY) sync-<SYNC_HASH>
#if canImport(GoogleMaps)
GMSServices.provideAPIKey("<GOOGLE_MAPS_API_KEY>")
#endif
// @generated end react-native-maps-init
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

// @generated begin travel-app-scene-method - expo prebuild (DO NOT MODIFY) sync-travel-app-scene-lifecycle
#if os(iOS) || os(tvOS)
  /**
   Creates the app window for a connecting scene and starts React Native in it.

   The window used to be created in `didFinishLaunchingWithOptions` from
   `UIScreen.main.bounds`. Since iOS 27 a build made with the current SDK must
   adopt the UIScene life cycle, otherwise UIKit traps in
   `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. The scene is
   the only place that can hand out a `UIWindowScene`, so the window — and with
   it the React Native root view — is created here instead. `Info.plist` names
   this file's `SceneDelegate` for the default window-scene role.
   */
  func startReactNative(
    in windowScene: UIWindowScene,
    launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> UIWindow {
    let sceneWindow = UIWindow(windowScene: windowScene)
    // Kept for `UIApplicationDelegate.window` consumers.
    window = sceneWindow
    reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: sceneWindow,
      launchOptions: launchOptions)
    return sceneWindow
  }
#endif
// @generated end travel-app-scene-method

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

// @generated begin travel-app-scene-class - expo prebuild (DO NOT MODIFY) sync-travel-app-scene-lifecycle
#if os(iOS) || os(tvOS)
/**
 Owns the single app window in the UIScene life cycle.

 Only window ownership and the React Native start moved here. URL and
 universal-link delivery is forwarded to `AppDelegate`, so the existing
 `expo-linking` / `expo-router` subscribers keep receiving it exactly as before.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }
    window = appDelegate.startReactNative(in: windowScene, launchOptions: nil)
    window?.makeKeyAndVisible()

    /*
     A cold launch by URL delivers it in `connectionOptions`, not through
     `scene(_:openURLContexts:)` — that callback only fires for a URL arriving
     while the app is already running. Without this forwarding a
     `travel-app://…` cold launch opened the app at its initial route and the
     link was silently dropped, which broke every deep-linked device check.
     `RCTLinkingManager` buffers the URL until the bridge is up, so forwarding
     here — before React subscribes — is the supported order.
     */
    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
    if let userActivity = connectionOptions.userActivities.first {
      self.scene(scene, continue: userActivity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in })
  }
}
#endif
// @generated end travel-app-scene-class
