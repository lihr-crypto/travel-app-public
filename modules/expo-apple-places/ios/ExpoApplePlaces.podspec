Pod::Spec.new do |s|
  s.name           = 'ExpoApplePlaces'
  s.version        = '1.0.0'
  s.summary        = 'Native Apple MapKit place search and reverse geocoding'
  s.description    = 'A keyless Expo boundary for Apple MapKit search and reverse geocoding.'
  s.author         = 'Travel App'
  s.homepage       = 'https://developer.apple.com/documentation/mapkit'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit', 'CoreLocation'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
