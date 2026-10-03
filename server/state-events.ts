import type { Request, Response } from "express";

// The database clock is authoritative. Only its revision is broadcast, never
// project content; snapshots continue through the existing /api/state contract.
export function stateEvents(readRevision: () => number) {
  const clients = new Set<Response>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let previous = readRevision();
  let ticks = 0;
  const send = (client: Response, revision: number) => {
    if (!client.writableNeedDrain) client.write(`data: ${revision}\n\n`);
  };
  return (request: Request, response: Response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    clients.add(response);
    send(response, readRevision());
    response.on("drain", () => send(response, readRevision()));
    if (!timer) {
      previous = readRevision();
      timer = setInterval(() => {
        const revision = readRevision();
        if (revision !== previous) {
          previous = revision;
          for (const client of clients) send(client, revision);
        } else if (++ticks % 100 === 0) {
          for (const client of clients)
            if (!client.writableNeedDrain) client.write(": heartbeat\n\n");
        }
      }, 150);
      timer.unref();
    }
    request.on("close", () => {
      clients.delete(response);
      if (!clients.size) {
        clearInterval(timer);
        timer = undefined;
      }
    });
  };
}
