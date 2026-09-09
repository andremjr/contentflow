import assert from "node:assert/strict";
import test from "node:test";

import { translate } from "./app-preferences";

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
