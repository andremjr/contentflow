const RELEASE_DOWNLOAD_ROOT = "https://github.com/andremjr/contentflow/releases/latest/download";
const ECOSYSTEM_PAGE = "https://andremjr.github.io/contentflow/ecosystem/";

export const ECOSYSTEM_DOWNLOADS = {
  plugins: `${ECOSYSTEM_PAGE}?category=plugins`,
  methods: `${ECOSYSTEM_PAGE}?category=methods`,
  browserBridge: `${RELEASE_DOWNLOAD_ROOT}/ContentFlow-Browser-Bridge.zip`,
  pluginDevelopmentSkill: `${RELEASE_DOWNLOAD_ROOT}/ContentFlow-Skill-Plugin-Development.zip`,
  methodDevelopmentSkill: `${RELEASE_DOWNLOAD_ROOT}/ContentFlow-Skill-Method-Development.zip`,
} as const;
