import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ecosystem = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reference = path.join(ecosystem, "plugins/reference");
const expectedVersions = new Map([
  ["anthropic-claude", "2.0.0"],
  ["antigravity-skill-runner", "1.0.0"],
  ["assemblyai-srt", "2.0.0"],
  ["chatgpt-browser-studio", "2.0.0"],
  ["claude-browser-text", "2.0.0"],
  ["claude-code-skill-runner", "1.0.0"],
  ["codex-skill-runner", "1.0.0"],
  ["edge-tts", "2.0.0"],
  ["elevenlabs", "2.0.0"],
  ["ffmpeg-image-sequence-video", "2.0.0"],
  ["free-stock-media-studio", "1.0.0"],
  ["gemini-browser-studio", "2.0.0"],
  ["google-flow-browser-images", "2.0.0"],
  ["grok-browser-studio", "2.0.0"],
  ["mai-playground-browser", "2.0.0"],
  ["manual-tool-launcher", "2.0.0"],
  ["meta-ai-browser-studio", "2.0.0"],
  ["openai-gpt", "2.0.0"],
  ["silence-remover", "2.0.0"],
  ["text-file-builder", "2.0.0"],
  ["vibes-browser-studio", "1.0.0"],
]);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

test("os 21 plugins API v2 têm nova major e exigem ContentFlow 1.3.1", () => {
  const directories = readdirSync(reference).filter((directory) =>
    existsSync(path.join(reference, directory, "contentflow.plugin.json")),
  );
  assert.deepEqual(directories.sort(), [...expectedVersions.keys()].sort());
  for (const directory of directories) {
    const manifest = readJson(path.join(reference, directory, "contentflow.plugin.json"));
    assert.equal(manifest.apiVersion, "2", directory);
    assert.equal(manifest.version, expectedVersions.get(directory), directory);
    assert.equal(manifest.minCoreVersion, "1.3.1", directory);
    const packageFile = path.join(reference, directory, "package.json");
    if (existsSync(packageFile)) {
      assert.equal(readJson(packageFile).version, manifest.version, directory);
    }
  }
});
