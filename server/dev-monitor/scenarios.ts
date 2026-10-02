import type { Scenario } from "./contract";

export const scenarios: Record<string, Scenario & { args: string[] }> = {
  "strategic-library": {
    name: "strategic-library",
    intent:
      "HTTP → lote atômico → ESCOLHER → reserva exclusiva → conclusão do Processo → consumo e snapshot tipado; restart é validado na execução direta da suite",
    expectedDomains: ["core", "method", "plugin"],
    expectedProducers: [
      { domain: "core", component: "execution-persistence" },
      { domain: "method", component: "method-snapshot" },
      { domain: "plugin", component: "plugin-runner" },
    ],
    requiredEventFamilies: [
      "plugin:invocation.started",
      "plugin:invocation.completed",
      "core:execution.snapshot",
      "core:block.snapshot",
      "core:delivery.snapshot",
      "method:method.snapshot",
      "method:block.snapshot",
    ],
    timeoutMs: 120000,
    requiredChecks: [
      "PLUGIN.INVOCATION.HAS_TERMINAL_RESULT",
      "PLUGIN.INVOCATION.CORE_ORIGIN",
      "CORE.EXECUTION.STRUCTURAL_INVARIANTS",
      "CORE.BLOCK.REQUIRED_OUTPUTS",
      "CORE.EXECUTION.OFFICIAL_OUTPUT",
      "METHOD.BLOCK.CORE_EXECUTION_MATCH",
      "METHOD.SNAPSHOT.CANONICAL",
    ],
    args: ["--import", "tsx", "--test", "server/strategic-library.integration.test.ts"],
  },
  "human-theme": {
    name: "human-theme",
    intent: "HTTP → snapshot → Core humano → persistência → delivery e output oficial",
    expectedDomains: ["core", "method"],
    expectedProducers: [
      { domain: "core", component: "execution-persistence" },
      { domain: "method", component: "method-snapshot" },
    ],
    requiredEventFamilies: [
      "core:execution.snapshot",
      "core:block.snapshot",
      "core:delivery.snapshot",
      "method:method.snapshot",
      "method:block.snapshot",
    ],
    timeoutMs: 30000,
    requiredChecks: [
      "CORE.EXECUTION.STRUCTURAL_INVARIANTS",
      "CORE.EXECUTION.HAS_TERMINAL_STATE",
      "CORE.BLOCK.HAS_TERMINAL_STATE",
      "CORE.BLOCK.REQUIRED_OUTPUTS",
      "CORE.EXECUTION.OFFICIAL_OUTPUT",
      "METHOD.BLOCK.CORE_EXECUTION_MATCH",
      "METHOD.SNAPSHOT.CANONICAL",
    ],
    args: ["--import", "tsx", "--test", "server/dev-monitor/vertical.test.ts"],
  },
  "sandbox-faults": {
    name: "sandbox-faults",
    intent: "Plugin real na sandbox: sucesso, erro estruturado, timeout e cancelamento",
    expectedDomains: ["plugin"],
    expectedProducers: [{ domain: "plugin", component: "plugin-runner" }],
    requiredEventFamilies: [
      "plugin:invocation.started",
      "plugin:invocation.completed",
      "plugin:invocation.failed",
    ],
    timeoutMs: 30000,
    requiredChecks: ["PLUGIN.INVOCATION.HAS_TERMINAL_RESULT", "PLUGIN.INVOCATION.CORE_ORIGIN"],
    args: ["--import", "tsx", "--test", "server/deterministic-fault-injection.integration.test.ts"],
  },
};
