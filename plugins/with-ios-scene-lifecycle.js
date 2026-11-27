/**
 * Re-applies the UIScene life-cycle adoption that `expo prebuild` cannot know about.
 *
 * `ios/TravelApp/AppDelegate.swift` is template-owned: `expo prebuild` clears and
 * regenerates `ios/`, so every hand-written line in that file is lost on the next
 * prebuild. Losing it reintroduces the iOS 27 launch crash
 * (`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`), and the crash
 * only shows up at runtime on a device.
 *
 * The `Info.plist` half of that fix is already durable because it lives in
 * `app.config.js`. This plugin makes the Swift half durable too, by injecting it
 * into the freshly generated file inside `// @generated` regions. The injection is
 * idempotent: the regions are stripped first, so running prebuild repeatedly, or
 * running it over an already-injected file, produces byte-identical output.
 *
 * Both injected regions are pure additions that need no knowledge of the template
 * beyond two anchors, and a missing anchor fails loudly instead of silently
 * shipping a build that crashes at launch.
 *
 * The transformation is exported so `tests/config/ios-scene-lifecycle-plugin.test.ts`
 * can prove the fixed-point and idempotence properties without running prebuild.
 */

const { withAppDelegate } = require('@expo/config-plugins');

const METHOD_REGION = 'travel-app-scene-method';
const CLASS_REGION = 'travel-app-scene-class';
const SYNC = 'sync-travel-app-scene-lifecycle';

/** Template-owned lines this plugin relies on; both are stable across SDK 5x. */
const APP_DELEGATE_CLASS = 'class AppDelegate: ExpoAppDelegate';
const METHOD_ANCHOR = '  // Linking API';

/**
 * The window is created by the scene, not by `didFinishLaunchingWithOptions`:
 * since iOS 27 a build made with the current SDK must adopt the UIScene life
 * cycle, and only a scene can hand out a `UIWindowScene`.
 */
const METHOD_BODY = `#if os(iOS) || os(tvOS)
  /**
   Creates the app window for a connecting scene and starts React Native in it.

   The window used to be created in \`didFinishLaunchingWithOptions\` from
   \`UIScreen.main.bounds\`. Since iOS 27 a build made with the current SDK must
   adopt the UIScene life cycle, otherwise UIKit traps in
   \`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption\`. The scene is
   the only place that can hand out a \`UIWindowScene\`, so the window — and with
   it the React Native root view — is created here instead. \`Info.plist\` names
   this file's \`SceneDelegate\` for the default window-scene role.
   */
  func startReactNative(
    in windowScene: UIWindowScene,
    launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> UIWindow {
    let sceneWindow = UIWindow(windowScene: windowScene)
    // Kept for \`UIApplicationDelegate.window\` consumers.
    window = sceneWindow
    reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: sceneWindow,
      launchOptions: launchOptions)
    return sceneWindow
  }
#endif`;

/**
 * Owns the single app window. URL and universal-link delivery is forwarded to
 * `AppDelegate`, so `expo-linking` / `expo-router` keep receiving it unchanged.
 */
const CLASS_BODY = `#if os(iOS) || os(tvOS)
/**
 Owns the single app window in the UIScene life cycle.

 Only window ownership and the React Native start moved here. URL and
 universal-link delivery is forwarded to \`AppDelegate\`, so the existing
 \`expo-linking\` / \`expo-router\` subscribers keep receiving it exactly as before.
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
     A cold launch by URL delivers it in \`connectionOptions\`, not through
     \`scene(_:openURLContexts:)\` — that callback only fires for a URL arriving
     while the app is already running. Without this forwarding a
     \`travel-app://…\` cold launch opened the app at its initial route and the
     link was silently dropped, which broke every deep-linked device check.
     \`RCTLinkingManager\` buffers the URL until the bridge is up, so forwarding
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
#endif`;

function beginMarker(name) {
  return `// @generated begin ${name} - expo prebuild (DO NOT MODIFY) ${SYNC}`;
}

function endMarker(name) {
  return `// @generated end ${name}`;
}

function region(name, body) {
  return `${beginMarker(name)}\n${body}\n${endMarker(name)}`;
}

/**
 * Removes both injected regions, including the separator blank lines around them,
 * so the result is exactly what the template would have produced on its own.
 */
function stripSceneLifecycle(contents) {
  const method = new RegExp(
    `^${escapeRegExp(beginMarker(METHOD_REGION))}\\n[\\s\\S]*?^${escapeRegExp(endMarker(METHOD_REGION))}\\n\\n?`,
    'm',
  );
  const klass = new RegExp(
    `\\n\\n?^${escapeRegExp(beginMarker(CLASS_REGION))}\\n[\\s\\S]*?^${escapeRegExp(endMarker(CLASS_REGION))}\\n?`,
    'm',
  );
  return contents.replace(method, '').replace(klass, '\n');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The template still creates the window from `UIScreen.main.bounds` inside
 * `didFinishLaunchingWithOptions`. Once the scene delegate owns the window that
 * would create a second one — and the legacy window is built before any scene
 * connects — so the block is removed rather than left in place.
 */
const LEGACY_WINDOW_BLOCK = new RegExp(
  '^#if os\\(iOS\\) \\|\\| os\\(tvOS\\)\\n'
  + '    window = UIWindow\\(frame: UIScreen\\.main\\.bounds\\)\\n'
  + '    factory\\.startReactNative\\(\\n'
  + '      withModuleName: "main",\\n'
  + '      in: window,\\n'
  + '      launchOptions: launchOptions\\)\\n'
  + '#endif\\n\\n?',
  'm',
);

/**
 * The one string that must not survive into the built app.
 *
 * It is the window construction, not the bare path: the injected comment names
 * `UIScreen.main.bounds` too, and only the code is a problem.
 */
const LEGACY_WINDOW_MARKER = 'UIWindow(frame: UIScreen.main.bounds)';

function stripLegacySceneWindow(contents) {
  return contents.replace(LEGACY_WINDOW_BLOCK, '');
}

/**
 * Strips any previous injection and re-applies it.
 *
 * `applySceneLifecycle(stripSceneLifecycle(x))` is a fixed point, and
 * `applySceneLifecycle` is idempotent, so prebuild can run any number of times.
 */
function applySceneLifecycle(contents) {
  const stripped = stripSceneLifecycle(contents);

  if (!stripped.includes(APP_DELEGATE_CLASS)) {
    throw new Error(
      `withIosSceneLifecycle: the generated AppDelegate.swift no longer contains "${APP_DELEGATE_CLASS}". `
      + 'The Expo iOS template changed; re-derive plugins/with-ios-scene-lifecycle.js before building.',
    );
  }
  if (!stripped.includes(METHOD_ANCHOR)) {
    throw new Error(
      `withIosSceneLifecycle: the generated AppDelegate.swift no longer contains the anchor "${METHOD_ANCHOR}". `
      + 'Without it the SceneDelegate cannot be installed, and a build would crash at launch on iOS 27. '
      + 'Re-derive plugins/with-ios-scene-lifecycle.js before building.',
    );
  }

  const withoutLegacyWindow = stripLegacySceneWindow(stripped);
  /*
   * A template that reshaped the legacy window block would leave it in place and
   * silently produce two windows, so the removal is verified rather than trusted.
   */
  if (withoutLegacyWindow.includes(LEGACY_WINDOW_MARKER)) {
    throw new Error(
      `withIosSceneLifecycle: the generated AppDelegate.swift still creates a window from "${LEGACY_WINDOW_MARKER}" `
      + 'in a shape this plugin does not recognise. Leaving it would create two windows once the scene delegate '
      + 'is installed. Re-derive plugins/with-ios-scene-lifecycle.js before building.',
    );
  }

  const withMethod = withoutLegacyWindow.replace(
    METHOD_ANCHOR,
    `${region(METHOD_REGION, METHOD_BODY)}\n\n${METHOD_ANCHOR}`,
  );

  return `${withMethod.replace(/\s*$/, '')}\n\n${region(CLASS_REGION, CLASS_BODY)}\n`;
}

module.exports = function withIosSceneLifecycle(config) {
  return withAppDelegate(config, (cfg) => {
    cfg.modResults.contents = applySceneLifecycle(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.applySceneLifecycle = applySceneLifecycle;
module.exports.stripSceneLifecycle = stripSceneLifecycle;
module.exports.stripLegacySceneWindow = stripLegacySceneWindow;
module.exports.METHOD_REGION = METHOD_REGION;
module.exports.CLASS_REGION = CLASS_REGION;
module.exports.METHOD_ANCHOR = METHOD_ANCHOR;
module.exports.APP_DELEGATE_CLASS = APP_DELEGATE_CLASS;
module.exports.LEGACY_WINDOW_MARKER = LEGACY_WINDOW_MARKER;
