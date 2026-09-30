import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type ActionBlock,
  type Channel,
  type ProcessExecution,
  type ProcessMethod,
  type Project,
} from "../src/lib/domain";
import { createCanonicalProcessExecution } from "../src/lib/execution-core";
import { executionCommands } from "./execution-commands";

const initialStages = () =>
  Object.fromEntries(
    PROCESS_ORDER.map((processType) => [processType, "not_started"]),
  ) as Project["stages"];

function humanBlock(
  id: string,
  order: number,
  outputKey = `value_${order}`,
  outputType: NonNullable<ActionBlock["outputs"]>[number]["type"] = "text",
): ActionBlock {
  return {
    id,
    type: "CRIAR",
    operator: "Humano",
    name: id,
    inputs: [],
    outputs: [
      {
        id: `${id}-output`,
        label: `Saída ${id}`,
        key: outputKey,
        type: outputType,
        required: true,
      },
    ],
    parameters: [],
    order,
  };
}

function automaticBlock(id: string, order: number, outputKey = `value_${order}`): ActionBlock {
  return {
    id,
    type: "CRIAR",
    operator: "Código",
    name: id,
    inputs: [],
    outputs: [
      {
        id: `${id}-output`,
        label: `Saída ${id}`,
        key: outputKey,
        type: "text",
        required: true,
      },
    ],
    plugin: {
      pluginId: "com.contentflow.characterization",
      capabilityId: "characterize",
      configuration: {},
    },
    parameters: [],
    order,
  };
}

function fixture(blocks: ActionBlock[], processType: ProcessMethod["processType"] = "theme") {
  const methods = createEmptyMethods();
  methods[processType] = {
    name: "Método caracterizado",
    processType,
    blocks,
  };
  const channel: Channel = {
    id: "channel-characterization",
    name: "Canal de caracterização",
    handle: "",
    color: "#6366f1",
    subscribers: "—",
    niche: "Teste",
    language: "pt-BR",
    activeProjects: 1,
    frequency: "Semanal",
    nextPublish: "",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    methods,
    createdAt: "2026-09-28T00:00:00.000Z",
  };
  const project: Project = {
    id: "project-characterization",
    title: "Projeto de caracterização",
    channelId: channel.id,
    currentStage: processType,
    state: "not_started",
    progress: 0,
    deadline: "Sem prazo",
    duration: "—",
    updatedAt: "Agora",
    stages: initialStages(),
    assignee: { name: "Teste", initials: "T" },
    thumbHue: 0,
    createdAt: "2026-09-28T00:00:00.000Z",
  };
  const db = {
    channels: [channel],
    projects: [project],
    executions: [] as ProcessExecution[],
    libraryItems: [],
    libraryCollections: [],
  };
  return { db, channel, project, commands: executionCommands(db) };
}

test("C01 — start com primeiro Bloco Humano projeta espera humana", () => {
  const { commands, project } = fixture([
    humanBlock("human-first", 0),
    humanBlock("human-second", 1),
  ]);

  const execution = commands.startProcessExecution(project.id, "theme");

  assert.ok(execution);
  assert.equal(execution.status, "awaiting_human");
  assert.equal(execution.outputStatus, "pending");
  assert.deepEqual(
    execution.blocks.map((block) => ({ status: block.status, attempt: block.attempt })),
    [
      { status: "awaiting_human", attempt: 1 },
      { status: "pending", attempt: 1 },
    ],
  );
  assert.ok(execution.blocks[0].startedAt);
  assert.equal(execution.blocks[1].startedAt, undefined);
  assert.equal(project.stages.theme, "awaiting_human");
  assert.equal(project.currentStage, "theme");
  assert.equal(project.state, "awaiting_human");
});

test("C02 — start com primeiro Bloco automático projeta executor bloqueado", () => {
  const { commands, project } = fixture([
    automaticBlock("automatic-first", 0),
    humanBlock("human-second", 1),
  ]);

  const execution = commands.startProcessExecution(project.id, "theme");

  assert.ok(execution);
  assert.equal(execution.status, "blocked_executor");
  assert.deepEqual(
    execution.blocks.map((block) => block.status),
    ["blocked_executor", "pending"],
  );
  assert.ok(execution.blocks[0].startedAt);
  assert.equal(project.stages.theme, "blocked");
  assert.equal(project.currentStage, "theme");
  assert.equal(project.state, "blocked");
});

test("C02A — start manual é semanticamente equivalente à criação canônica", () => {
  for (const blocks of [
    [humanBlock("human-first", 0), automaticBlock("automatic-second", 1)],
    [automaticBlock("automatic-first", 0), humanBlock("human-second", 1)],
  ]) {
    const { commands, project } = fixture(blocks);
    const execution = commands.startProcessExecution(project.id, "theme");
    assert.ok(execution);
    const canonical = createCanonicalProcessExecution({
      executionId: execution.id,
      projectId: execution.projectId,
      channelId: execution.channelId,
      processType: execution.processType,
      methodSnapshot: execution.methodSnapshot,
      now: execution.createdAt,
    });
    assert.equal(canonical.ok, true);
    if (!canonical.ok) continue;
    assert.deepEqual(
      {
        processType: execution.processType,
        methodSnapshot: execution.methodSnapshot,
        blocks: execution.blocks,
        status: execution.status,
        outputStatus: execution.outputStatus,
        createdAt: execution.createdAt,
      },
      {
        processType: canonical.execution.processType,
        methodSnapshot: canonical.execution.methodSnapshot,
        blocks: canonical.execution.blocks,
        status: canonical.execution.status,
        outputStatus: canonical.execution.outputStatus,
        createdAt: canonical.execution.createdAt,
      },
    );
  }
});

test("C02B — segunda chamada retorna a execução existente sem duplicar", () => {
  const { commands, project, db } = fixture([humanBlock("human-first", 0)]);
  const first = commands.startProcessExecution(project.id, "theme");
  const second = commands.startProcessExecution(project.id, "theme");
  assert.ok(first);
  assert.equal(second, first);
  assert.equal(db.executions.length, 1);
});

test("C03 — conclusão Humana ativa o próximo Bloco Humano", () => {
  const { commands, project } = fixture([
    humanBlock("human-first", 0),
    humanBlock("human-second", 1),
  ]);
  const execution = commands.startProcessExecution(project.id, "theme")!;

  const result = commands.completeHumanBlock(execution.id, "human-first", { value_0: "feito" });

  assert.deepEqual(result, { ok: true, completedProcess: false });
  assert.equal(execution.blocks[0].status, "completed");
  assert.equal(execution.blocks[0].values.value_0, "feito");
  assert.ok(execution.blocks[0].completedAt);
  assert.equal(execution.blocks[1].status, "awaiting_human");
  assert.equal(execution.blocks[1].attempt, 1);
  assert.ok(execution.blocks[1].startedAt);
  assert.equal(execution.status, "awaiting_human");
  assert.equal(project.stages.theme, "awaiting_human");
  assert.equal(project.state, "awaiting_human");
  assert.equal(execution.deliveries?.[0].status, "completed");
});

test("C04 — conclusão Humana ativa o próximo Bloco automático", () => {
  const { commands, project } = fixture([
    humanBlock("human-first", 0),
    automaticBlock("automatic-second", 1),
  ]);
  const execution = commands.startProcessExecution(project.id, "theme")!;

  const result = commands.completeHumanBlock(execution.id, "human-first", { value_0: "feito" });

  assert.deepEqual(result, { ok: true, completedProcess: false });
  assert.equal(execution.blocks[0].status, "completed");
  assert.equal(execution.blocks[1].status, "blocked_executor");
  assert.equal(execution.blocks[1].attempt, 1);
  assert.equal(execution.status, "blocked_executor");
  assert.equal(project.stages.theme, "blocked");
  assert.equal(project.currentStage, "theme");
  assert.equal(project.state, "blocked");
});

test("C05 — último Bloco materializa output derivável e conclui o Processo", () => {
  const { commands, project } = fixture([humanBlock("theme-output", 0, "theme", "textarea")]);
  const execution = commands.startProcessExecution(project.id, "theme")!;

  const result = commands.completeHumanBlock(execution.id, "theme-output", {
    theme: "Tema caracterizado",
  });

  assert.deepEqual(result, { ok: true, completedProcess: true });
  assert.equal(execution.blocks[0].status, "completed");
  assert.equal(execution.status, "completed");
  assert.equal(execution.outputStatus, "completed");
  assert.deepEqual(execution.output?.values, { theme: "Tema caracterizado" });
  assert.equal(execution.output?.sourceBlockId, "theme-output");
  assert.equal(execution.deliveries?.length, 1);
  assert.equal(execution.deliveries?.[0].outputKey, "theme");
  assert.equal(project.stages.theme, "done");
  assert.equal(project.currentStage, "title");
  assert.equal(project.state, "not_started");
  assert.equal(project.progress, 13);
});

test("C06 — output não derivável aguarda humano e completeProcessOutput conclui", () => {
  const { commands, project } = fixture([humanBlock("notes-only", 0, "notes", "textarea")]);
  const execution = commands.startProcessExecution(project.id, "theme")!;

  const blockResult = commands.completeHumanBlock(execution.id, "notes-only", {
    notes: "Material intermediário",
  });

  assert.deepEqual(blockResult, { ok: true, completedProcess: false });
  assert.equal(execution.status, "awaiting_output");
  assert.equal(execution.outputStatus, "awaiting_human");
  assert.equal(execution.output, undefined);
  assert.equal(project.stages.theme, "awaiting_human");
  assert.equal(project.currentStage, "theme");
  assert.equal(project.state, "awaiting_human");

  const invalid = commands.completeProcessOutput(execution.id, { theme: "" });
  assert.equal(invalid.ok, false);
  assert.deepEqual("missing" in invalid ? invalid.missing : [], ["Tema final"]);
  assert.equal(execution.status, "awaiting_output");

  const completed = commands.completeProcessOutput(execution.id, { theme: "Tema final humano" });
  const completedExecution = { ...execution } as ProcessExecution;
  assert.deepEqual(completed, { ok: true });
  assert.equal(completedExecution.status, "completed");
  assert.equal(completedExecution.outputStatus, "completed");
  assert.deepEqual(completedExecution.output?.values, { theme: "Tema final humano" });
  assert.equal(
    completedExecution.deliveries?.some((item) => item.blockId === "__process_output__"),
    true,
  );
  assert.equal(project.stages.theme, "done");
  assert.equal(project.currentStage, "title");
  assert.equal(project.progress, 13);
});

test("C07 — draft humano preserva espera e não cria delivery", () => {
  const { commands, project } = fixture([humanBlock("human-draft", 0)]);
  const execution = commands.startProcessExecution(project.id, "theme")!;

  assert.equal(
    commands.saveHumanBlockDraft(execution.id, "human-draft", { value_0: "rascunho" }),
    true,
  );
  assert.deepEqual(execution.blocks[0].values, { value_0: "rascunho" });
  assert.equal(execution.blocks[0].status, "awaiting_human");
  assert.equal(execution.blocks[0].completedAt, undefined);
  assert.equal(execution.status, "awaiting_human");
  assert.equal(execution.outputStatus, "pending");
  assert.equal(execution.deliveries, undefined);
  assert.equal(project.stages.theme, "awaiting_human");
});

test("C08 — conclusão fora do estado ativo falha sem mutação", () => {
  const { commands, project } = fixture([
    humanBlock("human-first", 0),
    humanBlock("human-pending", 1),
  ]);
  const execution = commands.startProcessExecution(project.id, "theme")!;
  const beforeExecution = structuredClone(execution);
  const beforeProject = structuredClone(project);

  const result = commands.completeHumanBlock(execution.id, "human-pending", {
    value_1: "inválido",
  });

  assert.deepEqual(result, { ok: false, missing: ["Executor humano indisponível"] });
  assert.deepEqual(execution, beforeExecution);
  assert.deepEqual(project, beforeProject);
});

test("C08A — rejeição estrutural do Core não materializa conclusão, delivery ou progressão", () => {
  const { commands, project } = fixture([
    humanBlock("human-first", 0),
    humanBlock("human-second", 1),
  ]);
  const execution = commands.startProcessExecution(project.id, "theme")!;
  execution.blocks[1].status = "awaiting_human";
  const beforeExecution = structuredClone(execution);
  const beforeProject = structuredClone(project);

  const result = commands.completeHumanBlock(execution.id, "human-first", {
    value_0: "não deve persistir",
  });

  assert.deepEqual(result, { ok: false, missing: ["Executor humano indisponível"] });
  assert.deepEqual(execution, beforeExecution);
  assert.deepEqual(project, beforeProject);
  assert.equal(execution.deliveries, undefined);
});

test("C09 — input ausente impede conclusão humana e promoção de delivery", () => {
  const block = humanBlock("human-with-input", 0);
  block.inputs = [
    {
      id: "missing-input",
      label: "Título anterior",
      type: "text",
      source: "previous_process",
      sourceProcessType: "title",
      sourceKey: "title",
      binding: { kind: "previous_process", processType: "title", outputKey: "title" },
    },
  ];
  const { commands, project } = fixture([block]);
  const execution = commands.startProcessExecution(project.id, "theme")!;

  const result = commands.completeHumanBlock(execution.id, block.id, { value_0: "feito" });

  assert.deepEqual(result, { ok: false, missing: ["Entrada: Título anterior"] });
  assert.equal(execution.blocks[0].status, "awaiting_human");
  assert.deepEqual(execution.blocks[0].values, {});
  assert.equal(execution.status, "awaiting_human");
  assert.equal(execution.deliveries, undefined);
  assert.equal(project.stages.theme, "awaiting_human");
});

test("C10 — output obrigatório ausente preserva a execução", () => {
  const { commands, project } = fixture([humanBlock("required-output", 0)]);
  const execution = commands.startProcessExecution(project.id, "theme")!;

  const result = commands.completeHumanBlock(execution.id, "required-output", { value_0: "" });

  assert.deepEqual(result, { ok: false, missing: ["Saída required-output"] });
  assert.equal(execution.blocks[0].status, "awaiting_human");
  assert.equal(execution.blocks[0].completedAt, undefined);
  assert.deepEqual(execution.blocks[0].values, {});
  assert.equal(execution.status, "awaiting_human");
  assert.equal(execution.deliveries, undefined);
  assert.equal(project.stages.theme, "awaiting_human");
});

test("C11 — snapshot do Método permanece congelado após alteração do Canal", () => {
  const originalBlocks = [humanBlock("frozen-first", 0), humanBlock("frozen-second", 1)];
  const { commands, channel, project } = fixture(originalBlocks);
  const execution = commands.startProcessExecution(project.id, "theme")!;
  const frozen = structuredClone(execution.methodSnapshot);

  channel.methods.theme.name = "Método alterado depois do start";
  channel.methods.theme.blocks = [automaticBlock("replacement", 0)];

  assert.deepEqual(execution.methodSnapshot, frozen);
  assert.deepEqual(
    execution.blocks.map((block) => [block.blockId, block.status]),
    [
      ["frozen-first", "awaiting_human"],
      ["frozen-second", "pending"],
    ],
  );
  assert.equal(project.strategySnapshot?.methods.theme.name, "Método caracterizado");
});

test("C11A — Method inválido não cria execução nem projeta start", () => {
  const { commands, project, channel, db } = fixture([humanBlock("human-first", 0)]);
  channel.methods.theme.blocks = [];
  const beforeStages = structuredClone(project.stages);
  const beforeState = project.state;
  const execution = commands.startProcessExecution(project.id, "theme");
  assert.equal(execution, undefined);
  assert.equal(db.executions.length, 0);
  assert.deepEqual(project.stages, beforeStages);
  assert.equal(project.state, beforeState);
});

test("C12 — somente o próximo Bloco é ativado em sequência de três", () => {
  const { commands, project } = fixture([
    humanBlock("sequence-first", 0),
    humanBlock("sequence-second", 1),
    automaticBlock("sequence-third", 2),
  ]);
  const execution = commands.startProcessExecution(project.id, "theme")!;

  assert.deepEqual(
    execution.blocks.map((block) => block.status),
    ["awaiting_human", "pending", "pending"],
  );
  commands.completeHumanBlock(execution.id, "sequence-first", { value_0: "feito" });
  assert.deepEqual(
    execution.blocks.map((block) => block.status),
    ["completed", "awaiting_human", "pending"],
  );
  assert.equal(execution.blocks[2].startedAt, undefined);
});

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  server.close();
  await once(server, "close");
  return address.port;
}

test(
  "C13 — plugin simples persiste values, delivery, output e projeção do Project",
  { timeout: 60_000 },
  async () => {
    const port = await availablePort();
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-state-machine-"));
    const repositoryRoot = process.cwd();
    const base = `http://127.0.0.1:${port}`;
    const logs: string[] = [];
    const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CONTENTFLOW_API_PORT: String(port),
        CONTENTFLOW_APP_ROOT: repositoryRoot,
        CONTENTFLOW_DATA_DIR: dataDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    server.stdout.on("data", (chunk) => logs.push(String(chunk)));
    server.stderr.on("data", (chunk) => logs.push(String(chunk)));

    const request = async <T>(route: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${base}${route}`, init);
      const body = await response.text();
      assert.ok(response.ok, `${response.status} ${route}: ${body}\n${logs.join("")}`);
      return (body ? JSON.parse(body) : undefined) as T;
    };

    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (server.exitCode !== null) throw new Error(`API encerrada: ${logs.join("")}`);
        try {
          await request("/api/plugins");
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      await request("/api/plugins/link-development-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: path.join(
            repositoryRoot,
            "ecosystem",
            "plugins",
            "examples",
            "kit-generated-text-transform",
          ),
        }),
      });
      await request("/api/plugins/com.contentflow.kit-text-demo/consent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });

      const now = new Date().toISOString();
      const stages = initialStages();
      stages.theme = "processing";
      await request("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "plugin-channel",
          name: "Canal plugin",
          language: "pt-BR",
          niche: "Teste",
          createdAt: now,
        }),
      });
      await request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "plugin-project",
          title: "Projeto plugin",
          channelId: "plugin-channel",
          currentStage: "theme",
          state: "processing",
          progress: 0,
          deadline: "Sem prazo",
          duration: "—",
          updatedAt: "Agora",
          createdAt: now,
          stages,
          assignee: { name: "Teste", initials: "T" },
          thumbHue: 0,
        }),
      });

      const pluginBlock: ActionBlock = {
        id: "plugin-block",
        type: "CRIAR",
        operator: "Código",
        name: "Plugin determinístico",
        inputs: [
          {
            id: "plugin-input",
            label: "Texto",
            type: "textarea",
            source: "static",
            staticValue: "plugin success",
            portKey: "content",
          },
        ],
        outputs: [
          {
            id: "plugin-output",
            label: "Tema final",
            key: "theme",
            type: "textarea",
            required: true,
            portKey: "result",
          },
        ],
        plugin: {
          pluginId: "com.contentflow.kit-text-demo",
          capabilityId: "demo",
          configuration: {},
        },
        parameters: [],
        order: 0,
      };
      const execution: ProcessExecution = {
        id: "plugin-execution",
        projectId: "plugin-project",
        channelId: "plugin-channel",
        processType: "theme",
        methodSnapshot: {
          name: "Método plugin",
          processType: "theme",
          blocks: [pluginBlock],
        },
        blocks: [
          {
            blockId: pluginBlock.id,
            status: "blocked_executor",
            values: {},
            attempt: 1,
            startedAt: now,
          },
        ],
        status: "blocked_executor",
        outputStatus: "pending",
        createdAt: now,
        updatedAt: now,
      };

      await request("/api/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(execution),
      });
      const initial = await request<{ execution: ProcessExecution }>(
        "/api/executions/plugin-execution/state",
      );
      assert.ok(
        ["blocked_executor", "running", "completed"].includes(initial.execution.status),
        `estado inicial inesperado: ${initial.execution.status}`,
      );
      assert.ok(
        ["blocked_executor", "in_progress", "completed"].includes(
          initial.execution.blocks[0].status,
        ),
        `estado inicial do bloco inesperado: ${initial.execution.blocks[0].status}`,
      );

      let final: { execution: ProcessExecution; project: Project } | undefined;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const current = await request<{ execution: ProcessExecution; project: Project }>(
          "/api/executions/plugin-execution/state",
        );
        final = current;
        if (["completed", "failed"].includes(current.execution.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!final) assert.fail("a execução de plugin deve produzir estado final");
      assert.equal(final.execution.status, "completed", final.execution.error ?? logs.join(""));
      assert.equal(final.execution.blocks[0].status, "completed");
      assert.deepEqual(final.execution.blocks[0].values, { theme: "PLUGIN SUCCESS" });
      assert.deepEqual(final.execution.output?.values, { theme: "PLUGIN SUCCESS" });
      assert.equal(final.execution.outputStatus, "completed");
      assert.equal(final.execution.deliveries?.length, 1);
      assert.equal(final.execution.deliveries?.[0].blockId, "plugin-block");
      assert.equal(final.execution.deliveries?.[0].items[0].value, "PLUGIN SUCCESS");
      assert.equal(final.project.stages.theme, "done");
      assert.equal(final.project.currentStage, "title");
      assert.equal(final.project.state, "not_started");
      assert.equal(final.project.progress, 13);
    } finally {
      server.kill();
      if (server.exitCode === null) {
        await Promise.race([
          once(server, "exit"),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }
      await rm(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  },
);
