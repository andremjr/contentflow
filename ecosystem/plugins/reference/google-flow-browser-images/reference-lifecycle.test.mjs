import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rememberMedia, recalledMedia, prepareReferenceCatalog, rememberResult, recalledResult, referenceMessage, saveAnimationReceipt, readAnimationReceipt } from "./media-catalog.mjs";
import { __test } from "./handler.mjs";

const id = "e7f7e9b8-8441-4332-94a5-511efe0f4443";
const digest = "a".repeat(64);
const context = { accountProfile: "explicit-profile", projectUrl: "https://flow.google.com/project/project-a" };

test("animation receipt survives retry and isolates profile, project and core item", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flow-animation-"));
  const services = { getWorkspacePath: name => join(directory, name) };
  const request = { executionId: "execution", blockId: "animation", attempt: 1 };
  try {
    const pending = { promptDigest: digest, baselineUrls: ["existing-video"] };
    await saveAnimationReceipt(services, request, "core-item", context, pending);
    assert.deepEqual(await readAnimationReceipt(services, { ...request, attempt: 2 }, "core-item", context), pending);
    assert.equal(await readAnimationReceipt(services, request, "other-item", context), null);
    assert.equal(await readAnimationReceipt(services, request, "core-item", { ...context, accountProfile: "other" }), null);
    assert.equal(await readAnimationReceipt(services, request, "core-item", { ...context, projectUrl: "other" }), null);
    const complete = { promptDigest: digest, video: { video: { mediaId: id, fifeUrl: "https://flow-content.google/video" } } };
    await saveAnimationReceipt(services, request, "core-item", context, complete);
    assert.deepEqual(await readAnimationReceipt(services, request, "core-item", context), complete);
    const { readdir } = await import("node:fs/promises");
    const receiptName = (await readdir(directory)).find(name => name.endsWith(".animation"));
    await writeFile(join(directory, receiptName), "{broken", "utf8");
    await assert.rejects(readAnimationReceipt(services, request, "core-item", context), error => {
      assert.equal(error.code, "OUTPUT_VALIDATION_FAILED");
      assert.equal(error.recovery.externalEffect, "possible");
      return true;
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("core batch videos receive distinct artifact IDs while retaining ordinal order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flow-video-ids-"));
  const originalFetch = globalThis.fetch;
  const bytes = Buffer.alloc(1024);
  bytes.write("ftyp", 4);
  globalThis.fetch = async () => new Response(bytes, { headers: { "content-type": "video/mp4" } });
  try {
    const ids = [];
    for (let index = 0; index < 3; index++) {
      const ordinal = __test.invocationMediaContext({ batch: { itemId: `core-${index}`, index, total: 3 } }).promptOrdinal;
      const result = await __test.downloadGeneratedVideo({ video: { fifeUrl: "https://flow-content.google/test", mediaId: id } }, "animate", ordinal,
        { getOutputPath: name => join(directory, name) });
      ids.push(result.artifact.id);
    }
    assert.deepEqual(ids, ["google-flow-video-001", "google-flow-video-002", "google-flow-video-003"]);
  } finally { globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); }
});

test("rotating signed video URLs do not create a second media identity", () => {
  const first = "https://flow-content.google/video/known-video?signature=first";
  const refreshed = "https://flow-content.google/video/known-video?signature=renewed";
  const other = "https://flow-content.google/video/new-video?signature=other";
  const media = __test.mediaItemsFromVideoUrls([first, refreshed, other]);
  assert.equal(media.length, 2);
  const baseline = new Set([first].map(__test.imageMediaIdentity));
  assert.deepEqual(media.filter(item => !baseline.has(__test.imageMediaIdentity(item.video.fifeUrl)))
    .map(item => item.video.mediaId), ["new-video"]);
});

test("video polling ignores renewed links of old results and waits for the new video", async () => {
  let polls = 0;
  const client = { async send(method, { expression }) {
    assert.equal(method, "Runtime.evaluate");
    if (expression.includes("const tiles =")) return { result: { value: null } };
    polls++;
    const urls = ["https://flow-content.google/video/old?token=renewed"];
    if (polls > 1) urls.push("https://flow-content.google/video/new?token=current");
    return { result: { value: urls } };
  } };
  const result = await __test.waitForGeneratedVideosOnPage(client, "session",
    ["https://flow-content.google/video/old?token=previous"], new AbortController().signal, 5000);
  assert.equal(polls, 2);
  assert.equal(result.media[0].video.mediaId, "new");
});

test("ambiguous animation candidates block capture and replay instead of picking gallery order", () => {
  const media = [{ video: { fifeUrl: "https://flow-content.google/video/a" } }, { video: { fifeUrl: "https://flow-content.google/video/b" } }];
  assert.equal(__test.singleAnimationResult(media.slice(0, 1), "en"), media[0]);
  assert.throws(() => __test.singleAnimationResult(media, "en"), error => {
    assert.equal(error.code, "OUTPUT_VALIDATION_FAILED");
    assert.deepEqual(__test.generationFailureRecovery(error, false), { externalEffect: "possible", stage: "awaiting_result" });
    return true;
  });
});

test("provider identity survives a filename change and stays scoped to the explicit profile and project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flow-catalog-"));
  const services = { getWorkspacePath: name => join(directory, name) };
  try {
    await rememberMedia(services, digest, context, { mediaId: id, name: "Flow generated name" });
    assert.equal((await recalledMedia(services, digest, context)).mediaId, id);
    assert.equal((await recalledMedia(services, digest, context)).name, "Flow generated name");
    assert.equal(await recalledMedia(services, digest, { ...context, accountProfile: "another-profile" }), null);
    assert.equal(await recalledMedia(services, digest, { ...context, projectUrl: "https://flow.google.com/project/project-b" }), null);
    const request = { executionId: "execution", blockId: "block" };
    const media = [{ name: id, image: { generatedImage: { mediaId: id, fifeUrl: `https://flow-content.google/image/${id}` } } }];
    await rememberResult(services, request, "core-item", context, "scene prompt", media);
    assert.deepEqual(await recalledResult(services, request, "core-item", context, "scene prompt"), media);
    assert.equal(await recalledResult(services, request, "other-item", context, "scene prompt"), null);
    assert.equal(await recalledResult(services, request, "core-item", context, "changed prompt"), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("all references are verified before any prompt, and a missing reference blocks every prompt", async () => {
  const events = [];
  const images = [{ id: "father" }, { id: "daughter" }];
  const references = await prepareReferenceCatalog(images, async image => {
    events.push(`verify:${image.id}`);
    return { mediaId: id, name: "current page name" };
  });
  for (const image of images) { assert.ok(references.has(image.id)); events.push(`submit:${image.id}`); }
  assert.deepEqual(events, ["verify:father", "verify:daughter", "submit:father", "submit:daughter"]);
  let prompts = 0;
  await assert.rejects(async () => {
    await prepareReferenceCatalog(images, async image => image.id === "father" ? { mediaId: id, name: "Father" } : null);
    prompts++;
  }, { code: "OUTPUT_VALIDATION_FAILED" });
  assert.equal(prompts, 0);
});

test("reference messages exist in Portuguese, English and Spanish", () => {
  for (const key of ["animationAmbiguous", "animationPending", "unavailable", "missing", "unconfirmed", "confirmed", "clear", "uploaded"]) {
    const messages = ["pt-BR", "en", "es"].map(locale => referenceMessage(locale, key));
    assert.equal(new Set(messages).size, 3);
    assert.ok(messages.every(message => typeof message === "string" && message.length > 0));
  }
});

test("the plugin prepares both existing images and subsequently attaches the correct core reference without uploading", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flow-reference-preflight-"));
  const images = [{ id: "core-father", flowMediaId: id, name: "father-local.jpg", mimeType: "image/jpeg" },
    { id: "core-daughter", flowMediaId: "4620b625-cf0f-4992-a0f7-dced8c280436", name: "daughter-local.jpg", mimeType: "image/jpeg" }];
  const events = [];
  let count = 0;
  const services = { signal: new AbortController().signal, getWorkspacePath: name => join(directory, name),
    resolveInputFile: async image => join(directory, image.name) };
  const client = { async send(method, { expression }) {
    assert.equal(method, "Runtime.evaluate", "no upload or generation command is allowed during native preflight");
    let value;
    if (expression.includes("limparIngredientes")) { count = 0; value = 0; }
    else if (expression.includes("const find =")) {
      const image = images.find(image => expression.includes(image.flowMediaId));
      value = image ? { mediaId: image.flowMediaId, name: `native-${image.id}` } : null;
    } else if (expression.includes("const attach =")) {
      const image = images.find(image => expression.includes(image.flowMediaId));
      events.push(image.id); count++; value = true;
    } else if (expression.includes("const base =")) value = count;
    else throw new Error("Unexpected expression");
    return { result: { value } };
  } };
  try {
    for (const image of images) await writeFile(join(directory, image.name), image.id);
    const prepared = await __test.prepareAllFlowReferences(client, "session", {}, images,
      { configuration: { accountProfile: context.accountProfile }, context: { locale: "en" } }, services, context.projectUrl, {}, () => {});
    assert.deepEqual(events, ["core-father", "core-daughter"]);
    assert.equal(count, 0);
    await __test.attachReferenceImagesOneByOne(client, "session", {}, [join(directory, images[1].name)], {}, services.signal, () => {}, [prepared.get(images[1].id)], "en");
    assert.deepEqual(events, ["core-father", "core-daughter", "core-daughter"]);
    assert.equal(count, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rotating signed URLs retain the same media identity", () => {
  assert.equal(__test.imageMediaIdentity(`https://flow-content.google/image/${id}?token=old`),
    __test.imageMediaIdentity(`https://flow-content.google/image/${id}?token=new`));
});

test("a lost fill receipt is reconciled only when the complete prompt matches, without sending a generation", async () => {
  for (const exact of [true, false]) {
    let dispatched = 0;
    const bridge = { async dispatch(action) {
      assert.equal(action, "setPrompt");
      dispatched++;
      throw Object.assign(new Error("Page unavailable"), { code: "BRIDGE_PAGE_UNAVAILABLE" });
    } };
    const client = { async send(method, { expression }) {
      assert.equal(method, "Runtime.evaluate");
      return { result: { value: expression.includes("expectedPrompt") ? exact : undefined } };
    } };
    const call = () => __test.setPromptWithExtension(bridge, "entire requested prompt", "", "unit:fill", new AbortController().signal, client, "session");
    if (exact) assert.deepEqual(await call(), { readbackLength: 23, reconciledFromEditor: true });
    else await assert.rejects(call, { code: "BRIDGE_PAGE_UNAVAILABLE" });
    assert.equal(dispatched, 1);
  }
});

const engine = await readFile(new URL("./flow-engine.js", import.meta.url), "utf8");
test("Core item invocations do not publish a second logical unit for the same captured video", () => {
  const updates = [__test.mediaItemUpdate({ key: "animation:0", variantKey: "video:0", outputPort: "video", input: "Animate", value: { id: "video" } })];
  const request = { batch: { itemId: "core-unit", index: 1, total: 3 } };
  assert.equal(__test.mediaItemUpdatesForInvocation(request, updates), undefined);
  assert.equal(__test.mediaItemUpdatesForInvocation({}, updates), updates);
});
test("Flow's editor adapter must confirm the whole prompt before any generation", async () => {
  for (const matches of [true, false]) {
    let dispatched = 0;
    const bridge = { dispatch: async () => { dispatched++; } };
    const client = { send: async () => ({ result: { value: { available: true, applied: true, matches } } }) };
    const call = () => __test.setPromptWithExtension(bridge, "Full prompt", "", "unit:fill", new AbortController().signal, client, "page", "en");
    if (matches) assert.deepEqual(await call(), { readbackLength: 11, mechanism: "flow-engine" });
    else await assert.rejects(call, { code: "OUTPUT_VALIDATION_FAILED" });
    assert.equal(dispatched, 0);
  }
  for (const locale of ["pt-BR", "en", "es"]) assert.ok(referenceMessage(locale, "promptMismatch"));
});
test("an uncollected animation or explicit uncertain effect requires reconciliation, never replay", () => {
  assert.equal(__test.generationFailureRecovery({ code: "BRIDGE_PAGE_UNAVAILABLE" }, false), undefined);
  for (const [cause, awaiting] of [[{ code: "TIMEOUT" }, true], [{ code: "COMMAND_OUTCOME_UNKNOWN" }, false], [{ externalEffectUncertain: true }, false]]) {
    assert.deepEqual(__test.generationFailureRecovery(cause, awaiting), { externalEffect: "possible", stage: "awaiting_result" });
  }
});
test("animation uses the resolved block instruction even without a prompt input", () => {
  const request = { resolvedInstruction: "Animate the selected scene", context: { block: { instructions: "Old template" } } };
  assert.deepEqual(__test.animationPrompts(request, []), ["Animate the selected scene"]);
  assert.deepEqual(__test.animationPrompts(request, ["Pan left"]), ["Animate the selected scene\n\nPan left"]);
  assert.deepEqual(__test.animationPrompts(request, ["Animate the selected scene"]), ["Animate the selected scene"]);
  assert.deepEqual(__test.animationPrompts({}, []), []);
  for (const locale of ["pt-BR", "en", "es"]) assert.ok(referenceMessage(locale, "animationInstruction"));
});
test("Frames fills the structural initial slot and rejects an unconfirmed attachment", async () => {
  const source = engine.slice(engine.indexOf("  async function attachFrameByWorkflowId("), engine.indexOf("  async function abrirAbaDoMais("));
  for (const confirms of [true, false]) {
    let filled = false;
    const initial = { querySelector: () => filled ? {} : null };
    const final = { querySelector: () => null };
    const button = {};
    let clicked;
    const D2 = { $$: (selector, root) => root === initial ? [button] : [initial, final],
      clicar: value => { clicked = value; }, $: () => ({}), esperar: async fn => fn() };
    const attach = new Function("D2", "NS", "S2", "attachImageRefViaAddPanel", `${source}; return attachFrameByWorkflowId;`)(D2,
      { menu2: { configureGeneration: async () => {} } }, { addMenuPopover: "popover" }, async () => { filled = confirms; });
    if (confirms) assert.equal(await attach(null, "inicial", "Scene", id), true);
    else await assert.rejects(() => attach(null, "inicial", "Scene", id), /not confirmed/);
    assert.equal(clicked, button);
    assert.equal(final.querySelector(), null);
  }
});
test("virtual gallery lookup finds a reference outside the visible page by ID", async () => {
  let top = 0;
  const scroller = { clientHeight: 250, scrollHeight: 1400, get scrollTop() { return top; }, set scrollTop(value) { top = Math.max(0, Math.min(1150, value)); } };
  const native = { mediaId: id, nome: "Actual generated name" };
  const D2 = { getScroller: () => scroller, findTileByMediaId: value => top >= 1000 && value === id ? native : null };
  const NS = { sleep: async () => {}, media2: { chegadas: () => [] } };
  const source = engine.slice(engine.indexOf("  async function acharTile("), engine.indexOf("  async function listProjectMedia("));
  const find = new Function("D2", "NS", `${source}; return acharTile;`)(D2, NS);
  assert.equal(await find({ mediaUuid: id }), native);
  assert.ok(top >= 1000);
});

test("reference picker chooses exact media identity and rejects ambiguous names", async () => {
  let count = 0;
  let selected;
  const wrong = { name: "Same name", querySelectorAll: () => [{ src: "https://flow-content.google/image/4620b625-cf0f-4992-a0f7-dced8c280436" }], querySelector: () => null };
  const right = { name: "Same name", querySelectorAll: () => [{ src: `https://flow-content.google/image/${id}` }], querySelector: () => null };
  const S2 = { addMenuPopover: "popover", addMenuSearch: "search", addMenuItem: "items", qualquerChip: "chips" };
  const D2 = { $: selector => selector === "popover" ? {} : null,
    $$: selector => selector === "items" ? [wrong, right] : Array.from({ length: count }),
    rotulo: item => item.name, esperar: async predicate => predicate(),
    clicar: item => { selected = item; count++; }, fecharOverlays: async () => {} };
  const source = engine.slice(engine.indexOf("  async function anexarPeloMais("), engine.indexOf("  async function searchAndSelectRef("));
  const attach = new Function("D2", "S2", "NS", `${source}; return anexarPeloMais;`)(D2, S2, { sleep: async () => {} });
  assert.equal(await attach("Same name", id), true);
  assert.equal(selected, right);
  await assert.rejects(() => attach("Same name"));
});
