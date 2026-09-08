import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

const modules = [
  "chatgpt-browser-studio",
  "claude-browser-text",
  "gemini-browser-studio",
  "google-flow-browser-images",
];

for (const plugin of modules) {
  test(`${plugin} espera o Chrome persistir o perfil antes de encerrar à força`, async () => {
    const { __test } = await import(
      `../ecosystem/plugins/reference/${plugin}/handler.mjs?profile-persistence`
    );
    const events = [];
    const child = new EventEmitter();
    child.exitCode = null;
    child.kill = () => events.push("kill");
    const client = {
      async send(command) {
        events.push(command);
        setTimeout(() => {
          child.exitCode = 0;
          child.emit("exit", 0);
        }, 10);
      },
      close() {
        events.push("client.close");
      },
    };

    await __test.closeBrowserGracefully(client, child);
    assert.deepEqual(events, ["Browser.close", "client.close"]);
  });
}
