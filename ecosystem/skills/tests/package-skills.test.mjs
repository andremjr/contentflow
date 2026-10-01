import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import yauzl from "yauzl";

async function readArchive(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const files = new Map();
      zip.on("error", reject);
      zip.on("end", () => resolve(files));
      zip.on("entry", (entry) => {
        if (entry.fileName.endsWith("/")) return zip.readEntry();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on("error", reject);
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            assert.ok(!files.has(entry.fileName), `Entrada duplicada: ${entry.fileName}`);
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

test("os dois ZIPs standalone incluem docs da versão, licença, guia, hashes e links resolvíveis", async () => {
  const releaseRoot = path.resolve("release");
  await mkdir(releaseRoot, { recursive: true });
  const output = await mkdtemp(path.join(releaseRoot, "skill-package-test-"));
  try {
    execFileSync(
      process.execPath,
      ["scripts/package-ecosystem.mjs", output, "--skills-only", "--docs-version=1.3.1"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
      },
    );
    assert.deepEqual((await readdir(output)).sort(), [
      "ContentFlow-Skill-Method-Development.zip",
      "ContentFlow-Skill-Plugin-Development.zip",
    ]);
    for (const [skill, asset] of [
      ["contentflow-method-development", "ContentFlow-Skill-Method-Development.zip"],
      ["contentflow-plugin-development", "ContentFlow-Skill-Plugin-Development.zip"],
    ]) {
      const files = await readArchive(path.join(output, asset));
      const manifest = JSON.parse(files.get(`${skill}/DOCUMENTATION.json`).toString("utf8"));
      assert.equal(manifest.documentationVersion, "1.3.1");
      assert.equal(manifest.documentationRef, "v1.3.1");
      assert.equal(manifest.methodContractVersion, 3);
      assert.equal(manifest.pluginApiVersion, "2");
      assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/);
      assert.equal(typeof manifest.sourceHasLocalChanges, "boolean");
      assert.equal(
        manifest.files.find((file) => file.path === "docs/CURRENT_STATE.md").role,
        "observational",
      );
      if (manifest.recordedCoreVersion !== "1.3.1") assert.ok(manifest.warnings.length > 0);
      assert.ok(
        manifest.files.every((file) => !/AUDIT|reliability-program|roadmap/i.test(file.path)),
      );
      for (const required of [
        "AGENTS.md",
        "LICENSE",
        "AI_USAGE_POLICY.md",
        "docs/ARCHITECTURE.md",
        "docs/CONTENT_CONTRACT.md",
        "docs/CURRENT_STATE.md",
        "docs/UPGRADE_GUIDE_1_3_1.md",
        "docs/ecosystem/protocol.md",
        "docs/ecosystem/schemas/contentflow-plugin-v2.schema.json",
        "guardrails/development-contentflow/SKILL.md",
      ])
        assert.ok(
          manifest.files.some((file) => file.path === required),
          required,
        );
      for (const file of manifest.files) {
        const packaged = files.get(`${skill}/${file.path}`);
        assert.ok(packaged, file.path);
        assert.equal(createHash("sha256").update(packaged).digest("hex"), file.sha256);
        assert.equal(
          createHash("sha256")
            .update(await readFile(file.sourcePath ?? file.path))
            .digest("hex"),
          file.sourceSha256,
        );
      }
      for (const [name, bytes] of files) {
        assert.ok(name.startsWith(`${skill}/`), `Arquivo fora da skill: ${name}`);
        if (!name.endsWith(".md")) continue;
        const contents = bytes.toString("utf8");
        assert.doesNotMatch(
          contents,
          /https:\/\/github\.com\/andremjr\/contentflow\/(?:blob|tree)\/main\//,
        );
        for (const [, target] of contents.matchAll(/\]\(([^\s)]+)\)/g)) {
          if (/^(?:[a-z]+:|#|\/)/i.test(target)) continue;
          const resolved = path.posix.normalize(
            path.posix.join(path.posix.dirname(name), target.split("#")[0]),
          );
          assert.ok(files.has(resolved), `${name}: link local ausente ${target}`);
        }
      }
      const instructions = files.get(`${skill}/SKILL.md`).toString("utf8");
      assert.match(instructions, /references\/documentation\.md/);
      assert.match(instructions, /Migração para 1\.3\.1/);
      if (skill.includes("plugin")) assert.match(instructions, /nova major do plugin/);
    }
  } finally {
    // mkdtemp está explicitamente contido na saída descartável do workspace.
    assert.equal(path.dirname(output), releaseRoot);
    await rm(output, { recursive: true, force: true });
  }
});
