import type { AppLanguage } from "./app-preferences";

export const ecosystemCatalogMessages = {
  plugins: ["Catálogo de plugins", "Plugin catalog", "Catálogo de plugins"],
  methods: ["Métodos disponíveis", "Available Methods", "Métodos disponibles"],
  repository: ["Abrir repositório", "Open repository", "Abrir repositorio"],
  refresh: ["Atualizar catálogo", "Refresh catalog", "Actualizar catálogo"],
  loading: ["Consultando catálogo…", "Loading catalog…", "Consultando catálogo…"],
  unavailable: [
    "Não foi possível consultar o catálogo. Tente novamente.",
    "Could not load the catalog. Try again.",
    "No se pudo consultar el catálogo. Inténtalo de nuevo.",
  ],
  empty: [
    "Nenhum pacote disponível no catálogo.",
    "No packages available in the catalog.",
    "No hay paquetes disponibles en el catálogo.",
  ],
  install: ["Instalar plugin", "Install plugin", "Instalar plugin"],
  installed: ["Instalado", "Installed", "Instalado"],
  import: ["Importar Método", "Import Method", "Importar Método"],
  importHint: [
    "Escolha o Canal e confira as dependências na prévia de importação.",
    "Choose the Channel and review dependencies in the import preview.",
    "Elige el Canal y revisa las dependencias en la vista previa de importación.",
  ],
  permissions: [
    "Instale o pacote e depois revise as permissões antes de ativá-lo.",
    "Install the package, then review permissions before enabling it.",
    "Instala el paquete y revisa los permisos antes de activarlo.",
  ],
  installedNotice: [
    "Plugin instalado. Revise as permissões para ativá-lo.",
    "Plugin installed. Review permissions to enable it.",
    "Plugin instalado. Revisa los permisos para activarlo.",
  ],
  failed: [
    "Não foi possível obter o pacote. Tente novamente.",
    "Could not retrieve the package. Try again.",
    "No se pudo obtener el paquete. Inténtalo de nuevo.",
  ],
  incompatible: [
    "Exige um ContentFlow mais recente",
    "Requires a newer ContentFlow",
    "Requiere un ContentFlow más reciente",
  ],
  updates: ["Verificar atualizações", "Check for updates", "Buscar actualizaciones"],
  upToDate: [
    "Nenhuma atualização compatível disponível. Confira os avisos nos detalhes dos plugins.",
    "No compatible updates available. Review notices in plugin details.",
    "No hay actualizaciones compatibles disponibles. Revisa los avisos en los detalles de los plugins.",
  ],
  available: [
    "Plugins com atualização disponível",
    "Plugins with available updates",
    "Plugins con actualizaciones disponibles",
  ],
} as const;

export function ecosystemCatalogText(
  key: keyof typeof ecosystemCatalogMessages,
  language: AppLanguage,
) {
  return ecosystemCatalogMessages[key][language === "en" ? 1 : language === "es" ? 2 : 0];
}
