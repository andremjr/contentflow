import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createEmptyMethods, type Channel } from "../../src/lib/domain";
import { contentShape } from "../../src/lib/data-shape";

test.afterEach(async ({ request }) => {
  const preferences = await (await request.get("/api/preferences")).json();
  expect(
    (await request.put("/api/preferences", { data: { ...preferences, language: "pt-BR" } })).ok(),
  ).toBeTruthy();
});

for (const [language, title, add, use, apply, cancel, trigger] of [
  [
    "pt-BR",
    "Dados entre blocos",
    "Disponibilizar entrega",
    "Usar entrega de",
    "Aplicar",
    "Cancelar",
    "Plugin executor",
  ],
  [
    "en",
    "Data between blocks",
    "Make delivery available",
    "Use delivery from",
    "Apply",
    "Cancel",
    "Runner plugin",
  ],
  [
    "es",
    "Datos entre bloques",
    "Habilitar entrega",
    "Usar entrega de",
    "Aplicar cambios",
    "Cancelar",
    "Plugin ejecutor",
  ],
] as const) {
  test(`plugin content connections are explicit, drafted and persisted (${language})`, async ({
    page,
    request,
  }) => {
    const preferences = await (await request.get("/api/preferences")).json();
    expect(
      (await request.put("/api/preferences", { data: { ...preferences, language } })).ok(),
    ).toBeTruthy();
    expect(
      (
        await request.put("/api/plugins/com.contentflow.e2e-contract/consent", {
          data: { enabled: true },
        })
      ).ok(),
    ).toBeTruthy();
    const methods = createEmptyMethods();
    methods.script.blocks = [
      {
        id: "producer",
        type: "CRIAR",
        operator: "Humano",
        name: "Producer",
        order: 0,
        instructions: "",
        inputs: [],
        parameters: [],
        outputs: [
          {
            id: "context",
            key: "context",
            label: "User context",
            shape: contentShape("text", "many"),
            required: true,
          },
        ],
      },
      {
        id: "consumer",
        type: "CRIAR",
        operator: "IA",
        name: "Consumer",
        order: 1,
        instructions: "Create text.",
        inputs: [],
        parameters: [],
        outputs: [
          {
            id: "existing-image",
            key: "existing_image",
            label: "User image",
            shape: contentShape("image"),
            required: false,
          },
        ],
        plugin: {
          pluginId: "com.contentflow.e2e-contract",
          capabilityId: "generate",
          configuration: {},
        },
      },
    ];
    const channel: Channel = {
      id: randomUUID(),
      name: "Plugin connections",
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
    const saved = async () => {
      const channels = (await (await request.get("/api/channels")).json()) as Channel[];
      return channels.find((item) => item.id === channel.id)!.methods.script.blocks[1];
    };
    await page.goto(`/channel/${channel.id}/methods?process=script`);
    await page.getByText("Consumer", { exact: true }).first().click();
    const pluginTrigger = page.getByRole("button").filter({ hasText: trigger });
    await pluginTrigger.click();
    const data = page.getByTestId("plugin-method-data");
    await expect(data.getByText(title, { exact: true })).toBeVisible();
    await data.getByRole("button", { name: `${add}: Resultado`, exact: true }).click();
    await data.getByRole("combobox").first().click();
    await page
      .getByRole("option", { name: `${use}: Producer · User context`, exact: true })
      .click();
    expect((await saved()).inputs).toEqual([]);
    expect((await saved()).outputs).toEqual(methods.script.blocks[1].outputs);
    await page.getByRole("button", { name: cancel, exact: true }).click();
    await pluginTrigger.click();
    await expect(
      data.getByRole("button", { name: `${add}: Resultado`, exact: true }),
    ).toBeVisible();
    await data.getByRole("button", { name: `${add}: Resultado`, exact: true }).click();
    await data.getByRole("combobox").first().click();
    await page
      .getByRole("option", { name: `${use}: Producer · User context`, exact: true })
      .click();
    await page.getByRole("button", { name: apply, exact: true }).click();
    await expect
      .poll(async () => (await saved()).inputs?.[0]?.binding)
      .toEqual({ kind: "previous_block", blockId: "producer", outputKey: "context" });
    const output = (await saved()).outputs?.find((field) => field.portKey === "result");
    expect((await saved()).outputs?.find((field) => field.id === "existing-image")?.key).toBe(
      "existing_image",
    );
    expect(output?.portKey).toBe("result");
    expect(output?.shape).toEqual(contentShape("text"));
    await page.reload();
    await page.getByText("Consumer", { exact: true }).first().click();
    await pluginTrigger.click();
    await expect(data.getByRole("combobox").first()).toContainText(
      `${use}: Producer · User context`,
    );
    await expect(data.getByRole("button", { name: `${add}: Resultado`, exact: true })).toHaveCount(
      0,
    );
  });
}
