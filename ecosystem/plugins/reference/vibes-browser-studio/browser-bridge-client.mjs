import { createHash, randomUUID } from "node:crypto";

export const PLUGIN_ID = "local.contentflow.vibes-browser-studio";
export const VIBES_ORIGIN = "https://vibes.ai";
export const BRIDGE_ID = "com.contentflow.browser-bridge";
export const PROTOCOL_VERSION = 2;
export const PROTOCOL_RANGE = Object.freeze({ min: 2, max: 2 });
export const REQUIRED_CAPABILITIES = Object.freeze([
  "idempotent-replay.v1",
  "lifecycle-events.v1",
  "snapshot.v1",
  "condition-observer.v1",
  "reload.v1",
]);
const EFFECTFUL_ACTIONS = new Set(["click", "pressEnter", "setFiles", "reload"]);

const PROJECT_URL = /^https:\/\/vibes\.ai\/projects\/[A-Za-z0-9_-]+\/?$/;
const COPY = {
  "pt-BR": {
    cancelled: "Execução cancelada.",
    missing:
      "A ContentFlow Browser Bridge 0.4.0 ou superior não está instalada neste perfil dedicado.",
    refused: "A Browser Bridge recusou a conexão efêmera do plugin Vibes.",
    origin: "A aba anexada deixou o projeto autorizado do Vibes.",
    timeout: "A Browser Bridge deixou de responder.",
    incompatible: "A Browser Bridge instalada é incompatível com o plugin Vibes.",
    rejected: "A Browser Bridge recusou a ação solicitada.",
  },
  en: {
    cancelled: "Execution cancelled.",
    missing:
      "ContentFlow Browser Bridge 0.4.0 or newer is not installed in this dedicated profile.",
    refused: "Browser Bridge refused the Vibes plugin ephemeral connection.",
    origin: "The attached tab left the authorized Vibes project.",
    timeout: "Browser Bridge stopped responding.",
    incompatible: "The installed Browser Bridge is incompatible with the Vibes plugin.",
    rejected: "Browser Bridge refused the requested action.",
  },
  es: {
    cancelled: "Ejecución cancelada.",
    missing:
      "ContentFlow Browser Bridge 0.4.0 o posterior no está instalada en este perfil dedicado.",
    refused: "Browser Bridge rechazó la conexión efímera del plugin Vibes.",
    origin: "La pestaña conectada salió del proyecto autorizado de Vibes.",
    timeout: "Browser Bridge dejó de responder.",
    incompatible: "Browser Bridge instalada no es compatible con el plugin Vibes.",
    rejected: "Browser Bridge rechazó la acción solicitada.",
  },
};

function localeFor(request) {
  const locale = String(request?.context?.locale || "pt-BR").toLowerCase();
  if (locale.startsWith("en")) return "en";
  if (locale.startsWith("es")) return "es";
  return "pt-BR";
}

function copy(request, key) {
  return COPY[localeFor(request)][key];
}

function codedError(code, message, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function delay(ms, signal, request) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(codedError("CANCELLED", copy(request, "cancelled")));
    const timer = setTimeout(done, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(codedError("CANCELLED", copy(request, "cancelled")));
    };
    function done() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export function executionKey(request, profileId) {
  return createHash("sha256")
    .update(
      [
        request?.executionId || "configuration",
        request?.blockId || "profile",
        request?.capabilityId || PLUGIN_ID,
        Number(request?.attempt) || 1,
        request?.batch?.itemId || request?.batch?.index || "single",
        profileId,
      ].join(":"),
    )
    .digest("hex");
}

export function commandId(key, action, operationKey) {
  return createHash("sha256").update(`${key}:${action}:${operationKey}`).digest("hex");
}

export function bridgeAvailability() {
  return {
    available: true,
    minimumVersion: "0.4.0",
    origin: VIBES_ORIGIN,
    actions: [
      "ping",
      "inspect",
      "setText",
      "click",
      "setFiles",
      "leaseAcquire",
      "leaseRenew",
      "leaseRelease",
    ],
  };
}

async function evaluateWorker(client, sessionId, expression) {
  const evaluated = await client.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (evaluated?.exceptionDetails) return undefined;
  return evaluated?.result?.value;
}

function missingSession(error) {
  return /Session with given id not found|No session with given id|Target session .*not found/i.test(
    String(error?.message || error || ""),
  );
}

function supportsRequiredBridge(identity) {
  const min = Number(identity?.protocol?.min ?? identity?.protocolVersion);
  const max = Number(identity?.protocol?.max ?? identity?.protocolVersion);
  const capabilities = Array.isArray(identity?.capabilities) ? identity.capabilities : [];
  return (
    identity?.bridgeId === BRIDGE_ID &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    Math.min(PROTOCOL_RANGE.max, max) >= Math.max(PROTOCOL_RANGE.min, min) &&
    REQUIRED_CAPABILITIES.every((capability) => capabilities.includes(capability))
  );
}

function validateProjectUrl(value, request) {
  const url = String(value || "");
  if (!PROJECT_URL.test(url)) throw codedError("INVALID_CONFIGURATION", copy(request, "origin"));
  return url;
}

export async function attachVibesBridge({
  client,
  pageSessionId,
  pageTargetId,
  expectedUrl,
  profileId,
  request,
  signal,
  waitMs = 10_000,
}) {
  const projectUrl = validateProjectUrl(expectedUrl, request);
  let workerSessionId;
  let identity;

  const attachWorker = async (timeoutMs = waitMs) => {
    const deadline = Date.now() + timeoutMs;
    const rejected = new Set();
    while (Date.now() < deadline) {
      if (signal?.aborted) throw codedError("CANCELLED", copy(request, "cancelled"));
      const { targetInfos = [] } = await client.send("Target.getTargets");
      const candidates = targetInfos.filter(
        (item) =>
          item.type === "service_worker" &&
          /^chrome-extension:\/\/[^/]+\/service-worker\.js$/i.test(String(item.url || "")) &&
          !rejected.has(item.targetId),
      );
      for (const candidate of candidates) {
        let attached;
        try {
          attached = await client.send("Target.attachToTarget", {
            targetId: candidate.targetId,
            flatten: true,
          });
          await client.send("Runtime.enable", {}, attached.sessionId);
          const candidateIdentity = await evaluateWorker(
            client,
            attached.sessionId,
            "globalThis.contentFlowBridge?.identity",
          );
          if (
            supportsRequiredBridge(candidateIdentity) &&
            /^0\.(?:[4-9]|[1-9][0-9])\.|^[1-9][0-9]*\./.test(
              String(candidateIdentity?.bridgeVersion || candidateIdentity?.extensionVersion || ""),
            )
          ) {
            return { sessionId: attached.sessionId, identity: candidateIdentity };
          }
          if (candidateIdentity?.bridgeId === BRIDGE_ID) {
            throw codedError("BRIDGE_INCOMPATIBLE", copy(request, "incompatible"));
          }
        } catch (error) {
          if (!missingSession(error)) throw error;
        }
        rejected.add(candidate.targetId);
        if (attached?.sessionId) {
          await client
            .send("Target.detachFromTarget", { sessionId: attached.sessionId })
            .catch(() => undefined);
        }
      }
      await delay(250, signal, request);
    }
    throw codedError("BRIDGE_MISSING", copy(request, "missing"));
  };

  ({ sessionId: workerSessionId, identity } = await attachWorker());
  const sessionToken = randomUUID();
  const key = executionKey(request, profileId);
  let negotiatedProtocolVersion = PROTOCOL_VERSION;
  const handshake = {
    pluginId: PLUGIN_ID,
    protocolVersion: PROTOCOL_VERSION,
    protocol: PROTOCOL_RANGE,
    clientVersion: "1",
    requestedCapabilities: REQUIRED_CAPABILITIES,
    profileId,
    sessionToken,
  };
  const connectionExpression = `globalThis.contentFlowBridge.connect(${JSON.stringify(handshake)})`;
  const connect = async () => {
    const response = await evaluateWorker(client, workerSessionId, connectionExpression);
    if (!response?.ok) {
      throw codedError("BRIDGE_INCOMPATIBLE", response?.message || copy(request, "refused"));
    }
    if (
      !Number.isInteger(response.protocolVersion) ||
      response.protocolVersion < PROTOCOL_RANGE.min ||
      response.protocolVersion > PROTOCOL_RANGE.max ||
      !REQUIRED_CAPABILITIES.every((capability) => response.capabilities?.includes(capability))
    ) {
      throw codedError("BRIDGE_INCOMPATIBLE", copy(request, "incompatible"));
    }
    negotiatedProtocolVersion = response.protocolVersion;
  };
  const recover = async () => {
    if (workerSessionId) {
      await client
        .send("Target.detachFromTarget", { sessionId: workerSessionId })
        .catch(() => undefined);
    }
    ({ sessionId: workerSessionId, identity } = await attachWorker(5000));
    await connect();
  };
  const evaluateBridge = async (expression) => {
    try {
      return await evaluateWorker(client, workerSessionId, expression);
    } catch (error) {
      if (!missingSession(error)) throw error;
      await recover();
      return await evaluateWorker(client, workerSessionId, expression);
    }
  };

  await connect();
  let disposed = false;
  const lifecycleRequest = (extra = {}) => ({
    ...handshake,
    protocolVersion: negotiatedProtocolVersion,
    ...extra,
  });
  const readLifecycleEvents = async (afterSequence = 0) => {
    const response = await evaluateBridge(
      `globalThis.contentFlowBridge.events(${JSON.stringify(
        lifecycleRequest({ afterSequence: Math.max(0, Number(afterSequence) || 0) }),
      )})`,
    );
    if (!response?.ok) {
      throw codedError(
        "UPSTREAM_UNAVAILABLE",
        response?.message || "A Browser Bridge não conseguiu ler eventos de lifecycle.",
        true,
      );
    }
    return response;
  };
  const getRecoverySnapshot = async () => {
    const response = await evaluateBridge(
      `globalThis.contentFlowBridge.snapshot(${JSON.stringify(lifecycleRequest())})`,
    );
    if (!response?.ok) {
      throw codedError(
        "UPSTREAM_UNAVAILABLE",
        response?.message || "A Browser Bridge não conseguiu produzir o snapshot de recuperação.",
        true,
      );
    }
    return response;
  };
  const dispatch = async (action, payload = {}, operationKey = action, timeoutMs = 30_000) => {
    if (signal?.aborted) throw codedError("CANCELLED", copy(request, "cancelled"));
    let pageUrl = projectUrl;
    if (pageSessionId) {
      const page = await evaluateWorker(
        client,
        pageSessionId,
        "({ url: location.href, origin: location.origin })",
      );
      pageUrl = validateProjectUrl(page?.url, request);
    } else if (pageTargetId) {
      const { targetInfo } = await client.send("Target.getTargetInfo", { targetId: pageTargetId });
      pageUrl = validateProjectUrl(targetInfo?.url, request);
    }
    const issuedAt = Date.now();
    const boundedTimeout = Math.max(1000, Math.min(30_000, timeoutMs));
    const command = {
      ...handshake,
      protocolVersion: negotiatedProtocolVersion,
      executionKey: key,
      commandId: commandId(key, action, operationKey),
      issuedAt,
      expiresAt: issuedAt + boundedTimeout,
      expectedUrl: pageUrl,
      action,
      payload,
    };
    const expression = `(() => { const bridge = globalThis.contentFlowBridge; return Promise.race([bridge.dispatch(${JSON.stringify(command)}),new Promise(resolve=>setTimeout(()=>resolve({ok:false,code:"COMMAND_TIMEOUT"}),${boundedTimeout + 1000}))]); })()`;
    let response = await evaluateBridge(expression);
    if (response?.code === "SESSION_MISMATCH") {
      await connect();
      response = await evaluateBridge(expression);
    }
    if (response?.ok) return response;
    const code = String(response?.code || "");
    if (code === "CANCELLED") throw codedError("CANCELLED", copy(request, "cancelled"));
    if (
      ["COMMAND_TIMEOUT", "CONTENT_SCRIPT_UNAVAILABLE"].includes(code) &&
      !EFFECTFUL_ACTIONS.has(action)
    ) {
      throw codedError(
        "BRIDGE_PAGE_UNAVAILABLE",
        response?.message || copy(request, "timeout"),
        true,
      );
    }
    if (
      code === "COMMAND_OUTCOME_UNKNOWN" ||
      (["COMMAND_TIMEOUT", "CONTENT_SCRIPT_UNAVAILABLE"].includes(code) &&
        EFFECTFUL_ACTIONS.has(action))
    ) {
      throw codedError(
        "COMMAND_OUTCOME_UNKNOWN",
        response?.message || "O resultado do último comando precisa ser reconciliado.",
        true,
      );
    }
    if (
      ["SESSION_MISMATCH", "PROFILE_MISMATCH", "PROTOCOL_MISMATCH", "HANDSHAKE_REJECTED"].includes(
        code,
      )
    ) {
      throw codedError("BRIDGE_INCOMPATIBLE", response?.message || copy(request, "incompatible"));
    }
    throw codedError(
      "OUTPUT_VALIDATION_FAILED",
      response?.message || copy(request, "rejected"),
      code !== "LEASE_UNAVAILABLE",
    );
  };

  const cancel = () => {
    const payload = {
      ...handshake,
      protocolVersion: negotiatedProtocolVersion,
      executionKey: key,
      commandId: commandId(key, "cancel", "execution"),
    };
    void client
      .send(
        "Runtime.evaluate",
        {
          expression: `globalThis.contentFlowBridge?.cancel(${JSON.stringify(payload)})`,
          returnByValue: true,
          awaitPromise: true,
        },
        workerSessionId,
      )
      .catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    if (request?.recoveryDirective?.action === "reload_page") {
      await dispatch(
        "reload",
        {
          reconciliationState: "safe",
          bypassCache: true,
          reasonCode: request.recoveryDirective.reasonCode,
        },
        `core-recovery:${request.recoveryDirective.reasonCode}`,
      );
    }
    await dispatch("ping", {}, "bridge-ready");
  } catch (error) {
    cancel();
    throw error;
  }

  return {
    identity,
    executionKey: key,
    dispatch,
    readLifecycleEvents,
    getRecoverySnapshot,
    events({ afterSequence } = {}) {
      return readLifecycleEvents(afterSequence);
    },
    observeCondition(condition, operationKey = "condition") {
      return dispatch(
        "observeCondition",
        condition,
        operationKey,
        Math.max(1000, Math.min(30_000, Number(condition?.timeoutMs) || 10_000)),
      );
    },
    setFiles(files, selectors, operationKey = "upload") {
      return dispatch("setFiles", { files, selectors }, operationKey);
    },
    acquireLease(operationKey = "job", ttlMs = 60_000) {
      return dispatch("leaseAcquire", { ttlMs }, operationKey);
    },
    renewLease(operationKey = "job", ttlMs = 60_000) {
      return dispatch("leaseRenew", { ttlMs }, operationKey);
    },
    releaseLease(operationKey = "job") {
      return dispatch("leaseRelease", {}, operationKey);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await request?.__bridgeDiagnosticsState
        ?.capture?.({
          events: ({ afterSequence }) => readLifecycleEvents(afterSequence),
        })
        .catch(() => undefined);
      signal?.removeEventListener("abort", cancel);
      await dispatch("leaseRelease", {}, "dispose").catch(() => undefined);
      await evaluateWorker(
        client,
        workerSessionId,
        `globalThis.contentFlowBridge?.disconnect(${JSON.stringify({
          ...handshake,
          protocolVersion: negotiatedProtocolVersion,
        })})`,
      ).catch(() => undefined);
      await client
        .send("Target.detachFromTarget", { sessionId: workerSessionId })
        .catch(() => undefined);
    },
  };
}

export const __test = { PROJECT_URL, localeFor, validateProjectUrl };
