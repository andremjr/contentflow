import assert from "node:assert/strict";
import test from "node:test";

import { translate } from "./app-preferences";

test("translates process reordering controls and feedback in all interface languages", () => {
  const phrases = [
    "Reordenar processo",
    "Salvando ordem...",
    "A nova ordem invalida uma dependência entre Métodos.",
    "Mova o processo que fornece a entrada para uma posição anterior ao processo que depende dele.",
    "Não foi possível salvar a ordem dos processos. Recarregue e tente novamente.",
    "O Método mudou em outra aba. Recarregue antes de salvar suas alterações.",
    "O projeto inicia na primeira etapa configurada do Canal:",
    "Processos universais",
    "Recolher processos universais",
    "Expandir processos universais",
    "Método principal",
    "Dependência incluída",
    "Conjunto do Canal",
    "Coleções incluídas como estrutura",
    "campos",
    "vínculos",
    "Compartilhar itens",
    "Compartilhar Método",
    "Compartilhar pacote de Métodos",
    "Revise o conteúdo e a preparação antes de baixar o pacote.",
    "Métodos incluídos no pacote",
    "Baixar pacote",
    "Este pacote declara itens incluídos.",
    "Somente a estrutura das coleções está incluída.",
    "Ordem resultante",
    "As dependências selecionadas não formam uma ordem válida.",
    "Itens incluídos no compartilhamento",
    "Nenhuma dependência externa foi declarada.",
    "Preparação necessária",
    "Processo anterior",
    "Fonte incluída na importação",
    "Fonte já disponível no Canal de destino",
    "Fonte ainda não disponível no Canal de destino",
    "Abrir editor do Método para corrigir",
    "Plugin ausente",
    "Capability ausente",
    "Plugin desativado ou indisponível",
    "Conexão local pendente",
    "Plugin pronto",
    "Abrir Plugins para corrigir",
    "Associe uma conexão local no editor do Método antes de executar.",
    "O editor aceita somente um Método por vez.",
    "O Método principal não foi identificado.",
  ];
  for (const phrase of phrases) {
    assert.equal(translate(phrase, "pt-BR"), phrase);
    assert.notEqual(translate(phrase, "en"), phrase);
    assert.notEqual(translate(phrase, "es"), phrase);
  }
});

test("translates the global orchestrator production controls", () => {
  const phrases = [
    "Nova produção global",
    "Escolha os canais e quantos vídeos deseja gerar em cada um deles.",
    "Fila em andamento",
    "Disponível",
    "Nome base dos projetos",
    "Vídeos por canal",
    "Modo de execução",
    "Ponta a ponta",
    "Iniciar produção global",
    "canais selecionados",
    "vídeos por canal",
    "projetos no total",
    "Produção global iniciada",
    "Os projetos foram criados e as filas dos canais selecionados foram iniciadas.",
    "Não foi possível iniciar a produção global",
    "Escolha um canal para acompanhar ou retomar sua fila.",
    "Acompanhe, interrompa ou retome a fila deste canal. Novas filas são criadas na produção global acima, com um ou vários canais selecionados.",
    "Esta fila não está ativa no momento.",
    "Este canal ainda não possui histórico de orquestração.",
  ];
  for (const phrase of phrases) {
    assert.equal(translate(phrase, "pt-BR"), phrase);
    assert.notEqual(translate(phrase, "en"), phrase);
    assert.notEqual(translate(phrase, "es"), phrase);
  }
});

test("translates recently added Methods and plugin profile UI in English", () => {
  assert.equal(
    translate("Use, compartilhe e gerencie Métodos salvos nos seus canais", "en"),
    "Use, share, and manage Methods saved in your channels",
  );
  assert.equal(
    translate("Buscar por nome, Canal, processo ou ação...", "en"),
    "Search by name, Channel, process, or action...",
  );
  assert.equal(translate("5 de 8 processos configurados", "en"), "5 of 8 processes configured");
  assert.equal(translate("2 perfis", "en"), "2 profiles");
  assert.equal(translate("Acessar a internet", "en"), "Access the internet");
  assert.equal(translate(", entrega “theme”", "en"), ", output “theme”");
});

test("translates recently added Methods and plugin profile UI in Spanish", () => {
  assert.equal(
    translate("Use, compartilhe e gerencie Métodos salvos nos seus canais", "es"),
    "Usa, comparte y gestiona los Métodos guardados en tus canales",
  );
  assert.equal(
    translate("Buscar por nome, Canal, processo ou ação...", "es"),
    "Buscar por nombre, Canal, proceso o acción...",
  );
  assert.equal(translate("5 de 8 processos configurados", "es"), "5 de 8 procesos configurados");
  assert.equal(translate("2 perfis", "es"), "2 perfiles");
  assert.equal(translate("Acessar a internet", "es"), "Acceder a Internet");
  assert.equal(translate(", entrega “theme”", "es"), ", salida “theme”");
});

test("translates the MCP Method builder connection UI", () => {
  assert.equal(translate("Conectar agente via MCP", "en"), "Connect agent via MCP");
  assert.equal(translate("Conectar agente via MCP", "es"), "Conectar agente mediante MCP");
  assert.equal(
    translate("Configuração do servidor MCP local", "en"),
    "Local MCP server configuration",
  );
  assert.equal(translate("Copiar configuração", "es"), "Copiar configuración");
  assert.equal(translate("Preparando configuração MCP...", "en"), "Preparing MCP configuration...");
  assert.equal(
    translate(
      "Use esta configuração em qualquer agente compatível com MCP. O ContentFlow precisa permanecer aberto durante a criação e os testes dos Métodos.",
      "es",
    ),
    "Usa esta configuración con cualquier agente compatible con MCP. ContentFlow debe permanecer abierto durante la creación y las pruebas de los Métodos.",
  );
});

test("translates plugin credential management in English and Spanish", () => {
  assert.equal(translate("Credenciais e conexões", "en"), "Credentials and connections");
  assert.equal(translate("Credenciais e conexões", "es"), "Credenciales y conexiones");
  assert.equal(translate("1 conexão", "en"), "1 connection");
  assert.equal(translate("2 conexões", "es"), "2 conexiones");
  assert.equal(translate("1 de 4 credenciais configuradas", "en"), "1 of 4 credentials configured");
  assert.equal(
    translate("1 de 4 credenciais configuradas", "es"),
    "1 de 4 credenciales configuradas",
  );
  assert.equal(
    translate("Preencha somente as credenciais necessárias para esta conexão.", "en"),
    "Fill in only the credentials needed for this connection.",
  );
});

test("translates the unified block configuration labels", () => {
  assert.equal(translate("Coleções", "en"), "Collections");
  assert.equal(translate("Coleções", "es"), "Colecciones");
  assert.equal(translate("Iniciar minimizado", "en"), "Start minimized");
  assert.equal(translate("Iniciar minimizado", "es"), "Iniciar minimizado");
  assert.deepEqual(
    ["Nome da ação", "Prompt do bloco", "Operador responsável", "Informações de entrada"].map(
      (label) => translate(label, "en"),
    ),
    ["Action name", "Block prompt", "Responsible operator", "Input information"],
  );
  assert.deepEqual(
    ["Nome da ação", "Prompt do bloco", "Operador responsável", "Resultado desta ação"].map(
      (label) => translate(label, "es"),
    ),
    [
      "Nombre de la acción",
      "Prompt del bloque",
      "Operador responsable",
      "Resultado de esta acción",
    ],
  );
  assert.equal(
    translate("Defina apenas as entradas adicionais que esta ação precisa.", "en"),
    "Define only the additional inputs this action needs.",
  );
  assert.equal(
    translate("Cada entrega fica disponível para os próximos blocos.", "es"),
    "Cada salida queda disponible para los bloques siguientes.",
  );
});

test("preserves user-created and plugin-authored content", () => {
  for (const language of ["en", "es"] as const) {
    assert.equal(translate("Históricos Contentflow", language), "Históricos Contentflow");
    assert.equal(translate("Tipos de aberturas/ganchos", language), "Tipos de aberturas/ganchos");
    assert.equal(
      translate("Automação modular criada pelo autor do plugin.", language),
      "Automação modular criada pelo autor do plugin.",
    );
  }
});

test("translates the compact plugin contract validator", () => {
  assert.equal(translate("Plugin executor", "en"), "Runner plugin");
  assert.equal(translate("Requer ajustes", "es"), "Requiere ajustes");
  assert.equal(translate("Entrada · Sequência de prompts", "en"), "Input · Sequência de prompts");
  assert.equal(translate("Parâmetros do prompt (2)", "es"), "Parámetros del prompt (2)");
  assert.equal(translate("Prévia do envio à IA", "en"), "AI delivery preview");
  assert.equal(translate("Prévia do envio à IA", "es"), "Vista previa del envío a la IA");
});

test("translates the simplified plugin capability presentation", () => {
  assert.equal(translate("O que este plugin faz", "en"), "What this plugin does");
  assert.equal(translate("Recursos disponíveis", "es"), "Funciones disponibles");
  assert.equal(translate("Detalhes técnicos", "en"), "Technical details");
});

test("translates execution attention and error notifications", () => {
  assert.equal(translate("Pendências e erros", "en"), "Tasks and errors");
  assert.equal(translate("Pendências e erros", "es"), "Tareas y errores");
  assert.equal(
    translate("2 erros de execução e 3 tarefas humanas pendentes", "en"),
    "2 execution errors and 3 pending human tasks",
  );
  assert.equal(
    translate("2 erros de execução e 3 tarefas humanas pendentes", "es"),
    "2 errores de ejecución y 3 tareas humanas pendientes",
  );
  assert.equal(
    translate("Pendências e erros na barra de tarefas", "en"),
    "Tasks and errors on the taskbar",
  );
  assert.equal(
    translate("Pendências e erros na barra de tarefas", "es"),
    "Tareas y errores en la barra de tareas",
  );
});

test("translates completed output editing controls", () => {
  assert.equal(translate("Editar entrega", "en"), "Edit output");
  assert.equal(translate("Editar entrega", "es"), "Editar salida");
  assert.equal(translate("Salvar alterações", "en"), "Save changes");
  assert.equal(translate("Entrega atualizada", "es"), "Salida actualizada");
  assert.equal(translate("Não foi possível salvar a edição", "en"), "Could not save the changes");
});

test("translates universal item delivery recovery controls", () => {
  assert.equal(translate("Concluídos", "en"), "Completed");
  assert.equal(translate("Pendentes", "es"), "Pendientes");
  assert.equal(translate("Falhou no item", "en"), "Failed on item");
  assert.equal(translate("Continuar pendentes", "es"), "Continuar pendientes");
  assert.equal(translate("Recomeçar tudo", "en"), "Restart all");
  assert.equal(
    translate("O núcleo preservou os itens concluídos deste lote.", "es"),
    "El núcleo conservó los elementos completados de este lote.",
  );
  assert.equal(
    translate("Itens pendentes preparados para continuar.", "en"),
    "Pending items are ready to continue.",
  );
  assert.equal(translate("Finalizar com entregas atuais", "en"), "Finish with current outputs");
  assert.equal(
    translate("Usar entrega atual e continuar", "es"),
    "Usar la salida actual y continuar",
  );
  assert.equal(translate("Refazer este bloco", "en"), "Rerun this block");
  assert.equal(translate("Reiniciar processo do zero", "es"), "Reiniciar proceso desde cero");
  assert.equal(
    translate("O que já foi concluído permanece consolidado. Escolha como continuar.", "en"),
    "Completed work remains consolidated. Choose how to continue.",
  );
  assert.equal(
    translate("Processo concluído com as entregas atuais.", "es"),
    "Proceso completado con las salidas actuales.",
  );
  assert.equal(translate("Itens da execução", "en"), "Execution items");
  assert.equal(translate("Editar item", "es"), "Editar elemento");
  assert.equal(translate("Substituir arquivo", "en"), "Replace file");
  assert.equal(translate("Item substituído", "es"), "Elemento sustituido");
  assert.equal(translate("Aplicar importação", "en"), "Apply import");
  assert.equal(translate("Base reutilizada no Canal", "es"), "Base reutilizada en el Canal");
  assert.equal(
    translate(
      "Revise a estrutura e a prontidão local antes de aplicar o Método neste Canal.",
      "en",
    ),
    "Review the structure and local readiness before applying the Method to this Channel.",
  );
  assert.equal(translate("Ordem dos itens atualizada", "en"), "Item order updated");
  assert.equal(
    translate("Não foi possível reorganizar os itens", "es"),
    "No se pudieron reorganizar los elementos",
  );
  assert.equal(
    translate("Edite, substitua ou arraste os itens para reorganizar a sequência.", "en"),
    "Edit, replace, or drag items to reorder the sequence.",
  );
  assert.equal(
    translate("Edite textos ou substitua mídias sem alterar a posição do item.", "en"),
    "Edit text or replace media without changing the item's position.",
  );
});

test("translates the hybrid batch orchestrator labels", () => {
  assert.equal(translate("Lote híbrido", "en"), "Hybrid batch");
  assert.equal(translate("Lote híbrido", "es"), "Lote híbrido");
  assert.equal(
    translate(
      "Agrupa Tema, Título e Thumbnail quando forem a próxima etapa elegível; os demais processos seguem por projeto.",
      "en",
    ),
    "Groups Theme, Title, and Thumbnail when they are the next eligible stage; the other processes continue per project.",
  );
  assert.equal(
    translate(
      "Agrupa Tema, Título e Thumbnail quando forem a próxima etapa elegível; os demais processos seguem por projeto.",
      "es",
    ),
    "Agrupa Tema, Título y Thumbnail cuando sean la siguiente etapa elegible; los demás procesos continúan por proyecto.",
  );
});

test("translates the global orchestrator page in all supported languages", () => {
  const phrases = [
    "Orquestrador",
    "Centralize as filas de produção dos seus canais em um só lugar.",
    "Canais monitorados",
    "Filas ativas",
    "Aguardando ação",
    "Filas por canal",
    "Escolha um canal para criar, acompanhar ou retomar sua fila.",
    "Sem fila",
    "Produção e fila deste canal",
    "Nenhum canal disponível",
    "Crie um canal para começar a organizar filas de produção.",
    "Com erro",
  ];
  for (const phrase of phrases) {
    assert.equal(translate(phrase, "pt-BR"), phrase);
    assert.notEqual(translate(phrase, "en"), phrase);
    assert.notEqual(translate(phrase, "es"), phrase);
  }
});
