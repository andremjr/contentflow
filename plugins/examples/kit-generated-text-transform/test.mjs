import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "./handler.mjs";

test("respeita o contrato mínimo", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "contentflow-plugin-test-"));
  const source = path.join(temp, "entrada.txt");
  const output = path.join(temp, "output");
  await mkdir(output);
  await writeFile(source, "teste");
  const response = await execute(
    { inputs: { content: "  olá plugin  " }, configuration: {} },
    {
      signal: AbortSignal.timeout(5000),
      getSecret: async () => "test-only",
      resolveInputFile: async () => source,
      getOutputPath: (name) => path.join(output, name),
      getWorkspacePath: (name) => path.join(temp, name),
    },
  );
  assert.equal(response.status, "success");
  assert.ok(Object.hasOwn(response.values, "result"));
});
