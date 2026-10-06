import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

test("an explicit discovery wakes a dormant worker without idle polling or page effects", async () => {
  const source = await readFile(
    path.join(process.cwd(), "ecosystem/browser-bridge/content-script.js"),
    "utf8",
  );
  let listener;
  let wakes = 0;
  const page = {};
  vm.runInNewContext(source, {
    window: page,
    location: { origin: "https://flow.google.com" },
    chrome: {
      runtime: {
        connect: () => ({ onMessage: { addListener() {} }, onDisconnect: { addListener() {} } }),
        sendMessage: async (message) => {
          assert.equal(message.action, "wake");
          wakes++;
        },
      },
    },
    addEventListener: (type, callback) => {
      if (type === "message") listener = callback;
    },
  });
  const request = {
    source: page,
    origin: "https://flow.google.com",
    data: { source: "contentflow-bridge-client", action: "discover" },
  };
  listener({ ...request, source: {} });
  listener({ ...request, origin: "https://unexpected.invalid" });
  assert.equal(wakes, 0);
  listener(request);
  listener(request);
  assert.equal(wakes, 1);
});

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
