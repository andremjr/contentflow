import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  pluginAdministrationMessages,
  pluginAdministrationText,
} from "./plugin-administration-localization";

test("administrative incompatibility indicators have PT-BR, English and Spanish versions", () => {
  for (const key of Object.keys(pluginAdministrationMessages) as Array<
    keyof typeof pluginAdministrationMessages
  >) {
    const variants = ["pt-BR", "en", "es"].map((language) =>
      pluginAdministrationText(key, language as "pt-BR" | "en" | "es"),
    );
    assert.ok(variants.every((value) => value.length > 0));
    assert.notEqual(variants[0], variants[1]);
    assert.notEqual(variants[1], variants[2]);
  }
  const route = readFileSync("src/routes/plugins.tsx", "utf8");
  assert.match(route, /pluginAdministrationText\("incompatible", language\)/);
  assert.match(route, /pluginAdministrationText\("blockedCatalog", language\)/);
  assert.match(route, /!incompatible && <CommunityAccessPanel/);
  assert.match(route, /plugin\.compatibility\?\.status === "incompatible"/);
});
