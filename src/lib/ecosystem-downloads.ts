const RELEASE_DOWNLOAD_ROOT = "https://github.com/andremjr/contentflow/releases/latest/download";

export const ECOSYSTEM_DOWNLOADS = {
  plugins: `${RELEASE_DOWNLOAD_ROOT}/ContentFlow-Plugins.zip`,
  browserBridge: `${RELEASE_DOWNLOAD_ROOT}/ContentFlow-Browser-Bridge.zip`,
  pluginDevelopmentSkill: `${RELEASE_DOWNLOAD_ROOT}/ContentFlow-Skill-Plugin-Development.zip`,
  methodDevelopmentSkill: `${RELEASE_DOWNLOAD_ROOT}/ContentFlow-Skill-Method-Development.zip`,
} as const;
