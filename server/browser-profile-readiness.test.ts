import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { browserBridgeProfileState, stageBrowserBridge } from "./browser-profile-readiness";

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value), "utf8");
}

test("distingue uma Bridge existente de um vínculo antigo quebrado", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "contentflow-bridge-readiness-"));
  try {
    const workspace = path.join(root, "workspace");
    const profile = path.join(workspace, "default");
    const bridge = path.join(root, "stable-bridge");
    await writeJson(path.join(profile, ".contentflow-profile-ready.json"), {
      profile: "default",
    });
    await writeJson(path.join(profile, "Default", "Secure Preferences"), {
      extensions: {
        settings: {
          bridge: { location: 4, path: path.join(root, "missing-bridge") },
        },
      },
    });
    assert.equal(browserBridgeProfileState(workspace, "default"), "missing");

    await writeJson(path.join(bridge, "manifest.json"), {
      name: "ContentFlow Browser Bridge",
    });
    await writeJson(path.join(profile, "Default", "Secure Preferences"), {
      extensions: { settings: { bridge: { location: 4, path: bridge } } },
    });
    assert.equal(browserBridgeProfileState(workspace, "default"), "installed");
    assert.equal(browserBridgeProfileState(workspace, "outra-conta"), "unknown");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("copia a Bridge para uma pasta estável de dados", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "contentflow-bridge-stage-"));
  try {
    const source = path.join(root, "app", "ecosystem", "browser-bridge");
    const data = path.join(root, "data");
    for (const file of [
      "content-script.js",
      "INSTALAR.md",
      "manifest.json",
      "README.md",
      "service-worker.js",
    ]) {
      await mkdir(source, { recursive: true });
      await writeFile(
        path.join(source, file),
        file === "manifest.json" ? JSON.stringify({ name: "ContentFlow Browser Bridge" }) : file,
        "utf8",
      );
    }
    const destination = stageBrowserBridge(path.join(root, "app"), data);
    assert.equal(destination, path.join(data, "browser-bridge"));
    assert.equal(browserBridgeProfileState(data, "default"), "unknown");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
