import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createEmptyMethods, PROCESS_ORDER } from "../../src/lib/domain";

async function fixture(request: APIRequestContext) {
  const id = randomUUID();
  const methods = createEmptyMethods();
  for (const process of ["theme", "title"] as const) {
    methods[process].name = `Imported ${process}`;
    methods[process].blocks = [0, 1].map((order) => ({
      id: `${process}-${order}`,
      type: "CRIAR",
      operator: "Humano",
      name: `Step ${order}`,
      instructions: "Preserve",
      order,
      inputs: [],
      parameters: [],
      outputs: [
        {
          id: `${process}-output-${order}`,
          key: process,
          label: process,
          required: true,
          shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        },
      ],
    }));
  }
  const channel = {
    id,
    name: "Method deletion fixture",
    handle: "@delete",
    color: "#2563eb",
    subscribers: "0",
    niche: "Test",
    language: "pt-BR",
    activeProjects: 0,
    frequency: "",
    nextPublish: "",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    methods,
    createdAt: new Date().toISOString(),
  };
  expect((await request.post("/api/channels", { data: channel })).ok()).toBeTruthy();
  return channel;
}

test.afterEach(async ({ request }) => {
  const preferences = await (await request.get("/api/preferences")).json();
  await request.put("/api/preferences", { data: { ...preferences, language: "pt-BR" } });
});

for (const [language, deleteLabel, cancelLabel] of [
  ["pt-BR", "Apagar Método", "Cancelar"],
  ["en", "Delete Method", "Cancel"],
  ["es", "Eliminar Método", "Cancelar"],
] as const) {
  test(`deletes the entire Method after confirmation (${language})`, async ({ page, request }) => {
    const channel = await fixture(request);
    const preferences = await (await request.get("/api/preferences")).json();
    await request.put("/api/preferences", { data: { ...preferences, language } });
    await page.goto(`/channel/${channel.id}/methods?process=theme`);
    await page.getByRole("button", { name: deleteLabel, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Imported theme", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: cancelLabel, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    let stored = (await (await request.get("/api/channels")).json()).find(
      (item: { id: string }) => item.id === channel.id,
    );
    expect(stored.methods.theme.blocks).toHaveLength(2);
    await page.getByRole("button", { name: deleteLabel, exact: true }).click();
    await dialog.getByRole("button", { name: deleteLabel, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: deleteLabel, exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("button", { name: deleteLabel, exact: true })).toBeDisabled();
    stored = (await (await request.get("/api/channels")).json()).find(
      (item: { id: string }) => item.id === channel.id,
    );
    expect(stored.methods.theme).toEqual(createEmptyMethods().theme);
    expect(stored.methods.title).toEqual(channel.methods.title);
    expect(Object.keys(stored.methods)).toHaveLength(8);
  });
}

test("deletion rejects stale revisions and preserves started work atomically", async ({
  request,
}) => {
  const channel = await fixture(request);
  expect(
    (
      await request.delete(`/api/channels/${channel.id}/methods/theme`, {
        data: { definitionRevision: -1 },
      })
    ).status(),
  ).toBe(409);
  const projectId = randomUUID();
  await request.post("/api/projects", {
    data: {
      id: projectId,
      channelId: channel.id,
      title: "Started work",
      createdAt: new Date().toISOString(),
      stages: Object.fromEntries(PROCESS_ORDER.map((process) => [process, "not_started"])),
      currentStage: "theme",
      state: "not_started",
      progress: 0,
    },
  });
  const started = await (
    await request.post("/api/commands", {
      data: { id: randomUUID(), action: "start", projectId, processType: "theme" },
    })
  ).json();
  expect(started.result.id).toBeTruthy();
  const before = await (await request.get(`/api/executions/${started.result.id}/state`)).json();
  const stored = (await (await request.get("/api/channels")).json()).find(
    (item: { id: string }) => item.id === channel.id,
  );
  const rejected = await request.delete(`/api/channels/${channel.id}/methods/theme`, {
    data: { definitionRevision: stored.definitionRevision ?? 0 },
  });
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).error).toContain("trabalho já iniciado");
  const after = await (await request.get(`/api/executions/${started.result.id}/state`)).json();
  expect(after.execution).toEqual(before.execution);
  const final = (await (await request.get("/api/channels")).json()).find(
    (item: { id: string }) => item.id === channel.id,
  );
  expect(final).toEqual(stored);
});
