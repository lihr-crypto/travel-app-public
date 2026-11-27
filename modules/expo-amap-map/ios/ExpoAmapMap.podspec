Pod::Spec.new do |s|
  s.name           = 'ExpoAmapMap'
  s.version        = '1.0.0'
  s.summary        = 'Thin AMap iOS map view for the Travel App'
  s.description    = 'Marker, camera and interaction bridge for the AMap iOS SDK.'
  s.author         = 'Travel App'
  s.homepage       = 'https://lbs.amap.com/api/maps-sdk-for-ios/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'AMap3DMap', '~> 11.2'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
