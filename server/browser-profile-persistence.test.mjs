import assert from "node:assert/strict";
import test from "node:test";

const modules = [
  "chatgpt-browser-studio",
  "claude-browser-text",
  "gemini-browser-studio",
  "google-flow-browser-images",
];

for (const plugin of modules) {
  test(`${plugin} encerra somente o cliente CDP e deixa o lifecycle físico com o núcleo`, async () => {
    const { __test } = await import(
      `../ecosystem/plugins/reference/${plugin}/handler.mjs?profile-persistence`
    );
    const events = [];
    const client = {
      async send(command) {
        events.push(command);
      },
      close() {
        events.push("client.close");
      },
    };

    await __test.closeBrowserGracefully(client);
    assert.deepEqual(events, ["client.close"]);
  });
}
