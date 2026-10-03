import { createHash, randomUUID } from "node:crypto";

const BRIDGE_ID = "com.contentflow.browser-bridge";
const PROTOCOL_VERSION = 2;
const PROTOCOL_RANGE = Object.freeze({ min: 2, max: 2 });
const REQUIRED_CAPABILITIES = Object.freeze([
  "idempotent-replay.v1",
  "lifecycle-events.v1",
  "snapshot.v1",
  "condition-observer.v1",
  "reload.v1",
]);
const EFFECTFUL_ACTIONS = new Set(["click", "clickGenerate", "pressEnter", "setFiles", "reload"]);
let devMonitorSequence = 0;

function codedError(code, message, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(codedError("CANCELLED", "Execução cancelada."));
    const timer = setTimeout(done, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(codedError("CANCELLED", "Execução cancelada."));
    };
    function done() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function executionKey(request, profileId, pluginId) {
  return createHash("sha256")
    .update(
      [
        request?.executionId || "configuration",
        request?.blockId || "profile",
        request?.capabilityId || pluginId,
        Number(request?.attempt) || 1,
        request?.batch?.itemId || request?.batch?.index || "single",
        profileId,
      ].join(":"),
    )
    .digest("hex");
}

function commandId(key, action, operationKey) {
  return createHash("sha256").update(`${key}:${action}:${operationKey}`).digest("hex");
}

async function evaluateWorker(client, sessionId, expression) {
  const evaluated = await client.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (evaluated.exceptionDetails) return undefined;
  return evaluated.result?.value;
}

function isMissingCdpSession(error) {
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

export async function attachContentFlowBridge({
  client,
  pageSessionId,
  pageTargetId,
  expectedUrl,
  pluginId,
  profileId,
  request,
  signal,
  allowedOrigins,
  waitMs = 10000,
}) {
  let workerTarget;
  let workerSessionId;
  let identity;
  const monitor = (event) => {
    if (process.env.CONTENTFLOW_DEV_MONITOR_WORKER !== "1") return;
    process.stdout.write(
      "CONTENTFLOW_DEV_EVENT\t" + JSON.stringify({ sequence: ++devMonitorSequence, event }) + "\n",
    );
  };

  const attachWorkerSession = async (timeoutMs = waitMs) => {
    const deadline = Date.now() + timeoutMs;
    const rejectedTargets = new Set();
    let nextDiscoveryAt = 0;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
      // document_idle may install the listener after the first discovery. Wake
      // only while attaching, with bounded frequency, never during idle retention.
      if (Date.now() >= nextDiscoveryAt) {
        nextDiscoveryAt = Date.now() + 1_000;
        await client.send("Runtime.evaluate", {
          expression: `window.postMessage({ source: "contentflow-bridge-client", action: "discover" }, location.origin)`,
        }, pageSessionId).catch(() => undefined);
      }
      const { targetInfos = [] } = await client.send("Target.getTargets");
      const candidates = targetInfos.filter(
        (item) =>
          item.type === "service_worker" &&
          /^chrome-extension:\/\/[^/]+\/service-worker\.js$/i.test(String(item.url || "")) &&
          !rejectedTargets.has(item.targetId),
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
          if (supportsRequiredBridge(candidateIdentity)) {
            return {
              target: candidate,
              sessionId: attached.sessionId,
              identity: candidateIdentity,
            };
          }
          if (candidateIdentity?.bridgeId === BRIDGE_ID) {
            throw codedError("BRIDGE_INCOMPATIBLE", "A extensão instalada é incompatível.");
          }
        } catch (error) {
          if (!isMissingCdpSession(error)) throw error;
        }
        rejectedTargets.add(candidate.targetId);
        if (attached?.sessionId)
          await client
            .send("Target.detachFromTarget", { sessionId: attached.sessionId })
            .catch(() => undefined);
      }
      await delay(250, signal);
    }
    throw codedError(
      "BRIDGE_MISSING",
      "A ContentFlow Browser Bridge não está instalada neste perfil do Chrome. Abra chrome://extensions, ative o modo do desenvolvedor, use Carregar sem compactação na pasta contentflow-browser-bridge e recarregue a extensão. O plugin não continuará usando teclado ou mouse como alternativa.",
    );
  };

  ({ target: workerTarget, sessionId: workerSessionId, identity } = await attachWorkerSession());

  const sessionToken = randomUUID();
  const key = executionKey(request, profileId, pluginId);
  let negotiatedProtocolVersion = PROTOCOL_VERSION;
  const connectionExpression = () =>
    `globalThis.contentFlowBridge.connect(${JSON.stringify({
      pluginId,
      protocolVersion: PROTOCOL_VERSION,
      protocol: PROTOCOL_RANGE,
      clientVersion: "1",
      requestedCapabilities: REQUIRED_CAPABILITIES,
      profileId,
      sessionToken,
    })})`;
  const connectWorker = async () => {
    const handshake = await evaluateWorker(client, workerSessionId, connectionExpression());
    if (!handshake?.ok) {
      throw codedError(
        "BRIDGE_INCOMPATIBLE",
        handshake?.message || "A extensão recusou a conexão efêmera do plugin.",
      );
    }
    if (
      !Number.isInteger(handshake.protocolVersion) ||
      handshake.protocolVersion < PROTOCOL_RANGE.min ||
      handshake.protocolVersion > PROTOCOL_RANGE.max ||
      !REQUIRED_CAPABILITIES.every((capability) => handshake.capabilities?.includes(capability))
    ) {
      throw codedError("BRIDGE_INCOMPATIBLE", "A extensão instalada é incompatível.");
    }
    negotiatedProtocolVersion = handshake.protocolVersion;
  };
  const recoverWorkerSession = async () => {
    if (workerSessionId)
      await client
        .send("Target.detachFromTarget", { sessionId: workerSessionId })
        .catch(() => undefined);
    ({
      target: workerTarget,
      sessionId: workerSessionId,
      identity,
    } = await attachWorkerSession(5000));
    await connectWorker();
  };
  const evaluateBridge = async (expression) => {
    try {
      return await evaluateWorker(client, workerSessionId, expression);
    } catch (error) {
      if (!isMissingCdpSession(error)) throw error;
      await recoverWorkerSession();
      return await evaluateWorker(client, workerSessionId, expression);
    }
  };

  await connectWorker();

  const lifecycleRequest = (extra = {}) => ({
    pluginId,
    protocolVersion: negotiatedProtocolVersion,
    profileId,
    sessionToken,
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

  const origins = new Set(allowedOrigins);
  const dispatchRaw = async (action, payload = {}, operationKey = action, timeoutMs = 30000) => {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    // During an interactive Microsoft login the DevTools target can briefly
    // report the previous identity-provider URL after the page has already
    // returned to the Playground. The caller may provide the last validated
    // provider URL; the Browser Bridge still verifies the actual tab before
    // performing every command.
    const page = expectedUrl
      ? { url: String(expectedUrl), origin: new URL(String(expectedUrl)).origin }
      : pageSessionId
        ? await evaluateWorker(
            client,
            pageSessionId,
            "({ url: location.href, origin: location.origin })",
          )
        : await client
            .send("Target.getTargetInfo", { targetId: pageTargetId })
            .then(({ targetInfo }) => ({
              url: targetInfo?.url || "",
              origin: new URL(targetInfo?.url || "about:blank").origin,
            }));
    if (!origins.has(page?.origin)) {
      throw codedError(
        "OUTPUT_VALIDATION_FAILED",
        "A aba anexada deixou a origem autorizada para este plugin.",
      );
    }
    const issuedAt = Date.now();
    const commandTimeoutMs = Math.max(1000, Math.min(30000, timeoutMs));
    const command = {
      pluginId,
      protocolVersion: negotiatedProtocolVersion,
      profileId,
      sessionToken,
      executionKey: key,
      commandId: commandId(key, action, operationKey),
      issuedAt,
      expiresAt: issuedAt + commandTimeoutMs,
      expectedUrl: page.url,
      action,
      payload,
    };
    const dispatchExpression =
      // connect() replaces a bridge session. Calling it before every command
      // can race chrome.debugger.detach from the prior command with the next
      // chrome.debugger.attach on the same Playground tab. The session created
      // above remains alive while dispatch() updates its activity timestamp.
      `(() => { const bridge = globalThis.contentFlowBridge; return Promise.race([bridge.dispatch(${JSON.stringify(command)}),new Promise(resolve=>setTimeout(()=>resolve({ok:false,code:"COMMAND_TIMEOUT",message:"A extensão não respondeu no prazo."}),${commandTimeoutMs + 1000}))]); })()`;
    let response = await evaluateBridge(dispatchExpression);
    if (response?.code === "SESSION_MISMATCH") {
      // A suspended/restarted worker has lost its in-memory session. Reconnect
      // once only after that explicit signal; ordinary commands keep the same
      // session and therefore do not race a debugger reattachment.
      const reconnect = await evaluateBridge(connectionExpression());
      if (!reconnect?.ok) {
        throw codedError(
          "BRIDGE_INCOMPATIBLE",
          reconnect?.message || "A extensão recusou a reconexão efêmera do plugin.",
        );
      }
      response = await evaluateBridge(dispatchExpression);
    }
    if (!response?.ok) {
      const code = String(response?.code || "");
      if (code === "CANCELLED") throw codedError("CANCELLED", "Execução cancelada.");
      if (code === "UNKNOWN_ACTION") {
        throw codedError(
          "UNKNOWN_ACTION",
          response?.message || `A extensão não conhece a ação ${action}.`,
          true,
        );
      }
      if (
        ["COMMAND_TIMEOUT", "CONTENT_SCRIPT_UNAVAILABLE"].includes(code) &&
        !EFFECTFUL_ACTIONS.has(action)
      ) {
        throw codedError(
          "BRIDGE_PAGE_UNAVAILABLE",
          response?.message || "A extensão deixou de responder.",
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
        [
          "SESSION_MISMATCH",
          "PROFILE_MISMATCH",
          "PROTOCOL_MISMATCH",
          "HANDSHAKE_REJECTED",
        ].includes(code)
      ) {
        throw codedError(
          "BRIDGE_INCOMPATIBLE",
          response?.message || "A extensão instalada é incompatível.",
        );
      }
      throw codedError(
        "OUTPUT_VALIDATION_FAILED",
        response?.message || `A extensão recusou a ação ${action}.`,
        true,
      );
    }
    return response;
  };

  const dispatch = async (action, payload = {}, operationKey = action, timeoutMs = 30000) => {
    if (process.env.CONTENTFLOW_DEV_MONITOR_WORKER !== "1")
      return dispatchRaw(action, payload, operationKey, timeoutMs);
    const id = commandId(key, action, operationKey);
    const base = {
      entity: { type: "command", id },
      correlation: { commandId: id, sessionId: workerSessionId },
      payload: { action, effect: EFFECTFUL_ACTIONS.has(action) ? "possible" : "none" },
    };
    monitor({ ...base, kind: "command.sent", phase: "begin" });
    try {
      const result = await dispatchRaw(action, payload, operationKey, timeoutMs);
      monitor({ ...base, kind: "command.completed", phase: "end", outcome: "ok" });
      return result;
    } catch (error) {
      monitor({
        ...base,
        kind: "command.failed",
        phase: "end",
        outcome:
          error.code === "COMMAND_OUTCOME_UNKNOWN"
            ? "unknown"
            : error.code === "CANCELLED"
              ? "cancelled"
              : "error",
        payload: { ...base.payload, code: error.code || "UNKNOWN" },
      });
      throw error;
    }
  };
  const cancel = () => {
    const payload = {
      pluginId,
      protocolVersion: negotiatedProtocolVersion,
      sessionToken,
      profileId,
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
  let disposed = false;

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
    const ping = await dispatch("ping", {}, "bridge-ready");
    if (ping?.protocolVersion !== negotiatedProtocolVersion) {
      throw codedError("BRIDGE_INCOMPATIBLE", "A ContentFlow Browser Bridge está desatualizada.");
    }
  } catch (error) {
    // A failed initialization must not leave chrome.debugger attached. A
    // later chunk needs to acquire the same provider tab exclusively.
    await evaluateWorker(
      client,
      workerSessionId,
      `globalThis.contentFlowBridge?.disconnect(${JSON.stringify({
        pluginId,
        protocolVersion: negotiatedProtocolVersion,
        profileId,
        sessionToken,
      })})`,
    ).catch(() => undefined);
    await client
      .send("Target.detachFromTarget", { sessionId: workerSessionId })
      .catch(() => undefined);
    throw error;
  }
  return {
    dispatch,
    identity,
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
        Math.max(1000, Math.min(30000, Number(condition?.timeoutMs) || 10000)),
      );
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
      const payload = {
        pluginId,
        protocolVersion: negotiatedProtocolVersion,
        profileId,
        sessionToken,
      };
      await client
        .send(
          "Runtime.evaluate",
          {
            expression: `globalThis.contentFlowBridge?.disconnect(${JSON.stringify(payload)})`,
            returnByValue: true,
            awaitPromise: true,
          },
          workerSessionId,
        )
        .catch(() => undefined);
      await client
        .send("Target.detachFromTarget", { sessionId: workerSessionId })
        .catch(() => undefined);
    },
  };
}
