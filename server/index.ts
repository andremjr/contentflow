import express from "express";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fetchYouTubeChannel } from "./youtube";

const port = Number(process.env.CONTENTFLOW_API_PORT ?? 8787);
const dataDirectory = path.join(process.cwd(), "data");
mkdirSync(dataDirectory, { recursive: true });

const database = new Database(path.join(dataDirectory, "contentflow-os.sqlite"));
database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS projects_channel_id ON projects(channel_id);
`);

type StoredPayload = {
  id: string;
  channelId?: string;
  createdAt?: string;
  handle?: string;
};

function parseRows(rows: { payload: string }[]) {
  return rows.map((row) => JSON.parse(row.payload));
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/youtube/channel", async (request, response) => {
  try {
    const handle = typeof request.query.handle === "string" ? request.query.handle : "";
    response.json(await fetchYouTubeChannel(handle));
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível consultar o YouTube.",
    });
  }
});

app.get("/api/channels", (_request, response) => {
  const rows = database.prepare("SELECT payload FROM channels ORDER BY created_at DESC").all() as {
    payload: string;
  }[];
  response.json(parseRows(rows));
});

app.post("/api/channels", (request, response) => {
  const channel = request.body as StoredPayload;
  if (!channel?.id || !channel.createdAt) {
    response.status(400).json({ error: "Canal inválido." });
    return;
  }
  database
    .prepare("INSERT INTO channels (id, payload, created_at) VALUES (?, ?, ?)")
    .run(channel.id, JSON.stringify(channel), channel.createdAt);
  response.status(201).json(channel);
});

app.put("/api/channels/:id", (request, response) => {
  const channel = request.body as StoredPayload;
  if (!channel?.id || channel.id !== request.params.id) {
    response.status(400).json({ error: "Canal inválido." });
    return;
  }
  const result = database
    .prepare("UPDATE channels SET payload = ? WHERE id = ?")
    .run(JSON.stringify(channel), channel.id);
  if (result.changes === 0) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }
  response.json(channel);
});

app.post("/api/channels/:id/sync-youtube", async (request, response) => {
  const row = database
    .prepare("SELECT payload FROM channels WHERE id = ?")
    .get(request.params.id) as { payload: string } | undefined;

  if (!row) {
    response.status(404).json({ error: "Canal não encontrado." });
    return;
  }

  try {
    const channel = JSON.parse(row.payload) as StoredPayload;
    const profile = await fetchYouTubeChannel(channel.handle ?? "");
    const updated = { ...channel, ...profile };
    database
      .prepare("UPDATE channels SET payload = ? WHERE id = ?")
      .run(JSON.stringify(updated), request.params.id);
    response.json(updated);
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível atualizar esse canal.",
    });
  }
});

app.delete("/api/channels/:id", (request, response) => {
  const remove = database.transaction((channelId: string) => {
    database.prepare("DELETE FROM projects WHERE channel_id = ?").run(channelId);
    return database.prepare("DELETE FROM channels WHERE id = ?").run(channelId);
  });
  const result = remove(request.params.id) as { changes: number };
  response.status(result.changes ? 204 : 404).end();
});

app.get("/api/projects", (request, response) => {
  const channelId =
    typeof request.query.channelId === "string" ? request.query.channelId : undefined;
  const rows = channelId
    ? (database
        .prepare("SELECT payload FROM projects WHERE channel_id = ? ORDER BY created_at DESC")
        .all(channelId) as { payload: string }[])
    : (database.prepare("SELECT payload FROM projects ORDER BY created_at DESC").all() as {
        payload: string;
      }[]);
  response.json(parseRows(rows));
});

app.post("/api/projects", (request, response) => {
  const project = request.body as StoredPayload;
  if (!project?.id || !project.channelId || !project.createdAt) {
    response.status(400).json({ error: "Projeto inválido." });
    return;
  }
  database
    .prepare("INSERT INTO projects (id, channel_id, payload, created_at) VALUES (?, ?, ?, ?)")
    .run(project.id, project.channelId, JSON.stringify(project), project.createdAt);
  response.status(201).json(project);
});

app.put("/api/projects/:id", (request, response) => {
  const project = request.body as StoredPayload;
  if (!project?.id || project.id !== request.params.id || !project.channelId) {
    response.status(400).json({ error: "Projeto inválido." });
    return;
  }
  const result = database
    .prepare("UPDATE projects SET channel_id = ?, payload = ? WHERE id = ?")
    .run(project.channelId, JSON.stringify(project), project.id);
  if (result.changes === 0) {
    response.status(404).json({ error: "Projeto não encontrado." });
    return;
  }
  response.json(project);
});

app.delete("/api/projects/:id", (request, response) => {
  const result = database.prepare("DELETE FROM projects WHERE id = ?").run(request.params.id);
  response.status(result.changes ? 204 : 404).end();
});

app.listen(port, "127.0.0.1", () => {
  console.log(`ContentFlow OS API local pronta em http://127.0.0.1:${port}`);
});
