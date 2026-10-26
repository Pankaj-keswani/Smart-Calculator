// Adds VoiceCalc AI's App Intents (Siri, Shortcuts, Spotlight, Action button,
// Control Center) to the main iOS app target during `expo prebuild` / EAS Build.
//
// - targets/widget/SharedIntents.swift is also compiled into the widget extension,
//   because a Control Center button that opens the app needs its intent in both.
// - plugins/ios/VoiceCalcShortcuts.swift (the Siri phrases) belongs to the app only.

const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withFinalizedMod, withXcodeProject } = require('expo/config-plugins');

const FILES = [
  { from: 'targets/widget/SharedIntents.swift', name: 'SharedIntents.swift' },
  { from: 'plugins/ios/VoiceCalcShortcuts.swift', name: 'VoiceCalcShortcuts.swift' },
];

function withCopiedSwiftFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      const destDir = path.join(platformProjectRoot, projectName);
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of FILES) {
        fs.copyFileSync(path.join(projectRoot, file.from), path.join(destDir, file.name));
      }
      return cfg;
    },
  ]);
}

function withSwiftSourcesInAppTarget(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const { projectName } = cfg.modRequest;
    const appTarget = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
    for (const file of FILES) {
      const filepath = `${projectName}/${file.name}`;
      if (!project.hasFile(filepath)) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
          filepath,
          groupName: projectName,
          project,
          targetUuid: appTarget.uuid,
        });
      }
    }
    return cfg;
  });
}

// The widget target is generated with MARKETING_VERSION 1.0; App Store Connect expects
// extensions to carry the same version (and build number) as the app that contains them.
function withWidgetVersionMatchingApp(config) {
  return withFinalizedMod(config, [
    'ios',
    async (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      const pbxPath = path.join(platformProjectRoot, `${projectName}.xcodeproj`, 'project.pbxproj');
      if (!fs.existsSync(pbxPath)) return cfg;
      const version = String(cfg.version || '1.0');
      const buildNumber = String((cfg.ios && cfg.ios.buildNumber) || '1');
      const pbx = fs.readFileSync(pbxPath, 'utf8');
      const updated = pbx.replace(
        /buildSettings = \{[^}]*?\};/gs,
        (block) => {
          if (!block.includes('targets/widget/Info.plist')) return block;
          return block
            .replace(/MARKETING_VERSION = [^;]+;/, `MARKETING_VERSION = ${version};`)
            .replace(/CURRENT_PROJECT_VERSION = [^;]+;/, `CURRENT_PROJECT_VERSION = ${buildNumber};`);
        }
      );
      if (updated !== pbx) fs.writeFileSync(pbxPath, updated);
      return cfg;
    },
  ]);
}

module.exports = function withVoiceCalcAppIntents(config) {
  return withWidgetVersionMatchingApp(withSwiftSourcesInAppTarget(withCopiedSwiftFiles(config)));
};
