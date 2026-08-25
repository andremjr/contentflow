import assert from "node:assert/strict";
import test from "node:test";
import { attemptAfterRetryInvalidation } from "../src/lib/retry-attempt";

test("invalida a identidade dos jobs já executados ao repetir um trecho validado", () => {
  assert.equal(
    attemptAfterRetryInvalidation({
      status: "completed",
      attempt: 1,
      completedAt: "2026-08-24T00:00:00.000Z",
    }),
    2,
  );
  assert.equal(attemptAfterRetryInvalidation({ status: "blocked_executor", attempt: 2 }), 3);
  assert.equal(attemptAfterRetryInvalidation({ status: "pending", attempt: 1 }), 1);
});
