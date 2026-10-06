const assert = require("node:assert/strict");
const test = require("node:test");
const { mkdtemp, writeFile, readFile, readdir, rm, stat } = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const yauzl = require("yauzl");
const {
  createDiagnostics,
  createApiDiagnosticReader,
  exportDiagnostics,
  RETENTION_MS,
} = require("./diagnostics.cjs");
const { sanitizeEvent, safeError, safeConsoleError } = require("./diagnostic-contract.cjs");

async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "contentflow-support-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function unzip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = {};
      zip.on("error", reject);
      zip.on("end", () => resolve(entries));
      zip.on("entry", (entry) =>
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            entries[entry.fileName] = Buffer.concat(chunks).toString("utf8");
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    });
  });
}
test("support data excludes private values and preserves actionable error class and correlation", () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'private-token')");
  error.stack =
    "TypeError: private-token\n at http://127.0.0.1:8080/src/components/method-builder.tsx:724:5\n C:\\Users\\private-user";
  const event = sanitizeEvent({
    area: "interface",
    code: "UI_ERROR",
    ...safeError(error),
    executionId: "private-execution",
    token: "private-token",
    message: error.message,
    url: "https://private.invalid",
    prompt: "private-content",
    profilePath: "C:\\private",
  });
  assert.equal(event.errorKind, "UNDEFINED_ACCESS");
  assert.equal(event.location, "src/components/method-builder.tsx");
  assert.equal(event.line, 724);
  assert.doesNotMatch(JSON.stringify(event), /private/);
  assert.equal(sanitizeEvent({ code: "PRIVATE_EVENT" }), undefined);
  assert.equal(sanitizeEvent({ code: "JOB_FAILED", reasonCode: "SECRET" }).reasonCode, "UNKNOWN");
  const consoleError = safeConsoleError({
    message:
      "Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'private-token')",
    sourceId: "http://127.0.0.1:8080/assets/app.js",
    lineNumber: 40,
  });
  assert.equal(consoleError.code, "UI_REJECTION");
  assert.equal(consoleError.errorType, "TypeError");
  assert.equal(consoleError.location, "assets/app.js");
  assert.doesNotMatch(JSON.stringify(consoleError), /private|http/);
});

test("unavailable diagnostic storage fails export preparation without affecting the caller", async (t) => {
  const directory = await temporary(t);
  const blocked = path.join(directory, "blocked");
  await writeFile(blocked, "not a directory");
  const log = createDiagnostics(blocked);
  log.record({ code: "APP_STARTED" });
  await assert.rejects(log.prepare(), /Diagnostic storage unavailable/);
  await assert.rejects(log.read(), /Diagnostic storage unavailable/);
  await log.close();
});
test("expired owned records are removed on restart; other files remain intact", async (t) => {
  const directory = await temporary(t);
  const now = Math.floor(Date.now() / 3600000) * 3600000;
  const expired = `support-${now - RETENTION_MS}.jsonl`;
  await writeFile(path.join(directory, expired), "old");
  await writeFile(path.join(directory, "student-note.txt"), "preserve");
  const log = createDiagnostics(directory, { now: () => now });
  await log.prepare();
  assert.equal((await readdir(directory)).includes(expired), false);
  assert.equal(await readFile(path.join(directory, "student-note.txt"), "utf8"), "preserve");
  await log.close();
});
test("rotation bounds disk and retains newest events; flood is bounded and reported", async (t) => {
  const directory = await temporary(t);
  let now = Math.floor(Date.now() / 3600000) * 3600000;
  const log = createDiagnostics(directory, {
    now: () => now,
    maxFileBytes: 1024,
    maxTotalBytes: 2048,
  });
  for (let hour = 0; hour < 4; hour++) {
    for (let n = 0; n < 500; n++)
      log.record({
        code: "API_REQUEST_FAILED",
        area: "api",
        operation: "/api/commands",
        status: 422,
        durationMs: n,
      });
    await log.flush();
    now += 3600000;
  }
  log.record({ code: "UI_ERROR", area: "interface", errorType: "TypeError" });
  const events = await log.read();
  assert.ok(events.some((event) => event.code === "UI_ERROR"));
  assert.ok(events.some((event) => event.code === "RECORDS_DROPPED"));
  assert.ok(events.length < 20);
  const files = await readdir(directory);
  const total = (await Promise.all(files.map((name) => stat(path.join(directory, name))))).reduce(
    (n, info) => n + info.size,
    0,
  );
  assert.ok(total <= 2048);
  await log.close();
});
test("export revalidates log files and creates a readable ZIP without private data", async (t) => {
  const directory = await temporary(t);
  const log = createDiagnostics(directory);
  log.record({
    code: "JOB_FAILED",
    area: "plugin",
    pluginId: "example-plugin",
    pluginVersion: "2.1.0",
    reasonCode: "TIMEOUT",
    message: "PRIVATE",
  });
  await log.flush();
  const [file] = await readdir(directory);
  await writeFile(
    path.join(directory, file),
    JSON.stringify({
      at: new Date().toISOString(),
      code: "UI_ERROR",
      area: "interface",
      message: "PRIVATE",
      cookie: "PRIVATE",
    }) + "\n",
    { flag: "a" },
  );
  const zipPath = path.join(directory, "report.zip");
  await exportDiagnostics(zipPath, await log.read(), "1.3.6");
  const entries = await unzip(zipPath);
  assert.deepEqual(Object.keys(entries).sort(), [
    "LEIA-ME.txt",
    "environment.json",
    "events.jsonl",
  ]);
  assert.match(entries["LEIA-ME.txt"], /Execução do plugin falhou/);
  assert.match(entries["events.jsonl"], /TIMEOUT/);
  assert.doesNotMatch(JSON.stringify(entries), /PRIVATE/);
  await log.close();
});
test("API pipe reader accepts split frames and discards raw or oversized output", () => {
  const events = [];
  const read = createApiDiagnosticReader((event) => events.push(event));
  read("private raw output\nCONTENTFLOW_SUP");
  read('PORT {"code":"API_STARTED"}\n');
  read("x".repeat(10000));
  read('\nCONTENTFLOW_SUPPORT {"code":"API_ERROR"}\n');
  assert.deepEqual(events, [{ code: "API_STARTED" }, { code: "API_ERROR" }]);
});
