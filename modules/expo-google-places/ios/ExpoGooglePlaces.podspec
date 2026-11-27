Pod::Spec.new do |s|
  s.name           = 'ExpoGooglePlaces'
  s.version        = '1.0.0'
  s.summary        = 'Thin Google Places Swift SDK boundary for the Travel App'
  s.description    = 'SDK initialization boundary for provider-native Google place search.'
  s.author         = 'Travel App'
  s.homepage       = 'https://developers.google.com/maps/documentation/places/ios-sdk'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'GooglePlacesSwift', '10.15.0'
  s.dependency 'GoogleMaps', '9.4.0'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
