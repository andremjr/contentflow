import assert from "node:assert/strict";
import test from "node:test";
import {
  PROCESS_ORDER,
  type Channel,
  type ProcessMethod,
  type Project,
  type UniversalProcess,
} from "./domain";
import {
  captureProjectStrategy,
  nextExecutableProcess,
  projectProcessOrder,
  effectiveProcessOrder,
  isProcessOrder,
  resolveProcessOrderForMethods,
  validateProcessDependencies,
} from "./process-order";

const reordered: UniversalProcess[] = [
  "theme",
  "title",
  "script",
  "thumbnail",
  "narration",
  "assets",
  "editing",
  "publishing",
];
const method = (
  processType: UniversalProcess,
  inputs: ProcessMethod["blocks"][number]["inputs"] = [],
): ProcessMethod => ({
  name: processType,
  processType,
  blocks: [
    {
      id: `${processType}-block`,
      type: "CRIAR",
      operator: "Humano",
      order: 0,
      parameters: [],
      inputs,
      outputs: [
        {
          id: `${processType}-output`,
          label: processType,
          key: processType,
          type: "textarea",
          required: true,
        },
      ],
    },
  ],
});

test("legacy channels read in historical order without being rewritten", () => {
  const legacy = {};
  assert.deepEqual(effectiveProcessOrder(legacy), PROCESS_ORDER);
  assert.deepEqual(legacy, {});
  assert.equal(isProcessOrder([...PROCESS_ORDER, "theme"]), false);
  assert.equal(isProcessOrder([...PROCESS_ORDER.slice(0, -1), "theme"]), false);
  assert.equal(isProcessOrder(reordered), true);
});

test("script output can feed thumbnail only after script moves ahead", () => {
  const methods = {
    script: method("script"),
    thumbnail: method("thumbnail", [
      {
        id: "from-script",
        label: "Roteiro",
        type: "textarea",
        source: "previous_process",
        sourceProcessType: "script",
        blockId: "__process_output__",
        sourceKey: "script",
      },
    ]),
  };
  assert.match(
    validateProcessDependencies(PROCESS_ORDER, methods).join("\n"),
    /processo anterior inválido/,
  );
  assert.deepEqual(validateProcessDependencies(reordered, methods), []);
  methods.thumbnail.blocks[0].inputs![0].sourceKey = "missing";
  assert.match(
    validateProcessDependencies(reordered, methods).join("\n"),
    /saída anterior não encontrada/,
  );
});

test("cross process cycles and incompatible source types are rejected", () => {
  const methods = {
    script: method("script", [
      {
        id: "from-thumb",
        label: "Miniatura",
        type: "image",
        source: "previous_process",
        sourceProcessType: "thumbnail",
        blockId: "__process_output__",
        sourceKey: "thumbnail",
      },
    ]),
    thumbnail: method("thumbnail", [
      {
        id: "from-script",
        label: "Roteiro",
        type: "image",
        source: "previous_process",
        sourceProcessType: "script",
        blockId: "__process_output__",
        sourceKey: "script",
      },
    ]),
  };
  const errors = validateProcessDependencies(reordered, methods);
  assert.match(errors.join("\n"), /processo anterior inválido/);
  assert.match(errors.join("\n"), /tipo incompatível/);
});

test("resolved import order moves required dependencies ahead", () => {
  const methods = {
    script: method("script"),
    thumbnail: method("thumbnail", [
      {
        id: "from-script",
        label: "Roteiro",
        type: "textarea",
        source: "previous_process",
        sourceProcessType: "script",
        blockId: "__process_output__",
        sourceKey: "script",
      },
    ]),
  };
  assert.deepEqual(resolveProcessOrderForMethods(PROCESS_ORDER, methods), reordered);
});

test("resolved import order rejects dependency cycles", () => {
  const script = method("script", [
    {
      id: "from-thumbnail",
      label: "Thumbnail",
      type: "textarea",
      source: "previous_process",
      sourceProcessType: "thumbnail",
      blockId: "thumbnail-block",
      sourceKey: "thumbnail",
    },
  ]);
  const thumbnail = method("thumbnail", [
    {
      id: "from-script",
      label: "Roteiro",
      type: "textarea",
      source: "previous_process",
      sourceProcessType: "script",
      blockId: "script-block",
      sourceKey: "script",
    },
  ]);
  assert.equal(resolveProcessOrderForMethods(PROCESS_ORDER, { script, thumbnail }), undefined);
});

test("conversation reuse requires earlier block with matching plugin and connection", () => {
  const script = method("script");
  script.blocks[0].plugin = {
    pluginId: "writer",
    capabilityId: "write",
    configuration: {},
    connectionId: "account",
  };
  const thumbnail = method("thumbnail");
  thumbnail.blocks[0].plugin = {
    pluginId: "writer",
    capabilityId: "write",
    configuration: {},
    connectionId: "account",
    conversation: { mode: "reuse", sourceProcessType: "script", sourceBlockId: "script-block" },
  };
  assert.deepEqual(validateProcessDependencies(reordered, { script, thumbnail }), []);
  assert.match(
    validateProcessDependencies(PROCESS_ORDER, { script, thumbnail }).join("\n"),
    /conversa de origem/,
  );
  thumbnail.blocks[0].plugin.connectionId = "another";
  assert.match(
    validateProcessDependencies(reordered, { script, thumbnail }).join("\n"),
    /conversa de origem/,
  );
});

test("a project freezes order and all Methods once at first execution", () => {
  const channel = {
    processOrder: reordered,
    definitionRevision: 4,
    methods: Object.fromEntries(PROCESS_ORDER.map((id) => [id, method(id)])),
  } as Channel;
  const project = {
    stages: Object.fromEntries(PROCESS_ORDER.map((id) => [id, "not_started"])),
  } as Project;
  assert.deepEqual(projectProcessOrder(project, channel), reordered);
  captureProjectStrategy(project, channel, false);
  assert.equal(project.strategySnapshot?.definitionRevision, 4);
  channel.processOrder = [...PROCESS_ORDER];
  channel.methods.script.name = "Changed later";
  assert.deepEqual(projectProcessOrder(project, channel), reordered);
  assert.equal(project.strategySnapshot?.methods.script.name, "script");
  captureProjectStrategy(project, channel, false);
  assert.equal(project.strategySnapshot?.methods.script.name, "script");
});

test("legacy started projects retain the historical sequence", () => {
  const project = {
    stages: Object.fromEntries(
      PROCESS_ORDER.map((id) => [id, id === "theme" ? "done" : "not_started"]),
    ),
  } as Project;
  const channel = { processOrder: reordered } as Channel;
  captureProjectStrategy(project, channel, true);
  assert.equal(project.strategySnapshot, undefined);
  assert.deepEqual(projectProcessOrder(project, channel), PROCESS_ORDER);
});

test("next executable process respects frozen bounds and finishes after all eight", () => {
  const stages = Object.fromEntries(
    PROCESS_ORDER.map((id) => [id, "not_started"]),
  ) as Project["stages"];
  assert.equal(nextExecutableProcess(reordered, stages), "theme");
  stages.theme = "done";
  stages.title = "approved";
  assert.equal(nextExecutableProcess(reordered, stages), "script");
  assert.equal(nextExecutableProcess(reordered, stages, "thumbnail", "assets"), "thumbnail");
  for (const id of reordered) stages[id] = "done";
  assert.equal(nextExecutableProcess(reordered, stages), undefined);
});
