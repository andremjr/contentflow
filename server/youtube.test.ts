import assert from "node:assert/strict";
import test from "node:test";
import { readSubscriberCount } from "./youtube";

test("prioritizes the subscriber count in the structured channel header", () => {
  const html = `
    {"subscriberCountText":{"simpleText":"227 inscritos"},"canonicalBaseUrl":"/@captainworkoutES"}
    {"contentMetadataViewModel":{"metadataRows":[
      {"metadataParts":[{"text":{"content":"@captainworkoutYT"}}]},
      {"metadataParts":[
        {"text":{"content":"597\u00a0mil inscritos","accessibilityLabel":"597 mil inscritos"}},
        {"text":{"content":"85 vídeos"}}
      ]}
    ]}}
  `;

  assert.equal(readSubscriberCount(html, "@captainworkoutYT"), "597\u00a0mil inscritos");
});

test("uses the structured position for subscriber labels in other languages", () => {
  const html = `
    {"contentMetadataViewModel":{"metadataRows":[
      {"metadataParts":[{"text":{"content":"@canal"}}]},
      {"metadataParts":[
        {"text":{"content":"12,3 mil suscriptores"}},
        {"text":{"content":"40 vídeos"}}
      ]}
    ]}}
  `;

  assert.equal(readSubscriberCount(html, "@canal"), "12,3 mil suscriptores");
});

test("preserves the legacy combined subtitle strategy", () => {
  const html = `
    {"subtitle":{"content":"@canal • 9,95 mil inscritos • 120 vídeos"}}
  `;

  assert.equal(readSubscriberCount(html, "@canal"), "9,95 mil inscritos");
});

test("preserves the legacy global text candidate strategy", () => {
  const html = `
    {"simpleText":"2.4 million subscribers"}
  `;

  assert.equal(readSubscriberCount(html, "@channel"), "2.4 million subscribers");
});

test("falls back to zero when no supported subscriber count is available", () => {
  assert.equal(readSubscriberCount("<html></html>", "@channel"), "0 inscritos");
});
