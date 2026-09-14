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
      "Configure Methods only for channels that already exist in ContentFlow. Inspect the channel context and method contract first, use only installed plugins and local connection/profile identifiers exposed by the context, validate before applying, and never request or store secrets. Do not create channels or plugins. Production execution remains inside ContentFlow.",
  },
);

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
