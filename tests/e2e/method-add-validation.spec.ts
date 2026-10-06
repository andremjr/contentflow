import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createEmptyMethods, type Channel } from "../../src/lib/domain";
import { contentShape } from "../../src/lib/data-shape";

test.setTimeout(180_000);

test.afterEach(async ({ request }) => {
  const preferences = await (await request.get("/api/preferences")).json();
  await request.put("/api/preferences", { data: { ...preferences, language: "pt-BR" } });
});

for (const [language, button, placeholder] of [
  ["pt-BR", "Validar", "Selecione uma ação anterior"],
  ["en", "Validate", "Select a previous action"],
  ["es", "Validar", "Selecciona una acción anterior"],
] as const) {
  test(`adds VALIDAR, recovers the draft, selects its target and saves (${language})`, async ({
    page,
    request,
  }) => {
    const preferences = await (await request.get("/api/preferences")).json();
    await request.put("/api/preferences", { data: { ...preferences, language } });
    const methods = createEmptyMethods();
    methods.theme.blocks = [
      {
        id: "producer",
        type: "CRIAR",
        operator: "Humano",
        name: "Student result",
        instructions: "",
        inputs: [],
        parameters: [],
        order: 0,
        outputs: [
          {
            id: "theme",
            key: "theme",
            label: "Student output",
            shape: contentShape("text"),
            required: true,
          },
        ],
      },
    ];
    const channel: Channel = {
      id: randomUUID(),
      name: "Validation editor test",
      handle: "",
      color: "#6366f1",
      subscribers: "0",
      niche: "Test",
      language: "pt-BR",
      frequency: "",
      activeProjects: 0,
      nextPublish: "",
      currentProjectProgress: 0,
      status: "healthy",
      trend: [],
      methods,
      createdAt: new Date().toISOString(),
    };
    expect((await request.post("/api/channels", { data: channel })).ok()).toBeTruthy();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/channel/${channel.id}/methods?process=theme`);
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText(placeholder, { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    // An incomplete validation stays local; no target is silently selected.
    const draftKey = `contentflow:method-draft:${channel.id}:theme`;
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).blocks.length, draftKey),
    ).toBe(2);
    await page.reload();
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).blocks.length, draftKey),
    ).toBe(2);
    await expect(page.locator("article")).toHaveCount(2);
    await page.locator("article").last().getByRole("button").last().click();
    await page.getByRole("dialog").getByRole("combobox").filter({ hasText: placeholder }).click();
    await page.getByRole("option", { name: "1. Student result", exact: true }).click();
    const read = async () =>
      ((await (await request.get("/api/channels")).json()) as Channel[]).find(
        (item) => item.id === channel.id,
      )!.methods.theme.blocks;
    await expect.poll(async () => (await read())[1]?.validation?.targetBlockId).toBe("producer");
    const stored = await read();
    expect(stored[0]).toMatchObject(methods.theme.blocks[0]);
    expect(stored[1]).toMatchObject({
      type: "VALIDAR",
      operator: "Humano",
      validation: { mode: "approval", targetBlockId: "producer" },
    });
    await page.reload();
    expect(await read()).toEqual(stored);
    expect(errors).toEqual([]);
  });
}
