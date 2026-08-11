import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type {
  PluginArtifact,
  PluginExecutionResponse,
  PluginManifest,
} from "../src/lib/plugin-contract";
import { importPluginArtifacts } from "./plugin-runner";
import {
  assertPublicAddress,
  assertRemoteArtifactNetworkPermission,
  downloadRemoteArtifact,
  type RemoteArtifactDependencies,
  type RemoteArtifactResponse,
} from "./remote-artifact-downloader";

const uploadsDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-remote-artifacts-"));
const publicAddress = [{ address: "93.184.216.34", family: 4 as const }];
const resolvePublic: NonNullable<RemoteArtifactDependencies["resolve"]> = async () => publicAddress;

function artifact(
  url: string,
  overrides: Partial<Omit<PluginArtifact, "source">> = {},
): PluginArtifact & { source: { kind: "url"; url: string } } {
  return {
    id: "remote-file",
    name: "result.txt",
    mimeType: "text/plain",
    source: { kind: "url" as const, url },
    ...overrides,
  };
}

function response(
  statusCode: number,
  headers: Record<string, string> = {},
  chunks: Array<string | Buffer> = [],
) {
  return Object.assign(Readable.from(chunks), { statusCode, headers }) as RemoteArtifactResponse;
}

async function expectCleanFailure(run: () => Promise<unknown>, pattern: RegExp) {
  const before = new Set(await readdir(uploadsDirectory));
  await assert.rejects(run, pattern);
  assert.deepEqual(new Set(await readdir(uploadsDirectory)), before);
}

try {
  assert.throws(() => assertRemoteArtifactNetworkPermission([]), /permissão network/);
  assert.doesNotThrow(() => assertRemoteArtifactNetworkPermission(["network"]));

  const integrationOutput = path.join(uploadsDirectory, "integration-output");
  await mkdir(integrationOutput);
  const remoteResponse: PluginExecutionResponse = {
    status: "success",
    values: {
      result: {
        id: "hosted-result",
        name: "hosted.txt",
        mimeType: "text/plain",
        size: 6,
        url: "artifact://hosted-result",
      },
    },
    artifacts: [
      {
        id: "hosted-result",
        name: "hosted.txt",
        mimeType: "text/plain",
        size: 6,
        source: { kind: "url", url: "https://files.example.test/hosted.txt" },
      },
    ],
  };
  const manifest = {
    permissions: ["network"],
    networkHosts: ["files.example.test"],
  } as PluginManifest;
  const integratedPath = path.join(uploadsDirectory, "integrated.txt");
  const integrated = await importPluginArtifacts(
    remoteResponse,
    integrationOutput,
    uploadsDirectory,
    manifest,
    {
      downloadRemote: async () => {
        await writeFile(integratedPath, "hosted");
        return {
          storedPath: integratedPath,
          file: {
            id: "hosted-result",
            name: "hosted.txt",
            mimeType: "text/plain",
            size: 6,
            url: "/api/files/integrated.txt",
            sha256: createHash("sha256").update("hosted").digest("hex"),
          },
        };
      },
    },
  );
  assert.equal(integrated.status, "success");
  if (integrated.status !== "success") throw new Error("Importação integrada falhou.");
  const integratedFile = integrated.values.result;
  assert.equal(
    integratedFile && typeof integratedFile === "object" && "url" in integratedFile
      ? integratedFile.url
      : undefined,
    "/api/files/integrated.txt",
  );
  await rm(integratedPath, { force: true });
  await assert.rejects(
    () =>
      importPluginArtifacts(
        remoteResponse,
        integrationOutput,
        uploadsDirectory,
        { ...manifest, permissions: [] },
        { downloadRemote: async () => assert.fail("download não deveria iniciar") },
      ),
    /permissão network/,
  );
  const body = Buffer.from("artifact remoto válido", "utf8");
  const valid = await downloadRemoteArtifact({
    artifact: artifact("https://files.example.test/result.txt", { size: body.length }),
    uploadsDirectory,
    allowedHosts: ["*.example.test"],
    dependencies: {
      resolve: resolvePublic,
      request: async () =>
        response(200, { "content-type": "text/plain", "content-length": String(body.length) }, [
          body,
        ]),
    },
  });
  assert.equal((await readFile(valid.storedPath)).toString("utf8"), body.toString("utf8"));
  assert.equal(valid.file.size, body.length);
  assert.equal(valid.file.sha256, createHash("sha256").update(body).digest("hex"));
  assert.match(valid.file.url, /^\/api\/files\//);
  await rm(valid.storedPath, { force: true });

  const requestedHosts: string[] = [];
  const redirected = await downloadRemoteArtifact({
    artifact: artifact("https://api.example.test/start"),
    uploadsDirectory,
    allowedHosts: ["*.example.test"],
    dependencies: {
      resolve: resolvePublic,
      request: async (url) => {
        requestedHosts.push(url.hostname);
        return url.pathname === "/start"
          ? response(302, { location: "https://cdn.example.test/final" })
          : response(200, { "content-type": "text/plain" }, ["redirect ok"]);
      },
    },
  });
  assert.deepEqual(requestedHosts, ["api.example.test", "cdn.example.test"]);
  await rm(redirected.storedPath, { force: true });

  await expectCleanFailure(
    () =>
      downloadRemoteArtifact({
        artifact: artifact("https://api.example.test/start"),
        uploadsDirectory,
        allowedHosts: ["api.example.test"],
        dependencies: {
          resolve: resolvePublic,
          request: async () => response(302, { location: "https://unlisted.example/final" }),
        },
      }),
    /não autorizado/,
  );

  await expectCleanFailure(
    () =>
      downloadRemoteArtifact({
        artifact: artifact("https://files.example.test/large"),
        uploadsDirectory,
        maxBytes: 8,
        dependencies: {
          resolve: resolvePublic,
          request: async () => response(200, { "content-type": "text/plain" }, ["1234", "56789"]),
        },
      }),
    /maior que o limite/,
  );

  await expectCleanFailure(
    () =>
      downloadRemoteArtifact({
        artifact: artifact("https://files.example.test/slow"),
        uploadsDirectory,
        timeoutMs: 50,
        dependencies: {
          resolve: resolvePublic,
          request: async () =>
            Object.assign(
              new Readable({
                read() {},
              }),
              { statusCode: 200, headers: { "content-type": "text/plain" } },
            ) as RemoteArtifactResponse,
        },
      }),
    /timeout/,
  );

  await expectCleanFailure(
    () =>
      downloadRemoteArtifact({
        artifact: artifact("https://localhost/private"),
        uploadsDirectory,
        dependencies: { resolve: resolvePublic, request: async () => response(200) },
      }),
    /localhost/,
  );

  assert.throws(() => assertPublicAddress("127.0.0.1"), /endereço bloqueado/);
  assert.throws(() => assertPublicAddress("10.10.0.1"), /endereço bloqueado/);
  await expectCleanFailure(
    () =>
      downloadRemoteArtifact({
        artifact: artifact("https://private.example.test/file"),
        uploadsDirectory,
        dependencies: {
          resolve: async () => [{ address: "192.168.1.10", family: 4 }],
          request: async () => response(200),
        },
      }),
    /endereço bloqueado/,
  );
  await expectCleanFailure(
    () =>
      downloadRemoteArtifact({
        artifact: artifact("https://mixed.example.test/file"),
        uploadsDirectory,
        dependencies: {
          resolve: async () => [...publicAddress, { address: "10.0.0.2", family: 4 }],
          request: async () => response(200),
        },
      }),
    /endereço bloqueado/,
  );

  await expectCleanFailure(
    () =>
      downloadRemoteArtifact({
        artifact: artifact("https://files.example.test/wrong-mime"),
        uploadsDirectory,
        dependencies: {
          resolve: resolvePublic,
          request: async () => response(200, { "content-type": "application/json" }, ["{}"]),
        },
      }),
    /MIME remoto incompatível/,
  );

  console.log(
    "Artifacts remotos: URL, redirect, limite, timeout, localhost, rede privada e MIME aprovados.",
  );
} finally {
  await rm(uploadsDirectory, { recursive: true, force: true });
}
