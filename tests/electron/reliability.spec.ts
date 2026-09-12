import { expect, test, _electron as electron, type ElectronApplication } from "@playwright/test";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type Channel,
  type Project,
} from "../../src/lib/domain";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
let dataDirectory: string;
let electronApp: ElectronApplication;

test.beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-electron-e2e-"));
  const pluginsDirectory = path.join(dataDirectory, "data", "plugins", "local");
  await mkdir(pluginsDirectory, { recursive: true });
  await cp(
    path.join(repositoryRoot, "ecosystem", "plugins", "examples", "kit-generated-text-transform"),
    path.join(pluginsDirectory, "kit-generated-text-transform"),
    { recursive: true },
  );
  electronApp = await electron.launch({
    args: ["."],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CONTENTFLOW_ELECTRON_USER_DATA_DIR: dataDirectory,
    },
  });
});

test.afterEach(async () => {
  await electronApp?.close().catch(() => undefined);
  await rm(dataDirectory, { recursive: true, force: true });
});

test("inicia a aplicação desktop isolada e mantém API e navegação responsivas", async () => {
  const startedAt = Date.now();
  const window = await electronApp.firstWindow();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  window.on("pageerror", (error) => pageErrors.push(error.message));
  window.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await expect(window.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await expect(window.getByText("Nenhum canal ainda")).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(15_000);
  expect(new URL(window.url()).hostname).toBe("127.0.0.1");
  expect(new URL(window.url()).pathname).toBe("/dashboard");

  const desktopContract = await window.evaluate(() => {
    const desktop = (
      window as typeof window & {
        contentflowDesktop?: {
          updater?: { getState?: () => Promise<unknown> };
          humanTasks?: { update?: (input: unknown) => void };
        };
      }
    ).contentflowDesktop;
    return {
      updaterAvailable: typeof desktop?.updater?.getState === "function",
      humanTasksAvailable: typeof desktop?.humanTasks?.update === "function",
    };
  });
  expect(desktopContract.updaterAvailable).toBe(true);
  expect(desktopContract.humanTasksAvailable).toBe(true);

  const health = await window.evaluate(async () => {
    const response = await fetch("/api/health");
    return { ok: response.ok, body: await response.json() };
  });
  expect(health.ok).toBe(true);

  await window.getByRole("link", { name: "Métodos" }).click();
  await expect(window.getByRole("heading", { name: "Métodos", exact: true })).toBeVisible();
  await window.getByRole("link", { name: "Plugins" }).click();
  await expect(window.getByRole("heading", { name: "Plugins", exact: true })).toBeVisible();
  await window.getByRole("link", { name: "ContentFlow — Visão geral" }).click();
  await expect(window.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await window.reload();
  await expect(window.getByText("Nenhum canal ainda")).toBeVisible();

  await expect
    .poll(async () => (await readdir(path.join(dataDirectory, "data"))).length)
    .toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("mostra a quantidade de validações pendentes no ícone da barra de tarefas", async () => {
  const window = await electronApp.firstWindow();
  await expect(window.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await electronApp.evaluate(({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows()[0];
    const testState = globalThis as typeof globalThis & {
      __contentflowBadgeCalls?: Array<{ description: string; hasIcon: boolean }>;
    };
    testState.__contentflowBadgeCalls = [];
    const original = target.setOverlayIcon.bind(target);
    target.setOverlayIcon = (overlay, description) => {
      testState.__contentflowBadgeCalls?.push({
        description,
        hasIcon: Boolean(overlay && !overlay.isEmpty()),
      });
      original(overlay, description);
    };
  });

  const channelId = randomUUID();
  const projectId = randomUUID();
  const methods = createEmptyMethods();
  methods.theme.blocks = [
    {
      id: "desktop-human-theme",
      type: "CRIAR",
      operator: "Humano",
      name: "Validar tema no desktop",
      instructions: "Revise o tema antes de continuar.",
      inputs: [],
      outputs: [
        {
          id: "desktop-human-theme-output",
          key: "theme",
          label: "Tema",
          type: "textarea",
          required: true,
        },
      ],
      parameters: [],
      order: 0,
    },
  ];
  const channel: Channel = {
    id: channelId,
    name: "Canal com validação",
    handle: "",
    color: "#6366f1",
    subscribers: "—",
    niche: "Teste",
    language: "PT-BR",
    activeProjects: 1,
    frequency: "",
    nextPublish: "",
    currentProjectProgress: 0,
    status: "attention",
    trend: [],
    methods,
    createdAt: new Date().toISOString(),
  };
  const project: Project = {
    id: projectId,
    channelId,
    title: "Projeto aguardando validação",
    currentStage: "theme",
    state: "not_started",
    progress: 0,
    deadline: "Sem prazo",
    duration: "—",
    updatedAt: "Agora",
    stages: Object.fromEntries(
      PROCESS_ORDER.map((processType) => [processType, "not_started"]),
    ) as Project["stages"],
    assignee: { name: "Não atribuído", initials: "—" },
    thumbHue: 120,
    createdAt: new Date().toISOString(),
  };
  const started = await window.evaluate(
    async ({ channel, project }) => {
      const channelResponse = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      });
      const projectResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      const commandResponse = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          action: "start",
          projectId: project.id,
          processType: "theme",
        }),
      });
      return channelResponse.ok && projectResponse.ok && commandResponse.ok;
    },
    { channel, project },
  );
  expect(started).toBe(true);

  await expect
    .poll(() =>
      electronApp.evaluate(() => {
        const testState = globalThis as typeof globalThis & {
          __contentflowBadgeCalls?: Array<{ description: string; hasIcon: boolean }>;
        };
        return testState.__contentflowBadgeCalls?.at(-1);
      }),
    )
    .toEqual({ description: "1 tarefas humanas pendentes", hasIcon: true });
});
