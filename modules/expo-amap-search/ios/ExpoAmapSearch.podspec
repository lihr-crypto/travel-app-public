Pod::Spec.new do |s|
  s.name           = 'ExpoAmapSearch'
  s.version        = '1.0.0'
  s.summary        = 'Thin AMap iOS Search SDK boundary for the Travel App'
  s.description    = 'Privacy and SDK initialization boundary for provider-native AMap place search.'
  s.author         = 'Travel App'
  s.homepage       = 'https://lbs.amap.com/api/maps-sdk-for-ios/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'AMapSearch', '9.8.1'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
