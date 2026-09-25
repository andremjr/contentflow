import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type Channel,
  type ChannelLibraryItem,
  type ProcessExecution,
  type Project,
  type StoredFile,
  type StrategicCollection,
} from "../../src/lib/domain";
import { planPortableMethodTransfer } from "../../src/lib/method-file";
import { effectiveProcessOrder } from "../../src/lib/process-order";

async function seed(request: APIRequestContext) {
  const id = randomUUID();
  const methods = createEmptyMethods();
  for (const processType of ["theme", "title", "thumbnail"] as const) {
    methods[processType].blocks = [
      {
        id: `shared-${processType}`,
        type: "CRIAR",
        operator: "Humano",
        name: `Entrega ${processType}`,
        instructions: "",
        inputs: [],
        parameters: [],
        order: 0,
        outputs: [
          {
            id: `field-${processType}`,
            key: processType,
            label: `Resultado ${processType}`,
            type: processType === "theme" ? "textarea" : processType === "title" ? "text" : "image",
            required: true,
          },
        ],
      },
    ];
  }
  const channel: Channel = {
    id,
    name: `Canal E2E ${id.slice(0, 6)}`,
    handle: "",
    color: "#6366f1",
    subscribers: "—",
    description: "Teste isolado",
    niche: "Teste",
    language: "PT-BR",
    frequency: "1x / semana",
    activeProjects: 0,
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

test("CTA do projeto na barra lateral aponta para o site oficial", async ({ page }) => {
  await page.goto("/dashboard");
  const cta = page.getByRole("link", { name: /Saiba mais sobre o projeto ContentFlow/ });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveText("Saiba mais sobre o projeto ContentFlow");
  await expect(cta).toHaveAttribute("href", "https://andremjr.github.io/contentflow/");
  await expect(cta).toHaveAttribute("target", "_blank");
});

test("reordena Processos na barra lateral, persiste e rejeita dependência posterior", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  await page.goto(`/channel/${channel.id}/methods?process=script`);
  const scriptHandle = page.getByRole("button", { name: "Reordenar processo Roteiro" });
  const thumbnailHandle = page.getByRole("button", { name: "Reordenar processo Thumbnail" });
  await expect(scriptHandle).toBeVisible();
  await scriptHandle.dragTo(thumbnailHandle, { targetPosition: { x: 8, y: 2 }, steps: 12 });
  await expect
    .poll(async () => {
      const channels = (await (await request.get("/api/channels")).json()) as Channel[];
      return channels.find((item) => item.id === channel.id)?.processOrder?.slice(2, 4);
    })
    .toEqual(["script", "thumbnail"]);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Reordenar processo / }).nth(2)).toHaveAttribute(
    "aria-label",
    "Reordenar processo Roteiro",
  );
  const dragStatus = page.getByRole("status").filter({ hasText: /draggable item/i });
  const keyboardScriptHandle = page.getByRole("button", { name: "Reordenar processo Roteiro" });
  await keyboardScriptHandle.focus();
  await page.keyboard.press("Space");
  await expect(dragStatus).toContainText("moved over droppable area script");
  await page.keyboard.press("ArrowDown");
  await expect(dragStatus).toContainText("moved over droppable area thumbnail");
  await page.keyboard.press("Space");
  await expect
    .poll(async () => {
      const channels = (await (await request.get("/api/channels")).json()) as Channel[];
      return channels.find((item) => item.id === channel.id)?.processOrder?.slice(2, 4);
    })
    .toEqual(["thumbnail", "script"]);
  const reorderedScriptHandle = page.getByRole("button", { name: "Reordenar processo Roteiro" });
  await expect(reorderedScriptHandle).toBeEnabled();
  await reorderedScriptHandle.focus();
  await page.keyboard.press("Space");
  await expect(dragStatus).toContainText("moved over droppable area script");
  await page.keyboard.press("ArrowUp");
  await expect(dragStatus).toContainText("moved over droppable area thumbnail");
  await page.keyboard.press("Space");
  await expect
    .poll(async () => {
      const channels = (await (await request.get("/api/channels")).json()) as Channel[];
      return channels.find((item) => item.id === channel.id)?.processOrder?.slice(2, 4);
    })
    .toEqual(["script", "thumbnail"]);
  const updatedThumbnail = {
    ...channel.methods.thumbnail,
    blocks: channel.methods.thumbnail.blocks.map((block) => ({
      ...block,
      inputs: [
        {
          id: "script-reference",
          label: "Roteiro",
          type: "textarea",
          source: "previous_process",
          sourceProcessType: "script",
          blockId: "__process_output__",
          sourceKey: "script",
        },
      ],
    })),
  };
  expect(
    (
      await request.put(`/api/channels/${channel.id}/methods/thumbnail`, { data: updatedThumbnail })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  await page
    .getByRole("button", { name: "Reordenar processo Thumbnail" })
    .dragTo(page.getByRole("button", { name: "Reordenar processo Roteiro" }), {
      targetPosition: { x: 8, y: 2 },
      steps: 12,
    });
  await expect(
    page.getByText("A nova ordem invalida uma dependência entre Métodos."),
  ).toBeVisible();
  const saved = (await (await request.get("/api/channels")).json()) as Channel[];
  expect(saved.find((item) => item.id === channel.id)?.processOrder?.slice(2, 4)).toEqual([
    "script",
    "thumbnail",
  ]);
});

test("ordem do Canal governa novo Projeto, navegação e Biblioteca de Métodos", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  const channels = (await (await request.get("/api/channels")).json()) as Channel[];
  const revision = channels.find((item) => item.id === channel.id)?.definitionRevision ?? 0;
  const order = [
    "title",
    "theme",
    "thumbnail",
    "script",
    "narration",
    "assets",
    "editing",
    "publishing",
  ] as const;
  expect(
    (
      await request.put(`/api/channels/${channel.id}/process-order`, {
        data: { processOrder: order, definitionRevision: revision },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto(`/channel/${channel.id}`);
  await page.getByRole("main").getByRole("button", { name: "Novo projeto" }).click();
  await expect(
    page.getByText("O projeto inicia na primeira etapa configurada do Canal: Título."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();

  const projectId = randomUUID();
  const stages = Object.fromEntries(PROCESS_ORDER.map((process) => [process, "not_started"]));
  expect(
    (
      await request.post("/api/projects", {
        data: {
          id: projectId,
          title: "Projeto em ordem personalizada",
          channelId: channel.id,
          currentStage: "title",
          state: "not_started",
          progress: 0,
          deadline: "Sem prazo",
          duration: "—",
          updatedAt: "Agora",
          createdAt: new Date().toISOString(),
          stages,
          assignee: { name: "Não atribuído", initials: "—" },
          thumbHue: 210,
        },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto(`/project/${projectId}`);
  await expect(page).toHaveURL(new RegExp(`/project/${projectId}/title$`));
  await expect(page.getByRole("navigation", { name: "Processos do projeto" })).toContainText(
    "1Título",
  );

  await page.goto("/methods");
  const card = page.locator("article").filter({ hasText: channel.name });
  await expect(card).toBeVisible();
  const processRows = card.locator("[data-process-type]");
  await expect(processRows.nth(0)).toHaveAttribute("data-process-type", "title");
  await expect(processRows.nth(1)).toHaveAttribute("data-process-type", "theme");
  await expect(processRows.nth(2)).toHaveAttribute("data-process-type", "thumbnail");
});

test("prévia de reutilização inclui dependências transitivas e mantém itens desmarcados", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  await seed(request);
  const channels = (await (await request.get("/api/channels")).json()) as Channel[];
  const revision = channels.find((item) => item.id === channel.id)?.definitionRevision ?? 0;
  const order = [
    "theme",
    "title",
    "script",
    "thumbnail",
    "narration",
    "assets",
    "editing",
    "publishing",
  ] as const;
  expect(
    (
      await request.put(`/api/channels/${channel.id}/process-order`, {
        data: { processOrder: order, definitionRevision: revision },
      })
    ).ok(),
  ).toBeTruthy();

  const script = {
    ...channel.methods.script,
    name: "Roteiro portátil E2E",
    blocks: [
      {
        id: "script-local-e2e",
        type: "CRIAR",
        operator: "Humano",
        name: "Criar roteiro",
        instructions: "",
        inputs: [],
        parameters: [],
        outputs: [
          {
            id: "script-output-local-e2e",
            key: "script",
            label: "Roteiro",
            type: "textarea",
            required: true,
          },
        ],
        order: 0,
      },
    ],
  };
  expect(
    (await request.put(`/api/channels/${channel.id}/methods/script`, { data: script })).ok(),
  ).toBeTruthy();

  const thumbnail = {
    ...channel.methods.thumbnail,
    name: "Thumbnail portátil E2E",
    blocks: channel.methods.thumbnail.blocks.map((block) => ({
      ...block,
      inputs: [
        {
          id: "script-input-local-e2e",
          label: "Roteiro",
          type: "textarea",
          source: "previous_process",
          sourceProcessType: "script",
          sourceKey: "script",
          blockId: "script-local-e2e",
        },
      ],
    })),
  };
  expect(
    (await request.put(`/api/channels/${channel.id}/methods/thumbnail`, { data: thumbnail })).ok(),
  ).toBeTruthy();

  const preferences = (await (await request.get("/api/preferences")).json()) as Record<
    string,
    unknown
  >;
  expect(
    (
      await request.put("/api/preferences", {
        data: { ...preferences, methodsLibraryView: "methods" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/methods");
  const card = page.locator("article").filter({ hasText: "Thumbnail portátil E2E" });
  await card.getByRole("button", { name: "Reutilizar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Thumbnail portátil E2E", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Roteiro portátil E2E", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Método principal", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Dependência incluída", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Compartilhar itens", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox").last()).toBeEnabled();
  await expect(dialog.getByRole("checkbox").last()).not.toBeChecked();
  await dialog.getByRole("checkbox").last().click();
  await expect(dialog.getByRole("checkbox").last()).toBeChecked();
});

test("prévia de reutilização mostra plugin ausente com ação de correção", async ({
  page,
  request,
}) => {
  const source = await seed(request);
  await seed(request);
  const current = ((await (await request.get("/api/channels")).json()) as Channel[]).find(
    (channel) => channel.id === source.id,
  )!;
  const theme = {
    ...current.methods.theme,
    name: "Tema com plugin ausente E2E",
    blocks: current.methods.theme.blocks.map((block) => ({
      ...block,
      operator: "Código" as const,
      plugin: {
        pluginId: "com.contentflow.plugin-ausente-e2e",
        pluginVersion: "1.0.0",
        capabilityId: "gerar",
        configuration: {},
      },
    })),
  };
  expect(
    (await request.put(`/api/channels/${source.id}/methods/theme`, { data: theme })).ok(),
  ).toBeTruthy();
  const preferences = (await (await request.get("/api/preferences")).json()) as Record<
    string,
    unknown
  >;
  expect(
    (
      await request.put("/api/preferences", {
        data: { ...preferences, methodsLibraryView: "methods" },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto("/methods");
  const card = page.locator("article").filter({ hasText: "Tema com plugin ausente E2E" });
  await card.getByRole("button", { name: "Reutilizar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").first().click();
  await expect(dialog.getByText(/Plugin ausente/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Abrir Plugins para corrigir" })).toBeVisible();
});

test("compartilhamento exporta itens somente após marcar a opção", async ({ page, request }) => {
  const source = await seed(request);
  const collection: StrategicCollection = {
    id: randomUUID(),
    channelId: source.id,
    name: "Fórmulas compartilháveis E2E",
    fields: [{ id: "formula-e2e", label: "Fórmula", type: "textarea", required: true }],
    createdAt: new Date().toISOString(),
  };
  expect((await request.post("/api/library/collections", { data: collection })).ok()).toBeTruthy();
  expect(
    (
      await request.post("/api/library", {
        data: {
          id: randomUUID(),
          channelId: source.id,
          collectionId: collection.id,
          values: { "formula-e2e": "Como X mudou Y" },
          createdAt: new Date().toISOString(),
        },
      })
    ).ok(),
  ).toBeTruthy();
  const current = ((await (await request.get("/api/channels")).json()) as Channel[]).find(
    (channel) => channel.id === source.id,
  )!;
  const title = {
    ...current.methods.title,
    name: "Título compartilhável E2E",
    blocks: [
      {
        id: "choose-share-e2e",
        type: "ESCOLHER" as const,
        operator: "Humano" as const,
        collectionId: collection.id,
        parameters: [],
        order: 0,
      },
    ],
  };
  expect(
    (await request.put(`/api/channels/${source.id}/methods/title`, { data: title })).ok(),
  ).toBeTruthy();
  const preferences = (await (await request.get("/api/preferences")).json()) as Record<
    string,
    unknown
  >;
  expect(
    (
      await request.put("/api/preferences", {
        data: { ...preferences, methodsLibraryView: "methods" },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto("/methods");
  const card = page.locator("article").filter({ hasText: "Título compartilhável E2E" });
  await card.getByRole("button", { name: "Compartilhar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Compartilhar Método" })).toBeVisible();
  const itemsCheckbox = dialog.getByRole("checkbox").last();
  await expect(itemsCheckbox).toBeEnabled();
  await expect(itemsCheckbox).not.toBeChecked();
  await itemsCheckbox.click();
  await expect(
    dialog.getByText("Itens incluídos no compartilhamento: 1.", { exact: true }),
  ).toBeVisible();
  const exportRequest = page.waitForRequest(
    (candidate) =>
      candidate.url().includes("/api/method-packages/export") && candidate.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Baixar pacote" }).click();
  const sent = (await exportRequest).postDataJSON() as { manifest: string };
  const manifest = JSON.parse(sent.manifest) as { itemsIncluded: boolean; items: unknown[] };
  expect(manifest.itemsIncluded).toBe(true);
  expect(manifest.items).toHaveLength(1);
});

test("aplicação atômica remapeia coleções, preserva itens locais e rejeita revisão obsoleta", async ({
  request,
}) => {
  const source = await seed(request);
  const target = await seed(request);
  const sourceCollection: StrategicCollection = {
    id: randomUUID(),
    channelId: source.id,
    name: "Estruturas E2E",
    fields: [
      {
        id: "source-formula",
        label: "Fórmula",
        type: "textarea",
        required: true,
      },
    ],
    createdAt: new Date().toISOString(),
  };
  expect(
    (await request.post("/api/library/collections", { data: sourceCollection })).ok(),
  ).toBeTruthy();

  let channels = (await (await request.get("/api/channels")).json()) as Channel[];
  let sourceCurrent = channels.find((item) => item.id === source.id)!;
  expect(
    (
      await request.put(`/api/channels/${source.id}/process-order`, {
        data: {
          processOrder: [
            "theme",
            "title",
            "script",
            "thumbnail",
            "narration",
            "assets",
            "editing",
            "publishing",
          ],
          definitionRevision: sourceCurrent.definitionRevision ?? 0,
        },
      })
    ).ok(),
  ).toBeTruthy();

  sourceCurrent = ((await (await request.get("/api/channels")).json()) as Channel[]).find(
    (item) => item.id === source.id,
  )!;
  const script = {
    ...sourceCurrent.methods.script,
    name: "Roteiro atômico E2E",
    blocks: [
      {
        id: "source-script-block",
        type: "CRIAR",
        operator: "Humano",
        parameters: [],
        order: 0,
        outputs: [
          {
            id: "source-script-output",
            label: "Roteiro",
            key: "script",
            type: "textarea",
            required: true,
          },
        ],
      },
    ],
  };
  expect(
    (await request.put(`/api/channels/${source.id}/methods/script`, { data: script })).ok(),
  ).toBeTruthy();

  sourceCurrent = ((await (await request.get("/api/channels")).json()) as Channel[]).find(
    (item) => item.id === source.id,
  )!;
  const thumbnail = {
    ...sourceCurrent.methods.thumbnail,
    name: "Thumbnail atômica E2E",
    blocks: sourceCurrent.methods.thumbnail.blocks.map((block) => ({
      ...block,
      collectionId: sourceCollection.id,
      inputs: [
        {
          id: "source-script-input",
          label: "Roteiro",
          type: "textarea",
          source: "previous_process",
          sourceProcessType: "script",
          sourceKey: "script",
          blockId: "source-script-block",
        },
      ],
    })),
  };
  expect(
    (await request.put(`/api/channels/${source.id}/methods/thumbnail`, { data: thumbnail })).ok(),
  ).toBeTruthy();

  const targetCollection: StrategicCollection = {
    id: randomUUID(),
    channelId: target.id,
    name: "Estruturas E2E",
    fields: [
      {
        id: "target-formula",
        label: "Fórmula",
        type: "textarea",
        required: true,
      },
    ],
    createdAt: new Date().toISOString(),
  };
  expect(
    (await request.post("/api/library/collections", { data: targetCollection })).ok(),
  ).toBeTruthy();
  const localItemId = randomUUID();
  expect(
    (
      await request.post("/api/library", {
        data: {
          id: localItemId,
          channelId: target.id,
          collectionId: targetCollection.id,
          values: { "target-formula": "Item local preservado" },
          createdAt: new Date().toISOString(),
        },
      })
    ).ok(),
  ).toBeTruthy();

  channels = (await (await request.get("/api/channels")).json()) as Channel[];
  sourceCurrent = channels.find((item) => item.id === source.id)!;
  const targetCurrent = channels.find((item) => item.id === target.id)!;
  const plan = planPortableMethodTransfer({
    name: "Thumbnail atômica E2E",
    channelName: sourceCurrent.name,
    sourceMethods: effectiveProcessOrder(sourceCurrent).map(
      (processType) => sourceCurrent.methods[processType],
    ),
    collections: [sourceCollection],
    processOrder: effectiveProcessOrder(sourceCurrent),
    primaryProcessTypes: ["thumbnail"],
  });
  const expectedRevision = targetCurrent.definitionRevision ?? 0;
  const applyPayload = {
    targetChannelId: target.id,
    expectedDefinitionRevision: expectedRevision,
    methods: plan.methods.map((entry) => entry.method),
    collections: plan.collections,
    preferredOrder: effectiveProcessOrder(targetCurrent),
    selectedProcesses: plan.methods.map((entry) => entry.method.processType),
    preserveLocalConnections: true,
  };
  const applied = await request.post("/api/method-transfers/apply", { data: applyPayload });
  expect(applied.ok()).toBeTruthy();

  const updatedChannels = (await (await request.get("/api/channels")).json()) as Channel[];
  const updatedTarget = updatedChannels.find((item) => item.id === target.id)!;
  expect(effectiveProcessOrder(updatedTarget).indexOf("script")).toBeLessThan(
    effectiveProcessOrder(updatedTarget).indexOf("thumbnail"),
  );
  const targetCollections = (await (
    await request.get(`/api/library/collections?channelId=${target.id}`)
  ).json()) as StrategicCollection[];
  expect(
    targetCollections.filter((collection) => collection.name === "Estruturas E2E"),
  ).toHaveLength(2);
  const importedCollection = targetCollections.find(
    (collection) => collection.id !== targetCollection.id,
  )!;
  expect(updatedTarget.methods.thumbnail.blocks[0].collectionId).toBe(importedCollection.id);
  const targetItems = (await (await request.get(`/api/library?channelId=${target.id}`)).json()) as {
    id: string;
    collectionId: string;
  }[];
  expect(targetItems.some((item) => item.id === localItemId)).toBeTruthy();
  expect(targetItems.some((item) => item.collectionId === importedCollection.id)).toBeFalsy();

  const stale = await request.post("/api/method-transfers/apply", { data: applyPayload });
  expect(stale.status()).toBe(409);
  const afterConflict = (await (
    await request.get(`/api/library/collections?channelId=${target.id}`)
  ).json()) as StrategicCollection[];
  expect(afterConflict).toHaveLength(targetCollections.length);
});

test("aplicação com itens copia asset local com novo vínculo e preserva conteúdo", async ({
  request,
}) => {
  const source = await seed(request);
  const target = await seed(request);
  const sourceCollection: StrategicCollection = {
    id: randomUUID(),
    channelId: source.id,
    name: "Referências visuais E2E",
    fields: [{ id: "source-image", label: "Imagem", type: "image", required: true }],
    createdAt: new Date().toISOString(),
  };
  expect(
    (await request.post("/api/library/collections", { data: sourceCollection })).ok(),
  ).toBeTruthy();
  const assetBytes = Buffer.from("asset-portatil-e2e");
  const upload = await request.post("/api/uploads", {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent("referencia.png"),
      "X-File-Type": "image/png",
    },
    data: assetBytes,
  });
  expect(upload.ok()).toBeTruthy();
  const sourceFile = (await upload.json()) as StoredFile;
  expect(
    (
      await request.post("/api/library", {
        data: {
          id: randomUUID(),
          channelId: source.id,
          collectionId: sourceCollection.id,
          values: { "source-image": sourceFile },
          createdAt: new Date().toISOString(),
        },
      })
    ).ok(),
  ).toBeTruthy();

  let channels = (await (await request.get("/api/channels")).json()) as Channel[];
  let sourceCurrent = channels.find((item) => item.id === source.id)!;
  const titleMethod = {
    ...sourceCurrent.methods.title,
    name: "Título com referência visual E2E",
    blocks: [
      {
        id: "choose-reference-e2e",
        type: "ESCOLHER" as const,
        operator: "Humano" as const,
        collectionId: sourceCollection.id,
        parameters: [],
        order: 0,
      },
    ],
  };
  expect(
    (await request.put(`/api/channels/${source.id}/methods/title`, { data: titleMethod })).ok(),
  ).toBeTruthy();
  channels = (await (await request.get("/api/channels")).json()) as Channel[];
  sourceCurrent = channels.find((item) => item.id === source.id)!;
  const targetCurrent = channels.find((item) => item.id === target.id)!;
  const sourceItems = (await (
    await request.get(`/api/library?channelId=${source.id}`)
  ).json()) as ChannelLibraryItem[];
  const plan = planPortableMethodTransfer({
    name: titleMethod.name,
    sourceMethods: effectiveProcessOrder(sourceCurrent).map(
      (processType) => sourceCurrent.methods[processType],
    ),
    collections: [sourceCollection],
    items: sourceItems,
    includeItems: true,
    processOrder: effectiveProcessOrder(sourceCurrent),
    primaryProcessTypes: ["title"],
  });
  const payload = {
    targetChannelId: target.id,
    sourceChannelId: source.id,
    expectedDefinitionRevision: targetCurrent.definitionRevision ?? 0,
    methods: plan.methods.map((entry) => entry.method),
    collections: plan.collections,
    itemsIncluded: true,
    items: plan.items,
    preferredOrder: effectiveProcessOrder(targetCurrent),
    selectedProcesses: plan.methods.map((entry) => entry.method.processType),
    preserveLocalConnections: true,
  };
  const applied = await request.post("/api/method-transfers/apply", { data: payload });
  expect(applied.ok()).toBeTruthy();
  const importedItems = (await (
    await request.get(`/api/library?channelId=${target.id}`)
  ).json()) as Array<{ values: Record<string, StoredFile> }>;
  expect(importedItems).toHaveLength(1);
  const importedFile = Object.values(importedItems[0].values)[0];
  expect(importedFile.url).not.toBe(sourceFile.url);
  expect(importedFile.sha256).toMatch(/^[a-f0-9]{64}$/);
  const restored = await request.get(importedFile.url);
  expect(restored.ok()).toBeTruthy();
  expect(Buffer.from(await restored.body())).toEqual(assetBytes);

  const stale = await request.post("/api/method-transfers/apply", { data: payload });
  expect(stale.status()).toBe(409);
  const afterStale = (await (
    await request.get(`/api/library?channelId=${target.id}`)
  ).json()) as unknown[];
  expect(afterStale).toHaveLength(1);
});

test("editor reutiliza Método pela mesma aplicação atômica", async ({ page, request }) => {
  const source = await seed(request);
  const target = await seed(request);
  const sourceTheme = {
    ...source.methods.theme,
    name: "Tema editor atômico E2E",
  };
  expect(
    (await request.put(`/api/channels/${source.id}/methods/theme`, { data: sourceTheme })).ok(),
  ).toBeTruthy();

  await page.goto(`/channel/${target.id}/methods?process=theme`);
  await page.getByRole("button", { name: "Usar da biblioteca", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const sourceCard = dialog.getByRole("button").filter({ hasText: "Tema editor atômico E2E" });
  await expect(sourceCard).toBeVisible();
  await sourceCard.click();
  const preview = page.getByRole("dialog").filter({ hasText: "Tema editor atômico E2E" }).last();
  await expect(preview.getByText("Tema editor atômico E2E", { exact: true })).toBeVisible();
  const applied = page.waitForResponse(
    (response) =>
      response.url().includes("/api/method-transfers/apply") &&
      response.request().method() === "POST",
  );
  await preview.getByRole("button", { name: "Aplicar importação", exact: true }).click();
  expect((await applied).ok()).toBeTruthy();
  await expect(page.getByLabel("Nome do método", { exact: true })).toHaveValue(
    "Tema editor atômico E2E",
  );

  const channels = (await (await request.get("/api/channels")).json()) as Channel[];
  expect(channels.find((item) => item.id === target.id)?.methods.theme.name).toBe(
    "Tema editor atômico E2E",
  );
});

test("autosave de Método detecta edição concorrente entre abas", async ({
  page,
  context,
  request,
}) => {
  const channel = await seed(request);
  const secondPage = await context.newPage();
  await Promise.all([
    page.goto(`/channel/${channel.id}/methods?process=theme`),
    secondPage.goto(`/channel/${channel.id}/methods?process=theme`),
  ]);
  const firstName = page.getByLabel("Nome do método");
  const secondName = secondPage.getByLabel("Nome do método");
  await Promise.all([expect(firstName).toBeVisible(), expect(secondName).toBeVisible()]);
  await Promise.all([firstName.fill("Tema aba A"), secondName.fill("Tema aba B")]);
  await expect
    .poll(async () => {
      const message = "O Método mudou em outra aba. Recarregue antes de salvar suas alterações.";
      return (
        (await page.getByText(message).count()) + (await secondPage.getByText(message).count())
      );
    })
    .toBeGreaterThan(0);
  const channels = (await (await request.get("/api/channels")).json()) as Channel[];
  expect(["Tema aba A", "Tema aba B"]).toContain(
    channels.find((item) => item.id === channel.id)?.methods.theme.name,
  );
  await secondPage.close();
});

test("cria somente um projeto em clique duplo e não fecha o formulário em falha de gravação", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  await page.goto(`/channel/${channel.id}`);
  await page.getByRole("button", { name: "Novo projeto", exact: true }).first().click();
  await page.getByLabel("Título *", { exact: true }).fill("Projeto único");
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({ status: 503, json: { error: "Falha simulada de gravação" } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Criar projeto", exact: true }).click();
  await expect(page.getByText("Projeto não criado", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Título *", { exact: true })).toHaveValue("Projeto único");
  await page.unroute("**/api/projects");
  await page.getByRole("button", { name: "Criar projeto", exact: true }).dblclick();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const projects = (await (await request.get("/api/projects")).json()) as Project[];
  expect(
    projects.filter((item) => item.channelId === channel.id && item.title === "Projeto único"),
  ).toHaveLength(1);
});

test("expõe e persiste o contrato ambíguo do plugin no editor do Método", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  expect(
    (
      await request.put("/api/plugins/com.contentflow.e2e-contract/consent", {
        data: { enabled: true },
      })
    ).ok(),
  ).toBeTruthy();
  const block = {
    id: "claude-sequence",
    type: "CRIAR",
    operator: "IA",
    name: "Roteiro em sequência",
    instructions: "Escreva o roteiro.",
    inputs: [
      {
        id: "prompts",
        label: "Prompts",
        type: "list",
        source: "static",
        staticValue: "Primeiro\nSegundo",
      },
      {
        id: "sections",
        label: "Quantidade",
        type: "number",
        source: "static",
        staticValue: "2",
      },
    ],
    outputs: [
      {
        id: "script",
        key: "script",
        label: "Roteiro",
        type: "textarea",
        required: true,
      },
    ],
    parameters: [],
    order: 0,
    plugin: {
      pluginId: "com.contentflow.e2e-contract",
      capabilityId: "generate",
      configuration: {},
    },
  };
  expect(
    (
      await request.put(`/api/channels/${channel.id}/methods/script`, {
        data: { name: "Roteiro", blocks: [block] },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto(`/channel/${channel.id}/methods?process=script`);
  await page.getByRole("button", { name: /01 Criar Roteiro em sequência/ }).click();
  await expect(page.getByText("Requer ajustes", { exact: true })).toBeVisible();
  await page.getByText("Plugin executor", { exact: true }).click();
  await expect(page.getByText("Parâmetros do prompt (0)", { exact: true })).toBeVisible();
  await page.getByText("Dados usados pelo plugin", { exact: true }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").nth(2).click();
  await page.getByRole("option", { name: "Outline / estrutura", exact: true }).click();
  await dialog.getByRole("combobox").nth(3).click();
  await page.getByRole("option", { name: "Quantidade de blocos", exact: true }).click();

  await expect(page.getByText("Pronto para executar", { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const channels = (await (await request.get("/api/channels")).json()) as Channel[];
      const saved = channels.find((item) => item.id === channel.id)?.methods.script.blocks[0];
      return saved?.inputs?.map((input) => input.portKey);
    })
    .toEqual(["outline", "sections"]);
});

test("lista o plugin do processo antes de o contrato do bloco estar compatível", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  expect(
    (
      await request.put("/api/plugins/com.contentflow.e2e-contract/consent", {
        data: { enabled: true },
      })
    ).ok(),
  ).toBeTruthy();
  const block = {
    id: "incompatible-output",
    type: "CRIAR",
    operator: "IA",
    name: "Imagem ainda sem contrato",
    instructions: "Crie uma imagem.",
    inputs: [],
    outputs: [
      {
        id: "image",
        key: "image",
        label: "Imagem",
        type: "image",
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
  expect(
    (
      await request.put(`/api/channels/${channel.id}/methods/script`, {
        data: { name: "Roteiro", blocks: [block] },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto(`/channel/${channel.id}/methods?process=script`);
  await page.getByRole("button", { name: /01 Criar Imagem ainda sem contrato/ }).click();
  const pluginDetails = page.locator("details").filter({ hasText: "Plugin executor" });
  await pluginDetails.evaluate((element: HTMLDetailsElement) => {
    element.open = true;
  });
  await pluginDetails.getByRole("combobox").click();
  await expect(
    page.getByRole("option", { name: "Plugin de Contrato E2E · Resultado", exact: true }),
  ).toBeVisible();
});

test("cria uma coleção estratégica com o campo de nome focável e clicável", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  await page.goto(`/channel/${channel.id}/library`);
  await page.getByRole("button", { name: "Adicionar coleção", exact: true }).first().click();

  const name = page.getByLabel("Nome da coleção", { exact: true });
  await expect(name).toBeFocused();
  await expect(name).toBeEditable();
  await name.click();
  await name.fill("Estruturas E2E");
  await page.getByPlaceholder("Nome do campo 1", { exact: true }).fill("Estrutura");
  await page.getByRole("button", { name: "Criar coleção", exact: true }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Estruturas E2E", { exact: true })).toBeVisible();
});

test("canal preserva somente o código regional escolhido no campo de idioma", async ({
  page,
  request,
}) => {
  const original = (await (await request.get("/api/preferences")).json()) as Record<
    string,
    unknown
  >;
  const channelName = `Canal regional ${randomUUID().slice(0, 6)}`;
  const existingChannel = await seed(request);

  try {
    await request.put("/api/preferences", { data: { ...original, language: "pt-BR" } });
    await page.goto("/dashboard");
    await expect(page.getByText(existingChannel.name, { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Novo canal", exact: true }).click();
    await page.getByLabel("Nome do canal *", { exact: true }).fill(channelName);
    await page.getByLabel("Idioma", { exact: true }).click();
    await page.getByRole("option", { name: /inglês.*EN-AU/i }).click();
    await page.getByRole("button", { name: "Criar canal", exact: true }).click();

    const channels = (await (await request.get("/api/channels")).json()) as Channel[];
    expect(channels.find((channel) => channel.name === channelName)?.language).toBe("EN-AU");
  } finally {
    await request.put("/api/preferences", { data: original });
  }
});

test("centraliza perfis no plugin e deixa o Método apenas selecionar perfis existentes", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  const pluginId = "com.contentflow.e2e-profile";
  expect(
    (
      await request.put(`/api/plugins/${encodeURIComponent(pluginId)}/consent`, {
        data: { enabled: true },
      })
    ).ok(),
  ).toBeTruthy();
  const block = {
    id: "managed-profile-block",
    type: "CRIAR",
    operator: "IA",
    name: "Criar título com perfil",
    instructions: "Crie um título.",
    inputs: [],
    outputs: [
      {
        id: "managed-profile-result",
        key: "result",
        label: "Resultado",
        type: "text",
        required: true,
      },
    ],
    parameters: [],
    order: 0,
    plugin: {
      pluginId,
      capabilityId: "generate",
      configuration: {
        accountProfile: "principal-legado",
        fallbackAccountProfiles: "reserva-legado",
      },
    },
  };
  expect(
    (
      await request.put(`/api/channels/${channel.id}/methods/title`, {
        data: { name: "Títulos com perfil", blocks: [block] },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto("/plugins");
  await page.getByRole("button", { name: "Abrir detalhes de Plugin de Perfis E2E" }).click();
  await page.getByText("Perfis e contas", { exact: true }).click();
  await expect(page.getByText("principal-legado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("reserva-legado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Principal em 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Fallback em 1", { exact: true })).toBeVisible();

  await page.getByPlaceholder("Nome do novo perfil").fill("Perfil novo com acento");
  await page.getByRole("button", { name: "Adicionar perfil", exact: true }).click();
  await expect(page.getByText("Perfil novo com acento", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto(`/channel/${channel.id}/methods?process=title`);
  await page.getByText("Criar título com perfil", { exact: true }).first().click();
  await page.getByText("Plugin executor", { exact: true }).click();
  const profileSection = page.locator("section").filter({
    hasText: "Selecione um perfil já cadastrado",
  });
  await expect(profileSection).toBeVisible();
  await expect(profileSection.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preparar perfil" })).toHaveCount(0);
  await profileSection.getByRole("combobox").click();
  await page.getByRole("option", { name: "Perfil novo com acento", exact: true }).click();
  await profileSection.getByLabel("principal-legado", { exact: true }).check();

  await expect
    .poll(async () => {
      const channels = (await (await request.get("/api/channels")).json()) as Channel[];
      const saved = channels.find((candidate) => candidate.id === channel.id);
      return saved?.methods.title.blocks[0]?.plugin?.configuration;
    })
    .toEqual({
      accountProfile: "Perfil-novo-com-acento",
      fallbackAccountProfiles: "reserva-legado\nprincipal-legado",
    });
});

test("editor mantém entradas e variáveis do prompt sincronizadas", async ({ page, request }) => {
  const channel = await seed(request);
  const block = {
    id: "linked-prompt-input",
    type: "CRIAR",
    operator: "IA",
    name: "Criar com contexto",
    instructions: "Use {{inputs.tema_do_video}}.",
    inputs: [
      {
        id: "linked-theme",
        label: "Tema anterior",
        type: "textarea",
        source: "previous_process",
        sourceProcessType: "theme",
        blockId: "__process_output__",
        sourceKey: "theme",
      },
    ],
    outputs: [
      {
        id: "linked-result",
        key: "result",
        label: "Resultado",
        type: "textarea",
        required: true,
      },
    ],
    parameters: [],
  };
  const methodResponse = await request.put(`/api/channels/${channel.id}/methods/title`, {
    data: { blocks: [block] },
  });
  expect(methodResponse.ok(), await methodResponse.text()).toBeTruthy();

  await page.goto(`/channel/${channel.id}/methods?process=title`);
  await page.getByText("Criar com contexto", { exact: true }).first().click();
  await page.getByRole("button", { name: "Inserir variável", exact: true }).click();
  const variableMenu = page.getByRole("menu", { name: "Inserir variável", exact: true });
  await expect(variableMenu).toBeVisible();
  const layerOrder = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    return {
      menu: Number.parseInt(getComputedStyle(menu!).zIndex, 10),
      dialog: Number.parseInt(getComputedStyle(dialog!).zIndex, 10),
    };
  });
  expect(layerOrder.menu).toBeGreaterThan(layerOrder.dialog);
  await page.keyboard.press("Escape");
  const prompt = page.locator("textarea").first();
  await prompt.fill("Use apenas o contexto.");
  await prompt.blur();
  await expect(page.getByText(/Este bloco não precisa de uma entrada específica/i)).toBeVisible();

  await page.getByRole("button", { name: "Adicionar entrada", exact: true }).last().click();
  await expect(page.locator("textarea").first()).toHaveValue(
    "Use apenas o contexto. {{inputs.nova_entrada_1}}",
  );
  await page.locator("button[aria-expanded]").filter({ hasText: "Nova entrada 1" }).click();
  await page.getByPlaceholder("Nome da entrada", { exact: true }).fill("Briefing");
  await expect(page.locator("textarea").first()).toHaveValue(
    "Use apenas o contexto. {{inputs.briefing}}",
  );
  await page.getByRole("button", { name: "Remover entrada Briefing", exact: true }).click();
  await expect(page.locator("textarea").first()).toHaveValue("Use apenas o contexto.");
});

test("editor expõe um campo da coleção como saída do bloco Escolher", async ({ page, request }) => {
  const channel = await seed(request);
  const collection: StrategicCollection = {
    id: randomUUID(),
    channelId: channel.id,
    name: "Layouts E2E",
    fields: [
      { id: "layout-name", label: "Nome do layout", type: "text", required: true },
      { id: "layout-field", label: "Layout", type: "thumbnail_layout", required: true },
    ],
    createdAt: new Date().toISOString(),
  };
  expect((await request.post("/api/library/collections", { data: collection })).ok()).toBeTruthy();

  const chooseBlock = {
    id: "choose-thumbnail-layout",
    type: "ESCOLHER",
    operator: "Humano",
    name: "Escolher layout",
    instructions: "",
    inputs: [],
    outputs: [],
    parameters: [],
    order: 0,
    collectionId: collection.id,
  };
  const createBlock = {
    id: "create-thumbnail-from-layout",
    type: "CRIAR",
    operator: "Humano",
    name: "Criar thumbnail do layout",
    instructions: "Use {{inputs.layout_escolhido}}.",
    inputs: [
      {
        id: "chosen-layout",
        label: "layout escolhido",
        type: "thumbnail_layout",
        source: "previous_block",
        blockId: chooseBlock.id,
        sourceKey: "layout-field",
      },
    ],
    outputs: [
      {
        id: "thumbnail-output",
        key: "thumbnail",
        label: "Thumbnail",
        type: "image",
        required: true,
      },
    ],
    parameters: [],
    order: 1,
  };
  expect(
    (
      await request.put(`/api/channels/${channel.id}/methods/thumbnail`, {
        data: { name: "Thumbnail com layout", blocks: [chooseBlock, createBlock] },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto(`/channel/${channel.id}/methods?process=thumbnail`);
  await page.getByText("Criar thumbnail do layout", { exact: true }).first().click();
  await page.locator("button[aria-expanded]").filter({ hasText: "layout escolhido" }).click();

  const sourceField = page.getByText("Saída do bloco", { exact: true }).locator("xpath=..");
  await expect(sourceField.getByRole("combobox")).toContainText("Layout");

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByText("Escolher layout", { exact: true }).first().click();
  await expect(page.getByText("Coleção estratégica", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Considerar escolhas anteriores/)).toBeVisible();
  await expect(page.getByText("Item escolhido", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Resultado desta ação", { exact: true })).toHaveCount(0);
});

test("editor destaca o tipo do bloco junto ao ícone na visão geral", async ({ page, request }) => {
  const channel = await seed(request);
  await page.goto(`/channel/${channel.id}/methods?process=theme`);

  const card = page.locator("article > button").filter({ hasText: "Entrega theme" });
  const type = card.getByText("Criar", { exact: true });
  const title = card.getByText("Entrega theme", { exact: true });

  await expect(type).toHaveClass(/text-brand/);
  const icon = type.locator("xpath=..").locator("svg");
  await expect(icon).toHaveClass(/text-brand/);
  const typeBox = await type.boundingBox();
  const titleBox = await title.boundingBox();
  expect(typeBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(typeBox!.x).toBeLessThan(titleBox!.x);
});

test("editor reúne a configuração e expande entradas e entregas individualmente", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  await page.goto(`/channel/${channel.id}/methods?process=theme`);
  await page.getByText("Entrega theme", { exact: true }).first().click();

  const actionName = page.getByLabel("Nome da ação", { exact: true });
  await expect(actionName).toHaveValue("Entrega theme");
  await expect(page.getByPlaceholder(/Ex: Criar referências/)).toHaveCount(0);
  await actionName.fill("Entrega theme renomeada");
  await actionName.blur();
  await expect
    .poll(async () => {
      const channels = (await (await request.get("/api/channels")).json()) as Channel[];
      return channels.find((candidate) => candidate.id === channel.id)?.methods.theme.blocks[0]
        ?.name;
    })
    .toBe("Entrega theme renomeada");
  await expect(page.getByText("Operador responsável", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /O que faz Ação e instrução/ })).toHaveCount(0);
  await expect(
    page.getByText("Este bloco não precisa de uma entrada específica para começar.", {
      exact: true,
    }),
  ).toBeVisible();

  const output = page.locator("button[aria-expanded]").filter({ hasText: "Resultado theme" });
  await expect(output).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByPlaceholder("Nome da entrega", { exact: true })).toHaveCount(0);
  await output.click();
  await expect(output).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByPlaceholder("Nome da entrega", { exact: true })).toBeVisible();
});

test("validação resume contextos extensos e permite expandir cada entrega", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  const longContext = `Início do contexto para revisão. ${"Detalhe relevante. ".repeat(30)}Final exclusivo.`;
  expect(
    (
      await request.put(`/api/channels/${channel.id}/methods/theme`, {
        data: {
          blocks: [
            {
              id: "create-long-context",
              type: "CRIAR",
              operator: "Humano",
              name: "Produzir contexto longo",
              instructions: "Registre o material para revisão.",
              inputs: [],
              outputs: [
                {
                  id: "long-context-output",
                  key: "long_context",
                  label: "Contexto extenso",
                  type: "textarea",
                  required: true,
                },
              ],
              parameters: [],
              order: 0,
            },
            {
              id: "validate-long-context",
              type: "VALIDAR",
              operator: "Humano",
              name: "Validar contexto",
              instructions: "Revise o material produzido.",
              inputs: [],
              outputs: [
                {
                  id: "validation-decision",
                  key: "decision",
                  label: "Decisão",
                  type: "approval",
                  required: true,
                },
                {
                  id: "validation-feedback",
                  key: "feedback",
                  label: "Observações",
                  type: "textarea",
                  required: false,
                },
              ],
              validation: {
                mode: "approval",
                onReject: "retry_target",
                targetBlockId: "create-long-context",
                maxAttempts: 3,
                retryMode: "full",
              },
              parameters: [],
              order: 1,
            },
          ],
        },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto(`/channel/${channel.id}`);
  await page.getByRole("button", { name: "Novo projeto", exact: true }).first().click();
  await page.getByLabel("Título *", { exact: true }).fill("Validação compacta");
  await page.getByRole("button", { name: "Criar projeto", exact: true }).click();
  const projects = (await (await request.get("/api/projects")).json()) as Project[];
  const project = projects.find(
    (item) => item.channelId === channel.id && item.title === "Validação compacta",
  )!;

  await page.goto(`/project/${project.id}/theme`);
  await page.getByRole("button", { name: "Executar processo", exact: true }).click();
  await page.getByLabel("Contexto extenso").fill(longContext);
  await page.getByRole("button", { name: "Concluir ação humana", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Contexto disponível" })).toBeVisible();
  const contextItem = page.getByTestId("context-value").filter({ hasText: "Contexto extenso" });
  await expect(contextItem).not.toHaveAttribute("open", "");
  await expect(contextItem.getByText(/Final exclusivo\./)).not.toBeVisible();
  await expect(contextItem).toContainText("Início do contexto para revisão.");
  await contextItem.locator("summary").click();
  await expect(contextItem).toHaveAttribute("open", "");
  await expect(contextItem.getByText(/Final exclusivo\./)).toBeVisible();
  await expect(contextItem.getByTestId("output-character-count")).toHaveText(
    String(Array.from(longContext).length),
  );
});

test("rascunho sobrevive ao reload e a produção avança até thumbnail fora da tela", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  await page.goto(`/channel/${channel.id}`);
  await page.getByRole("button", { name: "Novo projeto", exact: true }).first().click();
  await page.getByLabel("Título *", { exact: true }).fill("Produção ponta a ponta");
  await page.getByRole("button", { name: "Criar projeto", exact: true }).click();
  const project = await expect
    .poll(async () => {
      const projects = (await (await request.get("/api/projects")).json()) as Project[];
      return projects.find((item) => item.channelId === channel.id)?.id;
    })
    .toBeTruthy();
  void project;
  const projects = (await (await request.get("/api/projects")).json()) as Project[];
  const id = projects.find((item) => item.channelId === channel.id)!.id;
  await page.goto(`/project/${id}/theme`);
  await page.getByRole("button", { name: "Executar processo", exact: true }).dblclick();
  await expect(page.getByTestId("output-character-count")).toHaveText("0");
  await page.getByLabel("Resultado theme").fill("Tema preservado após recarregar");
  await expect(page.getByTestId("output-character-count")).toHaveText("31");
  await expect
    .poll(async () => {
      const state = await (await request.get("/api/state")).json();
      return state.executions.find((item: { projectId: string }) => item.projectId === id)
        ?.blocks[0].values.theme;
    })
    .toBe("Tema preservado após recarregar");
  await page.reload();
  await expect(page.getByLabel("Resultado theme")).toHaveValue("Tema preservado após recarregar");
  await page.getByRole("button", { name: "Concluir ação humana", exact: true }).click();
  await page.locator('a[href="/dashboard"]').first().click();
  await expect
    .poll(async () => {
      const state = await (await request.get("/api/state")).json();
      return state.executions.find(
        (item: { projectId: string; processType: string }) =>
          item.projectId === id && item.processType === "title",
      )?.status;
    })
    .toBe("awaiting_human");
  await page.goto(`/project/${id}/title`);
  const titleResult = page.getByLabel("Resultado title");
  const titleCharacterCount = titleResult.locator("..").getByTestId("output-character-count");
  await expect(titleCharacterCount).toHaveText("0");
  await titleResult.fill("Título concluído");
  await expect(titleCharacterCount).toHaveText("16");
  await page.getByRole("button", { name: "Concluir ação humana", exact: true }).click();
  await expect
    .poll(async () => {
      const projects = (await (await request.get("/api/projects")).json()) as Project[];
      return projects.find((item) => item.id === id)?.title;
    })
    .toBe("Título concluído");
  await expect(page).toHaveURL(new RegExp(`/project/${id}/thumbnail`));
  await page.locator('input[type="file"]').setInputFiles({
    name: "thumbnail-fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByText("thumbnail-fixture.png", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Concluir ação humana", exact: true }).click();
  await expect
    .poll(async () => {
      const state = await (await request.get("/api/state")).json();
      return state.executions.find(
        (item: { projectId: string; processType: string }) =>
          item.projectId === id && item.processType === "thumbnail",
      )?.status;
    })
    .toBe("completed");
  const state = await (await request.get("/api/state")).json();
  const thumbnail = state.executions.find(
    (item: { projectId: string; processType: string }) =>
      item.projectId === id && item.processType === "thumbnail",
  ).output.values.thumbnail;
  expect((await request.get(thumbnail.url)).ok()).toBeTruthy();
  // Sem Método seguinte, a conclusão deve permanecer visível, sem levar a uma tela de erro.
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(new RegExp(`/project/${id}/thumbnail$`));
  await expect(
    page.getByRole("heading", { name: "Thumbnail concluído", exact: true }),
  ).toBeVisible();
  await page.goto(`/project/${id}/thumbnail`);
  await expect(page.getByRole("button", { name: "Executar novamente", exact: true })).toBeVisible();
  const intermediateResult = page.locator("details").filter({ hasText: "Entrega thumbnail" });
  await expect(intermediateResult).not.toHaveAttribute("open", "");
  await expect(
    intermediateResult.getByText("thumbnail-fixture.png", { exact: true }),
  ).not.toBeVisible();
  await expect(page.getByText("thumbnail-fixture.png", { exact: true }).last()).toBeVisible();
  await intermediateResult.locator("summary").click();
  await expect(
    intermediateResult.getByText("thumbnail-fixture.png", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Produtos do projeto", { exact: true })).toHaveCount(0);
  await page.goto(`/project/${id}/theme`);
  await expect(page.getByTestId("output-character-count").first()).toHaveText("31");
  await page.goto(`/project/${id}/title`);
  const titleIntermediateResult = page.locator("details").filter({ hasText: "Entrega title" });
  await titleIntermediateResult.locator("summary").click();
  await expect(titleIntermediateResult.getByTestId("output-character-count")).toHaveText("16");
  await page.goto(`/channel/${channel.id}`);
  const projectThumbnail = page.getByRole("img", {
    name: "Thumbnail do projeto Título concluído",
    exact: true,
  });
  await expect(projectThumbnail).toBeVisible();
  await expect(projectThumbnail).toHaveAttribute("src", thumbnail.url);
});

test("edita uma entrega concluída e atualiza a saída oficial do processo", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  await page.goto(`/channel/${channel.id}`);
  await page.getByRole("button", { name: "Novo projeto", exact: true }).first().click();
  await page.getByLabel("Título *", { exact: true }).fill("Edição de entrega");
  await page.getByRole("button", { name: "Criar projeto", exact: true }).click();
  const projects = (await (await request.get("/api/projects")).json()) as Project[];
  const project = projects.find(
    (item) => item.channelId === channel.id && item.title === "Edição de entrega",
  )!;

  await page.goto(`/project/${project.id}/theme`);
  await page.getByRole("button", { name: "Executar processo", exact: true }).click();
  await page.getByLabel("Resultado theme").fill("Aqui vai a sua resposta: tema original");
  await page.getByRole("button", { name: "Concluir ação humana", exact: true }).click();
  await page.goto(`/project/${project.id}/theme`);

  const result = page.locator("details").filter({ hasText: "Entrega theme" });
  await result.locator("summary").click();
  await result.getByRole("button", { name: "Editar entrega", exact: true }).click();
  await result.getByLabel("Resultado theme").fill("Tema corrigido manualmente");
  await result.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByText("Entrega atualizada", { exact: true })).toBeVisible();

  await expect
    .poll(async () => {
      const state = await (await request.get("/api/state")).json();
      const execution = state.executions.find(
        (item: { projectId: string; processType: string }) =>
          item.projectId === project.id && item.processType === "theme",
      );
      return {
        block: execution?.blocks[0]?.values?.theme,
        output: execution?.output?.values?.theme,
      };
    })
    .toEqual({
      block: "Tema corrigido manualmente",
      output: "Tema corrigido manualmente",
    });
});

test("persiste e exibe o snapshot do plugin antes da resposta final", async ({ request }) => {
  const channel = await seed(request);
  expect(
    (
      await request.put("/api/plugins/com.contentflow.e2e-contract/consent", {
        data: { enabled: true },
      })
    ).ok(),
  ).toBeTruthy();
  const block = {
    id: "incremental-plugin",
    type: "CRIAR",
    operator: "IA",
    name: "Resposta incremental",
    instructions: "Responda.",
    inputs: [],
    outputs: [
      {
        id: "script",
        key: "script",
        label: "Resultado",
        type: "textarea",
        required: true,
        portKey: "result",
      },
    ],
    parameters: [],
    order: 0,
    plugin: {
      pluginId: "com.contentflow.e2e-contract",
      capabilityId: "generate",
      configuration: {},
    },
  };
  expect(
    (
      await request.put(`/api/channels/${channel.id}/methods/script`, {
        data: { name: "Roteiro incremental", blocks: [block] },
      })
    ).ok(),
  ).toBeTruthy();
  const projectId = randomUUID();
  expect(
    (
      await request.post("/api/projects", {
        data: {
          id: projectId,
          channelId: channel.id,
          title: "Plugin incremental",
          createdAt: new Date().toISOString(),
          stages: Object.fromEntries(PROCESS_ORDER.map((process) => [process, "not_started"])),
          currentStage: "script",
          state: "not_started",
          progress: 0,
        },
      })
    ).ok(),
  ).toBeTruthy();
  const started = await (
    await request.post("/api/commands", {
      data: {
        id: randomUUID(),
        action: "start",
        projectId,
        processType: "script",
      },
    })
  ).json();
  let observedPartial = false;
  await expect
    .poll(async () => {
      const state = await (await request.get(`/api/executions/${started.result.id}/state`)).json();
      if (
        state.execution.blocks[0].status === "in_progress" &&
        state.execution.blocks[0].values.script === "resultado parcial"
      ) {
        observedPartial = true;
      }
      return {
        observedPartial,
        status: state.execution.status,
        result: state.execution.blocks[0].values.script,
        error: state.execution.error,
      };
    })
    .toEqual({
      observedPartial: true,
      status: "completed",
      result: "resultado final",
      error: undefined,
    });
});

test("edita texto e substitui mídia de um item sem alterar identidade ou posição", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  const textBlock = {
    id: "item-text-block",
    type: "CRIAR" as const,
    operator: "Humano" as const,
    name: "Blocos de roteiro",
    instructions: "",
    inputs: [],
    outputs: [
      {
        id: "parts",
        key: "parts",
        label: "Blocos",
        type: "list" as const,
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
  const mediaBlock = {
    id: "item-media-block",
    type: "CRIAR" as const,
    operator: "Humano" as const,
    name: "Assets visuais",
    instructions: "",
    inputs: [],
    outputs: [
      {
        id: "files",
        key: "files",
        label: "Arquivos",
        type: "files" as const,
        required: true,
      },
    ],
    parameters: [],
    order: 1,
  };
  expect(
    (
      await request.put(`/api/channels/${channel.id}/methods/script`, {
        data: { name: "Itens temporários", blocks: [textBlock, mediaBlock] },
      })
    ).ok(),
  ).toBeTruthy();

  const projectId = randomUUID();
  expect(
    (
      await request.post("/api/projects", {
        data: {
          id: projectId,
          channelId: channel.id,
          title: "Itens editáveis",
          createdAt: new Date().toISOString(),
          stages: Object.fromEntries(PROCESS_ORDER.map((process) => [process, "not_started"])),
          currentStage: "script",
          state: "not_started",
          progress: 0,
        },
      })
    ).ok(),
  ).toBeTruthy();
  const started = await (
    await request.post("/api/commands", {
      data: { id: randomUUID(), action: "start", projectId, processType: "script" },
    })
  ).json();
  const execution = started.result as ProcessExecution;
  const originalMedia: StoredFile[] = [
    {
      id: "generated-a",
      name: "generated-a.png",
      mimeType: "image/png",
      size: 10,
      url: "/api/files/generated-a.png",
    },
    {
      id: "generated-b",
      name: "generated-b.png",
      mimeType: "image/png",
      size: 10,
      url: "/api/files/generated-b.png",
    },
  ];
  const now = new Date().toISOString();
  execution.status = "failed";
  execution.error = "Falha simulada depois de materializar os itens.";
  execution.updatedAt = now;
  execution.blocks = [
    {
      blockId: textBlock.id,
      status: "failed",
      values: { parts: ["Parte A", "Parte B"] },
      attempt: 1,
      itemProgress: { total: 2, completed: 2, pending: 0 },
      items: [
        {
          id: "text-item-a",
          order: 0,
          input: "Prompt A",
          status: "completed",
          attempt: 1,
          output: "Parte A",
          attempts: [{ attempt: 1, status: "completed", input: "Prompt A", output: "Parte A" }],
        },
        {
          id: "text-item-b",
          order: 1,
          input: "Prompt B",
          status: "completed",
          attempt: 1,
          output: "Parte B",
          attempts: [{ attempt: 1, status: "completed", input: "Prompt B", output: "Parte B" }],
        },
      ],
      error: execution.error,
    },
    {
      blockId: mediaBlock.id,
      status: "failed",
      values: { files: originalMedia },
      attempt: 1,
      itemProgress: { total: 2, completed: 2, pending: 0 },
      items: originalMedia.map((file, order) => ({
        id: `media-item-${order + 1}`,
        order,
        input: `Prompt visual ${order + 1}`,
        status: "completed" as const,
        attempt: 1,
        output: file,
        attempts: [
          {
            attempt: 1,
            status: "completed" as const,
            input: `Prompt visual ${order + 1}`,
            output: file,
          },
        ],
      })),
      error: execution.error,
    },
  ];
  const saved = await request.put(`/api/executions/${execution.id}`, { data: execution });
  expect(saved.ok()).toBeTruthy();
  const savedExecution = (await saved.json()) as ProcessExecution;

  const textEdit = await request.patch(
    `/api/executions/${execution.id}/blocks/${textBlock.id}/items/text-item-a`,
    {
      data: { revision: savedExecution.revision, output: "Parte A corrigida manualmente" },
    },
  );
  expect(textEdit.ok()).toBeTruthy();
  const afterText = (await textEdit.json()).execution as ProcessExecution;
  expect(afterText.blocks[0].items?.[0]).toMatchObject({
    id: "text-item-a",
    order: 0,
    output: "Parte A corrigida manualmente",
  });
  expect(afterText.blocks[0].values.parts).toEqual(["Parte A corrigida manualmente", "Parte B"]);

  const upload = await request.post("/api/uploads", {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent("manual.png"),
      "X-File-Type": "image/png",
    },
    data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  expect(upload.ok()).toBeTruthy();
  const manualMedia = (await upload.json()) as StoredFile;
  const mediaEdit = await request.patch(
    `/api/executions/${execution.id}/blocks/${mediaBlock.id}/items/media-item-2`,
    {
      data: { revision: afterText.revision, output: manualMedia },
    },
  );
  expect(mediaEdit.ok()).toBeTruthy();
  const afterMedia = (await mediaEdit.json()).execution as ProcessExecution;
  expect(afterMedia.blocks[1].items?.[1]).toMatchObject({
    id: "media-item-2",
    order: 1,
  });
  expect((afterMedia.blocks[1].values.files as StoredFile[])[1].id).toBe(manualMedia.id);

  await page.goto(`/project/${projectId}/script`);
  await expect(page.getByText("Itens da execução", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Editar item", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Substituir arquivo", exact: true }).first(),
  ).toBeVisible();
});

test("salva separadamente som e notificações do Windows", async ({ page, request }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Carregando seus canais...", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Preferências", exact: true }).click();
  await page.getByRole("checkbox", { name: "Som de alerta", exact: true }).check();
  await page.getByRole("checkbox", { name: "Notificações do Windows", exact: true }).check();

  await expect
    .poll(async () => (await (await request.get("/api/preferences")).json()).notificationSound)
    .toBe(true);
  await expect
    .poll(async () => (await (await request.get("/api/preferences")).json()).systemNotifications)
    .toBe(true);

  await page.reload();
  await expect(page.getByText("Carregando seus canais...", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Preferências", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Som de alerta", exact: true })).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Notificações do Windows", exact: true }),
  ).toBeChecked();

  expect(
    (
      await request.put("/api/preferences", {
        data: {
          theme: "dark",
          language: "pt-BR",
          notificationSound: false,
          systemNotifications: false,
        },
      })
    ).ok(),
  ).toBeTruthy();
});

test("persiste a visualização escolhida na Biblioteca de Métodos", async ({ page, request }) => {
  const preferences = await (await request.get("/api/preferences")).json();
  expect(
    (
      await request.put("/api/preferences", {
        data: { ...preferences, methodsLibraryView: "methods" },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto("/methods");
  await expect(page.getByRole("button", { name: "Métodos", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Canais", exact: true }).click();
  await expect
    .poll(async () => (await (await request.get("/api/preferences")).json()).methodsLibraryView)
    .toBe("channels");

  await page.reload();
  await expect(page.getByRole("button", { name: "Canais", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Métodos", exact: true }).click();
  await expect
    .poll(async () => (await (await request.get("/api/preferences")).json()).methodsLibraryView)
    .toBe("methods");
});

test("carrega um projeto sem mostrar inexistência enquanto aguarda o banco", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  const id = randomUUID();
  expect(
    (
      await request.post("/api/projects", {
        data: {
          id,
          channelId: channel.id,
          title: "Carregamento normal",
          createdAt: new Date().toISOString(),
          stages: Object.fromEntries(PROCESS_ORDER.map((process) => [process, "not_started"])),
          currentStage: "theme",
          state: "not_started",
          progress: 0,
        },
      })
    ).ok(),
  ).toBeTruthy();
  let releaseState!: () => void;
  const stateReady = new Promise<void>((resolve) => {
    releaseState = resolve;
  });
  await page.route("**/api/state*", async (route) => {
    await stateReady;
    await route.continue();
  });
  await page.goto(`/project/${id}/theme`);
  try {
    await expect(page.getByRole("status")).toHaveText("Carregando projeto…");
    await expect(
      page.getByRole("heading", { name: "Projeto não encontrado", exact: true }),
    ).toHaveCount(0);
  } finally {
    releaseState();
  }
  await expect(
    page.getByRole("heading", { name: "Carregamento normal", exact: true }),
  ).toBeVisible();
});

test("comandos repetidos são idempotentes e um rascunho atrasado não reabre execução cancelada", async ({
  request,
}) => {
  const channel = await seed(request);
  const id = randomUUID();
  const now = new Date().toISOString();
  expect(
    (
      await request.post("/api/projects", {
        data: {
          id,
          channelId: channel.id,
          title: "Cancelamento",
          createdAt: now,
          stages: Object.fromEntries(PROCESS_ORDER.map((process) => [process, "not_started"])),
          currentStage: "theme",
          state: "not_started",
          progress: 0,
        },
      })
    ).ok(),
  ).toBeTruthy();
  const start = { id: randomUUID(), action: "start", projectId: id, processType: "theme" };
  const first = await (await request.post("/api/commands", { data: start })).json();
  const second = await (await request.post("/api/commands", { data: start })).json();
  expect(second.result.id).toBe(first.result.id);
  expect((await request.post(`/api/executions/${first.result.id}/cancel`)).ok()).toBeTruthy();
  const delayed = await (
    await request.post("/api/commands", {
      data: {
        id: randomUUID(),
        action: "draft",
        executionId: first.result.id,
        blockId: "shared-theme",
        attempt: 1,
        values: { theme: "rascunho atrasado" },
      },
    })
  ).json();
  expect(delayed.result).toBe(false);
  expect(
    delayed.state.executions.find((item: { id: string }) => item.id === first.result.id).status,
  ).toBe("cancelled");
});

test("salva o Método mesmo saindo imediatamente do editor e preserva o snapshot já iniciado", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  const projectId = randomUUID();
  await request.post("/api/projects", {
    data: {
      id: projectId,
      channelId: channel.id,
      title: "Snapshot imutável",
      createdAt: new Date().toISOString(),
      stages: Object.fromEntries(PROCESS_ORDER.map((id) => [id, "not_started"])),
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
  await page.goto(`/channel/${channel.id}/methods?process=theme`);
  await page.getByText("Entrega theme", { exact: true }).click();
  await page.getByLabel("Nome da ação", { exact: true }).fill("Alteração antes de sair");
  await page.keyboard.press("Escape");
  await page.locator('a[href="/dashboard"]').first().click();
  await expect
    .poll(async () => {
      const channels = (await (await request.get("/api/channels")).json()) as Channel[];
      return channels.find((item) => item.id === channel.id)?.methods.theme.blocks[0].name;
    })
    .toBe("Alteração antes de sair");
  const state = await (await request.get(`/api/executions/${started.result.id}/state`)).json();
  expect(state.execution.methodSnapshot.blocks[0].name).toBe("Entrega theme");
  await page.goto(`/channel/${channel.id}/methods?process=theme`);
  await expect(page.getByText("Alteração antes de sair", { exact: true })).toBeVisible();
});

test("Biblioteca alterna entre Métodos e Canais e persiste o nome personalizado", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  const customName = `Método da Comunidade ${channel.id.slice(0, 6)}`;
  const update = await request.put(`/api/channels/${channel.id}/methods/theme`, {
    data: { ...channel.methods.theme, name: customName },
  });
  expect(update.ok()).toBeTruthy();

  await page.goto("/methods");
  await expect(page.getByRole("heading", { name: customName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Canais", exact: true }).click();
  await expect(page.getByRole("heading", { name: channel.name, exact: true })).toBeVisible();

  await page.goto(`/channel/${channel.id}/methods?process=theme`);
  const name = page.getByLabel("Nome do método", { exact: true });
  await expect(name).toHaveValue(customName);
  const renamed = `${customName} — Adaptado`;
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/channels/${channel.id}/methods/theme`) &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await name.fill(renamed);
  await saved;
  await page.reload();
  await expect(page.getByLabel("Nome do método", { exact: true })).toHaveValue(renamed);
});

test("interface nova de Métodos e Plugins acompanha inglês e espanhol sem traduzir dados do usuário", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  const original = (await (await request.get("/api/preferences")).json()) as Record<
    string,
    unknown
  >;

  try {
    await request.put("/api/preferences", { data: { ...original, language: "en" } });
    await page.goto("/methods");
    await expect(
      page.getByText("Use, share, and manage Methods saved in your channels", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("Search by name, Channel, process, or action...", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(channel.name, { exact: true }).first()).toBeVisible();

    await page.goto("/plugins");
    await expect(page.getByRole("button", { name: "Install plugin", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Search plugins by name...", { exact: true })).toBeVisible();

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "New channel", exact: true }).click();
    const englishLanguage = page.getByLabel("Language", { exact: true });
    await expect(englishLanguage).toContainText(/Portuguese.*PT-BR/i);
    await englishLanguage.click();
    await expect(page.getByRole("option")).toHaveCount(98);
    await expect(page.getByRole("option", { name: /English.*EN-US/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /Spanish.*ES-MX/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Close" }).click();

    await request.put("/api/preferences", { data: { ...original, language: "es" } });
    await page.goto("/methods");
    await expect(
      page.getByText("Usa, comparte y gestiona los Métodos guardados en tus canales", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("Buscar por nombre, Canal, proceso o acción...", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(channel.name, { exact: true }).first()).toBeVisible();

    await page.goto("/plugins");
    await expect(page.getByRole("button", { name: "Instalar plugin", exact: true })).toBeVisible();
    await expect(
      page.getByPlaceholder("Buscar plugins por nombre...", { exact: true }),
    ).toBeVisible();

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Nuevo canal", exact: true }).click();
    const spanishLanguage = page.getByLabel("Idioma", { exact: true });
    await expect(spanishLanguage).toContainText(/portugués.*PT-BR/i);
    await spanishLanguage.click();
    await expect(page.getByRole("option", { name: /inglés.*EN-AU/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /español.*ES-ES/i })).toBeVisible();
  } finally {
    await request.put("/api/preferences", { data: original });
  }
});

test("Free Stock permite conexões parciais, troca de chave e várias chaves do mesmo provedor", async ({
  page,
}) => {
  await page.goto("/plugins");
  await page
    .getByRole("button", { name: "Abrir detalhes de Free Stock Media Studio", exact: true })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Credenciais e conexões", { exact: true })).toBeVisible();
  await dialog.getByText("Adicionar conexão", { exact: true }).click();
  const createForm = dialog.locator("details").filter({ hasText: "Adicionar conexão" });
  await createForm.getByPlaceholder("Ex.: Pexels principal").fill("Pexels principal");
  await createForm.locator('input[type="password"]').first().fill("pexels-chave-1");
  const save = createForm.getByRole("button", { name: "Salvar no cofre local", exact: true });
  await expect(save).toBeEnabled();
  await save.click();

  await expect(dialog.getByText("Pexels principal", { exact: true })).toBeVisible();
  await expect(dialog.getByText("1 de 4 credenciais configuradas", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Editar", exact: true }).click();
  await dialog
    .getByPlaceholder("Nova chave (deixe vazio para manter)")
    .first()
    .fill("pexels-chave-2");
  await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(page.getByText("Conexão atualizada", { exact: true })).toBeVisible();

  await createForm.getByPlaceholder("Ex.: Pexels principal").fill("Pexels reserva");
  await createForm.locator('input[type="password"]').first().fill("pexels-chave-3");
  await save.click();
  await expect(dialog.getByText("Pexels reserva", { exact: true })).toBeVisible();
  await expect(dialog.getByText("2 conexões", { exact: true })).toBeVisible();
});
