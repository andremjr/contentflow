import { readFileSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { valueShapeSchema } from "../src/lib/value-shape-schema";

type BuilderSession = {
  version: 1;
  apiUrl: string;
  token: string;
  pid: number;
  createdAt: string;
};

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const sessionPath = argument("--session");
const defaultChannelId = argument("--channel");
if (!sessionPath) throw new Error("Use --session para informar a sessão MCP do ContentFlow.");

const session = JSON.parse(readFileSync(path.resolve(sessionPath), "utf8")) as BuilderSession;
if (session.version !== 1 || !session.apiUrl || !session.token) {
  throw new Error("A sessão MCP do ContentFlow é inválida.");
}

async function api(pathname: string, init?: RequestInit) {
  const response = await fetch(`${session.apiUrl}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok && response.status !== 422) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `ContentFlow returned HTTP ${response.status}.`,
    );
  }
  return payload;
}

function result(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function channelId(value?: string) {
  const resolved = value || defaultChannelId;
  if (!resolved) throw new Error("Informe channelId ou conecte o MCP a partir da página do canal.");
  return resolved;
}

const server = new McpServer(
  { name: "contentflow-method-builder", version: "1.2.0" },
  {
    instructions:
      "Configure Methods, process order, and the Strategic Library only for channels that already exist in ContentFlow. Inspect the channel context and method contract first. Create strategic inputs and outputs only as content (text, image, audio, video). JSON and SRT are text when explicitly accepted by the plugin port; never assume the Core parses textual JSON into item relations. For consistent visual characters, extract characters from the script first, then create scene prompts with character IDs using plugin-declared JSON text configuration. The producing plugin supplies canonical input IDs and validates its text format; the consuming plugin resolves references using delivery provenance. Core does not choose characters or interpret editorial associations. Functional plugin controls come from its capability schema. Preserve existing internal control/record contracts; do not expose technical schemas to users. Native validation decisions, collection selection identity and channel history remain internal. Design the strategy and observable Block boundaries before selecting plugins: split stages that have reusable intermediate outputs, editorial validation, different result families, independent effects, or meaningful partial recovery; never collapse stages only because a plugin offers a combined mode. Do not create Blocks for collection items, attempts, profiles, lanes, leases, login, navigation, upload, polling, download, parsing, or technical validation: those belong to Core work units/profile policy or internal plugin/Browser Bridge execution. Use only installed plugins and local connection/profile identifiers exposed by the context, validate Methods before applying, and never request or store secrets. Do not create channels or plugins. Production execution remains inside ContentFlow.",
  },
);

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

const strategicFieldSchema = z.object({
  id: z.string().optional().describe("Existing field ID when updating; omit for a new field"),
  label: z.string().min(1),
  shape: valueShapeSchema,
  required: z.boolean(),
});

server.registerTool(
  "list_contentflow_channels",
  {
    title: "List ContentFlow channels",
    description:
      "Lists existing channels and which of the eight universal processes already have Methods.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(await api("/api/builder/channels")),
);

server.registerTool(
  "get_contentflow_method_contract",
  {
    title: "Get ContentFlow Method contract",
    description:
      "Returns the canonical eight processes, four block types, three operators, process output ports, strategic Block-granularity guidance, and portability rules.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(await api("/api/builder/method-contract")),
);

server.registerTool(
  "inspect_contentflow_channel",
  {
    title: "Inspect ContentFlow channel",
    description:
      "Reads one channel, its Methods, strategic collections, installed plugin capabilities, profiles, and connection summaries. Secrets are never returned.",
    inputSchema: { channelId: z.string().optional().describe("Existing ContentFlow channel ID") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ channelId: requested }) =>
    result(await api(`/api/builder/channels/${encodeURIComponent(channelId(requested))}/context`)),
);

server.registerTool(
  "get_contentflow_strategic_library",
  {
    title: "Get ContentFlow Strategic Library",
    description:
      "Reads every Strategic Library collection and item for one existing channel, including field IDs and item values.",
    inputSchema: { channelId: z.string().optional().describe("Existing ContentFlow channel ID") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ channelId: requested }) =>
    result(await api(`/api/builder/channels/${encodeURIComponent(channelId(requested))}/library`)),
);

server.registerTool(
  "set_contentflow_process_order",
  {
    title: "Set ContentFlow process order",
    description:
      "Sets the order of all eight universal processes for an existing channel. The order is rejected when it violates Method dependencies.",
    inputSchema: {
      channelId: z.string().optional().describe("Existing ContentFlow channel ID"),
      processOrder: z
        .array(universalProcessSchema)
        .length(8)
        .describe("All eight universal process IDs exactly once, in the desired order"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ channelId: requested, processOrder }) => {
    const payload = await api(
      `/api/builder/channels/${encodeURIComponent(channelId(requested))}/process-order`,
      { method: "PUT", body: JSON.stringify({ processOrder }) },
    );
    return result(payload, payload?.ok === false);
  },
);

server.registerTool(
  "create_contentflow_strategic_collection",
  {
    title: "Create ContentFlow Strategic Library collection",
    description:
      "Creates a collection in an existing channel Strategic Library. Field IDs may be omitted and will be generated by ContentFlow.",
    inputSchema: {
      channelId: z.string().optional().describe("Existing ContentFlow channel ID"),
      name: z.string().min(1).max(200),
      fields: z.array(strategicFieldSchema).min(1).max(100),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ channelId: requested, name, fields }) =>
    result(
      await api(`/api/builder/channels/${encodeURIComponent(channelId(requested))}/collections`, {
        method: "POST",
        body: JSON.stringify({ name, fields }),
      }),
    ),
);

server.registerTool(
  "update_contentflow_strategic_collection",
  {
    title: "Update ContentFlow Strategic Library collection",
    description:
      "Updates a collection name or schema. Preserve existing field IDs when editing fields already used by Methods.",
    inputSchema: {
      channelId: z.string().optional().describe("Existing ContentFlow channel ID"),
      collectionId: z.string().min(1),
      name: z.string().min(1).max(200),
      fields: z.array(strategicFieldSchema).min(1).max(100),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ channelId: requested, collectionId, name, fields }) => {
    const payload = await api(
      `/api/builder/channels/${encodeURIComponent(channelId(requested))}/collections/${encodeURIComponent(collectionId)}`,
      { method: "PUT", body: JSON.stringify({ name, fields }) },
    );
    return result(payload, payload?.ok === false);
  },
);

server.registerTool(
  "delete_contentflow_strategic_collection",
  {
    title: "Delete ContentFlow Strategic Library collection",
    description:
      "Deletes a Strategic Library collection and its items only when no Method still references that collection.",
    inputSchema: {
      channelId: z.string().optional().describe("Existing ContentFlow channel ID"),
      collectionId: z.string().min(1),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ channelId: requested, collectionId }) => {
    const payload = await api(
      `/api/builder/channels/${encodeURIComponent(channelId(requested))}/collections/${encodeURIComponent(collectionId)}`,
      { method: "DELETE" },
    );
    return result(payload, payload?.ok === false);
  },
);

server.registerTool(
  "create_contentflow_strategic_item",
  {
    title: "Create ContentFlow Strategic Library item",
    description:
      "Creates an item inside one Strategic Library collection. Values may use field IDs or exact field labels as keys.",
    inputSchema: {
      channelId: z.string().optional().describe("Existing ContentFlow channel ID"),
      collectionId: z.string().min(1),
      values: z.record(z.unknown()),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ channelId: requested, collectionId, values }) =>
    result(
      await api(
        `/api/builder/channels/${encodeURIComponent(channelId(requested))}/collections/${encodeURIComponent(collectionId)}/items`,
        { method: "POST", body: JSON.stringify({ values }) },
      ),
    ),
);

server.registerTool(
  "update_contentflow_strategic_item",
  {
    title: "Update ContentFlow Strategic Library item",
    description:
      "Replaces the values of one Strategic Library item. Values may use field IDs or exact field labels as keys.",
    inputSchema: {
      channelId: z.string().optional().describe("Existing ContentFlow channel ID"),
      collectionId: z.string().min(1),
      itemId: z.string().min(1),
      values: z.record(z.unknown()),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ channelId: requested, collectionId, itemId, values }) => {
    const payload = await api(
      `/api/builder/channels/${encodeURIComponent(channelId(requested))}/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`,
      { method: "PUT", body: JSON.stringify({ values }) },
    );
    return result(payload, payload?.ok === false);
  },
);

server.registerTool(
  "delete_contentflow_strategic_item",
  {
    title: "Delete ContentFlow Strategic Library item",
    description: "Deletes one item from a Strategic Library collection.",
    inputSchema: {
      channelId: z.string().optional().describe("Existing ContentFlow channel ID"),
      collectionId: z.string().min(1),
      itemId: z.string().min(1),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ channelId: requested, collectionId, itemId }) => {
    const payload = await api(
      `/api/builder/channels/${encodeURIComponent(channelId(requested))}/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
    );
    return result(payload, payload?.ok === false);
  },
);

server.registerTool(
  "validate_contentflow_methods",
  {
    title: "Validate ContentFlow Methods",
    description:
      "Validates a partial map of Methods without changing the channel. Keys must be universal process IDs and values must be complete ProcessMethod objects. New strategic fields must use kind content; preserve existing internal fields.",
    inputSchema: {
      channelId: z.string().optional().describe("Existing ContentFlow channel ID"),
      methods: z.record(z.unknown()).describe("Partial Record<UniversalProcess, ProcessMethod>"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ channelId: requested, methods }) => {
    const payload = await api(
      `/api/builder/channels/${encodeURIComponent(channelId(requested))}/validate`,
      { method: "POST", body: JSON.stringify({ methods }) },
    );
    return result(payload, payload?.ok === false);
  },
);

server.registerTool(
  "apply_contentflow_methods",
  {
    title: "Apply ContentFlow Methods",
    description:
      "Validates and saves Methods to an existing channel. During data migration, only stages reviewed v3 Methods in the migration plan without writing data; pass the current planId from channel context. Inspect and validate first. Apply only when requested by the user. Migration is committed separately with backup consent.",
    inputSchema: {
      channelId: z.string().optional().describe("Existing ContentFlow channel ID"),
      methods: z.record(z.unknown()).describe("Partial Record<UniversalProcess, ProcessMethod>"),
      planId: z
        .string()
        .optional()
        .describe("Required during migration: the fresh reviewed migration plan ID"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ channelId: requested, methods, planId }) => {
    const payload = await api(
      `/api/builder/channels/${encodeURIComponent(channelId(requested))}/apply`,
      { method: "POST", body: JSON.stringify({ methods, planId }) },
    );
    return result(payload, payload?.ok === false);
  },
);

server.registerTool(
  "get_contentflow_migration_plan",
  {
    title: "Inspect ContentFlow migration",
    description:
      "Read migration diagnostics and staged Method proposals. Inspect channel context for original methods, reviewMethods and installed plugin ports. Proposals are temporary and invalidated by changes to data or plugin contracts. Execution stays blocked until migration is applied.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => result(await api("/api/upgrade/plan")),
);

server.registerTool(
  "apply_contentflow_migration",
  {
    title: "Apply reviewed ContentFlow migration",
    description:
      "Create and verify a recoverable backup, then atomically apply the reviewed migration and staged Method proposals. Only after explicit user authorization for this plan and backup. Refuses remaining diagnostics or a changed plan; preserves historical jobs and completed work.",
    inputSchema: {
      planId: z.string().describe("Fresh migration plan ID reviewed by the user"),
      confirmBackup: z
        .boolean()
        .describe("Explicit user consent to create a recoverable backup and apply this migration"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ planId, confirmBackup }) =>
    result(
      await api("/api/builder/upgrade/apply", {
        method: "POST",
        body: JSON.stringify({ planId, confirmBackup }),
      }),
    ),
);

await server.connect(new StdioServerTransport());
console.error("ContentFlow Method Builder MCP conectado por stdio.");
