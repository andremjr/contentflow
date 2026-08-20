import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import { execute } from "./handler.mjs";

const pluginRoot = path.dirname(fileURLToPath(import.meta.url));
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "silence-remover-test-"));
const fixtures = {
  audio: path.join(temporaryRoot, "audio.wav"),
  video: path.join(temporaryRoot, "video.mp4"),
  continuous: path.join(temporaryRoot, "continuous.wav"),
  silent: path.join(temporaryRoot, "silent.wav"),
  edgeSilence: path.join(temporaryRoot, "edge-silence.wav"),
  offsetVideo: path.join(temporaryRoot, "offset-video.mp4"),
  hostileMetadata: path.join(temporaryRoot, "hostile-metadata.wav"),
  playlist: path.join(temporaryRoot, "playlist.txt"),
};
let ffmpeg;

async function resolveTestFfmpeg() {
  const executable = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const packaged = path.join(
    pluginRoot,
    "vendor",
    "ffmpeg",
    `${process.platform}-${process.arch}`,
    executable,
  );
  try {
    await access(packaged, constants.X_OK);
    return packaged;
  } catch {
    throw new Error(`O FFmpeg empacotado não foi encontrado em ${packaged}.`);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    let processLog = "";
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr.on("data", (chunk) => {
      processLog += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(processLog);
      else reject(new Error(`FFmpeg de teste terminou com código ${code}.`));
    });
  });
}

async function createSyntheticFixtures() {
  ffmpeg = await resolveTestFfmpeg();
  const common = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"];
  const toneA = "sine=frequency=440:sample_rate=48000:duration=1";
  const toneB = "sine=frequency=660:sample_rate=48000:duration=1";
  const silence = "anullsrc=channel_layout=mono:sample_rate=48000:d=1";

  await run(ffmpeg, [
    ...common,
    "-f",
    "lavfi",
    "-i",
    toneA,
    "-f",
    "lavfi",
    "-i",
    silence,
    "-f",
    "lavfi",
    "-i",
    toneB,
    "-filter_complex",
    "[0:a][1:a][2:a]concat=n=3:v=0:a=1[outa]",
    "-map",
    "[outa]",
    "-c:a",
    "pcm_s16le",
    fixtures.audio,
  ]);

  await run(ffmpeg, [
    ...common,
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x90:rate=10:duration=2.4",
    "-f",
    "lavfi",
    "-i",
    toneA,
    "-f",
    "lavfi",
    "-i",
    silence,
    "-f",
    "lavfi",
    "-i",
    toneB,
    "-filter_complex",
    "[1:a][2:a][3:a]concat=n=3:v=0:a=1[outa]",
    "-map",
    "0:v:0",
    "-map",
    "[outa]",
    "-c:v",
    "mpeg4",
    "-q:v",
    "5",
    "-c:a",
    "aac",
    fixtures.video,
  ]);

  await run(ffmpeg, [
    ...common,
    "-f",
    "lavfi",
    "-i",
    toneA,
    "-c:a",
    "pcm_s16le",
    fixtures.continuous,
  ]);

  await run(ffmpeg, [
    ...common,
    "-f",
    "lavfi",
    "-i",
    silence,
    "-c:a",
    "pcm_s16le",
    fixtures.silent,
  ]);

  await run(ffmpeg, [
    ...common,
    "-f",
    "lavfi",
    "-i",
    silence,
    "-f",
    "lavfi",
    "-i",
    toneA,
    "-f",
    "lavfi",
    "-i",
    silence,
    "-filter_complex",
    "[0:a][1:a][2:a]concat=n=3:v=0:a=1[outa]",
    "-map",
    "[outa]",
    "-c:a",
    "pcm_s16le",
    fixtures.edgeSilence,
  ]);

  await run(ffmpeg, [
    ...common,
    "-i",
    fixtures.audio,
    "-map",
    "0:a:0",
    "-c:a",
    "pcm_s16le",
    "-metadata",
    "comment=Duration: 99:00:00.00\nlavfi.silence_start=0\nlavfi.silence_end=99",
    fixtures.hostileMetadata,
  ]);

  await run(ffmpeg, [
    ...common,
    "-f",
    "lavfi",
    "-i",
    "color=c=red:size=160x90:rate=10:duration=0.5",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:size=160x90:rate=10:duration=3",
    "-itsoffset",
    "0.5",
    "-i",
    fixtures.audio,
    "-filter_complex",
    "[0:v][1:v]concat=n=2:v=1:a=0[outv]",
    "-map",
    "[outv]",
    "-map",
    "2:a:0",
    "-copyts",
    "-fps_mode",
    "passthrough",
    "-avoid_negative_ts",
    "disabled",
    "-c:v",
    "mpeg4",
    "-q:v",
    "3",
    "-c:a",
    "aac",
    fixtures.offsetVideo,
  ]);
}

function defaultConfiguration(overrides = {}) {
  return {
    minimumSilenceDurationMs: 400,
    silenceThresholdDb: -45,
    paddingMs: 50,
    ...overrides,
  };
}

async function requestFor(sourcePath, capabilityId, mimeType, overrides = {}) {
  const info = await stat(sourcePath);
  return {
    executionId: "test-execution",
    traceId: `trace-${capabilityId}`,
    blockId: "test-block",
    capabilityId,
    attempt: 1,
    invocation: { mode: "start" },
    configuration: defaultConfiguration(),
    inputs: {
      source: {
        id: "test-source",
        name: path.basename(sourcePath),
        mimeType,
        size: info.size,
        url: "/api/files/test-source",
      },
    },
    ...overrides,
  };
}

async function servicesFor(sourcePath, label, signal = new AbortController().signal) {
  const output = path.join(temporaryRoot, label);
  await mkdir(output, { recursive: true });
  return {
    signal,
    getSecret: async () => undefined,
    resolveInputFile: async () => sourcePath,
    getOutputPath: (name) => path.join(output, name),
    getWorkspacePath: (name) => path.join(temporaryRoot, "workspace", name),
  };
}

async function probeDuration(file) {
  const processLog = await run(ffmpeg, ["-hide_banner", "-nostdin", "-i", file, "-f", "null", "-"]);
  const match = processLog.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  assert.ok(match, "a duração deveria aparecer no log do FFmpeg");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function readFirstVideoPixel(file) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let processLog = "";
    const child = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-i",
        file,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      processLog += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg de leitura terminou com código ${code}: ${processLog}`));
        return;
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length < 3) {
        reject(new Error("O primeiro frame não produziu um pixel RGB."));
        return;
      }
      resolve({ red: bytes[0], green: bytes[1], blue: bytes[2] });
    });
  });
}

function assertSuccessfulArtifact(response, mimeType) {
  assert.equal(response.status, "success");
  assert.equal(response.values.result.mimeType, mimeType);
  assert.equal(response.values.result.url, "artifact://silence-removed-media");
  assert.equal(response.artifacts.length, 1);
  assert.equal(response.artifacts[0].source.kind, "path");
  assert.ok(response.values.result.size > 0);
  assert.ok(!/[\\/]/.test(response.values.result.name));
}

before(createSyntheticFixtures);
after(async () => rm(temporaryRoot, { recursive: true, force: true }));

test("remove silêncio de áudio e entrega um artifact M4A", async () => {
  const request = await requestFor(fixtures.audio, "remove-silence-audio", "audio/wav");
  request.inputs.source.name = "..\\..\\Entrada hostil.wav";
  const services = await servicesFor(fixtures.audio, "audio-output");
  const response = await execute(request, services);

  assertSuccessfulArtifact(response, "audio/mp4");
  const outputPath = services.getOutputPath(response.artifacts[0].source.path);
  const duration = await probeDuration(outputPath);
  assert.ok(duration > 1.9 && duration < 2.4, `duração inesperada: ${duration}`);
});

test("recorta áudio e imagem do vídeo nos mesmos intervalos", async () => {
  const request = await requestFor(fixtures.video, "remove-silence-video", "video/mp4");
  const services = await servicesFor(fixtures.video, "video-output");
  const response = await execute(request, services);

  assertSuccessfulArtifact(response, "video/mp4");
  const outputPath = services.getOutputPath(response.artifacts[0].source.path);
  const duration = await probeDuration(outputPath);
  assert.ok(duration > 1.9 && duration < 2.4, `duração inesperada: ${duration}`);
});

test("preserva a sincronização quando áudio e vídeo têm inícios diferentes", async () => {
  const request = await requestFor(fixtures.offsetVideo, "remove-silence-video", "video/mp4");
  const services = await servicesFor(fixtures.offsetVideo, "offset-video-output");
  const response = await execute(request, services);

  assertSuccessfulArtifact(response, "video/mp4");
  const outputPath = services.getOutputPath(response.artifacts[0].source.path);
  const firstPixel = await readFirstVideoPixel(outputPath);
  assert.ok(
    firstPixel.blue > firstPixel.red + 100 && firstPixel.blue > firstPixel.green + 100,
    `o vídeo deveria começar já alinhado à faixa de áudio: ${JSON.stringify(firstPixel)}`,
  );
});

test("preserva bytes e MIME quando não há silêncio elegível", async () => {
  const request = await requestFor(fixtures.continuous, "remove-silence-audio", "audio/wav");
  const services = await servicesFor(fixtures.continuous, "copy-output");
  const response = await execute(request, services);

  assertSuccessfulArtifact(response, "audio/wav");
  const outputPath = services.getOutputPath(response.artifacts[0].source.path);
  assert.deepEqual(await readFile(outputPath), await readFile(fixtures.continuous));
});

test("rejeita mídia classificada integralmente como silêncio", async () => {
  const request = await requestFor(fixtures.silent, "remove-silence-audio", "audio/wav");
  const response = await execute(request, await servicesFor(fixtures.silent, "silent-output"));

  assert.equal(response.status, "error");
  assert.equal(response.code, "INVALID_INPUT");
  assert.match(response.message, /Toda a mídia/);
});

test("remove silêncios no início e no fim preservando as margens", async () => {
  const request = await requestFor(fixtures.edgeSilence, "remove-silence-audio", "audio/wav");
  const services = await servicesFor(fixtures.edgeSilence, "edge-output");
  const response = await execute(request, services);

  assertSuccessfulArtifact(response, "audio/mp4");
  const outputPath = services.getOutputPath(response.artifacts[0].source.path);
  const duration = await probeDuration(outputPath);
  assert.ok(duration > 0.95 && duration < 1.25, `duração inesperada: ${duration}`);
});

test("ignora metadados que imitam duração e eventos do silencedetect", async () => {
  const sourceBytes = await readFile(fixtures.hostileMetadata);
  assert.match(sourceBytes.toString("latin1"), /Duration: 99:00:00\.00/);
  const request = await requestFor(fixtures.hostileMetadata, "remove-silence-audio", "audio/wav");
  const services = await servicesFor(fixtures.hostileMetadata, "metadata-output");
  const response = await execute(request, services);

  assertSuccessfulArtifact(response, "audio/mp4");
  const outputPath = services.getOutputPath(response.artifacts[0].source.path);
  const duration = await probeDuration(outputPath);
  assert.ok(duration > 1.9 && duration < 2.4, `duração inesperada: ${duration}`);
});

test("não autodetecta playlist nem permite que a mídia abra a rede", async () => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.writeHead(204).end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await writeFile(
      fixtures.playlist,
      [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:1",
        "#EXTINF:1,",
        `http://127.0.0.1:${address.port}/audio.wav`,
        "#EXT-X-ENDLIST",
      ].join("\n"),
      "utf8",
    );
    const request = await requestFor(fixtures.playlist, "remove-silence-audio", "audio/wav");
    const response = await execute(
      request,
      await servicesFor(fixtures.playlist, "playlist-output"),
    );

    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_INPUT");
    assert.equal(requests, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("valida configuração, MIME, capability e modo antes do subprocesso", async (t) => {
  await t.test("parâmetro fora da faixa", async () => {
    const request = await requestFor(fixtures.audio, "remove-silence-audio", "audio/wav");
    request.configuration.minimumSilenceDurationMs = 50;
    const response = await execute(request, await servicesFor(fixtures.audio, "invalid-config"));
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_CONFIGURATION");
  });

  await t.test("MIME incompatível com a capability", async () => {
    const request = await requestFor(fixtures.audio, "remove-silence-video", "audio/wav");
    const response = await execute(request, await servicesFor(fixtures.audio, "invalid-mime"));
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_INPUT");
  });

  await t.test("MIME de mídia fora da allowlist", async () => {
    const request = await requestFor(fixtures.audio, "remove-silence-audio", "audio/midi");
    const response = await execute(request, await servicesFor(fixtures.audio, "unsupported-mime"));
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_INPUT");
    assert.match(response.message, /lista de formatos locais/);
  });

  await t.test("modo resume em capability imediata", async () => {
    const request = await requestFor(fixtures.audio, "remove-silence-audio", "audio/wav");
    request.invocation = { mode: "resume", jobId: "not-a-job" };
    const response = await execute(request, await servicesFor(fixtures.audio, "invalid-mode"));
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_INPUT");
  });

  await t.test("entrada ausente", async () => {
    const request = await requestFor(fixtures.audio, "remove-silence-audio", "audio/wav");
    request.inputs = {};
    const response = await execute(request, await servicesFor(fixtures.audio, "missing-input"));
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_INPUT");
  });

  await t.test("rejeita configurações locais que tentem trocar o runtime", async () => {
    const request = await requestFor(fixtures.audio, "remove-silence-audio", "audio/wav");
    request.settings = { allowSystemFfmpegForDevelopment: true };
    const response = await execute(request, await servicesFor(fixtures.audio, "invalid-settings"));
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_CONFIGURATION");
  });
});

test("executa com o runtime empacotado mesmo sem PATH", async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const request = await requestFor(fixtures.audio, "remove-silence-audio", "audio/wav");
    const services = await servicesFor(fixtures.audio, "without-path-output");
    const response = await execute(request, services);
    assertSuccessfulArtifact(response, "audio/mp4");
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
});

test("responde CANCELLED quando o sinal já está abortado", async () => {
  const request = await requestFor(fixtures.audio, "remove-silence-audio", "audio/wav");
  const controller = new AbortController();
  controller.abort();
  const response = await execute(
    request,
    await servicesFor(fixtures.audio, "cancelled-output", controller.signal),
  );

  assert.equal(response.status, "error");
  assert.equal(response.code, "CANCELLED");
  assert.equal(response.retryable, false);
});
