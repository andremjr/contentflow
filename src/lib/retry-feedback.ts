import type { RuntimeValue } from "@/lib/domain";

function feedbackText(feedback: Record<string, RuntimeValue> | undefined) {
  if (!feedback) return "";
  for (const key of ["feedback", "observations", "observacoes", "notes"]) {
    const value = feedback[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const remaining = Object.fromEntries(
    Object.entries(feedback).filter(([key, value]) => key !== "decision" && value != null),
  );
  return Object.keys(remaining).length ? JSON.stringify(remaining, null, 2) : "";
}

export function instructionWithRetryFeedback(
  instruction: string,
  feedback: Record<string, RuntimeValue> | undefined,
) {
  const observations = feedbackText(feedback);
  if (!observations) return instruction;
  return [instruction.trim(), `OBSERVAÇÕES DA REPROVAÇÃO ANTERIOR:\n${observations}`]
    .filter(Boolean)
    .join("\n\n");
}
