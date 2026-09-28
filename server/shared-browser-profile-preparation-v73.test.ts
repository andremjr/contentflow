import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const repositoryRoot = process.cwd();

test("7.3 prepara pelo vínculo global, usa a pasta física exata e isola readiness", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "contentflow-profile-v73-"));
  const pluginsDirectory = path.join(dataDirectory, "plugins", "local");
  await mkdir(pluginsDirectory, { recursive: true });
  await cp(
    path.join(repositoryRoot, "tests", "fixtures", "profile-plugin"),
    path.join(pluginsDirectory, "profile-plugin"),
    { recursive: true },
  );
  const port = 9800 + (process.pid % 100);
  const apiBase = `http://127.0.0.1:${port}`;
  const output: string[] = [];
  const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: String(port),
      CONTENTFLOW_APP_ROOT: repositoryRoot,
      CONTENTFLOW_DATA_DIR: dataDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => output.push(String(chunk)));
  server.stderr.on("data", (chunk) => output.push(String(chunk)));

  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        if ((await fetch(`${apiBase}/api/health`)).ok) break;
      } catch {
        // API isolada ainda iniciando.
      }
      if (attempt === 79) throw new Error(`API não iniciou.\n${output.join("\n")}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal((await fetch(`${apiBase}/api/plugins`)).ok, true, output.join("\n"));
    const consent = await fetch(`${apiBase}/api/plugins/com.contentflow.e2e-profile/consent`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(consent.ok, true);

    const createdResponse = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/profile-bindings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Global 7.3", alias: "global-v73" }),
      },
    );
    assert.equal(createdResponse.status, 201, output.join("\n"));
    const created = (await createdResponse.json()) as { profile: { id: string; alias: string } };

    const fakeBridge = path.join(dataDirectory, "fake-browser-bridge");
    await mkdir(fakeBridge, { recursive: true });
    await writeFile(
      path.join(fakeBridge, "manifest.json"),
      JSON.stringify({ name: "ContentFlow Browser Bridge" }),
      "utf8",
    );
    const physicalProfile = path.join(dataDirectory, "browser-profiles", created.profile.id);
    await mkdir(path.join(physicalProfile, "Default"), { recursive: true });
    await writeFile(
      path.join(physicalProfile, "Default", "Secure Preferences"),
      JSON.stringify({
        extensions: { settings: { bridge: { path: fakeBridge, location: 4 } } },
      }),
      "utf8",
    );

    const databasePath = path.join(dataDirectory, "contentflow.sqlite");
    const database = new Database(databasePath);
    try {
      const now = "2026-09-26T20:00:00.000Z";
      database
        .prepare(
          `INSERT INTO plugin_profile_bindings (plugin_id, profile_id, created_at, updated_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run("plugin.other", created.profile.id, now, now);
      database
        .prepare(
          `INSERT INTO plugin_profile_readiness
            (plugin_id, profile_id, state, checked_at, prepared_at, metadata)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("plugin.other", created.profile.id, "needs_auth", now, null, "{}");
    } finally {
      database.close();
    }

    const prepare = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/profile-bindings/${encodeURIComponent(created.profile.id)}/prepare`,
      { method: "POST" },
    );
    const prepared = (await prepare.json()) as {
      ready?: boolean;
      bridgeState?: string;
      readiness?: { state?: string; preparedAt?: string };
      error?: string;
    };
    assert.equal(prepare.ok, true, JSON.stringify(prepared));
    assert.equal(prepared.ready, true);
    assert.equal(prepared.bridgeState, "installed");
    assert.equal(prepared.readiness?.state, "ready");
    assert.ok(prepared.readiness?.preparedAt);
    assert.equal(
      await readFile(
        path.join(dataDirectory, "browser-profiles", created.profile.id, "v73-profile-used.txt"),
        "utf8",
      ),
      created.profile.alias,
    );

    const status = await fetch(
      `${apiBase}/api/plugins/com.contentflow.e2e-profile/profile-bindings/${encodeURIComponent(created.profile.id)}/status`,
      { method: "POST" },
    );
    assert.equal(status.ok, true);

    const verified = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      const rows = verified
        .prepare(
          `SELECT plugin_id, state FROM plugin_profile_readiness
           WHERE profile_id = ? ORDER BY plugin_id`,
        )
        .all(created.profile.id) as Array<{ plugin_id: string; state: string }>;
      assert.deepEqual(rows, [
        { plugin_id: "com.contentflow.e2e-profile", state: "ready" },
        { plugin_id: "plugin.other", state: "needs_auth" },
      ]);
    } finally {
      verified.close();
    }
  } finally {
    if (server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once("exit", resolve));
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
