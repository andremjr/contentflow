import type { AppLanguage } from "./app-preferences";

export const upgradeTranslations = {
  "pt-BR": {
    BACKUP_CONFIRMATION_REQUIRED: "Confirme a criação do backup antes de aplicar.",
    UPGRADE_BUSY: "Uma migração já está em andamento. Aguarde e atualize o plano.",
    PLAN_CHANGED: "O plano mudou. Atualize e revise antes de confirmar novamente.",
    UPGRADE_AMBIGUOUS: "Há dados ambíguos. Consulte os diagnósticos e o guia antes de continuar.",
    POST_VALIDATION_FAILED:
      "A validação após a migração falhou. Consulte o guia de recuperação e atualize o plano.",
    UPGRADE_FAILED: "A migração falhou. Consulte o guia de recuperação e atualize o plano.",
    USER_DATA_UPGRADE_REQUIRED: "Os dados precisam de migração antes desta ação.",
    historical: "Jobs e itens históricos serão preservados.",

    title: "Migração de dados",
    description:
      "Seus Canais e Métodos estão preservados. Revise o plano antes de autorizar a migração. Edição e execução incompatíveis ficam bloqueadas.",
    refresh: "Atualizar plano",
    loading: "Consultando plano…",
    confirm: "Autorizo criar um backup recuperável antes de migrar meus dados.",
    apply: "Criar backup e aplicar migração",
    applying: "Criando backup e migrando…",
    blocked:
      "Atualize os plugins necessários. Se houver incompatibilidades nos Métodos, conecte um agente via MCP no Canal para revisar e propor a migração. Depois, atualize o plano.",
    proposed:
      "Há revisões de Métodos propostas pelo MCP. Serão salvas somente ao confirmar a migração com backup.",
    diagnostics: "Diagnósticos",
    guide: "Guia de migração e recuperação",
    skill: "Skill para revisão assistida",
    plugins: "Gerenciar plugins",
    backup: "Backup recuperável salvo em:",
    success: "Migração aplicada. Backup recuperável salvo em:",
    planError: "Não foi possível consultar o plano. Tente atualizar novamente.",
    applyError:
      "A migração não foi confirmada. Atualize o plano para verificar o estado dos dados e a recuperação.",
    refreshError: "Migração aplicada, mas não foi possível atualizar a interface. Tente novamente.",
    incompatible:
      "Este conteúdo precisa de migração antes de editar ou executar. Seus dados originais permanecem preservados.",
    raw: "Dados originais preservados",
    ready: "Nenhuma migração pendente neste plano.",
    close: "Fechar confirmação",
  },
  en: {
    BACKUP_CONFIRMATION_REQUIRED: "Confirm backup creation before applying.",
    UPGRADE_BUSY: "A migration is already running. Wait and refresh the plan.",
    PLAN_CHANGED: "The plan changed. Refresh and review before confirming again.",
    UPGRADE_AMBIGUOUS:
      "Some data is ambiguous. Review the diagnostics and guide before continuing.",
    POST_VALIDATION_FAILED:
      "Validation after migration failed. Review the recovery guide and refresh the plan.",
    UPGRADE_FAILED: "Migration failed. Review the recovery guide and refresh the plan.",
    USER_DATA_UPGRADE_REQUIRED: "The data needs migration before this action.",
    historical: "Historical jobs and items will be preserved.",

    title: "Data migration",
    description:
      "Your Channels and Methods are preserved. Review the plan before authorizing migration. Incompatible editing and execution are blocked.",
    refresh: "Refresh plan",
    loading: "Loading plan…",
    confirm: "I authorize creating a recoverable backup before migrating my data.",
    apply: "Create backup and apply migration",
    applying: "Creating backup and migrating…",
    blocked:
      "Update the required plugins. If Methods are incompatible, connect an agent via MCP in the Channel to review and propose migration. Then refresh the plan.",
    proposed:
      "Method revisions have been proposed through MCP. They will only be saved when migration with backup is confirmed.",
    diagnostics: "Diagnostics",
    guide: "Migration and recovery guide",
    skill: "Skill for assisted review",
    plugins: "Manage plugins",
    backup: "Recoverable backup saved at:",
    success: "Migration applied. Recoverable backup saved at:",
    planError: "Could not load the plan. Try refreshing again.",
    applyError:
      "Migration was not confirmed. Refresh the plan to check the data state and recovery.",
    refreshError: "Migration applied, but the interface could not refresh. Try again.",
    incompatible:
      "This content needs migration before editing or execution. Your original data remains preserved.",
    raw: "Preserved original data",
    ready: "No migration pending in this plan.",
    close: "Close confirmation",
  },
  es: {
    BACKUP_CONFIRMATION_REQUIRED: "Confirma la creación de la copia de seguridad antes de aplicar.",
    UPGRADE_BUSY: "Ya hay una migración en curso. Espera y actualiza el plan.",
    PLAN_CHANGED: "El plan cambió. Actualiza y revisa antes de confirmar de nuevo.",
    UPGRADE_AMBIGUOUS:
      "Hay datos ambiguos. Consulta los diagnósticos y la guía antes de continuar.",
    POST_VALIDATION_FAILED:
      "La validación después de la migración falló. Consulta la guía de recuperación y actualiza el plan.",
    UPGRADE_FAILED: "La migración falló. Consulta la guía de recuperación y actualiza el plan.",
    USER_DATA_UPGRADE_REQUIRED: "Los datos necesitan migración antes de esta acción.",
    historical: "Se conservarán los jobs e ítems históricos.",

    title: "Migración de datos",
    description:
      "Tus Canales y Métodos están preservados. Revisa el plan antes de autorizar la migración. La edición y ejecución incompatibles están bloqueadas.",
    refresh: "Actualizar plan",
    loading: "Consultando el plan…",
    confirm: "Autorizo crear una copia de seguridad recuperable antes de migrar mis datos.",
    apply: "Crear copia de seguridad y aplicar migración",
    applying: "Creando copia de seguridad y migrando…",
    blocked:
      "Actualiza los plugins necesarios. Si los Métodos son incompatibles, conecta un agente por MCP en el Canal para revisar y proponer la migración. Después, actualiza el plan.",
    proposed:
      "Hay revisiones de Métodos propuestas por MCP. Solo se guardarán al confirmar la migración con copia de seguridad.",
    diagnostics: "Diagnósticos",
    guide: "Guía de migración y recuperación",
    skill: "Skill para revisión asistida",
    plugins: "Gestionar plugins",
    backup: "Copia de seguridad recuperable guardada en:",
    success: "Migración aplicada. Copia de seguridad recuperable guardada en:",
    planError: "No se pudo consultar el plan. Intenta actualizarlo de nuevo.",
    applyError:
      "La migración no fue confirmada. Actualiza el plan para verificar el estado de los datos y la recuperación.",
    refreshError: "Migración aplicada, pero no se pudo actualizar la interfaz. Inténtalo de nuevo.",
    incompatible:
      "Este contenido necesita migración antes de editar o ejecutar. Tus datos originales permanecen preservados.",
    raw: "Datos originales preservados",
    ready: "No hay migración pendiente en este plan.",
    close: "Cerrar confirmación",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

export function upgradeText(language: AppLanguage) {
  return upgradeTranslations[language];
}
