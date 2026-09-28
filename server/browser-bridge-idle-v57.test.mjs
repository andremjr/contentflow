import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

test("5.7: heartbeat existe somente durante sessão ativa", async () => {
  const source = await readFile(
    path.join(process.cwd(), "ecosystem/browser-bridge/content-script.js"),
    "utf8",
  );
  let onMessage;
  let onDisconnect;
  let intervals = 0;
  let posts = 0;
  let reconnects = 0;
  const port = {
    postMessage() {
      posts += 1;
    },
    onMessage: {
      addListener(callback) {
        onMessage = callback;
      },
    },
    onDisconnect: {
      addListener(callback) {
        onDisconnect = callback;
      },
    },
  };
  vm.runInNewContext(source, {
    chrome: { runtime: { connect: () => port, sendMessage() {} } },
    addEventListener() {},
    location: { href: "https://example.invalid/" },
    setInterval() {
      intervals += 1;
      return intervals;
    },
    clearInterval() {
      intervals -= 1;
    },
    setTimeout() {
      reconnects += 1;
    },
  });
  assert.equal(intervals, 0);
  assert.equal(posts, 0);
  onMessage({ action: "job-active" });
  assert.equal(intervals, 1);
  assert.equal(posts, 1);
  onMessage({ action: "job-idle" });
  assert.equal(intervals, 0);
  onDisconnect();
  assert.equal(reconnects, 0);
  onMessage({ action: "job-active" });
  onDisconnect();
  assert.equal(intervals, 0);
  assert.equal(reconnects, 1);
});
