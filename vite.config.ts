// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Connect, Plugin } from "vite";

const API_TARGET = "http://127.0.0.1:8787";

/**
 * The sandbox strips `server.proxy`, so /api is forwarded to the local Express
 * backend through a middleware instead.
 */
function localApiProxy(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith("/api")) return next();
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(key, value);
      }
      headers.delete("host");
      headers.delete("connection");
      fetch(`${API_TARGET}${req.url}`, {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      })
        .then(async (upstream) => {
          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key !== "content-encoding" && key !== "content-length") {
              res.setHeader(key, value);
            }
          });
          res.end(Buffer.from(await upstream.arrayBuffer()));
        })
        .catch((error: unknown) => {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: `API local indisponível: ${String(error)}` }));
        });
    });
  };

  return {
    name: "contentflow:local-api-proxy",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [localApiProxy()],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
