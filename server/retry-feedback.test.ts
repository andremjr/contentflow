import assert from "node:assert/strict";
import test from "node:test";
import { instructionWithRetryFeedback } from "../src/lib/retry-feedback";

test("acrescenta as observações da reprovação ao prompt do bloco repetido", () => {
  assert.equal(
    instructionWithRetryFeedback("Crie um novo tema.", {
      decision: "rejected",
      feedback: "Troque o acontecimento e deixe a promessa mais específica.",
    }),
    "Crie um novo tema.\n\nOBSERVAÇÕES DA REPROVAÇÃO ANTERIOR:\nTroque o acontecimento e deixe a promessa mais específica.",
  );
});
