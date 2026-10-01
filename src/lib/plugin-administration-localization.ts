import type { AppLanguage } from "./app-preferences";

export type PluginAdministrationCompatibility = {
  status: "compatible" | "incompatible";
  reason?: "unsupported_api" | "core_version" | "invalid_manifest" | "missing_metadata";
};

export const pluginAdministrationMessages = {
  incompatible: ["Plugin incompatível", "Incompatible plugin", "Plugin incompatible"],
  unsupported_api: [
    "Esta versão usa uma API de plugin não suportada. Atualize para API2 antes de executar.",
    "This version uses an unsupported plugin API. Update to API2 before running.",
    "Esta versión usa una API de plugin no compatible. Actualiza a API2 antes de ejecutar.",
  ],
  core_version: [
    "Esta versão exige um ContentFlow mais recente.",
    "This version requires a newer ContentFlow.",
    "Esta versión requiere un ContentFlow más reciente.",
  ],
  invalid_manifest: [
    "O pacote instalado é inválido. Atualize com um pacote API2 válido.",
    "The installed package is invalid. Update with a valid API2 package.",
    "El paquete instalado no es válido. Actualiza con un paquete API2 válido.",
  ],
  missing_metadata: [
    "O catálogo não informa a compatibilidade da API. Use uma pasta API2 validada.",
    "The catalog does not declare API compatibility. Use a validated API2 folder.",
    "El catálogo no declara compatibilidad de API. Usa una carpeta API2 validada.",
  ],
  blockedCatalog: [
    "Versão do catálogo incompatível",
    "Incompatible catalog version",
    "Versión del catálogo incompatible",
  ],
  executionBlocked: [
    "Execução bloqueada até uma atualização compatível. Seus dados locais estão preservados.",
    "Execution is blocked until a compatible update. Your local data is preserved.",
    "La ejecución está bloqueada hasta una actualización compatible. Tus datos locales se conservan.",
  ],
  apiVersion: ["API do plugin", "Plugin API", "API del plugin"],
  minCoreVersion: ["ContentFlow mínimo", "Minimum ContentFlow", "ContentFlow mínimo"],
  updateAvailable: ["Atualização disponível", "Update available", "Actualización disponible"],
} as const;

export function pluginAdministrationText(
  key: keyof typeof pluginAdministrationMessages,
  language: AppLanguage,
) {
  return pluginAdministrationMessages[key][language === "en" ? 1 : language === "es" ? 2 : 0];
}
