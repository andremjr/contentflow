import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { DevCollector } from "../server/dev-monitor/collector";
import { diffRuns, writeReport, readTrace } from "../server/dev-monitor/report";
import { scenarios } from "../server/dev-monitor/scenarios";
import { coverageMatrix } from "../server/dev-monitor/coverage";

const [command, arg, second] = process.argv.slice(2);
function runDirectory(run: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(run)) throw new Error("Invalid run ID");
  return path.resolve(".dev-monitor", "runs", run);
}
if (command === "run") {
  const scenario = scenarios[arg];
  if (!scenario)
    throw new Error(`Unknown scenario. Available: ${Object.keys(scenarios).join(", ")}`);
  const runId = `${scenario.name}-${randomUUID()}`;
  const directory = runDirectory(runId);
  const collector = new DevCollector(runId, scenario, directory);
  const env = await collector.start();
  const child = spawn(process.execPath, scenario.args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  // Drain traditional test output without persisting or exposing it by default.
  child.stdout.resume();
  child.stderr.resume();
  let timeout = false;
  const timer = setTimeout(() => {
    timeout = true;
    child.kill("SIGTERM");
  }, scenario.timeoutMs);
  const forced = setTimeout(() => child.kill("SIGKILL"), scenario.timeoutMs + 3000);
  forced.unref();
  const [code] = await once(child, "exit");
  clearTimeout(timer);
  clearTimeout(forced);
  await collector.stop();
  const digest = writeReport({
    directory,
    runId,
    scenario,
    events: collector.events,
    integrity: collector.integrity(),
    functional: timeout ? "timeout" : code === 0 ? "ok" : "error",
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    startedAt: collector.startedAt,
  });
  process.stdout.write(JSON.stringify(digest, null, 2) + "\n");
  if (digest.verdict !== "PASS") {
    process.exitCode = 1;
  }
} else if (command === "inspect") {
  // Read the digest first. Integrity of the full trace is validated separately on demand.
  process.stdout.write(readFileSync(path.join(runDirectory(arg), "ai-digest.json"), "utf8"));
} else if (command === "verify") {
  const directory = runDirectory(arg);
  const run = JSON.parse(readFileSync(path.join(directory, "run.json"), "utf8"));
  const events = readTrace(directory);
  if (
    !run.complete ||
    run.eventCount !== events.length ||
    !run.monitorIntegrity.valid ||
    run.traceHash !==
      createHash("sha256")
        .update(readFileSync(path.join(directory, "events.jsonl")))
        .digest("hex")
  )
    throw new Error("INVALID_INSTRUMENTATION");
  process.stdout.write("TRACE_VALID\n");
} else if (command === "evidence") {
  const directory = runDirectory(arg);
  const checks = JSON.parse(readFileSync(path.join(directory, "checks.json"), "utf8")) as Array<{
    checkId: string;
    evidence?: string;
  }>;
  for (const check of checks.filter((c) => c.checkId === second && c.evidence))
    process.stdout.write(readFileSync(path.join(directory, check.evidence!), "utf8"));
} else if (command === "diff") {
  process.stdout.write(
    JSON.stringify(diffRuns(runDirectory(arg), runDirectory(second)), null, 2) + "\n",
  );
} else if (command === "coverage") {
  process.stdout.write(JSON.stringify(coverageMatrix, null, 2) + "\n");
} else throw new Error("Usage: dev-monitor run|inspect|verify|evidence|diff|coverage");
