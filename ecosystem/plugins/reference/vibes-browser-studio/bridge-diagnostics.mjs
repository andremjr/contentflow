import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const ALLOWED_CODES = new Set(["BRIDGE_CONTROLLED_RELOAD", "BRIDGE_WORKER_RESTART"]);

function statePath(request, services) {
  const key = createHash("sha256")
    .update(
      [request?.executionId, request?.blockId, request?.capabilityId, request?.attempt].join(":"),
    )
    .digest("hex");
  return services?.getWorkspacePath?.(`bridge-lifecycle/${key}.json`);
}

export async function createBridgeDiagnostics(request, services) {
  const path = statePath(request, services);
  let lastSequence = 0;
  if (path) {
    try {
      const saved = JSON.parse(await readFile(path, "utf8"));
      lastSequence = Math.max(0, Number(saved?.lastSequence) || 0);
    } catch {}
  }
  const bridgeDiagnostics = [];
  const persist = async () => {
    if (!path) return;
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    await writeFile(temporary, JSON.stringify({ lastSequence }), "utf8");
    await rename(temporary, path);
  };
  return {
    bridgeDiagnostics,
    async capture(bridge) {
      const lifecycle = await bridge.events({ afterSequence: lastSequence });
      bridgeDiagnostics.push(
        ...(Array.isArray(lifecycle?.events) ? lifecycle.events : [])
          .filter((event) => ALLOWED_CODES.has(event?.diagnosticCode))
          .map((event) => ({ code: event.diagnosticCode })),
      );
      lastSequence = Math.max(lastSequence, Number(lifecycle?.lastSequence) || 0);
      await persist();
    },
  };
}
