import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Request, Response } from "express";
import { stateEvents } from "./state-events";

test("revision notifications are coalesced, respect backpressure and stop without clients", async () => {
  let revision = 10;
  let reads = 0;
  const subscribe = stateEvents(() => {
    reads++;
    return revision;
  });
  const request = new EventEmitter();
  const messages: string[] = [];
  const response = Object.assign(new EventEmitter(), {
    writableNeedDrain: false,
    setHeader: () => {},
    flushHeaders: () => {},
    write: (value: string) => {
      messages.push(value);
      return true;
    },
  });
  subscribe(request as Request, response as unknown as Response);
  try {
    assert.deepEqual(messages, ["data: 10\n\n"]);
    revision = 12;
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.deepEqual(messages, ["data: 10\n\n", "data: 12\n\n"]);
    response.writableNeedDrain = true;
    revision = 13;
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(messages.length, 2);
    response.writableNeedDrain = false;
    response.emit("drain");
    assert.equal(messages.at(-1), "data: 13\n\n");
  } finally {
    request.emit("close");
  }
  const finalReads = reads;
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(reads, finalReads);
});
