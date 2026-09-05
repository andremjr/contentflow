import { expect, test, _electron as electron, type ElectronApplication } from "@playwright/test";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEmptyMethods, type Channel } from "../../src/lib/domain";

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
        contentflowDesktop?: { updater?: { getState?: () => Promise<unknown> } };
      }
    ).contentflowDesktop;
    return {
      updaterAvailable: typeof desktop?.updater?.getState === "function",
    };
  });
  expect(desktopContract.updaterAvailable).toBe(true);

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

test("testa um bloco no editor do Electron sem persistir o resultado", async () => {
  const window = await electronApp.firstWindow();
  await expect(window.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  const id = randomUUID();
  const channel: Channel = {
    id,
    name: "Canal de teste do Método",
    handle: "",
    color: "#6366f1",
    subscribers: "—",
    description: "Teste isolado no Electron",
    niche: "Teste",
    language: "PT-BR",
    frequency: "1x / semana",
    activeProjects: 0,
    nextPublish: "",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    methods: createEmptyMethods(),
    createdAt: new Date().toISOString(),
  };
  const pluginId = "com.contentflow.kit-text-demo";
  const block = {
    id: "electron-method-test-block",
    type: "CRIAR",
    operator: "Código",
    name: "Testar configuração real",
    instructions: "",
    inputs: [
      {
        id: "electron-method-test-input",
        label: "Tema anterior",
        type: "textarea",
        source: "previous_process",
        sourceProcessType: "theme",
        sourceKey: "theme",
      },
    ],
    outputs: [
      {
        id: "electron-method-test-output",
        key: "result",
        label: "Resultado",
        type: "textarea",
        required: true,
      },
    ],
    parameters: [],
    order: 0,
    plugin: { pluginId, capabilityId: "demo", configuration: {} },
  };
  const seeded = await window.evaluate(
    async ({ channel, block, pluginId }) => {
      const channelResponse = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      });
      const consentResponse = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/consent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const methodResponse = await fetch(`/api/channels/${channel.id}/methods/title`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: [block] }),
      });
      const state = await (await fetch("/api/state")).json();
      return {
        ok: channelResponse.ok && consentResponse.ok && methodResponse.ok,
        projectCount: state.projects.length,
        executionCount: state.executions.length,
      };
    },
    { channel, block, pluginId },
  );
  expect(seeded.ok).toBe(true);

  await window.goto(new URL(`/channel/${channel.id}/methods?process=title`, window.url()).href);
  await window.getByText("Testar configuração real", { exact: true }).first().click();
  await window.getByLabel(/Tema anterior para teste/).fill("entrada informada no Electron");
  await window.getByRole("button", { name: "Executar teste", exact: true }).click();
  await expect(window.getByText("ENTRADA INFORMADA NO ELECTRON", { exact: true })).toBeVisible();
  const after = await window.evaluate(async () => {
    const state = await (await fetch("/api/state")).json();
    return { projectCount: state.projects.length, executionCount: state.executions.length };
  });
  expect(after).toEqual({
    projectCount: seeded.projectCount,
    executionCount: seeded.executionCount,
  });
  await window.getByRole("button", { name: "Close" }).click();
  await expect
    .poll(async () => {
      const root = path.join(dataDirectory, "data", "method-tests");
      return (await readdir(root)).length;
    })
    .toBe(0);
});
