import { z } from "zod";
import { validateValueShape } from "@/lib/data-shape";
import type { ValueShape } from "@/lib/domain";

const unique = <T>(values: T[]) => new Set(values).size === values.length;

export const cardinalitySchema = z.enum(["one", "many"]);

export const formatConstraintsSchema = z
  .object({
    mimeTypes: z.array(z.string().min(1).max(200)).max(50).refine(unique).optional(),
    extensions: z.array(z.string().min(1).max(30)).max(50).refine(unique).optional(),
  })
  .strict();

export const contentShapeSchema = z
  .object({
    kind: z.literal("content"),
    family: z.enum(["text", "image", "audio", "video"]),
    cardinality: cardinalitySchema,
    representation: z.enum(["inline", "artifact", "either"]),
    formats: formatConstraintsSchema.optional(),
  })
  .strict();

export const controlShapeSchema = z
  .object({
    kind: z.literal("control"),
    control: z.enum([
      "identifier",
      "number",
      "boolean",
      "selection",
      "datetime",
      "url",
      "approval",
      "thumbnail_layout",
    ]),
    cardinality: cardinalitySchema,
    options: z.array(z.string().max(500)).max(100).optional(),
  })
  .strict();

export const atomicValueShapeSchema = z.discriminatedUnion("kind", [
  contentShapeSchema,
  controlShapeSchema,
]);

export const recordShapeSchema = z
  .object({
    kind: z.literal("record"),
    cardinality: cardinalitySchema,
    fields: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1).max(200),
            key: z.string().min(1).max(200),
            shape: atomicValueShapeSchema,
            required: z.boolean(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export const valueShapeSchema = z
  .discriminatedUnion("kind", [contentShapeSchema, controlShapeSchema, recordShapeSchema])
  .superRefine((shape, context) => {
    for (const issue of validateValueShape(shape as ValueShape)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.path.split(".").slice(1),
        message: issue.message,
      });
    }
  });
