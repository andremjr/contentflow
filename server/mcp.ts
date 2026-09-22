import { readFileSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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
  { name: "contentflow-method-builder", version: "1.0.0" },
  {
    instructions:
      "Configure Methods, process order, and the Strategic Library only for channels that already exist in ContentFlow. Inspect the channel context and method contract first, use only installed plugins and local connection/profile identifiers exposed by the context, validate Methods before applying, and never request or store secrets. Do not create channels or plugins. Production execution remains inside ContentFlow.",
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
  type: z.enum(["text", "textarea", "number", "image", "url", "thumbnail_layout"]),
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
      "Returns the canonical eight processes, four block types, three operators, process outputs, and portability rules.",
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
      "Validates a partial map of Methods without changing the channel. Keys must be universal process IDs and values must be complete ProcessMethod objects.",
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
      "Atomically validates and saves a partial map of Methods to an existing channel. Use only after inspection and successful validation, and only when the user asked to apply the plan.",
    inputSchema: {
      channelId: z.string().optional().describe("Existing ContentFlow channel ID"),
      methods: z.record(z.unknown()).describe("Partial Record<UniversalProcess, ProcessMethod>"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ channelId: requested, methods }) => {
    const payload = await api(
      `/api/builder/channels/${encodeURIComponent(channelId(requested))}/apply`,
      { method: "POST", body: JSON.stringify({ methods }) },
    );
    return result(payload, payload?.ok === false);
  },
);

await server.connect(new StdioServerTransport());
console.error("ContentFlow Method Builder MCP conectado por stdio.");
