import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { PluginManifest } from "../src/lib/plugin-contract";

const semver =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const identifier = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const pluginId = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const host =
  /^(?:\*\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const entrypoint = /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/;
const httpsUrl = z.string().url().startsWith("https://");
const unique = <T>(values: T[]) => new Set(values).size === values.length;

const dataTypeSchema = z.enum([
  "text",
  "textarea",
  "number",
  "boolean",
  "list",
  "records",
  "select",
  "multiselect",
  "datetime",
  "url",
  "file",
  "files",
  "image",
  "audio",
  "video",
  "approval",
  "thumbnail_layout",
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
    itemType: z.enum(["text", "record", "file", "image", "audio", "video"]).optional(),
    acceptedMimeTypes: z
      .array(
        z
          .string()
          .max(200)
          .regex(/^[-A-Za-z0-9_.+]+\/[-A-Za-z0-9_.+*]+$/),
      )
      .max(50)
      .refine(unique, "não pode conter duplicatas")
      .optional(),
  })
  .strict();
const jsonSchema = z.record(z.unknown());
const portBase = {
  key: z.string().min(1).max(100).regex(identifier),
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  required: z.boolean(),
  presentation: presentationSchema.optional(),
};
const inputPortSchema = z
  .object({
    ...portBase,
    acceptedTypes: z.array(dataTypeSchema).min(1).refine(unique, "não pode conter duplicatas"),
    multiple: z.boolean().optional(),
  })
  .strict();
const outputPortSchema = z
  .object({
    ...portBase,
    producedTypes: z.array(dataTypeSchema).min(1).refine(unique, "não pode conter duplicatas"),
  })
  .strict();
const profileSetupSchema = z
  .object({
    configurationKey: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
    label: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    prepareTimeoutMs: z.number().int().min(30_000).max(900_000).optional(),
  })
  .strict();
const capabilitySchema = z
  .object({
    id: z.string().min(1).max(100).regex(identifier),
    operator: z.enum(["IA", "Código"]),
    blockTypes: z
      .array(z.enum(["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"]))
      .min(1)
      .refine(unique, "não pode conter duplicatas"),
    processTypes: z
      .array(
        z.enum([
          "theme",
          "title",
          "thumbnail",
          "script",
          "narration",
          "assets",
          "editing",
          "publishing",
        ]),
      )
      .min(1)
      .refine(unique, "não pode conter duplicatas")
      .optional(),
    inputPorts: z.array(inputPortSchema),
    outputPorts: z.array(outputPortSchema).min(1),
    acceptedInputTypes: z
      .array(dataTypeSchema)
      .refine(unique, "não pode conter duplicatas")
      .optional(),
    producedOutputTypes: z
      .array(dataTypeSchema)
      .min(1)
      .refine(unique, "não pode conter duplicatas")
      .optional(),
    execution: z
      .object({
        mode: z.enum(["immediate", "async"]),
        defaultTimeoutMs: z.number().int().min(100).max(86_400_000).optional(),
        supportsCancellation: z.boolean().optional(),
        maxConcurrency: z.number().int().min(1).max(100).optional(),
      })
      .strict(),
    sideEffects: z
      .array(
        z.enum([
          "external_read",
          "external_write",
          "public_publish",
          "local_artifact",
          "subprocess",
        ]),
      )
      .refine(unique, "não pode conter duplicatas"),
    cost: z
      .object({ model: z.enum(["free", "metered", "unknown"]), estimateSupported: z.boolean() })
      .strict(),
    dataPolicy: z
      .object({
        sendsDataToThirdParties: z.boolean(),
        providers: z
          .array(z.string().min(1).max(160))
          .min(1)
          .refine(unique, "não pode conter duplicatas")
          .optional(),
        retentionPolicyUrl: httpsUrl.optional(),
        trainingPolicyUrl: httpsUrl.optional(),
      })
      .strict()
      .superRefine((policy, context) => {
        if (policy.sendsDataToThirdParties && !policy.providers?.length) {
          context.addIssue({
            code: "custom",
            path: ["providers"],
            message: "é obrigatório quando dados são enviados a terceiros",
          });
        }
      }),
    blockConfigSchema: jsonSchema,
    outputSchema: jsonSchema,
  })
  .strict();

export const pluginManifestSchema = z
  .object({
    $schema: z.string().optional(),
    apiVersion: z.literal("1"),
    id: z.string().min(3).max(160).regex(pluginId),
    name: z.string().min(1).max(100),
    version: z.string().regex(semver),
    description: z.string().min(1).max(500),
    author: z.string().min(1).max(160),
    license: z.string().min(1).max(160),
    homepage: httpsUrl.optional(),
    repository: httpsUrl.optional(),
    runtime: z
      .object({
        kind: z.literal("node"),
        version: z.string().min(1).max(80),
        module: z.literal("esm"),
      })
      .strict(),
    minCoreVersion: z.string().regex(semver).optional(),
    entrypoint: z.string().min(1).max(260).regex(entrypoint),
    permissions: z
      .array(
        z.enum(["network", "filesystem:read", "filesystem:write", "process", "worker", "native"]),
      )
      .refine(unique, "não pode conter duplicatas"),
    networkHosts: z
      .array(z.string().max(255).regex(host))
      .min(1)
      .max(100)
      .refine(
        (values) => unique(values.map((value) => value.toLowerCase())),
        "não pode conter duplicatas",
      )
      .optional(),
    secretKeys: z
      .array(
        z
          .string()
          .max(100)
          .regex(/^[A-Z][A-Z0-9_]*$/),
      )
      .refine(unique, "não pode conter duplicatas")
      .optional(),
    deliveryTypes: z
      .array(z.enum(["text", "image", "audio", "video", "processing"]))
      .min(1)
      .refine(unique, "não pode conter duplicatas")
      .optional(),
    profileSetup: profileSetupSchema.optional(),
    settingsSchema: jsonSchema.optional(),
    capabilities: z.array(capabilitySchema).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.networkHosts && !manifest.permissions.includes("network")) {
      context.addIssue({
        code: "custom",
        path: ["networkHosts"],
        message: "exige a permissão network",
      });
    }
    if (manifest.profileSetup) {
      for (const [index, capability] of manifest.capabilities.entries()) {
        const properties = capability.blockConfigSchema?.properties;
        if (
          !properties ||
          typeof properties !== "object" ||
          !(manifest.profileSetup.configurationKey in properties)
        ) {
          context.addIssue({
            code: "custom",
            path: ["capabilities", index, "blockConfigSchema", "properties"],
            message: `precisa declarar ${manifest.profileSetup.configurationKey} para profileSetup`,
          });
        }
      }
    }
  });

export type PluginValidationIssue = { path: string; message: string };

export class PluginValidationError extends Error {
  constructor(public readonly issues: PluginValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "PluginValidationError";
  }
}

export function validatePluginManifest(value: unknown): PluginManifest {
  const result = pluginManifestSchema.safeParse(value);
  if (!result.success) {
    throw new PluginValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.length ? issue.path.join(".") : "$",
        message: issue.message,
      })),
    );
  }
  return result.data as PluginManifest;
}

export function findPluginManifest(directory: string) {
  const aliasPath = path.join(directory, "plugin.json");
  if (existsSync(aliasPath)) {
    try {
      const alias = JSON.parse(readFileSync(aliasPath, "utf8")) as { canonical_manifest?: unknown };
      if (
        typeof alias.canonical_manifest === "string" &&
        !path.isAbsolute(alias.canonical_manifest) &&
        !alias.canonical_manifest.includes("..")
      ) {
        const referenced = path.join(directory, alias.canonical_manifest);
        if (existsSync(referenced)) return referenced;
      }
    } catch {
      return aliasPath;
    }
  }
  const canonical = path.join(directory, "contentflow.plugin.json");
  if (existsSync(canonical)) return canonical;
  return existsSync(aliasPath) ? aliasPath : undefined;
}

export function assertPluginTreeSafe(directory: string) {
  const pending = [directory];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (++visited > 20_000) throw new Error("O pacote excede o limite de 20.000 arquivos.");
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink() || lstatSync(target).isSymbolicLink())
        throw new Error("Plugins comunitários não podem conter links simbólicos.");
      if (entry.isDirectory()) pending.push(target);
    }
  }
}

export function validatePluginDirectory(directory: string, checkSymlinks = true) {
  const absoluteDirectory = realpathSync(path.resolve(directory));
  const manifestPath = findPluginManifest(absoluteDirectory);
  if (!manifestPath) throw new Error("contentflow.plugin.json não foi encontrado.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Manifesto JSON inválido: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const manifest = validatePluginManifest(parsed);
  const entrypointPath = path.resolve(absoluteDirectory, manifest.entrypoint);
  if (!existsSync(entrypointPath) || !statSync(entrypointPath).isFile())
    throw new Error(`Entrypoint não encontrado: ${manifest.entrypoint}`);
  const realEntrypoint = realpathSync(entrypointPath);
  if (!realEntrypoint.startsWith(`${absoluteDirectory}${path.sep}`))
    throw new Error("O entrypoint precisa permanecer dentro da pasta do plugin.");
  if (checkSymlinks) assertPluginTreeSafe(absoluteDirectory);
  return { manifest, manifestPath, absoluteDirectory, entrypoint: realEntrypoint };
}
