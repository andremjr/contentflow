import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { execute } from "./handler.mjs";

test("declares the manual tool for every human block and process", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("./contentflow.plugin.json", import.meta.url), "utf8"),
  );
  const capability = manifest.capabilities.find(({ id }) => id === "open-tool");

  assert.equal(capability.operator, "Humano");
  assert.deepEqual(capability.blockTypes, ["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"]);
  assert.equal("processTypes" in capability, false);
});

test("rejects a non-HTTPS browser URL before launching a process", async () => {
  await assert.rejects(
    () =>
      execute({
        configuration: {
          destinationType: "browser",
          browserExecutablePath: "C:\\browser.exe",
          browserProfilePath: "C:\\profile",
          url: "http://example.test",
        },
      }),
    /HTTPS/,
  );
});

test("rejects a relative executable path", async () => {
  await assert.rejects(
    () =>
      execute({
        configuration: { destinationType: "application", applicationExecutablePath: "tool.exe" },
      }),
    /absoluto/,
  );
});
