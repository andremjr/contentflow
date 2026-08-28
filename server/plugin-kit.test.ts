import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { contractCommand, createPlugin, type Answers } from "../tools/plugin-kit";
import { PluginValidationError, validatePluginDirectory } from "./plugin-validation";

function answers(template: Answers["template"]): Answers {
  const file = template === "file-artifact";
  const hosted = template === "hosted-api";
  return {
    template,
    name: `Kit ${template}`,
    id: `com.contentflow.kit-${template}`,
    author: "ContentFlow",
    license: "Proprietary",
    description: "Plugin gerado durante os testes oficiais do kit.",
    operator: "Código",
    blockTypes: ["CRIAR"],
    input: {
      key: file ? "source" : "content",
      label: file ? "Arquivo" : "Texto",
      type: file ? "file" : "textarea",
    },
    output: { key: "result", label: "Resultado", type: file ? "file" : "textarea" },
    permissions: file ? ["filesystem:read", "filesystem:write"] : hosted ? ["network"] : [],
    networkHosts: hosted ? ["api.example.com"] : [],
    secretKeys: hosted ? ["API_TOKEN"] : [],
    sendsDataToThirdParties: hosted,
    providers: hosted ? ["API de exemplo"] : [],
  };
}

test("o gerador cria e valida os três templates oficiais", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "contentflow-kit-test-"));
  try {
    for (const template of ["text-transform", "hosted-api", "file-artifact"] as const) {
      const directory = await createPlugin(path.join(temporary, template), answers(template));
      const validated = validatePluginDirectory(directory);
      assert.equal(validated.manifest.apiVersion, "1");
      await contractCommand(directory);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("a validação expõe todos os erros do manifesto", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "contentflow-kit-invalid-"));
  try {
    const directory = await createPlugin(path.join(temporary, "plugin"), answers("text-transform"));
    const manifestPath = path.join(directory, "contentflow.plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.id = "ID INVÁLIDO";
    manifest.unknownField = true;
    await writeFile(manifestPath, JSON.stringify(manifest));
    assert.throws(
      () => validatePluginDirectory(directory),
      (error) => {
        assert.ok(error instanceof PluginValidationError);
        assert.ok(error.issues.length >= 2);
        return true;
      },
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
