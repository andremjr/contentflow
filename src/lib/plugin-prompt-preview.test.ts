import assert from "node:assert/strict";
import test from "node:test";

import type { ActionBlock } from "./domain";
import { renderPluginPromptPreview } from "./plugin-prompt-preview";

const block = {
  id: "block-1",
  type: "CRIAR",
  operator: "IA",
  name: "Escrever roteiro",
  instructions: "Escreva um roteiro sobre {{inputs.tema_do_video}}.",
  inputs: [],
  outputs: [],
  parameters: [],
  plugin: { pluginId: "example", capabilityId: "text", configuration: {} },
} as unknown as ActionBlock;

const capability = {
  id: "text",
  operator: "IA",
  instructionUsage: "required",
  promptPreview: {
    template: "INSTRUÇÕES:\n{{BLOCK_INSTRUCTIONS}}\n\nCONTEXTO:\n{{CONTEXT_INPUTS}}",
  },
} as const;

test("renders the declared prompt shape with Method variables and omits duplicated context", () => {
  const result = renderPluginPromptPreview(block, capability as never, [
    {
      portKey: "content",
      input: {
        id: "theme",
        label: "Tema do vídeo",
        type: "text",
        source: "previous_process",
        sourceKey: "theme",
        sourceProcessType: "theme",
        blockId: "__process_output__",
      },
    },
    {
      portKey: "context",
      input: {
        id: "rules",
        label: "Regras do canal",
        type: "textarea",
        source: "static",
        sourceKey: "rules",
        staticValue: "",
      },
    },
  ]);

  assert.equal(
    result,
    "INSTRUÇÕES:\nEscreva um roteiro sobre {{inputs.tema_do_video}}.\n\nCONTEXTO:\ncontext:\n{{inputs.rules}}",
  );
});

test("uses a non-secret template configuration when declared by the plugin", () => {
  const configured = {
    ...block,
    plugin: { ...block.plugin!, configuration: { promptTemplate: "Pedido: {{INPUT:content}}" } },
  };
  const result = renderPluginPromptPreview(
    configured,
    {
      ...capability,
      promptPreview: {
        template: "{{BLOCK_INSTRUCTIONS}}",
        templateConfigurationKey: "promptTemplate",
      },
    } as never,
    [
      {
        portKey: "content",
        input: {
          id: "theme",
          label: "Tema do vídeo",
          type: "text",
          source: "previous_process",
          sourceKey: "theme",
          sourceProcessType: "theme",
          blockId: "__process_output__",
        },
      },
    ],
  );
  assert.equal(result, "Pedido: {{inputs.tema_do_video}}");
});
