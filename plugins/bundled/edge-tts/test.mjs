import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { executeWithRunner, internals } from "./handler.mjs";

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "edge-tts-plugin-test-"));

after(async () => rm(temporaryRoot, { recursive: true, force: true }));

function request(overrides = {}) {
  return {
    executionId: "test-execution",
    traceId: "test-trace",
    blockId: "narration-edge-tts",
    capabilityId: "text-to-speech",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {
      voice: "en-US-GuyNeural",
      ratePercent: 5,
      volumePercent: 0,
      pitchHz: -2,
    },
    settings: {},
    inputs: { text: "Train with control, breathe steadily, and finish strong." },
    ...overrides,
  };
}

async function services(label, signal = new AbortController().signal) {
  const output = path.join(temporaryRoot, label);
  await mkdir(output, { recursive: true });
  return {
    signal,
    getSecret: async () => undefined,
    resolveInputFile: async () => undefined,
    getOutputPath: (name) => path.join(output, name),
    getWorkspacePath: (name) => path.join(temporaryRoot, "workspace", name),
  };
}

test("produz um artifact MP3 usando somente o runtime empacotado", async () => {
  let executable;
  let receivedArgs;
  const fakeRunner = async (command, args) => {
    executable = command;
    receivedArgs = args;
    const outputPath = args[args.indexOf("--write-media") + 1];
    await writeFile(outputPath, Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000TEST"));
  };

  const response = await executeWithRunner(request(), await services("success"), fakeRunner);

  assert.equal(response.status, "success");
  assert.equal(response.values.audio.mimeType, "audio/mpeg");
  assert.equal(response.values.audio.url, "artifact://edge-tts-audio");
  assert.deepEqual(response.artifacts[0].source, { kind: "path", path: "edge-narration.mp3" });
  assert.match(executable, /vendor[\\/]python[\\/]win32-x64[\\/]python\.exe$/i);
  assert.deepEqual(receivedArgs.slice(0, 4), ["-m", "edge_tts", "--file", receivedArgs[3]]);
  assert.ok(receivedArgs.includes("en-US-GuyNeural"));
  assert.ok(receivedArgs.includes("--rate=+5%"));
  assert.ok(receivedArgs.includes("--pitch=-2Hz"));
});

test("não procura Python no PATH quando o runtime empacotado é incompatível", () => {
  if (process.platform === "win32" && process.arch === "x64") {
    assert.match(process.execPath, /node/i);
  }
  assert.equal(typeof internals.edgeTtsArgs, "function");
});

test("rejeita texto vazio e configuração desconhecida", async (t) => {
  const shouldNotRun = async () => assert.fail("o subprocesso não deveria iniciar");
  await t.test("texto vazio", async () => {
    const input = request({ inputs: { text: "   " } });
    const response = await executeWithRunner(input, await services("empty"), shouldNotRun);
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_INPUT");
  });
  await t.test("configuração desconhecida", async () => {
    const input = request();
    input.configuration.extra = true;
    const response = await executeWithRunner(input, await services("unknown"), shouldNotRun);
    assert.equal(response.status, "error");
    assert.equal(response.code, "INVALID_CONFIGURATION");
  });
});

test("respeita cancelamento antes de iniciar o subprocesso", async () => {
  const controller = new AbortController();
  controller.abort();
  const response = await executeWithRunner(
    request(),
    await services("cancelled", controller.signal),
    async () => assert.fail("o subprocesso não deveria iniciar"),
  );
  assert.equal(response.status, "error");
  assert.equal(response.code, "CANCELLED");
});

test("as funções puras produzem argumentos seguros e determinísticos", () => {
  const configuration = internals.validateConfiguration({});
  const args = internals.edgeTtsArgs("C:\\input file.txt", "C:\\output file.mp3", configuration);
  assert.equal(args[0], "-m");
  assert.equal(args[1], "edge_tts");
  assert.ok(args.includes("C:\\input file.txt"));
  assert.ok(args.includes("C:\\output file.mp3"));
  assert.ok(!args.some((value) => value.includes("cmd.exe")));
});
