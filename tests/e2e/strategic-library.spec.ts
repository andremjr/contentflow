import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createEmptyMethods,
  type Channel,
  type StrategicCollection,
  type ChannelLibraryItem,
} from "../../src/lib/domain";

for (const [language, editLabel, saveLabel] of [
  ["pt-BR", "Editar item", "Salvar alterações"],
  ["en", "Edit item", "Save changes"],
  ["es", "Editar elemento", "Guardar cambios"],
] as const) {
  test(`edits library items in ${language}, preserves identity and cancels without saving`, async ({
    page,
    request,
  }) => {
    const id = randomUUID();
    const channel = {
      id,
      name: "Canal edição",
      handle: "@edit",
      color: "#2563eb",
      subscribers: "0",
      niche: "Teste",
      language: "pt-BR",
      activeProjects: 0,
      frequency: "",
      nextPublish: "",
      currentProjectProgress: 0,
      status: "healthy",
      trend: [],
      methods: createEmptyMethods(),
      createdAt: new Date().toISOString(),
    };
    await request.post("/api/channels", { data: channel });
    const collection = {
      id: randomUUID(),
      channelId: id,
      name: "Coleção edição",
      usage: "fixed",
      fields: [
        {
          id: "text",
          label: "Salvo",
          required: true,
          shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        },
        {
          id: "number",
          label: "Zero",
          required: true,
          shape: { kind: "control", control: "number", cardinality: "one" },
        },
        {
          id: "link",
          label: "Link",
          required: true,
          shape: { kind: "control", control: "url", cardinality: "one" },
        },
      ],
      createdAt: new Date().toISOString(),
    };
    await request.post("/api/library/collections", { data: collection });
    const item = {
      id: randomUUID(),
      channelId: id,
      collectionId: collection.id,
      values: { text: "Editar item", number: 0, link: "https://example.com/original" },
      createdAt: new Date().toISOString(),
    };
    await request.post("/api/library", { data: item });
    const preferences = await (await request.get("/api/preferences")).json();
    await request.put("/api/preferences", { data: { ...preferences, language } });
    await page.goto(`/channel/${id}/library`);
    await page
      .getByRole("button", { name: /Coleção edição/ })
      .first()
      .click();
    await page.getByRole("button", { name: editLabel, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Salvo", { exact: true })).toBeVisible();
    await expect(dialog.locator("textarea")).toHaveValue("Editar item");
    await expect(dialog.locator('input[type="number"]')).toHaveValue("0");
    await dialog.locator("textarea").fill("Cancelado");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    let saved = (
      (await (await request.get("/api/state")).json()).libraryItems as ChannelLibraryItem[]
    ).find((row) => row.id === item.id)!;
    expect(saved.values).toEqual(item.values);
    await page.getByRole("button", { name: editLabel, exact: true }).click();
    await expect(dialog.locator("textarea")).toHaveValue("Editar item");
    await dialog.locator("textarea").fill("");
    await expect(dialog.getByRole("button", { name: saveLabel, exact: true })).toBeDisabled();
    await dialog.locator("textarea").fill("Revisado pelo usuário");
    await dialog.locator('input[type="url"]').fill("https://example.com/revised");
    await dialog.getByRole("button", { name: saveLabel, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: /Coleção edição/ })
      .first()
      .click();
    await expect(page.getByText("Revisado pelo usuário", { exact: true })).toBeVisible();
    saved = (
      (await (await request.get("/api/state")).json()).libraryItems as ChannelLibraryItem[]
    ).find((row) => row.id === item.id)!;
    expect(saved).toMatchObject({
      id: item.id,
      collectionId: item.collectionId,
      channelId: id,
      createdAt: item.createdAt,
      values: { text: "Revisado pelo usuário", number: 0, link: "https://example.com/revised" },
    });
    expect(
      (
        await request.put(`/api/library/${item.id}`, {
          data: { ...item, values: { ...item.values, link: "invalid" } },
        })
      ).status(),
    ).toBe(422);
    await request.put("/api/preferences", { data: { ...preferences, language: "pt-BR" } });
  });
}

test("creates consumable collection and imports rows, text/link columns and images in order", async ({
  page,
  request,
}) => {
  const channel: Channel = {
    id: randomUUID(),
    name: "Biblioteca E2E",
    handle: "@library",
    color: "#2563eb",
    subscribers: "0",
    niche: "Teste",
    language: "pt-BR",
    activeProjects: 0,
    frequency: "Semanal",
    nextPublish: "—",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    methods: createEmptyMethods(),
    createdAt: new Date().toISOString(),
  };
  expect((await request.post("/api/channels", { data: channel })).ok()).toBeTruthy();
  await page.goto(`/channel/${channel.id}/library`);
  await page.getByRole("button", { name: "Adicionar coleção" }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome da coleção").fill("Coleção consumível E2E");
  await dialog.getByRole("combobox", { name: "Uso da coleção" }).click();
  await page.getByRole("option", { name: "Consumível", exact: true }).click();
  await dialog.getByRole("button", { name: "Criar coleção", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Consumível", { exact: true })).toBeVisible();
  const collection = (
    (await (
      await request.get(`/api/library/collections?channelId=${channel.id}`)
    ).json()) as StrategicCollection[]
  )[0];
  expect(collection.usage).toBe("consumable");
  const updated: StrategicCollection = {
    ...collection,
    fields: [
      { ...collection.fields[0], label: "Texto", required: true },
      {
        id: "link",
        label: "Link",
        required: true,
        shape: { kind: "control", control: "url", cardinality: "one" },
      },
      {
        id: "image",
        label: "Imagem",
        required: true,
        shape: { kind: "content", family: "image", cardinality: "one", representation: "artifact" },
      },
    ],
  };
  expect(
    (await request.put(`/api/library/collections/${collection.id}`, { data: updated })).ok(),
  ).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Importar em lote", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Coluna", { exact: true }).selectOption("image");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
    "base64",
  );
  await dialog.getByLabel("Selecionar arquivos", { exact: true }).setInputFiles([
    { name: "primeira.png", mimeType: "image/png", buffer: png },
    { name: "segunda.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(dialog.getByRole("link", { name: "segunda.png" })).toBeVisible();
  await dialog.getByLabel("Coluna", { exact: true }).selectOption(updated.fields[0].id);
  await dialog.getByLabel("Valores da coluna").fill("Texto um\nTexto dois");
  await dialog.getByRole("button", { name: "Aplicar à coluna" }).click();
  await dialog.getByLabel("Coluna", { exact: true }).selectOption("link");
  await dialog.getByLabel("Valores da coluna").fill("https://example.com/1\nhttps://example.com/2");
  await dialog.getByRole("button", { name: "Aplicar à coluna" }).click();
  await dialog.getByLabel("Texto 2", { exact: true }).fill("Texto dois revisado");
  await dialog.getByRole("button", { name: "Adicionar linha", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Importar itens", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Remover linha", exact: true }).last().click();
  await dialog.getByRole("button", { name: "Adicionar linha", exact: true }).click();
  await dialog.getByLabel("Texto 3", { exact: true }).fill("Texto três por linha");
  await dialog.getByLabel("Link 3", { exact: true }).fill("https://example.com/3");
  await dialog
    .getByLabel("Imagem 3", { exact: true })
    .setInputFiles({ name: "terceira.png", mimeType: "image/png", buffer: png });
  await expect(dialog.getByRole("link", { name: "terceira.png" })).toBeVisible();

  await dialog.getByRole("button", { name: "Importar itens", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const items = (
    (await (await request.get("/api/state")).json()) as { libraryItems: ChannelLibraryItem[] }
  ).libraryItems.filter((item) => item.collectionId === collection.id);
  expect(items.map((item) => item.values[updated.fields[0].id])).toEqual([
    "Texto um",
    "Texto dois revisado",
    "Texto três por linha",
  ]);
  expect(items.map((item) => (item.values.image as { name: string }).name)).toEqual([
    "primeira.png",
    "segunda.png",
    "terceira.png",
  ]);
  expect(items.map((item) => item.values.link)).toEqual([
    "https://example.com/1",
    "https://example.com/2",
    "https://example.com/3",
  ]);
  await page.reload();
  await page
    .getByRole("button", { name: /Coleção consumível E2E/ })
    .first()
    .click();
  await expect(page.getByText("Texto dois revisado", { exact: true })).toBeVisible();
});

for (const [language, importLabel, fixedLabel, columnLabel] of [
  ["en", "Bulk import", "Fixed", "Fill by column"],
  ["es", "Importar en lote", "Fija", "Completar por columna"],
] as const) {
  test(`library batch interface uses ${language} without translating collection names`, async ({
    page,
    request,
  }) => {
    const id = randomUUID();
    const channel: Channel = {
      id,
      name: "Canal",
      handle: "@library",
      color: "#2563eb",
      subscribers: "0",
      niche: "Teste",
      language: "pt-BR",
      activeProjects: 0,
      frequency: "Semanal",
      nextPublish: "—",
      currentProjectProgress: 0,
      status: "healthy",
      trend: [],
      methods: createEmptyMethods(),
      createdAt: new Date().toISOString(),
    };
    await request.post("/api/channels", { data: channel });
    await request.post("/api/library/collections", {
      data: {
        id: randomUUID(),
        channelId: id,
        name: "Fixa",
        fields: [
          {
            id: "text",
            label: "Salvo",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
        ],
        createdAt: new Date().toISOString(),
      },
    });
    const preferences = await (await request.get("/api/preferences")).json();
    await request.put("/api/preferences", { data: { ...preferences, language } });
    await page.goto(`/channel/${id}/library`);
    await expect(page.getByText(fixedLabel, { exact: true })).toBeVisible();
    await expect(page.getByText("Fixa", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: importLabel, exact: true }).click();
    await expect(page.getByRole("dialog").getByText(columnLabel, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("columnheader", { name: "Salvo" }),
    ).toBeVisible();
    await request.put("/api/preferences", { data: { ...preferences, language: "pt-BR" } });
  });
}
