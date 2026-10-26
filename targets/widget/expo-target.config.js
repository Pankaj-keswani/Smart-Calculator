// iPhone widget extension for VoiceCalc AI (home screen, lock screen and Control Center).
// Built by @bacons/apple-targets during `expo prebuild` / EAS Build.

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'VoiceCalcWidget',
  displayName: 'VoiceCalc AI',
  bundleIdentifier: '.widget',
  // Control Center controls need iOS 18; the main app still supports older iOS.
  deploymentTarget: '18.0',
  colors: {
    $accent: '#E6D01B',
    $widgetBackground: '#0F0F0F',
  },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
