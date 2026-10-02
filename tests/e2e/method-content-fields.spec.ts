import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createEmptyMethods, type Channel } from "../../src/lib/domain";
import { contentShape, recordShape } from "../../src/lib/data-shape";

for (const [language, contentType, family, quantity, options] of [
  ["pt-BR", "Tipo de conteúdo", "Imagem", "Quantidade", ["Texto", "Imagem", "Áudio", "Vídeo"]],
  ["en", "Content type", "Image", "Quantity", ["Text", "Image", "Audio", "Video"]],
  ["es", "Tipo de contenido", "Imagen", "Cantidad", ["Texto", "Imagen", "Audio", "Vídeo"]],
] as const) {
  test(`content-only editor preserves internal relations on edit, suggestions and reload (${language})`, async ({
    page,
    request,
  }) => {
    const preferences = await (await request.get("/api/preferences")).json();
    expect(
      (await request.put("/api/preferences", { data: { ...preferences, language } })).ok(),
    ).toBeTruthy();
    const relation = recordShape("many", [
      {
        id: "description",
        key: "description",
        label: "Description",
        shape: contentShape("text"),
        required: true,
      },
    ]);
    const methods = createEmptyMethods();
    methods.theme.blocks = [
      {
        id: "producer",
        type: "CRIAR",
        operator: "Humano",
        name: "Producer",
        order: 0,
        inputs: [],
        parameters: [],
        instructions: "",
        outputs: [
          {
            id: "text",
            key: "text",
            label: "User text",
            shape: contentShape("text"),
            required: true,
          },
          {
            id: "relations",
            key: "relations",
            label: "Internal relation",
            shape: relation,
            required: true,
          },
        ],
      },
      {
        id: "consumer",
        type: "CRIAR",
        operator: "Humano",
        name: "Consumer",
        order: 1,
        inputs: [
          {
            id: "context",
            label: "User context",
            shape: contentShape("text"),
            binding: { kind: "previous_block", blockId: "producer", outputKey: "text" },
          },
          {
            id: "internal",
            label: "Internal binding",
            shape: relation,
            binding: { kind: "previous_block", blockId: "producer", outputKey: "relations" },
          },
        ],
        parameters: [],
        instructions: "",
        outputs: [
          {
            id: "result",
            key: "theme",
            label: "User result",
            shape: contentShape("text"),
            required: true,
          },
        ],
      },
    ];
    const channel: Channel = {
      id: randomUUID(),
      name: "Content editor test",
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
    await page.goto(`/channel/${channel.id}/methods?process=theme`);
    await page.getByText("Producer", { exact: true }).first().click();
    await expect(page.getByText("Internal relation", { exact: true })).toHaveCount(0);
    await page.locator("button[aria-expanded]").filter({ hasText: "User text" }).click();
    await page.getByRole("combobox", { name: contentType, exact: true }).click();
    await expect(page.getByRole("option")).toHaveText([...options]);
    await page.getByRole("option", { name: family, exact: true }).click();
    await expect(page.getByRole("combobox", { name: quantity, exact: true })).toBeVisible();
    const read = async () =>
      ((await (await request.get("/api/channels")).json()) as Channel[]).find(
        (item) => item.id === channel.id,
      )!.methods.theme.blocks;
    await expect
      .poll(async () => (await read())[0].outputs![0].shape)
      .toEqual(contentShape("image"));
    expect((await read())[0].outputs![1]).toMatchObject(methods.theme.blocks[0].outputs![1]);
    await page.reload();
    await page.getByText("Producer", { exact: true }).first().click();
    await page
      .getByRole("button", {
        name:
          language === "pt-BR"
            ? "Usar sugestão"
            : language === "en"
              ? "Use suggestion"
              : "Usar sugerencia",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await read())[0].outputs!.find((field) => field.key === "relations"))
      .toMatchObject(methods.theme.blocks[0].outputs![1]);
    await expect
      .poll(async () => (await read())[0].outputs!.some((field) => field.key === "theme"))
      .toBe(true);
    await page.reload();
    await page.getByText("Consumer", { exact: true }).first().click();
    await expect(page.getByText("Internal binding", { exact: true })).toHaveCount(0);
    expect((await read())[1].inputs![1]).toMatchObject(methods.theme.blocks[1].inputs![1]);
  });
}
