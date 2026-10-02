import { test, expect, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { createEmptyMethods, type Channel } from "../lib/domain";
import { upgradeText } from "../lib/upgrade-translations";
import type { AppLanguage } from "../lib/app-preferences";

function fixtureChannels(): Channel[] {
  const file = process.env.CONTENTFLOW_UPGRADE_UI_FIXTURE;
  if (file) {
    // Deserialize a read-only memory copy; never open the original SQLite/WAL for writing.
    const database = new Database(readFileSync(file), { readonly: true });
    try {
      return (
        database.prepare("SELECT payload FROM channels ORDER BY created_at").all() as Array<{
          payload: string;
        }>
      ).map((row) => JSON.parse(row.payload));
    } finally {
      database.close();
    }
  }
  return [
    {
      id: "legacy-channel",
      name: "Canal preservado",
      handle: "@preservado",
      color: "#7755dd",
      subscribers: "0",
      niche: "",
      language: "pt-BR",
      activeProjects: 0,
      frequency: "",
      nextPublish: "",
      currentProjectProgress: 0,
      status: "healthy",
      trend: [],
      createdAt: "2026-01-01",
      methods: {
        ...createEmptyMethods(),
        theme: {
          contractVersion: 2,
          name: "Método preservado",
          processType: "theme",
          blocks: [
            {
              id: "legacy-block",
              type: "CRIAR",
              operator: "Humano",
              parameters: [],
              order: 0,
              outputs: [{ id: "legacy-output", key: "theme", type: "textarea", label: "Tema" }],
            },
          ],
        },
      },
    },
  ] as unknown as Channel[];
}

async function setup(page: Page, language: AppLanguage, ambiguous = false, code?: string) {
  const channels = fixtureChannels();
  const original = JSON.stringify(channels);
  let required = true;
  let planNumber = 1;
  const applies: unknown[] = [];
  const forceRefreshes: string[] = [];
  const plan = () => ({
    planId: `plan-${planNumber}`,
    required,
    canApply: !ambiguous,
    pendingUpdates: [],
    scanned: {},
    diagnostics: ambiguous
      ? [{ path: "channels.methods.theme", message: "Contrato ambíguo preservado" }]
      : [],
    historicalJobsPreserved: true,
    currentPluginCapabilities: [],
    guideUrl: "https://github.com/andremjr/contentflow/blob/main/docs/UPGRADE_GUIDE_1_3_1.md",
    skillUrl:
      "https://github.com/andremjr/contentflow/blob/main/ecosystem/skills/contentflow-method-development/SKILL.md",
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/preferences")
      return route.fulfill({ json: { language, theme: "dark", methodsLibraryView: "channels" } });
    if (url.pathname === "/api/upgrade/plan") {
      planNumber++;
      return route.fulfill({ json: plan() });
    }
    if (url.pathname === "/api/upgrade/apply") {
      applies.push(route.request().postDataJSON());
      if (code)
        return route.fulfill({
          status: 409,
          json: { code, error: code, backupPath: "test-backups/recoverable.sqlite" },
        });
      required = false;
      for (const channel of channels) channel.methods = createEmptyMethods();
      return route.fulfill({
        json: { applied: true, backupPath: "test-backups/recoverable.sqlite", plan: plan() },
      });
    }
    if (url.pathname === "/api/state") {
      if (url.searchParams.get("since") === "-1") forceRefreshes.push(url.href);
      return route.fulfill({
        json: {
          revision: required ? 1 : 2,
          channels,
          projects: [],
          executions: [],
          orchestrators: [],
          libraryItems: [],
          libraryCollections: [],
          upgrade: { required, applying: false },
        },
      });
    }
    if (url.pathname === "/api/upgrade/status")
      return route.fulfill({ json: { required, applying: false } });
    return route.fulfill({ json: { plugins: [], connections: [], profiles: [], items: [] } });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { channels, original, applies, forceRefreshes, errors };
}

for (const language of ["pt-BR", "en", "es"] as const) {
  test(`first opening preserves channels and raw methods; explicit backup and refresh (${language})`, async ({
    page,
  }) => {
    const fixture = await setup(page, language);
    const text = upgradeText(language);
    await page.goto("/dashboard");
    const panel = page.getByTestId("user-data-upgrade");
    await expect(panel.getByRole("heading", { name: text.title })).toBeVisible();
    await expect(page.getByText(fixture.channels[0].name, { exact: true }).first()).toBeVisible();
    await expect(panel.getByRole("button", { name: text.apply })).toBeDisabled();
    expect(fixture.applies).toEqual([]);
    expect(JSON.stringify(fixture.channels)).toEqual(fixture.original);
    await page.goto(`/channel/${fixture.channels[0].id}/methods`);
    await expect(page.getByText(text.incompatible, { exact: true })).toBeVisible();
    await page.getByText(text.raw, { exact: true }).click();
    await expect(page.locator("pre")).toContainText(fixture.channels[0].methods.theme.name);
    await panel.getByRole("checkbox", { name: text.confirm }).check();
    await panel.getByRole("button", { name: text.refresh }).click();
    await expect(panel.getByRole("checkbox")).not.toBeChecked();
    await panel.getByRole("checkbox", { name: text.confirm }).check();
    await panel.getByRole("button", { name: text.apply }).click();
    await expect(panel).toContainText(text.success);
    expect(fixture.applies).toEqual([{ planId: "plan-4", confirmBackup: true }]);
    expect(fixture.forceRefreshes.length).toBeGreaterThan(1);
    await expect(page.getByText(text.incompatible, { exact: true })).toHaveCount(0);
    expect(fixture.errors).toEqual([]);
  });
}

test("ambiguity leaves all data unchanged and keeps guide, skill, plugins and refresh available", async ({
  page,
}) => {
  const fixture = await setup(page, "pt-BR", true);
  const text = upgradeText("pt-BR");
  await page.goto("/methods");
  const panel = page.getByTestId("user-data-upgrade");
  await expect(panel.getByText(text.blocked)).toBeVisible();
  await expect(panel.getByRole("button", { name: text.apply })).toBeDisabled();
  await expect(panel.getByRole("link", { name: text.guide })).toHaveAttribute(
    "href",
    /UPGRADE_GUIDE_1_3_1.md/,
  );
  await expect(panel.getByRole("link", { name: text.skill })).toHaveAttribute("href", /SKILL.md/);
  await panel.locator("summary").click();
  await expect(panel).toContainText("Contrato ambíguo preservado");
  await panel.getByRole("button", { name: text.refresh }).click();
  expect(fixture.applies).toEqual([]);
  expect(JSON.stringify(fixture.channels)).toEqual(fixture.original);
  expect(fixture.errors).toEqual([]);
});

test("a changed plan is localized and requires a fresh review; recovery backup remains visible", async ({
  page,
}) => {
  const fixture = await setup(page, "en", false, "PLAN_CHANGED");
  const text = upgradeText("en");
  await page.goto("/dashboard");
  const panel = page.getByTestId("user-data-upgrade");
  await panel.getByRole("checkbox", { name: text.confirm }).check();
  await panel.getByRole("button", { name: text.apply }).click();
  await expect(panel.getByRole("alert")).toHaveText(text.PLAN_CHANGED);
  await expect(panel).toContainText(text.backup);
  await expect(panel.getByRole("link", { name: text.guide })).toBeVisible();
  await expect(panel.getByRole("button", { name: text.apply })).toBeDisabled();
  expect(fixture.applies).toHaveLength(1);
  expect(JSON.stringify(fixture.channels)).toEqual(fixture.original);
});
