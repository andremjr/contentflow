import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("contrato 0.5 fecha lifecycle, negociação, backpressure, reload e reconciliação", async () => {
  const browser = await read("docs/ecosystem/browser-automation.md");
  const required = [
    "profileRef",
    "protocolVersion",
    "requestedCapabilities",
    "lastSequence",
    "commandId",
    "condition-observer.v1",
    "sequence",
    "worker_reconnected",
    "debugger_lost",
    "observeCondition",
    "BACKPRESSURE",
    "RELOAD_BLOCKED_UNCERTAIN_EFFECT",
    "efeito incerto",
    "reconciliar recibo/job/resultado",
    "plugin handler",
    "MV3 service worker",
    "content script / CDP limitado",
  ];
  for (const token of required) {
    assert.ok(browser.includes(token), `browser-automation precisa conter ${token}`);
  }
});

test("arquitetura, protocolo, segurança, skill e AGENTS concordam com o contrato da Bridge", async () => {
  const [architecture, protocol, security, skill, agents] = await Promise.all([
    read("docs/ARCHITECTURE.md"),
    read("docs/ecosystem/protocol.md"),
    read("docs/ecosystem/security.md"),
    read("ecosystem/skills/contentflow-plugin-development/references/browser-automation.md"),
    read("AGENTS.md"),
  ]);
  for (const source of [architecture, protocol, security, skill, agents]) {
    assert.match(source, /negoci/i);
    assert.match(source, /capabilit/i);
    assert.match(source, /reconcil/i);
    assert.match(source, /reload|recarga/i);
  }
  assert.ok(architecture.includes("Recarga é uma primitiva allowlisted e controlada"));
  assert.ok(protocol.includes("não expõe o `profileId` local persistente"));
  assert.ok(security.includes("backpressure"));
  assert.ok(skill.includes("sequência monotônica"));
  assert.ok(agents.includes("recarga nunca é fallback universal"));
});

test("schema v1 continua sem transformar a Bridge em configuração portátil do manifesto", async () => {
  const schema = JSON.parse(await read("docs/ecosystem/schemas/contentflow-plugin-v1.schema.json"));
  const serialized = JSON.stringify(schema);
  assert.equal(serialized.includes("profileExecution"), false);
  assert.equal(serialized.includes("profileIds"), false);
  assert.equal(serialized.includes("browserBridgeSession"), false);
  assert.equal(serialized.includes("sessionToken"), false);
});
