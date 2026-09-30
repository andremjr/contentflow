import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const protocol = readFileSync("docs/ecosystem/protocol.md", "utf8");
const security = readFileSync("docs/ecosystem/security.md", "utf8");
const browser = readFileSync("docs/ecosystem/browser-automation.md", "utf8");

test("pacote 0.4 fecha os nomes do contrato de perfil global", () => {
  for (const term of ["profileExecution", "profileIds", "getProfilePath", "profileId"]) {
    assert.match(protocol, new RegExp(term));
  }
  assert.match(protocol, /single.*fallback.*parallel/s);
});

test("migração de perfil legado não reintroduz contrato antigo de Método ou plugin", () => {
  assert.match(protocol, /Plugin API v2 e Método v3 são os únicos contratos aceitos/);
  assert.match(protocol, /configurationKey/);
  assert.match(protocol, /fallbackConfigurationKey/);
  assert.match(browser, /registros físicos legados de perfil/);
  assert.doesNotMatch(browser, /Métodos antigos continuam resolvendo/);
});

test("Método v3 usa política local sem expor IDs ao handler", () => {
  assert.match(protocol, /Método v3 usa a política local `profileExecution`/);
  assert.match(protocol, /nunca são enviados ao plugin em `request`/);
  assert.match(browser, /handler nunca recebe esses IDs/);
});

test("pacote portátil não carrega referência local nem sessão autenticada", () => {
  for (const term of [
    "profileExecution",
    "profileIds",
    "caminho absoluto",
    "storage_key",
    "cookies",
    "storage de sessão",
  ]) {
    assert.ok(browser.toLowerCase().includes(term.toLowerCase()), `browser automation sem ${term}`);
  }
  assert.match(security, /não entram no request, no Método exportado nem em diagnósticos/);
});

test("consentimento, sandbox e revogação são explícitos", () => {
  assert.match(protocol, /consentimento explícito/);
  assert.match(protocol, /Revogar o vínculo impede novas invocações/);
  assert.match(protocol, /sandbox concede no máximo a raiz física do perfil selecionado/);
  assert.match(
    security,
    /Compartilhar um perfil com outro plugin exige um novo consentimento explícito/,
  );
});
