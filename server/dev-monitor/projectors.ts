import type { CollectedEvent, DevEvent } from "./contract";

export type EntityProjection = {
  key: string;
  type: string;
  id: string;
  domain: string;
  correlation: DevEvent["correlation"];
  status?: string;
  metadata: NonNullable<DevEvent["payload"]>;
  firstSeq: number;
  lastSeq: number;
  eventIds: string[];
  begins: number;
  ends: number;
  terminalOutcomes: string[];
  readySeq?: number;
  closedSeq?: number;
};
export type ProjectionContext = { entities: EntityProjection[] };
export function entityKey(event: Pick<DevEvent, "source" | "entity" | "correlation">) {
  return [
    event.source.domain,
    event.entity.type,
    event.correlation.executionId ?? "",
    event.correlation.blockId ?? "",
    event.entity.id,
  ].join(":");
}
export function projectEvents(events: CollectedEvent[]): ProjectionContext {
  const entities = new Map<string, EntityProjection>();
  for (const event of [...events].sort((a, b) => a.collectorSeq - b.collectorSeq)) {
    const key = entityKey(event);
    const entity = entities.get(key) ?? {
      key,
      type: event.entity.type,
      id: event.entity.id,
      domain: event.source.domain,
      correlation: {},
      metadata: {},
      firstSeq: event.collectorSeq,
      lastSeq: event.collectorSeq,
      eventIds: [],
      begins: 0,
      ends: 0,
      terminalOutcomes: [],
    };
    entity.correlation = { ...entity.correlation, ...event.correlation };
    entity.metadata = { ...entity.metadata, ...event.payload };
    if (typeof event.payload?.status === "string") {
      if (entity.status) entity.metadata.previousStatus = entity.status;
      entity.status = event.payload.status;
      if (entity.status === "ready") entity.readySeq = event.collectorSeq;
      if (["closed", "crashed"].includes(entity.status)) entity.closedSeq = event.collectorSeq;
    }
    entity.lastSeq = event.collectorSeq;
    entity.eventIds.push(event.eventId);
    if (event.phase === "begin") entity.begins++;
    if (event.phase === "end") {
      entity.ends++;
      entity.terminalOutcomes.push(event.outcome ?? "unknown");
    }
    entities.set(key, entity);
  }
  return { entities: [...entities.values()].sort((a, b) => a.key.localeCompare(b.key)) };
}
