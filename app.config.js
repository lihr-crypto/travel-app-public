const DEVELOPMENT_BUNDLE_ID = 'com.example.travelapp.dev';

module.exports = ({ config }) => {
  const googleKey = process.env.GOOGLE_MAPS_IOS_API_KEY?.trim();
  const amapKey = process.env.AMAP_IOS_API_KEY?.trim();

  if (process.env.EXPO_MAPS_REQUIRE_KEYS === '1' && (!googleKey || !amapKey)) {
    throw new Error(
      'Map build requires GOOGLE_MAPS_IOS_API_KEY and AMAP_IOS_API_KEY in ignored .env.local.',
    );
  }

  const existingInfoPlist = config.ios?.infoPlist ?? {};
  const existingQuerySchemes = Array.isArray(existingInfoPlist.LSApplicationQueriesSchemes)
    ? existingInfoPlist.LSApplicationQueriesSchemes
    : [];
  const querySchemes = [...new Set([...existingQuerySchemes, 'iosamap'])];

  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: process.env.EXPO_IOS_BUNDLE_IDENTIFIER?.trim() || DEVELOPMENT_BUNDLE_ID,
      appleTeamId: process.env.EXPO_APPLE_TEAM_ID?.trim() || undefined,
      infoPlist: {
        ...existingInfoPlist,
        LSApplicationQueriesSchemes: querySchemes,
        // iOS 27 requires a build made with the current SDK to adopt the UIScene
        // life cycle; without this manifest UIKit traps at launch. The named
        // delegate lives in `ios/TravelApp/AppDelegate.swift`.
        UIApplicationSceneManifest: {
          UIApplicationSupportsMultipleScenes: false,
          UISceneConfigurations: {
            UIWindowSceneSessionRoleApplication: [
              {
                UISceneConfigurationName: 'Default Configuration',
                UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
              },
            ],
          },
        },
        ...(amapKey ? { AMapApiKey: amapKey } : {}),
        NSLocationWhenInUseUsageDescription:
          '地图 SDK 可能访问定位能力；行程浏览本身不会自动请求您的位置。',
      },
    },
    plugins: [
      ...(config.plugins ?? []),
      // `expo prebuild` regenerates AppDelegate.swift and would drop the UIScene
      // adoption, which reintroduces the iOS 27 launch crash. See the plugin.
      './plugins/with-ios-scene-lifecycle',
      ['react-native-maps', { iosGoogleMapsApiKey: googleKey }],
    ],
  };
};
