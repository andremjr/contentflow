import assert from "node:assert/strict";
import test from "node:test";
import type {
  ActionBlock,
  ProcessExecution,
  Project,
  RuntimeValue,
  StoredFile,
} from "../src/lib/domain";
import { resolveBlockInputs } from "../src/lib/runtime-contract";

const project: Project = {
  id: "project-1",
  channelId: "channel-1",
  title: "Project",
  currentStage: "assets",
  state: "processing",
  progress: 0,
  deadline: "",
  duration: "",
  updatedAt: "2026-09-24T00:00:00.000Z",
  stages: {
    theme: "not_started",
    title: "not_started",
    thumbnail: "not_started",
    script: "not_started",
    narration: "not_started",
    assets: "processing",
    editing: "not_started",
    publishing: "not_started",
  },
  assignee: { name: "", initials: "" },
  thumbHue: 0,
  createdAt: "2026-09-24T00:00:00.000Z",
};

test("resolves runtime files from the active execution without storing them in the Method", () => {
  const input = {
    id: "references",
    label: "Referências",
    type: "files",
    source: "runtime",
    portKey: "reference_images",
  } as const;
  const block = {
    id: "generate",
    type: "CRIAR",
    operator: "IA",
    order: 0,
    parameters: [],
    inputs: [input],
    outputs: [],
  } satisfies ActionBlock;
  const files: StoredFile[] = [
    {
      id: "image-1",
      name: "reference.png",
      mimeType: "image/png",
      size: 42,
      url: "/api/files/image-1.png",
    },
  ];
  const execution = {
    id: "execution-1",
    projectId: "project-1",
    channelId: "channel-1",
    processType: "assets",
    status: "blocked_executor",
    outputStatus: "pending",
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
    blocks: [
      {
        blockId: block.id,
        status: "blocked_executor",
        values: {},
        runtimeInputs: { [input.id]: files },
      },
    ],
    methodSnapshot: { name: "Assets", processType: "assets", blocks: [block] },
  } satisfies ProcessExecution;
  const [resolved] = resolveBlockInputs({
    block,
    execution,
    project,
    projectExecutions: [execution],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, true);
  assert.deepEqual(resolved.value, files);
  assert.equal("runtimeInputs" in execution.methodSnapshot.blocks[0], false);
});

test("explicit binding wins over conflicting legacy source fields", () => {
  const heuristicSource: ActionBlock = {
    id: "heuristic-source",
    type: "CRIAR",
    operator: "Humano",
    order: 0,
    parameters: [],
    outputs: [
      {
        id: "matching-script",
        label: "Roteiro final",
        key: "matching_script",
        type: "textarea",
        required: true,
      },
    ],
  };
  const explicitSource: ActionBlock = {
    id: "explicit-source",
    type: "CRIAR",
    operator: "Humano",
    order: 1,
    parameters: [],
    outputs: [
      {
        id: "approved-copy",
        label: "Texto aprovado",
        key: "approved_copy",
        type: "textarea",
        required: true,
      },
    ],
  };
  const target: ActionBlock = {
    id: "target",
    type: "CRIAR",
    operator: "IA",
    order: 2,
    parameters: [],
    inputs: [
      {
        id: "script-input",
        label: "Roteiro final",
        type: "textarea",
        source: "previous_block",
        blockId: heuristicSource.id,
        sourceKey: "matching_script",
        binding: {
          kind: "previous_block",
          blockId: explicitSource.id,
          outputKey: "approved_copy",
        },
      },
    ],
    outputs: [],
  };
  const execution: ProcessExecution = {
    id: "execution-explicit-binding",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    status: "blocked_executor",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    methodSnapshot: {
      name: "Explicit binding",
      processType: "assets",
      blocks: [heuristicSource, explicitSource, target],
    },
    blocks: [
      {
        blockId: heuristicSource.id,
        status: "completed",
        values: { matching_script: "heuristic value" },
      },
      {
        blockId: explicitSource.id,
        status: "completed",
        values: { approved_copy: "explicit value" },
      },
      { blockId: target.id, status: "blocked_executor", values: {} },
    ],
  };

  const [resolved] = resolveBlockInputs({
    block: target,
    execution,
    project,
    projectExecutions: [execution],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.value, "explicit value");
  assert.equal(resolved.sourceBlockId, explicitSource.id);
  assert.equal(resolved.resolvedSourceKey, "approved_copy");
});

test("canonical previous_process resolves the exact process output", () => {
  const target: ActionBlock = {
    id: "target-process",
    type: "CRIAR",
    operator: "IA",
    order: 0,
    parameters: [],
    inputs: [
      {
        id: "script-input",
        label: "Texto qualquer",
        type: "textarea",
        source: "previous_block",
        binding: { kind: "previous_process", processType: "script", outputKey: "script" },
      },
    ],
    outputs: [],
  };
  const execution: ProcessExecution = {
    id: "execution-canonical-process",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    status: "blocked_executor",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    methodSnapshot: { name: "Assets", processType: "assets", blocks: [target] },
    blocks: [{ blockId: target.id, status: "blocked_executor", values: {} }],
  };
  const scriptExecution: ProcessExecution = {
    id: "execution-script",
    projectId: project.id,
    channelId: project.channelId,
    processType: "script",
    status: "completed",
    outputStatus: "completed",
    output: {
      processType: "script",
      values: { script: "canonical script" },
      createdAt: project.createdAt,
    },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    methodSnapshot: { name: "Script", processType: "script", blocks: [] },
    blocks: [],
  };

  const [resolved] = resolveBlockInputs({
    block: target,
    execution,
    project,
    projectExecutions: [scriptExecution, execution],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, true);
  assert.equal(resolved.value, "canonical script");
  assert.equal(resolved.sourceProcessType, "script");
  assert.equal(resolved.resolvedSourceKey, "script");
});

test("an unresolved canonical binding never falls back to legacy fields", () => {
  const source: ActionBlock = {
    id: "available-source",
    type: "CRIAR",
    operator: "Humano",
    order: 0,
    parameters: [],
    outputs: [
      {
        id: "matching-output",
        label: "Roteiro final",
        key: "matching_script",
        type: "textarea",
        required: true,
      },
    ],
  };
  const target: ActionBlock = {
    id: "canonical-missing-target",
    type: "CRIAR",
    operator: "IA",
    order: 1,
    parameters: [],
    inputs: [
      {
        id: "canonical-missing-input",
        label: "Roteiro final",
        type: "textarea",
        source: "previous_block",
        blockId: source.id,
        sourceKey: "matching_script",
        binding: {
          kind: "previous_block",
          blockId: "removed-source",
          outputKey: "removed-output",
        },
      },
    ],
    outputs: [],
  };
  const execution: ProcessExecution = {
    id: "execution-canonical-missing",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    status: "blocked_executor",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    methodSnapshot: {
      name: "Missing canonical source",
      processType: "assets",
      blocks: [source, target],
    },
    blocks: [
      { blockId: source.id, status: "completed", values: { matching_script: "must not win" } },
      { blockId: target.id, status: "blocked_executor", values: {} },
    ],
  };

  const [resolved] = resolveBlockInputs({
    block: target,
    execution,
    project,
    projectExecutions: [execution],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, false);
  assert.equal(resolved.value, undefined);
});

test("legacy previous_block with complete identifiers resolves exactly", () => {
  const source: ActionBlock = {
    id: "legacy-explicit-source",
    type: "CRIAR",
    operator: "Humano",
    order: 0,
    parameters: [],
    outputs: [
      {
        id: "legacy-explicit-output",
        label: "Roteiro final",
        key: "script",
        type: "textarea",
        required: true,
      },
    ],
  };
  const target: ActionBlock = {
    id: "legacy-explicit-target",
    type: "CRIAR",
    operator: "IA",
    order: 1,
    parameters: [],
    inputs: [
      {
        id: "legacy-explicit-input",
        label: "Contexto",
        type: "textarea",
        source: "previous_block",
        blockId: source.id,
        sourceKey: "script",
      },
    ],
    outputs: [],
  };
  const execution: ProcessExecution = {
    id: "execution-legacy-explicit",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    status: "blocked_executor",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    methodSnapshot: {
      name: "Legacy explicit",
      processType: "assets",
      blocks: [source, target],
    },
    blocks: [
      { blockId: source.id, status: "completed", values: { script: "explicit legacy value" } },
      { blockId: target.id, status: "blocked_executor", values: {} },
    ],
  };

  const [resolved] = resolveBlockInputs({
    block: target,
    execution,
    project,
    projectExecutions: [execution],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, true);
  assert.equal(resolved.value, "explicit legacy value");
  assert.equal(resolved.sourceBlockId, source.id);
  assert.equal(resolved.resolvedSourceKey, "script");
});

test("ambiguous legacy input stays unresolved regardless of candidate order or matching label", () => {
  const genericSource: ActionBlock = {
    id: "generic-source",
    type: "CRIAR",
    operator: "Humano",
    order: 0,
    parameters: [],
    outputs: [
      {
        id: "generic-text",
        label: "Texto auxiliar",
        key: "generic_text",
        type: "textarea",
        required: true,
      },
    ],
  };
  const matchingSource: ActionBlock = {
    id: "matching-source",
    type: "CRIAR",
    operator: "Humano",
    order: 1,
    parameters: [],
    outputs: [
      {
        id: "matching-script",
        label: "Roteiro final",
        key: "matching_script",
        type: "textarea",
        required: true,
      },
    ],
  };
  const target: ActionBlock = {
    id: "legacy-target",
    type: "CRIAR",
    operator: "IA",
    order: 2,
    parameters: [],
    inputs: [
      {
        id: "legacy-script-input",
        label: "Roteiro final",
        type: "textarea",
        source: "previous_block",
      },
    ],
    outputs: [],
  };
  for (const [index, sources] of [
    [genericSource, matchingSource],
    [matchingSource, genericSource],
  ].entries()) {
    const orderedSources = sources.map((source, order) => ({ ...source, order }));
    const orderedTarget = { ...target, order: orderedSources.length };
    const execution: ProcessExecution = {
      id: `execution-legacy-ambiguous-${index}`,
      projectId: project.id,
      channelId: project.channelId,
      processType: "assets",
      status: "blocked_executor",
      outputStatus: "pending",
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      methodSnapshot: {
        name: "Legacy ambiguous",
        processType: "assets",
        blocks: [...orderedSources, orderedTarget],
      },
      blocks: [
        ...orderedSources.map((source) => {
          const values: Record<string, RuntimeValue> =
            source.id === genericSource.id
              ? { generic_text: "generic value" }
              : { matching_script: "matching value" };
          return { blockId: source.id, status: "completed" as const, values };
        }),
        { blockId: target.id, status: "blocked_executor", values: {} },
      ],
    };

    const [resolved] = resolveBlockInputs({
      block: orderedTarget,
      execution,
      project,
      projectExecutions: [execution],
      collections: [],
      libraryItems: [],
    });

    assert.equal(resolved.resolved, false);
    assert.equal(resolved.value, undefined);
    assert.equal(resolved.sourceBlockId, undefined);
  }
});

test("legacy previous_process without process identity stays unresolved", () => {
  const target: ActionBlock = {
    id: "legacy-process-target",
    type: "CRIAR",
    operator: "IA",
    order: 0,
    parameters: [],
    inputs: [
      {
        id: "legacy-process-input",
        label: "Roteiro final",
        type: "textarea",
        source: "previous_process",
        sourceKey: "script",
      },
    ],
    outputs: [],
  };
  const execution: ProcessExecution = {
    id: "execution-legacy-process-target",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    status: "blocked_executor",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    methodSnapshot: { name: "Assets", processType: "assets", blocks: [target] },
    blocks: [{ blockId: target.id, status: "blocked_executor", values: {} }],
  };
  const scriptExecution: ProcessExecution = {
    id: "execution-legacy-process-source",
    projectId: project.id,
    channelId: project.channelId,
    processType: "script",
    status: "completed",
    outputStatus: "completed",
    output: {
      processType: "script",
      values: { script: "must not be inferred" },
      createdAt: project.createdAt,
    },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    methodSnapshot: { name: "Script", processType: "script", blocks: [] },
    blocks: [],
  };

  const [resolved] = resolveBlockInputs({
    block: target,
    execution,
    project,
    projectExecutions: [scriptExecution, execution],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, false);
  assert.equal(resolved.value, undefined);
  assert.equal(resolved.sourceProcessType, undefined);
});
