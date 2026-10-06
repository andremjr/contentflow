const fs = require("node:fs/promises");
const path = require("node:path");
const { createWriteStream } = require("node:fs");
const { sanitizeEvent, version } = require("./diagnostic-contract.cjs");

const RETENTION_MS = 24 * 60 * 60 * 1000;
const SEGMENT_MS = 60 * 60 * 1000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_QUEUE_BYTES = 64 * 1024;
const PREFIX = "CONTENTFLOW_SUPPORT ";

function createDiagnostics(
  directory,
  { now = Date.now, maxFileBytes = MAX_FILE_BYTES, maxTotalBytes = MAX_TOTAL_BYTES } = {},
) {
  let pending = [];
  let queueBytes = 0;
  let dropped = 0;
  let timer;
  let queue = Promise.resolve();
  let failure = false;
  let accepting = true;
  let rateWindow = 0;
  let rateCount = 0;
  const duplicates = new Map();
  const owned = /^support-\d{13}\.jsonl$/;

  async function clean() {
    await fs.mkdir(directory, { recursive: true });
    const files = [];
    for (const name of await fs.readdir(directory)) {
      if (!owned.test(name)) continue;
      const file = path.join(directory, name);
      const info = await fs.lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) continue;
      const started = Number(name.slice(8, 21));
      if (started + RETENTION_MS <= now()) await fs.unlink(file);
      else files.push({ name, size: info.size });
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    let total = files.reduce((sum, file) => sum + file.size, 0);
    while (total > maxTotalBytes && files.length) {
      const removed = files.shift();
      await fs.unlink(path.join(directory, removed.name));
      total -= removed.size;
    }
    return { files, total };
  }

  function enqueue(action) {
    queue = queue.then(action).then(
      () => {
        failure = false;
      },
      () => {
        failure = true;
      },
    );
    return queue;
  }

  function record(input) {
    if (!accepting) return;
    const event = sanitizeEvent(input);
    if (!event) return;
    const at = now();
    if (at - rateWindow >= 1000) {
      rateWindow = at;
      rateCount = 0;
    }
    if (++rateCount > 40) {
      dropped++;
      return;
    }
    const { durationMs: _duration, ...fingerprint } = event;
    const key = JSON.stringify(fingerprint);
    const previous = duplicates.get(key);
    if (previous !== undefined && at - previous < 5000) {
      dropped++;
      return;
    }
    if (duplicates.size >= 128) duplicates.delete(duplicates.keys().next().value);
    duplicates.set(key, at);
    const line = JSON.stringify({ at: new Date(at).toISOString(), ...event }) + "\n";
    const size = Buffer.byteLength(line);
    if (queueBytes + size > MAX_QUEUE_BYTES) {
      dropped++;
      return;
    }
    pending.push(line);
    queueBytes += size;
    if (!timer)
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, 1000);
    timer?.unref();
  }

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    return enqueue(async () => {
      // Drain inside the serialized writer, not into an unbounded chain of batch closures.
      let batch = pending.join("");
      pending = [];
      queueBytes = 0;
      if (dropped) {
        batch +=
          JSON.stringify({
            at: new Date(now()).toISOString(),
            area: "desktop",
            code: "RECORDS_DROPPED",
            count: dropped,
          }) + "\n";
        dropped = 0;
      }
      const { files, total: originalTotal } = await clean();
      if (!batch) return;
      const name = `support-${Math.floor(now() / SEGMENT_MS) * SEGMENT_MS}.jsonl`;
      const current = files.find((file) => file.name === name)?.size ?? 0;
      let total = originalTotal;
      while (
        files.length &&
        total + Math.min(Buffer.byteLength(batch), maxFileBytes - current) > maxTotalBytes
      ) {
        const oldest = files[0];
        if (oldest.name === name) break;
        files.shift();
        await fs.unlink(path.join(directory, oldest.name));
        total -= oldest.size;
      }
      const room = Math.max(0, Math.min(maxFileBytes - current, maxTotalBytes - total));
      const lines = batch.split("\n").filter(Boolean);
      let output = "";
      for (const line of lines) {
        if (Buffer.byteLength(output) + Buffer.byteLength(line) + 1 > room) {
          dropped++;
          continue;
        }
        output += line + "\n";
      }
      if (output) {
        const target = path.join(directory, name);
        const info = await fs.lstat(target).catch(() => undefined);
        if (info?.isSymbolicLink()) throw new Error("Unsafe log target");
        await fs.appendFile(target, output, { flag: "a", mode: 0o600 });
      }
    });
  }

  async function read() {
    await flush();
    if (failure) throw new Error("Diagnostic storage unavailable");
    const events = [];
    const { files } = await clean();
    for (const file of files) {
      if (file.size > maxFileBytes) continue;
      for (const line of (await fs.readFile(path.join(directory, file.name), "utf8")).split("\n")) {
        try {
          const parsed = JSON.parse(line);
          const at = Date.parse(parsed.at);
          // Revalidate edited/corrupt files before exporting them. Hashes are not hashed twice.
          const { executionId, blockId, jobId, profileId, ...fields } = parsed;
          const safe = sanitizeEvent(fields);
          if (!safe || at < now() - RETENTION_MS || at > now()) continue;
          const ids = Object.fromEntries(
            Object.entries({ executionId, blockId, jobId, profileId }).filter(
              ([, value]) => typeof value === "string" && /^[a-f0-9]{16}$/.test(value),
            ),
          );
          events.push({ at: new Date(at).toISOString(), ...safe, ...ids });
        } catch {
          /* Partial/corrupt lines never become support payloads. */
        }
      }
    }
    return events;
  }

  let cleanupTimer;
  function scheduleCleanup() {
    cleanupTimer = setTimeout(
      () => {
        void enqueue(clean);
        scheduleCleanup();
      },
      SEGMENT_MS - (now() % SEGMENT_MS),
    );
    cleanupTimer.unref();
  }
  scheduleCleanup();
  void enqueue(clean);
  return {
    record,
    flush,
    read,
    async prepare() {
      await flush();
      if (failure) throw new Error("Diagnostic storage unavailable");
    },
    async close() {
      accepting = false;
      clearTimeout(cleanupTimer);
      await flush();
    },
  };
}

const DESCRIPTIONS = {
  APP_STARTED: "Aplicativo iniciado / Application started / Aplicación iniciada",
  API_STARTED: "Serviço local iniciado / Local service started / Servicio local iniciado",
  UI_ERROR: "Erro na interface / Interface error / Error de interfaz",
  UI_REJECTION:
    "Operação da interface falhou / Interface operation failed / Falló una operación de interfaz",
  API_REQUEST_FAILED:
    "Solicitação recusada ou falhou / Request rejected or failed / Solicitud rechazada o fallida",
  API_ERROR: "Erro no serviço local / Local service error / Error del servicio local",
  JOB_FAILED: "Execução do plugin falhou / Plugin execution failed / Falló la ejecución del plugin",
  RECORDS_DROPPED:
    "Registros repetidos ou excedentes omitidos / Repeated or excess records omitted / Registros repetidos o excedentes omitidos",
};

async function exportDiagnostics(file, events, appVersion) {
  // Load compression only for an explicit export, keeping startup light.
  const archiver = require("archiver");
  const environment = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    appVersion: version(appVersion) ?? "unknown",
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    retentionHours: 24,
    maxLogBytes: MAX_TOTAL_BYTES,
  };
  const report = [
    "ContentFlow — Diagnóstico / Diagnostic report / Diagnóstico",
    `Versão / Version / Versión: ${environment.appVersion}`,
    "Registros das últimas 24 horas, sujeitos ao limite de tamanho. / Last 24 hours, subject to the size limit. / Últimas 24 horas, sujetas al límite de tamaño.",
    "Conteúdo e mensagens privadas não são incluídos. / Private content and messages are excluded. / Se excluyen contenido y mensajes privados.",
    "Informe o que tentou fazer e o horário do erro. / Describe what you tried to do and the error time. / Describe qué intentaste hacer y la hora del error.",
    "",
    ...events.map(
      (event) =>
        `${event.at} | ${event.area} | ${event.code} | ${DESCRIPTIONS[event.code] ?? event.code} | ${JSON.stringify(event)}`,
    ),
  ].join("\n");
  await new Promise((resolve, reject) => {
    const output = createWriteStream(file, { flags: "w", mode: 0o600 });
    const zip = archiver("zip", { zlib: { level: 1 } });
    output.once("close", resolve);
    output.once("error", reject);
    zip.once("error", reject);
    zip.once("warning", reject);
    zip.pipe(output);
    zip.append(report, { name: "LEIA-ME.txt" });
    zip.append(JSON.stringify(environment, null, 2), { name: "environment.json" });
    zip.append(events.map((event) => JSON.stringify(event)).join("\n"), { name: "events.jsonl" });
    void zip.finalize().catch(reject);
  });
}

// Only marked structured frames are considered; regular stdout is discarded.
function createApiDiagnosticReader(record) {
  let buffer = "";
  let discarding = false;
  return (chunk) => {
    for (const part of String(chunk).split(/(?<=\n)/)) {
      if (!discarding) buffer += part;
      if (buffer.length > 4096) {
        buffer = "";
        discarding = true;
      }
      if (!part.endsWith("\n")) continue;
      if (!discarding && buffer.startsWith(PREFIX)) {
        try {
          record(JSON.parse(buffer.slice(PREFIX.length)));
        } catch {
          /* invalid frame */
        }
      }
      buffer = "";
      discarding = false;
    }
  };
}

module.exports = {
  createDiagnostics,
  exportDiagnostics,
  createApiDiagnosticReader,
  RETENTION_MS,
  MAX_TOTAL_BYTES,
  MAX_QUEUE_BYTES,
};
