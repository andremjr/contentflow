import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type Channel,
  type Project,
  type StrategicCollection,
} from "../../src/lib/domain";

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

test("testa um bloco com entradas temporárias sem criar execução ou histórico", async ({
  request,
}) => {
  const channel = await seed(request);
  const pluginId = "com.contentflow.kit-text-demo";
  expect(
    (
      await request.put(`/api/plugins/${encodeURIComponent(pluginId)}/consent`, {
        data: { enabled: true },
      })
    ).ok(),
  ).toBeTruthy();
  const before = (await (await request.get("/api/state")).json()) as {
    projects: unknown[];
    executions: unknown[];
  };
  const runId = randomUUID();
  const block = {
    id: "test-only-block",
    type: "CRIAR" as const,
    operator: "Código" as const,
    name: "Transformar tema",
    instructions: "Considere o prazo {{project.deadline}}.",
    inputs: [
      {
        id: "test-theme",
        label: "Tema anterior",
        type: "textarea" as const,
        source: "previous_process" as const,
        sourceProcessType: "theme" as const,
        sourceKey: "theme",
      },
    ],
    outputs: [
      {
        id: "test-result",
        key: "result",
        label: "Resultado",
        type: "textarea" as const,
        required: true,
      },
    ],
    parameters: [],
    order: 0,
    plugin: {
      pluginId,
      capabilityId: "demo",
      configuration: {},
    },
  };
  const result = await request.post("/api/method-block-tests", {
    data: {
      runId,
      channelId: channel.id,
      processType: "title",
      blockId: block.id,
      blocks: [block],
      inputValues: { "test-theme": "tema informado durante o teste" },
      projectTitle: "Projeto temporário",
      projectDeadline: "2026-09-30",
    },
  });
  const payload = await result.json();
  expect(result.ok(), JSON.stringify(payload)).toBeTruthy();
  expect(payload.values).toEqual({ result: "TEMA INFORMADO DURANTE O TESTE" });
  const after = (await (await request.get("/api/state")).json()) as {
    projects: unknown[];
    executions: unknown[];
  };
  expect(after.projects).toHaveLength(before.projects.length);
  expect(after.executions).toHaveLength(before.executions.length);
  expect((await request.delete(`/api/method-block-tests/${runId}`)).status()).toBe(204);
});

test("editor solicita entradas temporárias e visualiza o resultado do bloco", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  const pluginId = "com.contentflow.kit-text-demo";
  await request.put(`/api/plugins/${encodeURIComponent(pluginId)}/consent`, {
    data: { enabled: true },
  });
  const block = {
    id: "editor-test-block",
    type: "CRIAR",
    operator: "Código",
    name: "Transformar tema",
    instructions: "Considere o prazo {{project.deadline}}.",
    inputs: [
      {
        id: "editor-test-theme",
        label: "Tema anterior",
        type: "textarea",
        source: "previous_process",
        sourceProcessType: "theme",
        sourceKey: "theme",
      },
    ],
    outputs: [
      {
        id: "editor-test-result",
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
  expect(
    (
      await request.put(`/api/channels/${channel.id}/methods/title`, {
        data: { blocks: [block] },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto(`/channel/${channel.id}/methods?process=title`);
  await page.getByText("Transformar tema", { exact: true }).first().click();
  await expect(page.getByText("Testar somente este bloco", { exact: true })).toBeVisible();
  await page.getByLabel("Prazo fictício do Projeto", { exact: true }).fill("2026-09-30");
  await page.getByLabel(/Tema anterior para teste/).fill("tema temporário");
  await page.getByRole("button", { name: "Executar teste", exact: true }).click();
  await expect(page.getByText("TEMA TEMPORÁRIO", { exact: true })).toBeVisible();
  await expect(page.getByText(/não entrou no histórico do Canal/i)).toBeVisible();
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
  expect(
    (
      await request.put(`/api/channels/${channel.id}/methods/title`, {
        data: { blocks: [block] },
      })
    ).ok(),
  ).toBeTruthy();

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
  await page.getByRole("button", { name: /O que precisa Informações de entrada/ }).click();
  await expect(page.getByText(/Este bloco não precisa de uma entrada específica/i)).toBeVisible();

  await page.getByRole("button", { name: "Adicionar entrada", exact: true }).last().click();
  await page.getByRole("button", { name: /O que faz Ação e instrução/ }).click();
  await expect(page.locator("textarea").first()).toHaveValue(
    "Use apenas o contexto. {{inputs.nova_entrada_1}}",
  );
  await page.getByRole("button", { name: /O que precisa Informações de entrada/ }).click();
  await page.getByPlaceholder("Nome da entrada", { exact: true }).fill("Briefing");
  await page.getByRole("button", { name: /O que faz Ação e instrução/ }).click();
  await expect(page.locator("textarea").first()).toHaveValue(
    "Use apenas o contexto. {{inputs.briefing}}",
  );
  await page.getByRole("button", { name: /O que precisa Informações de entrada/ }).click();
  await page.getByRole("button", { name: "Remover entrada Briefing", exact: true }).click();
  await page.getByRole("button", { name: /O que faz Ação e instrução/ }).click();
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
  await page.getByRole("button", { name: /O que precisa Informações de entrada/ }).click();

  const sourceField = page.getByText("Saída do bloco", { exact: true }).locator("xpath=..");
  await expect(sourceField.getByRole("combobox")).toContainText("Layout");
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

test("editor expande uma única seção de configuração do bloco por vez", async ({
  page,
  request,
}) => {
  const channel = await seed(request);
  await page.goto(`/channel/${channel.id}/methods?process=theme`);
  await page.getByText("Entrega theme", { exact: true }).first().click();

  const action = page.getByRole("button", { name: /O que faz Ação e instrução/ });
  const operator = page.getByRole("button", {
    name: /Quem executa Operador responsável/,
  });
  const inputs = page.getByRole("button", { name: /O que precisa Informações de entrada/ });
  const outputs = page.getByRole("button", { name: /O que entrega Resultado desta ação/ });

  await expect(action).toHaveAttribute("aria-expanded", "true");
  await expect(operator).toHaveAttribute("aria-expanded", "false");
  await expect(inputs).toHaveAttribute("aria-expanded", "false");
  await expect(outputs).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByPlaceholder("Ex: Criar referências", { exact: true })).toBeVisible();

  await operator.click();
  await expect(action).toHaveAttribute("aria-expanded", "false");
  await expect(operator).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByPlaceholder("Ex: Criar referências", { exact: true })).toHaveCount(0);

  await inputs.click();
  await expect(operator).toHaveAttribute("aria-expanded", "false");
  await expect(inputs).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("Este bloco não precisa de uma entrada específica para começar.", {
      exact: true,
    }),
  ).toBeVisible();

  await outputs.click();
  await expect(inputs).toHaveAttribute("aria-expanded", "false");
  await expect(outputs).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Adicionar entrega", exact: true })).toBeVisible();

  const visualStyle = await action.evaluate((button) => {
    const section = button.closest("section")!;
    const eyebrow = button.querySelector("span > span")!;
    return {
      sectionClass: section.className,
      eyebrowClass: eyebrow.className,
    };
  });
  expect(visualStyle.sectionClass).toContain("border-brand/30");
  expect(visualStyle.sectionClass).not.toContain("bg-brand/");
  expect(visualStyle.eyebrowClass).toContain("text-brand");
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
  await page.getByLabel("Resultado theme").fill("Tema preservado após recarregar");
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
  await page.getByLabel("Resultado title").fill("Título concluído");
  await page.getByRole("button", { name: "Concluir ação humana", exact: true }).click();
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
  await page.goto(`/channel/${channel.id}`);
  const projectThumbnail = page.getByRole("img", {
    name: "Thumbnail do projeto Produção ponta a ponta",
    exact: true,
  });
  await expect(projectThumbnail).toBeVisible();
  await expect(projectThumbnail).toHaveAttribute("src", thumbnail.url);
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
  expect(preferences.methodsLibraryView).toBe("channels");
  await request.put("/api/preferences", {
    data: { ...preferences, methodsLibraryView: "methods" },
  });

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
  await page
    .getByPlaceholder("Ex: Criar referências", { exact: true })
    .fill("Alteração antes de sair");
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
