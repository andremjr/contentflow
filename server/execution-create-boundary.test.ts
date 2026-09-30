import assert from "node:assert/strict";
import test from "node:test";

import { parseCanonicalExecutionCreatePayload } from "./execution-create-boundary";

function canonicalPayload() {
  return {
    revision: 1,
    id: "execution-1",
    projectId: "project-1",
    channelId: "channel-1",
    processType: "theme",
    methodSnapshot: {
      contractVersion: 3,
      name: "Canonical",
      processType: "theme",
      blocks: [
        {
          id: "create-theme",
          type: "CRIAR",
          operator: "Humano",
          name: "Criar tema",
          inputs: [],
          outputs: [
            {
              id: "theme-output",
              label: "Tema",
              key: "theme",
              shape: {
                kind: "content",
                family: "text",
                cardinality: "one",
                representation: "inline",
              },
              required: true,
            },
          ],
          parameters: [],
          order: 0,
        },
      ],
    },
    blocks: [
      {
        blockId: "create-theme",
        status: "awaiting_human",
        values: {},
        attempt: 1,
      },
    ],
    status: "awaiting_human",
    outputStatus: "pending",
    createdAt: "2026-09-30T10:00:00.000Z",
    updatedAt: "2026-09-30T10:00:00.000Z",
  };
}

test("accepts a canonical ProcessMethod v3 execution state", () => {
  const input = canonicalPayload();
  const result = parseCanonicalExecutionCreatePayload(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.execution, input);
  assert.notEqual(result.execution, input);
});

test("rejects historical method snapshots without contractVersion 3", () => {
  const input = canonicalPayload();
  const { contractVersion: _contractVersion, ...historicalSnapshot } = input.methodSnapshot;
  const historical = { ...input, methodSnapshot: historicalSnapshot };
  assert.equal(parseCanonicalExecutionCreatePayload(historical).ok, false);
});

test("rejects execution state that violates Core block order invariants", () => {
  const input = canonicalPayload();
  input.blocks[0].blockId = "other-block";
  const result = parseCanonicalExecutionCreatePayload(input);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /Core invariants/);
});

test("rejects block values that violate the declared ValueShape", () => {
  const input = canonicalPayload();
  input.blocks[0].values = {
    theme: {
      id: "image-1",
      name: "theme.png",
      mimeType: "image/png",
      size: 10,
      url: "/api/files/image-1",
    },
  } as never;
  const result = parseCanonicalExecutionCreatePayload(input);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /ValueShape/);
});

test("rejects unknown block value keys instead of accepting aliases", () => {
  const input = canonicalPayload();
  input.blocks[0].values = { result: "Tema" } as never;
  assert.equal(parseCanonicalExecutionCreatePayload(input).ok, false);
});
