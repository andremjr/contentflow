import { z } from "zod";
import type { ProcessMethod } from "@/lib/domain";
import { valueShapeSchema } from "@/lib/value-shape-schema";

const universalProcessSchema = z.enum([
  "theme",
  "title",
  "thumbnail",
  "script",
  "narration",
  "assets",
  "editing",
  "publishing",
]);

const presentationSchema = z
  .object({
    renderer: z.enum([
      "auto",
      "text-short",
      "text-long",
      "list",
      "tags",
      "table",
      "cards",
      "file-list",
      "image-gallery",
      "audio-player",
      "video-player",
      "decision",
    ]),
  })
  .strict();

const inputSourceBindingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), key: z.enum(["title", "deadline"]) }).strict(),
  z
    .object({
      kind: z.literal("previous_process"),
      processType: universalProcessSchema,
      outputKey: z.string().min(1).max(200),
      blockId: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("previous_block"),
      blockId: z.string().min(1),
      outputKey: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      kind: z.literal("channel_history"),
      processType: universalProcessSchema,
      blockId: z.string().min(1),
      outputKey: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(100),
      eligibility: z.enum(["completed", "published"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("channel_library"),
      collectionId: z.string().min(1),
      fieldId: z.string().min(1),
    })
    .strict(),
  z.object({ kind: z.literal("runtime") }).strict(),
  z.object({ kind: z.literal("static"), value: z.string().max(10_000) }).strict(),
]);

const inputSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).max(200),
    shape: valueShapeSchema,
    binding: inputSourceBindingSchema,
    presentation: presentationSchema.optional(),
    portKey: z.string().min(1).max(100).optional(),
  })
  .strict();

const outputSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).max(200),
    key: z.string().min(1).max(200),
    shape: valueShapeSchema,
    required: z.boolean(),
    placeholder: z.string().max(500).optional(),
    helpText: z.string().max(2_000).optional(),
    optionsSourceBlockId: z.string().optional(),
    optionsSourceKey: z.string().max(200).optional(),
    presentation: presentationSchema.optional(),
    portKey: z.string().min(1).max(100).optional(),
  })
  .strict();

const parameterSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().max(200),
    key: z.string().max(200),
    type: z.enum(["text", "number", "select", "boolean", "textarea"]),
    value: z.union([z.string(), z.number(), z.boolean()]),
    placeholder: z.string().max(500).optional(),
    options: z.array(z.string().max(500)).max(100).optional(),
  })
  .strict();

const actionBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"]),
    operator: z.enum(["IA", "Humano", "Código"]),
    collectionId: z.string().optional(),
    name: z.string().max(200).optional(),
    instructions: z.string().max(20_000).optional(),
    inputs: z.array(inputSchema).max(100).optional(),
    outputs: z.array(outputSchema).max(100).optional(),
    validation: z
      .object({
        targetBlockId: z.string().min(1),
        targetOutputKey: z.string().max(200).optional(),
        targetPortKey: z.string().min(1).max(100).optional(),
        mode: z.enum(["approval", "select_one", "select_many"]),
        onReject: z.enum(["retry_target", "pause"]),
        maxAttempts: z.number().int().min(1).max(20),
        retryMode: z.enum(["full", "conversation_feedback"]).optional(),
      })
      .strict()
      .optional(),
    plugin: z
      .object({
        pluginId: z.string().min(1).max(160),
        pluginVersion: z.string().max(80).optional(),
        capabilityId: z.string().min(1).max(100),
        configuration: z.record(z.union([z.string(), z.number(), z.boolean()])),
        connectionRequired: z.boolean().optional(),
        connectionId: z.string().optional(),
        profileExecution: z
          .object({
            mode: z.enum(["single", "fallback", "parallel"]),
            profileIds: z.array(z.string().min(1)).min(1),
            maxParallel: z.number().int().min(1).optional(),
          })
          .strict()
          .optional(),
        conversation: z
          .discriminatedUnion("mode", [
            z.object({ mode: z.literal("new") }).strict(),
            z
              .object({
                mode: z.literal("reuse"),
                sourceProcessType: universalProcessSchema,
                sourceBlockId: z.string().min(1),
              })
              .strict(),
          ])
          .optional(),
      })
      .strict()
      .optional(),
    parameters: z.array(parameterSchema).max(100),
    order: z.number().int().nonnegative(),
  })
  .strict();

export const processMethodV3Schema = z
  .object({
    contractVersion: z.literal(3),
    name: z.string().min(1).max(200),
    imageUrl: z.string().max(1_500_000).optional(),
    processType: universalProcessSchema,
    // An empty method is a valid editable state. The editor must be able to
    // remove the final block and save the process for later configuration.
    blocks: z.array(actionBlockSchema).max(200),
  })
  .strict();

// The editor creates an explicit previous-block binding before the user chooses
// its source. Persist this draft without accepting it as an executable contract.
const workspaceInputSchema = inputSchema.extend({
  binding: z.union([
    inputSourceBindingSchema,
    z
      .object({
        kind: z.literal("previous_block"),
        blockId: z.string(),
        outputKey: z.string().max(200),
      })
      .strict(),
  ]),
});
export const workspaceMethodV3Schema = processMethodV3Schema.extend({
  blocks: z
    .array(
      actionBlockSchema.extend({
        inputs: z.array(workspaceInputSchema).max(100).optional(),
      }),
    )
    .max(200),
});

export function parseProcessMethodV3(value: unknown): ProcessMethod {
  return processMethodV3Schema.parse(value) as ProcessMethod;
}
