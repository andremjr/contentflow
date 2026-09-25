import assert from "node:assert/strict";
import test from "node:test";
import {
  configurationOptionsCacheKey,
  parseConfigurationOptionsResponse,
  PluginConfigurationOptionsCache,
} from "./plugin-configuration-options";

const provider = {
  property: "model",
  providerId: "models",
  dependsOn: ["mode"],
  cacheTtlMs: 60_000,
};

test("cache key is isolated by profile and declared dependencies", () => {
  const base = {
    pluginId: "com.example.plugin",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    provider,
    profileConfigurationKey: "profile",
  };
  const a = configurationOptionsCacheKey({
    ...base,
    configuration: { profile: "a", mode: "image", ignored: "x" },
  });
  const b = configurationOptionsCacheKey({
    ...base,
    configuration: { profile: "b", mode: "image", ignored: "x" },
  });
  const ignored = configurationOptionsCacheKey({
    ...base,
    configuration: { profile: "a", mode: "image", ignored: "y" },
  });
  assert.notEqual(a, b);
  assert.equal(a, ignored);
});

test("cache key is isolated by local connection", () => {
  const base = {
    pluginId: "com.example.plugin",
    pluginVersion: "1.0.0",
    capabilityId: "generate",
    provider,
    configuration: { mode: "image" },
  };
  assert.notEqual(
    configurationOptionsCacheKey({ ...base, connectionId: "connection-a" }),
    configurationOptionsCacheKey({ ...base, connectionId: "connection-b" }),
  );
});

test("parses a safe list of configuration options", () => {
  assert.deepEqual(
    parseConfigurationOptionsResponse({
      status: "success",
      values: {
        options: [
          { value: "veo", label: "Veo", description: "Vídeo" },
          { value: 2, label: "Duas variantes", disabled: true },
        ],
      },
    }),
    [
      { value: "veo", label: "Veo", description: "Vídeo" },
      { value: 2, label: "Duas variantes", disabled: true },
    ],
  );
});

test("rejects duplicate option values", () => {
  assert.throws(() =>
    parseConfigurationOptionsResponse({
      status: "success",
      values: {
        options: [
          { value: "x", label: "X" },
          { value: "x", label: "X2" },
        ],
      },
    }),
  );
});

test("cache expires and supports explicit bypass at the caller", () => {
  const cache = new PluginConfigurationOptionsCache();
  cache.set("k", [{ value: "x", label: "X" }], 100, 1_000);
  assert.equal(cache.get("k", 1_050)?.[0]?.value, "x");
  assert.equal(cache.get("k", 1_100), undefined);
});
