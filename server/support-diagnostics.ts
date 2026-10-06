import type { ErrorRequestHandler, RequestHandler } from "express";
import { sanitizeEvent, safeError } from "../desktop/diagnostic-contract.cjs";

export const supportDiagnosticsEnabled = process.env.CONTENTFLOW_SUPPORT_DIAGNOSTICS === "1";
let blocked = false;
let skipped = 0;

export function reportSupportEvent(input: unknown) {
  if (!supportDiagnosticsEnabled) return;
  const event = sanitizeEvent(input);
  if (!event) return;
  if (blocked) {
    skipped++;
    return;
  }
  blocked = !process.stdout.write(`CONTENTFLOW_SUPPORT ${JSON.stringify(event)}\n`);
  if (blocked)
    process.stdout.once("drain", () => {
      blocked = false;
      if (skipped) {
        const count = skipped;
        skipped = 0;
        reportSupportEvent({ area: "api", code: "RECORDS_DROPPED", count });
      }
    });
}

export const supportRequestDiagnostics: RequestHandler = (request, response, next) => {
  if (supportDiagnosticsEnabled) {
    const started = performance.now();
    response.once("finish", () => {
      const failed = response.statusCode >= 400;
      if (!failed && ["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
      reportSupportEvent({
        area: "api",
        code: failed ? "API_REQUEST_FAILED" : "API_OPERATION",
        method: request.method,
        operation: typeof request.route?.path === "string" ? request.route.path : "/api",
        status: response.statusCode,
        durationMs: Math.min(1e9, Math.round(performance.now() - started)),
      });
    });
  }
  next();
};

export const supportErrorDiagnostics: ErrorRequestHandler = (error, _request, _response, next) => {
  reportSupportEvent({ area: "api", code: "API_ERROR", ...safeError(error) });
  next(error);
};

if (supportDiagnosticsEnabled) {
  process.on("uncaughtExceptionMonitor", (error) =>
    reportSupportEvent({ area: "api", code: "API_ERROR", ...safeError(error) }),
  );
}
