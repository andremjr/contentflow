import net from "node:net";
import { randomBytes } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  domains,
  eventSchema,
  sanitizePayload,
  type CollectedEvent,
  type Scenario,
} from "./contract";

const sourceSchema = eventSchema.shape.source.omit({ sourceSeq: true });
const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("register"), source: sourceSchema }),
  z.object({
    type: z.literal("flush"),
    source: sourceSchema,
    finalSeq: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("event"), event: eventSchema }),
]);
export type MonitorIntegrity = {
  valid: boolean;
  expectedDomains: number;
  observedDomains: number;
  droppedEvents: number;
  sequenceGaps: number;
  allSourcesFlushed: boolean;
  problems: string[];
};
export class DevCollector {
  readonly startedAt = new Date().toISOString();
  readonly events: CollectedEvent[] = [];
  readonly problems: string[] = [];
  readonly token = randomBytes(32).toString("hex");
  readonly sources = new Map<
    string,
    {
      domain: string;
      component: string;
      processId: string;
      seq: number;
      flushed: boolean;
      dropped: number;
    }
  >();
  private ids = new Set<string>();
  private collectorDropped = 0;
  private sockets = new Set<net.Socket>();
  private server = net.createServer((socket) => {
    this.sockets.add(socket);
    let buffer = "";
    socket.on("error", () => {
      this.problems.push("TRANSPORT_ERROR");
    });
    socket.on("close", () => {
      if (buffer.trim()) this.problems.push("TRUNCATED_FRAME");
      this.sockets.delete(socket);
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.length > 65536 || this.problems.length >= 1000) {
          this.problems.push("FRAME_LIMIT");
          socket.destroy();
          return;
        }
        try {
          const message = JSON.parse(line);
          if (
            message.type === "flush-request" &&
            message.token === this.token &&
            message.runId === this.runId
          ) {
            for (const producer of this.sockets) if (producer !== socket) producer.write("flush\n");
            const deadline = Date.now() + 1500;
            const interval = setInterval(() => {
              if ([...this.sources.values()].every((s) => s.flushed) || Date.now() >= deadline) {
                clearInterval(interval);
                socket.write("flushed\n");
              }
            }, 10);
          } else this.accept(message);
        } catch {
          this.problems.push("INVALID_JSON");
        }
      }
      if (buffer.length > 65536) {
        this.problems.push("FRAME_LIMIT");
        socket.destroy();
      }
    });
  });
  private stream;
  endpoint = "";
  constructor(
    readonly runId: string,
    readonly scenario: Scenario,
    readonly directory: string,
  ) {
    mkdirSync(directory, { recursive: true });
    this.stream = createWriteStream(path.join(directory, "events.jsonl"), { flags: "wx" });
    this.stream.on("error", () => {
      this.problems.push("STORAGE_ERROR");
    });
    writeFileSync(
      path.join(directory, "run.json"),
      JSON.stringify(
        { runId, scenario, schemaVersion: 1, startedAt: this.startedAt, complete: false },
        null,
        2,
      ),
    );
  }
  async start() {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", resolve);
    });
    const address = this.server.address() as net.AddressInfo;
    this.endpoint = `127.0.0.1:${address.port}`;
    return {
      CONTENTFLOW_DEV_MONITOR_RUN: this.runId,
      CONTENTFLOW_DEV_MONITOR_ENDPOINT: this.endpoint,
      CONTENTFLOW_DEV_MONITOR_TOKEN: this.token,
    };
  }
  accept(raw: unknown) {
    const envelope = z
      .object({ runId: z.literal(this.runId), token: z.literal(this.token) })
      .passthrough()
      .safeParse(raw);
    if (!envelope.success) {
      this.problems.push("UNAUTHORIZED_FRAME");
      return;
    }
    const parsed = messageSchema.safeParse(envelope.data);
    if (!parsed.success) {
      this.problems.push("INVALID_SCHEMA");
      return;
    }
    const message = parsed.data;
    const source = message.type === "event" ? message.event.source : message.source;
    const key = `${source.domain}:${source.component}:${source.processId}`;
    if (message.type === "register") {
      if (this.sources.size >= 128) {
        this.problems.push("PRODUCER_LIMIT");
        return;
      }
      if (this.sources.has(key)) this.problems.push("DUPLICATE_PRODUCER");
      else
        this.sources.set(key, {
          domain: source.domain,
          component: source.component,
          processId: source.processId,
          seq: 0,
          flushed: false,
          dropped: 0,
        });
      return;
    }
    const registered = this.sources.get(key);
    if (!registered) {
      this.problems.push("UNREGISTERED_PRODUCER");
      return;
    }
    if (message.type === "flush") {
      if (registered.flushed || message.finalSeq !== registered.seq)
        this.problems.push("FLUSH_SEQUENCE_MISMATCH");
      registered.flushed = true;
      registered.dropped = message.dropped;
      return;
    }
    const event = message.event;
    if (event.kind === "instrumentation.invalid") this.problems.push("INVALID_WORKER_EVENT");
    if (event.runId !== this.runId || registered.flushed) {
      this.problems.push("EVENT_AFTER_FLUSH_OR_WRONG_RUN");
      return;
    }
    if (this.ids.has(event.eventId)) {
      this.problems.push("DUPLICATE_EVENT");
      return;
    }
    if (event.source.sourceSeq !== registered.seq + 1) this.problems.push("SOURCE_SEQUENCE_GAP");
    registered.seq = event.source.sourceSeq;
    this.ids.add(event.eventId);
    if (this.events.length >= 100000 || this.stream.writableLength > 1024 * 1024) {
      this.collectorDropped++;
      this.problems.push("EVENT_LIMIT");
      return;
    }
    const collected = {
      ...event,
      payload: sanitizePayload(event.payload),
      collectorSeq: this.events.length + 1,
      receivedAt: new Date().toISOString(),
    };
    this.events.push(collected);
    this.stream.write(JSON.stringify(collected) + "\n");
  }
  integrity(): MonitorIntegrity {
    const problems = [...this.problems];
    const observed = new Set(this.events.map((e) => e.source.domain));
    for (const domain of this.scenario.expectedDomains)
      if (!observed.has(domain)) problems.push(`MISSING_DOMAIN:${domain}`);
    for (const producer of this.scenario.expectedProducers)
      if (
        ![...this.sources.values()].some(
          (s) => s.domain === producer.domain && s.component === producer.component,
        )
      )
        problems.push(`MISSING_PRODUCER:${producer.domain}:${producer.component}`);
    for (const family of this.scenario.requiredEventFamilies)
      if (!this.events.some((e) => `${e.source.domain}:${e.kind}` === family))
        problems.push(`MISSING_FAMILY:${family}`);
    const allSourcesFlushed =
      this.sources.size > 0 && [...this.sources.values()].every((s) => s.flushed);
    const droppedByProcess = new Map<string, number>();
    for (const source of this.sources.values())
      droppedByProcess.set(
        source.processId,
        Math.max(droppedByProcess.get(source.processId) ?? 0, source.dropped),
      );
    const droppedEvents =
      this.collectorDropped +
      [...droppedByProcess.values()].reduce((sum, dropped) => sum + dropped, 0);
    if (!allSourcesFlushed) problems.push("UNFLUSHED_PRODUCER");
    if (droppedEvents) problems.push("DROPPED_EVENTS");
    if (!this.events.length) problems.push("EMPTY_TRACE");
    return {
      valid: !problems.length,
      expectedDomains: this.scenario.expectedDomains.length,
      observedDomains: domains.filter((d) => observed.has(d)).length,
      droppedEvents,
      sequenceGaps: problems.filter((p) => p === "SOURCE_SEQUENCE_GAP").length,
      allSourcesFlushed,
      problems: [...new Set(problems)].sort(),
    };
  }
  async stop() {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    await new Promise<void>((resolve) => this.stream.end(resolve));
  }
}
