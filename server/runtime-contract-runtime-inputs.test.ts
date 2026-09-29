import assert from "node:assert/strict";
import test from "node:test";
import type { ActionBlock, ProcessExecution, Project, StoredFile } from "../src/lib/domain";
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

test("explicit binding wins over a semantically stronger heuristic candidate", () => {
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
        blockId: explicitSource.id,
        sourceKey: "approved_copy",
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

test("LEGACY / TEMPORARY CHARACTERIZATION: resolves an unbound input by label similarity", () => {
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
  const execution: ProcessExecution = {
    id: "execution-legacy-label-score",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    status: "blocked_executor",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    methodSnapshot: {
      name: "Legacy heuristic",
      processType: "assets",
      blocks: [genericSource, matchingSource, target],
    },
    blocks: [
      {
        blockId: genericSource.id,
        status: "completed",
        values: { generic_text: "generic value" },
      },
      {
        blockId: matchingSource.id,
        status: "completed",
        values: { matching_script: "heuristic value" },
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

  assert.equal(resolved.value, "heuristic value");
  assert.equal(resolved.sourceBlockId, matchingSource.id);
});
