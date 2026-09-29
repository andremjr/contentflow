import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseMethodFile } from "../src/lib/method-file";
import { validatePluginDirectory } from "./plugin-validation";

test("exemplo oficial de Method passa pelo parser real", async () => {
  const contents = await readFile(
    "ecosystem/skills/contentflow-method-development/templates/method-skeleton.json",
    "utf8",
  );
  const parsed = parseMethodFile(contents);
  assert.equal(parsed.method.processType, "theme");
});

test("exemplo oficial de Plugin passa pelo validator real", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "contentflow-skill-plugin-"));
  try {
    await cp(
      "ecosystem/skills/contentflow-plugin-development/templates/contentflow.plugin.json",
      path.join(temp, "contentflow.plugin.json"),
    );
    await cp(
      "ecosystem/skills/contentflow-plugin-development/templates/handler.mjs",
      path.join(temp, "handler.mjs"),
    );
    const validated = validatePluginDirectory(temp, false);
    assert.equal(validated.manifest.apiVersion, "1");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
