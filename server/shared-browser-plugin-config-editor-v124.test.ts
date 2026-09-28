import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL("../src/components/method-builder.tsx", import.meta.url),
  "utf8",
);
const pluginsRouteSource = readFileSync(
  new URL("../src/routes/plugins.tsx", import.meta.url),
  "utf8",
);

test("package 12.4 keeps the complete plugin interface in the Method editor window", () => {
  assert.match(builderSource, /data-testid="plugin-configuration-panel"/);
  assert.match(builderSource, /aria-labelledby=\{`\$\{block\.id\}-plugin-panel-title`\}/);
  assert.match(builderSource, /\{t\("Configurar plugin executor"\)\}/);
  assert.match(builderSource, /<PluginConfigurationRenderer/);
  assert.match(builderSource, /connectionSection=/);
  assert.match(builderSource, /profileSection=/);
  assert.match(builderSource, /conversationSection=/);
  assert.match(builderSource, /preparePluginConfigurationCommit/);
  assert.doesNotMatch(builderSource, /open=\{pluginExpanded\}/);
  assert.ok(
    builderSource.indexOf("<PluginConfigurationRenderer") <
      builderSource.indexOf("<PluginPromptPreview"),
    "the plugin-declared interface must appear before core prompt diagnostics",
  );
});

test("package 12.4 does not move the Method plugin interface to the Plugins page", () => {
  assert.doesNotMatch(pluginsRouteSource, /PluginConfigurationRenderer/);
  assert.doesNotMatch(pluginsRouteSource, /Configurar plugin executor/);
  assert.doesNotMatch(pluginsRouteSource, /Prévia de configuração/);
  assert.match(pluginsRouteSource, /<InstallPluginDialog onInstalled=\{refresh\} \/>/);
});

test("package 12.4 keeps plugin UI declarative and owned by the core", () => {
  const rendererSource = readFileSync(
    new URL("../src/components/plugin-configuration-renderer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(rendererSource, /buildPluginConfigurationRendererModel/);
  assert.doesNotMatch(rendererSource, /dangerouslySetInnerHTML|eval\(|new Function/);
});
