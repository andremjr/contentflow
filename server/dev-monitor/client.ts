import net from "node:net";
import { randomUUID } from "node:crypto";
import { threadId } from "node:worker_threads";
import { sanitizePayload, type DevEventSink, type Domain, type EventInput } from "./contract";

export const NoopDevEventSink: DevEventSink = Object.freeze({ enabled: false, emit() {} });
const sinks = new Map<string, DevEventSink>();
let socket: net.Socket | undefined;
let dropped = 0;
let closed = false;
const sequences = new Map<string, number>();
const processId = `${process.pid}-${threadId}-${randomUUID()}`;
export function monitorEnabled() {
  return Boolean(
    process.env.CONTENTFLOW_DEV_MONITOR_RUN &&
    process.env.CONTENTFLOW_DEV_MONITOR_ENDPOINT &&
    process.env.CONTENTFLOW_DEV_MONITOR_TOKEN,
  );
}
function send(message: object) {
  if (closed) {
    dropped++;
    return;
  }
  if (!socket) {
    const endpoint = process.env.CONTENTFLOW_DEV_MONITOR_ENDPOINT!;
    if (!/^127\.0\.0\.1:\d+$/.test(endpoint)) {
      dropped++;
      return;
    }
    socket = net.createConnection({ host: "127.0.0.1", port: Number(endpoint.split(":")[1]) });
    socket.on("error", () => {
      dropped++;
      closed = true;
    });
    socket.on("close", () => {
      closed = true;
    });
    socket.on("data", () => {
      void flushMonitor();
    });
    socket.unref();
    process.once("beforeExit", () => {
      void flushMonitor();
    });
    // Only explicitly monitored server processes install this shutdown hook.
    process.once("SIGTERM", () => {
      void flushMonitor().finally(() => process.exit(0));
    });
  }
  if (socket.writableLength > 256 * 1024) {
    dropped++;
    return;
  }
  socket.write(
    JSON.stringify({
      ...message,
      runId: process.env.CONTENTFLOW_DEV_MONITOR_RUN,
      token: process.env.CONTENTFLOW_DEV_MONITOR_TOKEN,
    }) + "\n",
  );
}
export async function requestMonitorFlush() {
  if (!monitorEnabled()) return;
  const connection = net.createConnection({
    host: "127.0.0.1",
    port: Number(process.env.CONTENTFLOW_DEV_MONITOR_ENDPOINT!.split(":")[1]),
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      connection.destroy();
      reject(new Error("MONITOR_FLUSH_TIMEOUT"));
    }, 2000);
    connection.on("error", reject);
    connection.on("data", () => {
      clearTimeout(timer);
      connection.end();
      resolve();
    });
    connection.on("connect", () =>
      connection.write(
        JSON.stringify({
          type: "flush-request",
          runId: process.env.CONTENTFLOW_DEV_MONITOR_RUN,
          token: process.env.CONTENTFLOW_DEV_MONITOR_TOKEN,
        }) + "\n",
      ),
    );
  });
}
export function devProbe(domain: Domain, component: string): DevEventSink {
  if (!monitorEnabled()) return NoopDevEventSink;
  const key = `${domain}:${component}`;
  const existing = sinks.get(key);
  if (existing) return existing;
  sequences.set(key, 0);
  const ordinal = sinks.size;
  try {
    send({ type: "register", source: { domain, component, processId } });
  } catch {
    dropped++;
    return NoopDevEventSink;
  }
  const sink: DevEventSink = {
    enabled: true,
    emit(input: EventInput) {
      try {
        const sourceSeq = sequences.get(key)! + 1;
        sequences.set(key, sourceSeq);
        send({
          type: "event",
          event: {
            ...input,
            payload: sanitizePayload(input.payload),
            schemaVersion: 1,
            eventId: `${processId}:${ordinal}:${sourceSeq}`,
            runId: process.env.CONTENTFLOW_DEV_MONITOR_RUN,
            source: { domain, component, processId, sourceSeq },
            observedAt: new Date().toISOString(),
          },
        });
      } catch {
        dropped++;
      }
    },
  };
  sinks.set(key, sink);
  return sink;
}
export async function flushMonitor() {
  if (!socket || closed) return;
  for (const [key, finalSeq] of sequences) {
    const separator = key.indexOf(":");
    const domain = key.slice(0, separator);
    const component = key.slice(separator + 1);
    send({ type: "flush", source: { domain, component, processId }, finalSeq, dropped });
  }
  closed = true;
  const active = socket;
  active.ref();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      active.destroy();
      resolve();
    }, 2000);
    active.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    active.end();
  });
}
