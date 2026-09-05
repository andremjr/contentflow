import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { execute, __test } from "./handler.mjs";

test("normaliza nome e extensão de acordo com o formato", () => {
  assert.equal(__test.safeFileName("Dossiê: roteiro?.txt", "markdown"), "Dossiê- roteiro-.md");
  assert.equal(__test.safeFileName("", "plain"), "contexto.txt");
});

test("cria artefato Markdown UTF-8 com o contexto consolidado", async () => {
  const directory = await mkdtemp(join(tmpdir(), "contentflow-text-file-"));
  const result = await execute(
    {
      invocation: { mode: "start" },
      configuration: { fileName: "dossie-roteiro.md", format: "markdown" },
      inputs: { content: 'Tema: Johnstown\nDados: ["2.209 mortos"]' },
      context: { block: { name: "Preparar contexto do roteiro" } },
    },
    { getOutputPath: (name) => join(directory, name) },
  );
  assert.equal(result.status, "success");
  assert.equal(result.values.document.name, "dossie-roteiro.md");
  assert.equal(result.values.document.mimeType, "text/markdown");
  assert.match(result.values.document.url, /^artifact:\/\/text-/);
  assert.equal(result.artifacts[0].source.path, "dossie-roteiro.md");
  assert.match(await readFile(join(directory, "dossie-roteiro.md"), "utf8"), /2\.209 mortos/);
});

test("recusa conteúdo vazio", async () => {
  await assert.rejects(
    execute(
      { invocation: { mode: "start" }, configuration: {}, inputs: { content: "  " } },
      { getOutputPath: () => "unused" },
    ),
    (error) => error.code === "INVALID_INPUT",
  );
});
