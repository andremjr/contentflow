import { createHash, randomUUID } from "node:crypto";

const BRIDGE_ID = "com.contentflow.browser-bridge";
const PROTOCOL_VERSION = 2;

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
  const deadline = Date.now() + waitMs;
  const rejectedTargets = new Set();
  let workerTarget;
  let workerSessionId;
  let identity;

  while (Date.now() < deadline && !workerSessionId) {
    if (signal?.aborted) throw codedError("CANCELLED", "Execução cancelada.");
    const { targetInfos = [] } = await client.send("Target.getTargets");
    const candidates = targetInfos.filter(
      (item) =>
        item.type === "service_worker" &&
        /^chrome-extension:\/\/[^/]+\/service-worker\.js$/i.test(String(item.url || "")) &&
        !rejectedTargets.has(item.targetId),
    );
    for (const candidate of candidates) {
      const attached = await client.send("Target.attachToTarget", {
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
        candidateIdentity?.bridgeId === BRIDGE_ID &&
        candidateIdentity?.protocolVersion === PROTOCOL_VERSION
      ) {
        workerTarget = candidate;
        workerSessionId = attached.sessionId;
        identity = candidateIdentity;
        break;
      }
      rejectedTargets.add(candidate.targetId);
      await client
        .send("Target.detachFromTarget", { sessionId: attached.sessionId })
        .catch(() => undefined);
    }
    if (!workerSessionId) await delay(250, signal);
  }

  if (!workerTarget?.targetId || !workerSessionId) {
    throw codedError(
      "INVALID_CONFIGURATION",
      "A ContentFlow Browser Bridge não está instalada neste perfil do Chrome. Abra chrome://extensions, ative o modo do desenvolvedor, use Carregar sem compactação na pasta contentflow-browser-bridge e recarregue a extensão. O plugin não continuará usando teclado ou mouse como alternativa.",
    );
  }

  const sessionToken = randomUUID();
  const key = executionKey(request, profileId, pluginId);
  const handshake = await evaluateWorker(
    client,
    workerSessionId,
    `globalThis.contentFlowBridge.connect(${JSON.stringify({
      pluginId,
      protocolVersion: PROTOCOL_VERSION,
      profileId,
      sessionToken,
    })})`,
  );
  if (!handshake?.ok) {
    throw codedError(
      "INVALID_CONFIGURATION",
      handshake?.message || "A extensão recusou a conexão efêmera do plugin.",
    );
  }

  const origins = new Set(allowedOrigins);
  const dispatch = async (action, payload = {}, operationKey = action, timeoutMs = 30000) => {
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
      protocolVersion: PROTOCOL_VERSION,
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
    let response = await evaluateWorker(client, workerSessionId, dispatchExpression);
    if (response?.code === "SESSION_MISMATCH") {
      // A suspended/restarted worker has lost its in-memory session. Reconnect
      // once only after that explicit signal; ordinary commands keep the same
      // session and therefore do not race a debugger reattachment.
      const reconnect = await evaluateWorker(
        client,
        workerSessionId,
        `globalThis.contentFlowBridge.connect(${JSON.stringify({
          pluginId,
          protocolVersion: PROTOCOL_VERSION,
          profileId,
          sessionToken,
        })})`,
      );
      if (!reconnect?.ok) {
        throw codedError(
          "INVALID_CONFIGURATION",
          reconnect?.message || "A extensão recusou a reconexão efêmera do plugin.",
        );
      }
      response = await evaluateWorker(client, workerSessionId, dispatchExpression);
    }
    if (!response?.ok) {
      const code = String(response?.code || "");
      if (code === "CANCELLED") throw codedError("CANCELLED", "Execução cancelada.");
      if (["COMMAND_TIMEOUT", "CONTENT_SCRIPT_UNAVAILABLE"].includes(code)) {
        throw codedError(
          "UPSTREAM_UNAVAILABLE",
          response?.message || "A extensão deixou de responder.",
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
          "INVALID_CONFIGURATION",
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

  const cancel = () => {
    const payload = {
      pluginId,
      protocolVersion: PROTOCOL_VERSION,
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

  let ping;
  try {
    try {
      ping = await dispatch("ping", {}, "bridge-ready");
    } catch (error) {
      if (error?.code !== "UPSTREAM_UNAVAILABLE") throw error;
      if (pageSessionId) {
        await client.send("Page.reload", { ignoreCache: true }, pageSessionId);
        await delay(1500, signal);
        ping = await dispatch("ping", {}, "bridge-ready-after-reload");
      } else {
        // Voice execution deliberately releases the direct CDP page session so
        // the Browser Bridge can own the debugger. In that mode there is no
        // Page.reload target; wait for the extension to settle and retry ping.
        await delay(750, signal);
        ping = await dispatch("ping", {}, "bridge-ready-retry");
      }
    }
  } catch (error) {
    // A failed initialization must not leave chrome.debugger attached. A
    // later chunk needs to acquire the same provider tab exclusively.
    await evaluateWorker(
      client,
      workerSessionId,
      `globalThis.contentFlowBridge?.disconnect(${JSON.stringify({
        pluginId,
        protocolVersion: PROTOCOL_VERSION,
        profileId,
        sessionToken,
      })})`,
    ).catch(() => undefined);
    await client
      .send("Target.detachFromTarget", { sessionId: workerSessionId })
      .catch(() => undefined);
    throw error;
  }
  if (ping?.protocolVersion !== PROTOCOL_VERSION) {
    throw codedError("INVALID_CONFIGURATION", "A ContentFlow Browser Bridge está desatualizada.");
  }

  return {
    dispatch,
    identity,
    async dispose() {
      if (disposed) return;
      disposed = true;
      signal?.removeEventListener("abort", cancel);
      const payload = { pluginId, protocolVersion: PROTOCOL_VERSION, profileId, sessionToken };
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
