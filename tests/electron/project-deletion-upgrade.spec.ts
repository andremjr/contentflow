import { test, expect, _electron as electron } from "@playwright/test";
import Database from "better-sqlite3";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEmptyMethods, PROCESS_ORDER } from "../../src/lib/domain";
import { upgradeText } from "../../src/lib/upgrade-translations";

test("packaged app deletes a project blocking migration and applies remaining migration without reload", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "contentflow-packaged-upgrade-"));
  const data = path.join(directory, "data");
  await mkdir(path.join(data, "uploads"), { recursive: true });
  await writeFile(path.join(data, "uploads", "preserved.txt"), "preserved artifact");
  const database = new Database(path.join(data, "contentflow.sqlite"));
  database.exec(`CREATE TABLE channels(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE projects(id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE process_executions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,process_type TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  const legacyMethod = (processType: string, type = "file") => ({
    name: processType,
    processType,
    blocks: [
      {
        id: "b",
        type: "CRIAR",
        operator: "Humano",
        order: 0,
        parameters: [],
        inputs: [],
        outputs: [{ id: "o", key: "unknown", label: "Unknown", type, required: true }],
      },
    ],
  });
  const channel = {
    id: "c",
    name: "Migration channel",
    handle: "",
    color: "#7755dd",
    subscribers: "0",
    niche: "",
    language: "pt-BR",
    activeProjects: 2,
    frequency: "",
    nextPublish: "",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    createdAt: "2026-01-01",
    methods: { ...createEmptyMethods(), theme: legacyMethod("theme", "text") },
  };
  database
    .prepare("INSERT INTO channels VALUES(?,?,?)")
    .run("c", JSON.stringify(channel), "2026-01-01");
  for (const id of ["bad", "good"]) {
    const project = {
      id,
      channelId: "c",
      title: `User project ${id}`,
      currentStage: "theme",
      state: "not_started",
      progress: 0,
      deadline: "",
      duration: "00:00",
      updatedAt: "",
      createdAt: "2026-01-01",
      assignee: { name: "User", initials: "U" },
      thumbHue: 200,
      stages: Object.fromEntries(PROCESS_ORDER.map((process) => [process, "not_started"])),
      ...(id === "bad"
        ? {
            strategySnapshot: {
              processOrder: [...PROCESS_ORDER],
              methods: { theme: legacyMethod("theme"), thumbnail: legacyMethod("thumbnail") },
            },
          }
        : {}),
    };
    database
      .prepare("INSERT INTO projects VALUES(?,?,?,?)")
      .run(id, "c", JSON.stringify(project), "2026-01-01");
  }
  database.prepare("INSERT INTO process_executions VALUES(?,?,?,?,?)").run(
    "e",
    "bad",
    "theme",
    JSON.stringify({
      id: "e",
      projectId: "bad",
      channelId: "c",
      processType: "theme",
      status: "awaiting_human",
      methodSnapshot: legacyMethod("theme"),
      blocks: [],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    }),
    "2026-01-01",
  );
  database.close();
  const app = await electron.launch({
    executablePath: path.resolve("release/v1/win-unpacked/ContentFlow.exe"),
    env: { ...process.env, CONTENTFLOW_ELECTRON_USER_DATA_DIR: directory },
  });
  try {
    const window = await app.firstWindow();
    const errors: string[] = [];
    window.on("pageerror", (error) => errors.push(error.message));
    const text = upgradeText("pt-BR");
    const panel = window.getByTestId("user-data-upgrade");
    await expect(panel.getByText(text.blocked)).toBeVisible();
    const before = await window.evaluate(async () => (await fetch("/api/upgrade/plan")).json());
    expect(before.diagnostics).toHaveLength(6);
    await window
      .getByRole("link")
      .filter({ has: window.getByText(channel.name, { exact: true }) })
      .click();
    await expect(
      window.getByRole("heading", { name: "User project bad", exact: true }),
    ).toBeVisible();
    // The existing static desktop shell can report recoverable React #419 on
    // startup. Record that separately; deletion and migration must add no errors.
    const startupErrors = errors.splice(0);
    expect(startupErrors.every((message) => message.includes("Minified React error #419"))).toBe(
      true,
    );
    console.log(`Recoverable startup hydration warnings: ${startupErrors.length}`);
    const card = window
      .locator("div.group")
      .filter({ has: window.getByRole("heading", { name: "User project bad", exact: true }) });
    await card.hover();
    await card.getByRole("button").click();
    await window.getByRole("menuitem", { name: "Excluir projeto" }).click();
    const dialog = window.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Excluir projeto?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Excluir projeto", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      window.getByRole("heading", { name: "User project bad", exact: true }),
    ).toHaveCount(0);
    await expect(
      window.getByRole("heading", { name: "User project good", exact: true }),
    ).toBeVisible();
    await expect(panel.getByText(text.blocked)).toHaveCount(0);
    await panel.getByRole("checkbox", { name: text.confirm }).check();
    await panel.getByRole("button", { name: text.apply }).click();
    await expect(panel).toContainText(text.success);
    const state = await window.evaluate(async () => (await fetch("/api/state?since=-1")).json());
    expect(state.upgrade.required).toBe(false);
    expect(state.executions).toHaveLength(0);
    expect(state.projects.map((project: { id: string }) => project.id)).toEqual(["good"]);
    expect(state.channels[0].name).toBe(channel.name);
    expect(await readFile(path.join(data, "uploads", "preserved.txt"), "utf8")).toBe(
      "preserved artifact",
    );
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    expect(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)).toBe(true);
    await rm(directory, { recursive: true, force: true });
  }
});
