/**
 * Public API of the engine layer.
 *
 * UI code should import from "@/engines" — never reach into individual
 * files. That keeps the internal layout free to change.
 */
export * from "./types";
export { DEFAULT_CONFIGS } from "./defaults";
export { REGISTRY, runProcess, buildCommand } from "./registry";
