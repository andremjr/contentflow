import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import { execute, internals } from "./handler.mjs";

const pluginRoot = path.dirname(fileURLToPath(import.meta.url));
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ffmpeg-sequence-test-"));
const fixtures = {
  red: path.join(temporaryRoot, "01-red.png"),
  green: path.join(temporaryRoot, "02-green.png"),
  blue: path.join(temporaryRoot, "03-blue.png"),
  audio: path.join(temporaryRoot, "audio.wav"),
  subtitles: path.join(temporaryRoot, "timings.srt"),
};
let ffmpeg;

function run(command, args, { captureStdout = false } = {}) {
  return new Promise((resolve, reject) => {
    const stdout = [];
    let stderr = "";
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"],
    });
    if (captureStdout) child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(stdout), stderr });
      else reject(new Error(`FFmpeg de teste terminou com código ${code}: ${stderr}`));
    });
  });
}

async function resolveTestFfmpeg() {
  const executable = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const packaged = path.join(
    pluginRoot,
    "vendor",
    "ffmpeg",
    `${process.platform}-${process.arch}`,
    executable,
  );
  await access(packaged, constants.X_OK);
  return packaged;
}

async function createFixtures() {
  ffmpeg = await resolveTestFfmpeg();
  for (const [name, color] of [
    ["red", "red"],
    ["green", "lime"],
    ["blue", "blue"],
  ]) {
    await run(ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:size=160x90`,
      "-frames:v",
      "1",
      fixtures[name],
    ]);
  }
  await run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=3",
    "-c:a",
    "pcm_s16le",
    fixtures.audio,
  ]);
  await writeFile(
    fixtures.subtitles,
    "1\n00:00:00,000 --> 00:00:00,500\nFirst scene\n\n2\n00:00:00,500 --> 00:00:02,000\nSecond scene\n\n3\n00:00:02,000 --> 00:00:03,000\nThird scene\n",
    "utf8",
  );
}

function storedFile(id, filePath, mimeType, size) {
  return { id, name: path.basename(filePath), mimeType, size, url: `/api/files/${id}` };
}

async function request(overrides = {}) {
  const [red, green, blue, audio] = await Promise.all([
    stat(fixtures.red),
    stat(fixtures.green),
    stat(fixtures.blue),
    stat(fixtures.audio),
  ]);
  return {
    executionId: "test-execution",
    traceId: "test-trace",
    blockId: "editing-block",
    capabilityId: "compose-image-sequence-with-audio",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {
      width: 320,
      height: 180,
      fps: 24,
      imageFit: "cover",
      backgroundColor: "#000000",
      videoQuality: 24,
    },
    settings: {},
    inputs: {
      images: [
        storedFile("red", fixtures.red, "image/png", red.size),
        storedFile("green", fixtures.green, "image/png", green.size),
        storedFile("blue", fixtures.blue, "image/png", blue.size),
      ],
      audio: storedFile("audio", fixtures.audio, "audio/wav", audio.size),
    },
    ...overrides,
  };
}

async function services(label, signal = new AbortController().signal) {
  const output = path.join(temporaryRoot, label);
  await mkdir(output, { recursive: true });
  const sources = new Map([
    ["red", fixtures.red],
    ["green", fixtures.green],
    ["blue", fixtures.blue],
    ["audio", fixtures.audio],
    ["subtitles", fixtures.subtitles],
  ]);
  return {
    signal,
    getSecret: async () => undefined,
    resolveInputFile: async (file) => sources.get(file.id),
    getOutputPath: (name) => path.join(output, name),
    getWorkspacePath: (name) => path.join(temporaryRoot, "workspace", name),
  };
}

async function probeDuration(file) {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-nostdin", "-i", file, "-f", "null", "-"]);
  const match = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  assert.ok(match, "a duração deveria ser detectável");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function pixelAt(file, seconds) {
  const { stdout } = await run(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-ss",
      String(seconds),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=1:1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { captureStdout: true },
  );
  assert.ok(stdout.length >= 3);
  return { red: stdout[0], green: stdout[1], blue: stdout[2] };
}

before(createFixtures);
after(async () => rm(temporaryRoot, { recursive: true, force: true }));

test("distribui as imagens na ordem pela duração do áudio e gera MP4", async () => {
  const service = await services("success");
  const response = await execute(await request(), service);

  assert.equal(response.status, "success");
  assert.equal(response.values.video.mimeType, "video/mp4");
  assert.equal(response.values.video.url, "artifact://final-video");
  assert.deepEqual(response.artifacts[0].source, { kind: "path", path: "video-final.mp4" });
  assert.match(response.logs[0], /1\.00 s por imagem/);

  const output = service.getOutputPath("video-final.mp4");
  const duration = await probeDuration(output);
  assert.ok(duration >= 2.95 && duration <= 3.05, `duração inesperada: ${duration}`);
  const [first, second, third] = await Promise.all([
    pixelAt(output, 0.25),
    pixelAt(output, 1.25),
    pixelAt(output, 2.25),
  ]);
  assert.ok(first.red > first.green + 100 && first.red > first.blue + 100);
  assert.ok(second.green > second.red + 100 && second.green > second.blue + 100);
  assert.ok(third.blue > third.red + 100 && third.blue > third.green + 100);
});

test("aceita uma imagem escalar e aplica os defaults", async () => {
  const input = await request();
  input.inputs.images = input.inputs.images[0];
  input.configuration = {};
  const response = await execute(input, await services("single"));
  assert.equal(response.status, "success");
});

test("sincroniza a duração de cada imagem pelos cues do SRT", async () => {
  const input = await request();
  const subtitle = await stat(fixtures.subtitles);
  input.configuration.timingMode = "srt";
  input.inputs.subtitles = [
    storedFile("subtitles", fixtures.subtitles, "application/x-subrip", subtitle.size),
  ];
  const service = await services("srt-timing");
  const response = await execute(input, service);

  assert.equal(response.status, "success");
  assert.match(response.logs[0], /3 cue\(s\) do SRT/);
  const output = service.getOutputPath("video-final.mp4");
  const [first, second, third] = await Promise.all([
    pixelAt(output, 0.25),
    pixelAt(output, 1.25),
    pixelAt(output, 2.5),
  ]);
  assert.ok(first.red > first.green + 100 && first.red > first.blue + 100);
  assert.ok(second.green > second.red + 100 && second.green > second.blue + 100);
  assert.ok(third.blue > third.red + 100 && third.blue > third.green + 100);
});

test("rejeita lista vazia, MIME incorreto e configuração desconhecida", async (t) => {
  await t.test("lista vazia", async () => {
    const input = await request();
    input.inputs.images = [];
    const response = await execute(input, await services("empty"));
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_INPUT");
  });
  await t.test("MIME incorreto", async () => {
    const input = await request();
    input.inputs.images[0].mimeType = "text/plain";
    const response = await execute(input, await services("mime"));
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_INPUT");
  });
  await t.test("configuração desconhecida", async () => {
    const input = await request();
    input.configuration.extra = true;
    const response = await execute(input, await services("config"));
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_CONFIGURATION");
  });
});

test("respeita cancelamento antes de iniciar o subprocesso", async () => {
  const controller = new AbortController();
  controller.abort();
  const response = await execute(await request(), await services("cancelled", controller.signal));
  assert.equal(response.status, "error");
  assert.equal(response.code, "CANCELLED");
});

test("as funções puras calculam duração e filtro determinísticos", () => {
  assert.equal(internals.parseProgressDuration("out_time_us=2500000\nprogress=end\n"), 2.5);
  const filter = internals.buildFilter(2, 1.25, {
    width: 320,
    height: 180,
    fps: 24,
    imageFit: "contain",
    backgroundColor: "#112233",
  });
  assert.match(filter, /pad=320:180/);
  assert.match(filter, /concat=n=2:v=1:a=0/);
  const cues = internals.parseSrt(
    "1\n00:00:00,000 --> 00:00:00,500\nOne\n\n2\n00:00:00,500 --> 00:00:02,000\nTwo\n\n3\n00:00:02,000 --> 00:00:03,000\nThree\n",
  );
  assert.deepEqual(internals.imageDurationsFromCues(cues, 3, 3), [0.5, 1.5, 1]);
  const timedFilter = internals.buildFilter(3, [0.5, 1.5, 1], {
    width: 320,
    height: 180,
    fps: 24,
    imageFit: "cover",
    backgroundColor: "#000000",
  });
  assert.match(timedFilter, /stop_duration=0\.500000/);
  assert.match(timedFilter, /stop_duration=1\.500000/);
});
