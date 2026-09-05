import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type Channel,
  type Project,
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
  const prompt = page.locator("textarea").first();
  await prompt.fill("Use apenas o contexto.");
  await prompt.blur();
  await expect(page.getByText(/Este bloco não precisa de uma entrada específica/i)).toBeVisible();

  await page.getByRole("button", { name: "Adicionar entrada", exact: true }).last().click();
  await expect(prompt).toHaveValue("Use apenas o contexto. {{inputs.nova_entrada_1}}");
  await page.getByPlaceholder("Nome da entrada", { exact: true }).fill("Briefing");
  await expect(prompt).toHaveValue("Use apenas o contexto. {{inputs.briefing}}");
  await page.getByRole("button", { name: "Remover entrada Briefing", exact: true }).click();
  await expect(prompt).toHaveValue("Use apenas o contexto.");
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
  await expect(page.getByText("thumbnail-fixture.png", { exact: true }).first()).toBeVisible();
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
