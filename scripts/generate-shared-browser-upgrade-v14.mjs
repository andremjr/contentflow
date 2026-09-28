import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = path.join(repositoryRoot, "tests", "fixtures", "shared-browser-upgrade-v14");
const outputRoot = path.resolve(process.argv[2] ?? defaultOutput);
const timestamp = "2026-09-26T12:00:00.000Z";

const schema = `
  CREATE TABLE channels (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE projects (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE process_executions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    process_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id, process_type)
  );
  CREATE TABLE plugin_consents (
    plugin_id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    permissions TEXT NOT NULL,
    network_hosts TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE plugin_workspaces (plugin_id TEXT PRIMARY KEY, directory TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE plugin_connections (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    name TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE TABLE plugin_profiles (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    name TEXT NOT NULL,
    alias TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX plugin_profiles_alias ON plugin_profiles(plugin_id, alias COLLATE NOCASE);
  CREATE TABLE plugin_jobs (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    block_id TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    status TEXT NOT NULL,
    next_poll_at TEXT NOT NULL,
    lease_token TEXT,
    lease_until TEXT,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(execution_id, block_id, attempt)
  );
`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function methodBlock(pluginId, primary = "default", fallbacks = []) {
  return {
    id: `block-${pluginId.replace(/[^a-z0-9]+/gi, "-")}`,
    type: "CRIAR",
    operator: "IA",
    name: "Bloco legado",
    instructions: "Fixture de atualização.",
    inputs: [],
    outputs: [],
    parameters: [],
    order: 0,
    plugin: {
      pluginId,
      capabilityId: "generate",
      configuration: {
        accountProfile: primary,
        fallbackAccountProfiles: fallbacks.join("\n"),
      },
    },
  };
}

function channel(id, blocks = []) {
  return {
    id,
    name: `Canal ${id}`,
    createdAt: timestamp,
    methods: {
      title: {
        name: "Método legado",
        processType: "title",
        blocks,
      },
    },
  };
}

function project(id, channelId, status) {
  return {
    id,
    channelId,
    title: `Projeto ${id}`,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function execution(id, projectId, state, items = []) {
  return {
    id,
    projectId,
    processType: "title",
    state,
    startedAt: timestamp,
    updatedAt: timestamp,
    blocks: [
      {
        blockId: "block-com-contentflow-fixture-browser",
        state,
        attempt: 1,
        items,
      },
    ],
  };
}

function job(id, executionId, status, overrides = {}) {
  return {
    id,
    pluginId: "com.contentflow.fixture.browser",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    executionId,
    blockId: "block-com-contentflow-fixture-browser",
    attempt: 1,
    traceId: `trace-${id}`,
    jobId: `provider-${id}`,
    request: {
      executionId,
      traceId: `trace-${id}`,
      blockId: "block-com-contentflow-fixture-browser",
      attempt: 1,
      capabilityId: "generate",
      inputs: { content: "fixture" },
      configuration: { accountProfile: "principal", fallbackAccountProfiles: "reserva" },
      settings: {},
      invocation: { mode: "execute" },
    },
    status,
    nextPollAt: timestamp,
    deadlineAt: "2026-09-26T13:00:00.000Z",
    partialValues: {},
    partialArtifacts: [],
    cancelRequested: false,
    retryCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function profile(id, pluginId, alias, name = alias) {
  return { id, pluginId, alias, name };
}

const scenarios = [
  {
    id: "01-no-profiles",
    description: "Instalação legada sem perfis de navegador.",
    channels: [channel("empty")],
  },
  {
    id: "02-single-profile-ready",
    description: "Um plugin com um perfil pronto e marker legado.",
    profiles: [profile("profile-one", "com.contentflow.fixture.browser", "principal", "Principal")],
    channels: [channel("single", [methodBlock("com.contentflow.fixture.browser", "principal")])],
    markers: [
      {
        relativePath:
          "plugin-workspaces/profiles/com.contentflow.fixture.browser/principal/.contentflow-profile-ready.json",
        value: { provider: "chatgpt.com", profile: "principal", bridgeProtocol: 2 },
      },
    ],
    resolvedFolders: {
      "com.contentflow.fixture.browser:principal":
        "plugin-workspaces/profiles/com.contentflow.fixture.browser/principal",
    },
  },
  {
    id: "03-multiple-profiles-fallbacks",
    description: "Vários perfis com principal e fallbacks ordenados.",
    profiles: [
      profile("profile-main", "com.contentflow.fixture.browser", "principal", "Principal"),
      profile("profile-fallback-a", "com.contentflow.fixture.browser", "reserva-a", "Reserva A"),
      profile("profile-fallback-b", "com.contentflow.fixture.browser", "reserva-b", "Reserva B"),
    ],
    channels: [
      channel("fallbacks", [
        methodBlock("com.contentflow.fixture.browser", "principal", ["reserva-a", "reserva-b"]),
      ]),
    ],
    resolvedFolders: {
      "com.contentflow.fixture.browser:principal":
        "plugin-workspaces/profiles/com.contentflow.fixture.browser/principal",
      "com.contentflow.fixture.browser:reserva-a":
        "plugin-workspaces/profiles/com.contentflow.fixture.browser/reserva-a",
      "com.contentflow.fixture.browser:reserva-b":
        "plugin-workspaces/profiles/com.contentflow.fixture.browser/reserva-b",
    },
  },
  {
    id: "04-homonymous-aliases",
    description: "Aliases iguais em plugins distintos sem fusão implícita.",
    profiles: [
      profile("profile-alpha", "com.contentflow.fixture.alpha", "principal", "Principal Alpha"),
      profile("profile-beta", "com.contentflow.fixture.beta", "principal", "Principal Beta"),
    ],
    channels: [
      channel("homonyms", [
        methodBlock("com.contentflow.fixture.alpha", "principal"),
        methodBlock("com.contentflow.fixture.beta", "principal"),
      ]),
    ],
    resolvedFolders: {
      "com.contentflow.fixture.alpha:principal":
        "plugin-workspaces/profiles/com.contentflow.fixture.alpha/principal",
      "com.contentflow.fixture.beta:principal":
        "plugin-workspaces/profiles/com.contentflow.fixture.beta/principal",
    },
  },
  {
    id: "05-method-primary-and-fallback",
    description: "Método legado persistindo aliases principal e fallback.",
    profiles: [
      profile("profile-method-main", "com.contentflow.fixture.browser", "principal", "Principal"),
      profile("profile-method-fallback", "com.contentflow.fixture.browser", "reserva", "Reserva"),
    ],
    channels: [
      channel("method", [methodBlock("com.contentflow.fixture.browser", "principal", ["reserva"])]),
    ],
    resolvedFolders: {
      "com.contentflow.fixture.browser:principal":
        "plugin-workspaces/profiles/com.contentflow.fixture.browser/principal",
      "com.contentflow.fixture.browser:reserva":
        "plugin-workspaces/profiles/com.contentflow.fixture.browser/reserva",
    },
  },
  {
    id: "06-completed-project",
    description: "Projeto concluído com execução e item concluído preserváveis.",
    channels: [channel("completed", [methodBlock("com.contentflow.fixture.browser", "principal")])],
    profiles: [
      profile("profile-completed", "com.contentflow.fixture.browser", "principal", "Principal"),
    ],
    projects: [project("project-completed", "completed", "completed")],
    executions: [
      execution("execution-completed", "project-completed", "completed", [
        { id: "item-completed", index: 0, state: "completed", attempt: 1, value: "Título final" },
      ]),
    ],
  },
  {
    id: "07-paused-project",
    description: "Projeto pausado com execução em andamento.",
    channels: [channel("paused", [methodBlock("com.contentflow.fixture.browser", "principal")])],
    profiles: [
      profile("profile-paused", "com.contentflow.fixture.browser", "principal", "Principal"),
    ],
    projects: [project("project-paused", "paused", "paused")],
    executions: [execution("execution-paused", "project-paused", "paused")],
  },
  {
    id: "08-interrupted-plugin-job",
    description: "Job de plugin interrompido preservando cursor de fallback.",
    channels: [
      channel("job", [methodBlock("com.contentflow.fixture.browser", "principal", ["reserva"])]),
    ],
    profiles: [
      profile("profile-job-main", "com.contentflow.fixture.browser", "principal", "Principal"),
      profile("profile-job-fallback", "com.contentflow.fixture.browser", "reserva", "Reserva"),
    ],
    projects: [project("project-job", "job", "paused")],
    executions: [execution("execution-job", "project-job", "pending")],
    jobs: [
      job("job-interrupted", "execution-job", "pending", {
        profileFallback: {
          configurationKey: "accountProfile",
          candidates: ["principal", "reserva"],
          activeIndex: 1,
          history: [{ profile: "principal", code: "TIMEOUT", message: "Timeout de fixture" }],
        },
      }),
    ],
  },
  {
    id: "09-partial-item-queue",
    description: "Fila com itens concluído, ativo e pendente mais partial incremental.",
    channels: [channel("partial", [methodBlock("com.contentflow.fixture.browser", "principal")])],
    profiles: [
      profile("profile-partial", "com.contentflow.fixture.browser", "principal", "Principal"),
    ],
    projects: [project("project-partial", "partial", "paused")],
    executions: [
      execution("execution-partial", "project-partial", "pending", [
        { id: "item-1", index: 0, state: "completed", attempt: 1, value: "A" },
        { id: "item-2", index: 1, state: "active", attempt: 1 },
        { id: "item-3", index: 2, state: "pending", attempt: 0 },
      ]),
    ],
    jobs: [
      job("job-partial", "execution-partial", "pending", {
        partialValues: { result: ["A"] },
        incrementalItems: [
          { id: "item-1", index: 0, state: "completed", attempt: 1, value: "A" },
          { id: "item-2", index: 1, state: "active", attempt: 1 },
          { id: "item-3", index: 2, state: "pending", attempt: 0 },
        ],
        itemOrchestration: {
          inputPort: "items",
          outputPort: "result",
          items: ["A", "B", "C"],
          itemIds: ["item-1", "item-2", "item-3"],
          currentIndex: 1,
          accumulatedItems: ["A"],
        },
      }),
    ],
  },
  {
    id: "10-missing-plugin",
    description: "Método referencia plugin ausente/desinstalado sem apagar a configuração.",
    channels: [
      channel("missing-plugin", [methodBlock("com.contentflow.fixture.missing", "principal")]),
    ],
    profiles: [
      profile("profile-missing", "com.contentflow.fixture.missing", "principal", "Principal"),
    ],
  },
  {
    id: "11-custom-workspace",
    description: "Plugin com workspace customizado contendo sessão física legada.",
    profiles: [
      profile("profile-custom", "com.contentflow.fixture.browser", "principal", "Principal"),
    ],
    channels: [channel("custom", [methodBlock("com.contentflow.fixture.browser", "principal")])],
    customWorkspace: {
      pluginId: "com.contentflow.fixture.browser",
      relativePath: "custom-workspace",
    },
    markers: [
      {
        relativePath: "custom-workspace/principal/.contentflow-profile-ready.json",
        value: { provider: "chatgpt.com", profile: "principal", bridgeProtocol: 1 },
      },
    ],
    resolvedFolders: {
      "com.contentflow.fixture.browser:principal": "custom-workspace/principal",
    },
  },
];

function insertPayload(database, table, value, extra = []) {
  const payload = JSON.stringify(value);
  if (table === "channels") {
    database
      .prepare("INSERT INTO channels (id, payload, created_at) VALUES (?, ?, ?)")
      .run(value.id, payload, timestamp);
  } else if (table === "projects") {
    database
      .prepare("INSERT INTO projects (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)")
      .run(value.id, value.channelId, payload, timestamp);
  } else if (table === "process_executions") {
    database
      .prepare(
        "INSERT INTO process_executions (id, project_id, process_type, payload, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(value.id, value.projectId, value.processType, payload, timestamp);
  } else if (table === "plugin_jobs") {
    database
      .prepare(
        "INSERT INTO plugin_jobs (id, execution_id, block_id, attempt, status, next_poll_at, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        value.id,
        value.executionId,
        value.blockId,
        value.attempt,
        value.status,
        value.nextPollAt,
        payload,
        value.createdAt,
        value.updatedAt,
      );
  } else {
    throw new Error(`Unsupported payload table ${table} ${extra.join(",")}`);
  }
  return payload;
}

function generateScenario(scenario) {
  const root = path.join(outputRoot, scenario.id);
  const dataRoot = path.join(root, "data");
  mkdirSync(dataRoot, { recursive: true });
  const database = new Database(path.join(dataRoot, "contentflow.sqlite"));
  database.pragma("journal_mode = DELETE");
  database.pragma("page_size = 4096");
  database.exec(schema);

  const payloadHashes = {};
  for (const value of scenario.channels ?? []) {
    const payload = insertPayload(database, "channels", value);
    payloadHashes[`channels:${value.id}`] = sha256(payload);
  }
  for (const value of scenario.projects ?? []) {
    const payload = insertPayload(database, "projects", value);
    payloadHashes[`projects:${value.id}`] = sha256(payload);
  }
  for (const value of scenario.executions ?? []) {
    const payload = insertPayload(database, "process_executions", value);
    payloadHashes[`process_executions:${value.id}`] = sha256(payload);
  }
  for (const value of scenario.jobs ?? []) {
    const payload = insertPayload(database, "plugin_jobs", value);
    payloadHashes[`plugin_jobs:${value.id}`] = sha256(payload);
  }
  for (const value of scenario.profiles ?? []) {
    database
      .prepare(
        "INSERT INTO plugin_profiles (id, plugin_id, name, alias, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(value.id, value.pluginId, value.name, value.alias, timestamp, timestamp);
  }
  if (scenario.customWorkspace) {
    const absoluteWorkspace = path.join(root, scenario.customWorkspace.relativePath);
    mkdirSync(absoluteWorkspace, { recursive: true });
    const persistedWorkspace = path.win32.join(
      "C:\\ContentFlowFixture",
      scenario.customWorkspace.relativePath,
    );
    database
      .prepare("INSERT INTO plugin_workspaces (plugin_id, directory, updated_at) VALUES (?, ?, ?)")
      .run(scenario.customWorkspace.pluginId, persistedWorkspace, timestamp);
  }
  database.close();

  for (const marker of scenario.markers ?? []) {
    const markerPath = path.join(root, marker.relativePath);
    mkdirSync(path.dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, `${JSON.stringify(marker.value, null, 2)}\n`, "utf8");
  }

  const verify = new Database(path.join(dataRoot, "contentflow.sqlite"), {
    readonly: true,
    fileMustExist: true,
  });
  const tables = [
    "channels",
    "projects",
    "process_executions",
    "plugin_profiles",
    "plugin_workspaces",
    "plugin_jobs",
  ];
  const counts = Object.fromEntries(
    tables.map((table) => [
      table,
      verify.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
    ]),
  );
  verify.close();

  const expectations = {
    version: 1,
    scenario: scenario.id,
    description: scenario.description,
    counts,
    payloadSha256: payloadHashes,
    resolvedFolders: scenario.resolvedFolders ?? {},
    markers: (scenario.markers ?? []).map((marker) => marker.relativePath),
  };
  writeFileSync(
    path.join(root, "expectations.json"),
    `${JSON.stringify(expectations, null, 2)}\n`,
    "utf8",
  );
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
for (const scenario of scenarios) generateScenario(scenario);
writeFileSync(
  path.join(outputRoot, "manifest.json"),
  `${JSON.stringify({ version: 1, generatedAt: timestamp, scenarios: scenarios.map(({ id, description }) => ({ id, description })) }, null, 2)}\n`,
  "utf8",
);
writeFileSync(
  path.join(outputRoot, "README.md"),
  `# Fixtures de atualização — pacote 1.4

Estas fixtures representam estados legados anteriores à migração de perfis globais. Elas existem para ensaiar as fases 2 e 3 sem depender de dados reais de usuário.

Cada cenário contém \`data/contentflow.sqlite\` e \`expectations.json\`. Quando o cenário possui sessão física, a árvore correspondente fica ao lado de \`data/\`. As expectativas registram contagens por tabela, SHA-256 dos payloads persistidos e caminhos relativos esperados para perfis. Caminhos relativos evitam incorporar diretórios pessoais ou específicos da máquina.

Regere o conjunto com:

\`\`\`bash
node scripts/generate-shared-browser-upgrade-v14.mjs
\`\`\`

O teste \`server/shared-browser-upgrade-fixtures-v14.test.mjs\` regenera o conjunto em uma pasta temporária, valida integridade SQLite, contagens, hashes, markers, aliases homônimos e a fila parcial.

Os 11 cenários correspondem diretamente aos estados do §7.4 do roadmap: sem perfis; perfil único; múltiplos perfis/fallbacks; aliases homônimos; Método principal/fallback; Projeto concluído; Projeto pausado; job interrompido; fila parcial; plugin ausente; workspace customizado.
`,
  "utf8",
);
