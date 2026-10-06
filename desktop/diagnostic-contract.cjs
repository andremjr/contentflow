const { createHash } = require("node:crypto");

const CODES = new Set([
  "APP_STARTED",
  "APP_STOPPED",
  "APP_START_FAILED",
  "API_STARTED",
  "API_EXITED",
  "API_ERROR",
  "API_OPERATION",
  "API_REQUEST_FAILED",
  "UI_ERROR",
  "UI_REJECTION",
  "UI_CRASHED",
  "UI_LOAD_FAILED",
  "UPDATE_CHECK",
  "UPDATE_AVAILABLE",
  "UPDATE_CURRENT",
  "UPDATE_DOWNLOADED",
  "UPDATE_ERROR",
  "JOB_CREATED",
  "PLUGIN_RETRY_SCHEDULED",
  "PROFILE_SWITCH",
  "JOB_COMPLETED",
  "JOB_FAILED",
  "JOB_CANCELLED",
  "BRIDGE_CONTROLLED_RELOAD",
  "BRIDGE_WORKER_RESTART",
  "RECORDS_DROPPED",
]);
const REASONS = new Set([
  "AUTHENTICATION_FAILED",
  "CAPTCHA_REQUIRED",
  "PERMISSION_DENIED",
  "QUOTA_EXCEEDED",
  "UPGRADE_REQUIRED",
  "ACCOUNT_BLOCKED",
  "PROVIDER_SECURITY_CHALLENGE",
  "DOM_INCOMPATIBLE",
  "BRIDGE_MISSING",
  "BRIDGE_INCOMPATIBLE",
  "UPSTREAM_UNAVAILABLE",
  "TIMEOUT",
  "JOB_FAILED",
  "RATE_LIMIT",
  "OUTPUT_VALIDATION_FAILED",
  "BRIDGE_DISCONNECTED",
  "BRIDGE_PAGE_UNAVAILABLE",
  "BROWSER_SESSION_CLOSED",
  "PROFILE_BUSY",
  "EXTERNAL_EFFECT_UNCERTAIN",
  "CANCELLED",
  "LEASE_EXPIRED",
  "UNKNOWN",
]);
const hashId = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
const version = (value) =>
  typeof value === "string" && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value)
    ? value
    : undefined;

// No arbitrary messages, payloads, URLs, paths, selectors or user names cross this boundary.
function sanitizeEvent(input) {
  if (!input || !CODES.has(input.code)) return undefined;
  const event = {
    code: input.code,
    area: ["desktop", "api", "interface", "plugin", "updater"].includes(input.area)
      ? input.area
      : "desktop",
  };
  for (const key of ["status", "durationMs", "attempt", "count", "line", "column", "exitCode"]) {
    if (Number.isSafeInteger(input[key]) && input[key] >= 0 && input[key] <= 1e9)
      event[key] = input[key];
  }
  for (const key of ["executionId", "blockId", "jobId", "profileId"]) {
    if (typeof input[key] === "string" && input[key].length <= 200) event[key] = hashId(input[key]);
  }
  for (const key of ["version", "pluginVersion"]) {
    if (version(input[key])) event[key] = input[key];
  }
  if (typeof input.pluginId === "string" && /^[a-z0-9][a-z0-9._-]{0,159}$/.test(input.pluginId))
    event.pluginId = input.pluginId;
  if (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(input.method)) event.method = input.method;
  if (typeof input.operation === "string" && /^[a-zA-Z/:_-]{1,120}$/.test(input.operation))
    event.operation = input.operation;
  if (typeof input.reasonCode === "string")
    event.reasonCode = REASONS.has(input.reasonCode) ? input.reasonCode : "UNKNOWN";
  if (
    [
      "Error",
      "TypeError",
      "RangeError",
      "ReferenceError",
      "SyntaxError",
      "URIError",
      "EvalError",
      "AggregateError",
    ].includes(input.errorType)
  )
    event.errorType = input.errorType;
  if (
    typeof input.location === "string" &&
    input.location.length <= 200 &&
    /^(?:assets\/[a-zA-Z0-9_-]+\.js|src\/[a-zA-Z0-9_/-]+\.tsx?|server\/[a-zA-Z0-9_/-]+\.ts|desktop\/[a-zA-Z0-9_-]+\.cjs)$/.test(
      input.location,
    )
  )
    event.location = input.location;
  if (
    ["UNDEFINED_ACCESS", "NOT_CALLABLE", "NETWORK_UNAVAILABLE", "MIGRATION_REQUIRED"].includes(
      input.errorKind,
    )
  )
    event.errorKind = input.errorKind;
  if (
    [
      "theme",
      "title",
      "thumbnail",
      "script",
      "narration",
      "assets",
      "editing",
      "publishing",
    ].includes(input.processType)
  )
    event.processType = input.processType;
  return event;
}

function safeError(error) {
  const errorType = [
    "Error",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "EvalError",
    "AggregateError",
  ].includes(error?.name)
    ? error.name
    : "Error";
  // Keep only a source location from our code, never the exception message or full stack.
  const source = String(error?.stack ?? "")
    .slice(0, 8000)
    .match(/((?:assets|src|server|desktop)\/[a-zA-Z0-9_/-]+\.(?:js|tsx?|cjs)):(\d+):(\d+)/);
  const message = String(error?.message ?? "").slice(0, 2000);
  const errorKind = /Cannot (?:read|set) properties of (?:undefined|null)/.test(message)
    ? "UNDEFINED_ACCESS"
    : /is not a function/.test(message)
      ? "NOT_CALLABLE"
      : /^(Failed to fetch|NetworkError when attempting to fetch resource\.)$/.test(message)
        ? "NETWORK_UNAVAILABLE"
        : message.startsWith("Este conteúdo precisa de migração antes de editar ou executar.")
          ? "MIGRATION_REQUIRED"
          : undefined;
  return {
    errorType,
    ...(errorKind ? { errorKind } : {}),
    ...(source ? { location: source[1], line: Number(source[2]), column: Number(source[3]) } : {}),
  };
}

function safeConsoleError(details) {
  // Isolated preload worlds do not always receive the renderer's Error object.
  const message = String(details.message ?? "").slice(0, 2000);
  const match = message.match(
    /^Uncaught(?: \(in promise\))? (TypeError|RangeError|ReferenceError|SyntaxError|URIError|EvalError|AggregateError|Error)(?::|\b)/,
  );
  return {
    code: message.startsWith("Uncaught (in promise)") ? "UI_REJECTION" : "UI_ERROR",
    ...safeError({
      name: match?.[1],
      message,
      stack: `${details.sourceId ?? ""}:${details.lineNumber ?? 0}:0`,
    }),
  };
}

module.exports = { sanitizeEvent, safeError, safeConsoleError, hashId, version };
