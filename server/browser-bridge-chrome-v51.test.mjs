import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("5.1 executa handshake e comando em Chrome real, minimizado e após suspend/resume", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/test-browser-bridge-chrome-v51.mjs"],
    {
      cwd: process.cwd(),
      timeout: 75_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(result.ok, true);
  assert.equal(result.handshake, true);
  assert.equal(result.command, true);
  assert.equal(result.workerSuspendResume, true);
  assert.equal(result.minimized, true);
});
