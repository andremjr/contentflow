import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");

function read(relativePath: string) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

function TypeScriptFilesUnder(relativeDirectory: string): string[] {
  const directory = resolve(repositoryRoot, relativeDirectory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    const relativePath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
    if (entry.isDirectory()) return TypeScriptFilesUnder(relativePath);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [relativePath]
      : [];
  });
}

function sourceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

test("keeps textual and plugin contract heuristics out of the Execution Core", () => {
  const coreSources = TypeScriptFilesUnder("src/lib/execution-core").map((file) => ({
    file,
    source: read(file),
  }));
  const forbiddenCoreKnowledge = [
    /\blabelScore\b/,
    /\bfuzzy\b/i,
    /\bselectPluginInputPort\b/,
    /\binputPorts\b/,
    /\boutputPorts\b/,
    /\bresponseValues\b/,
    /\bPluginManifest\b/,
    /from ["'][^"']*plugin-contract["']/,
    /from ["'][^"']*runtime-contract["']/,
  ];

  for (const { file, source } of coreSources) {
    for (const forbidden of forbiddenCoreKnowledge) {
      assert.doesNotMatch(source, forbidden, `${file} must remain integration-heuristic free`);
    }
  }
});

test("keeps runtime input sources deterministic and canonical bindings authoritative", () => {
  const productionFiles = [...TypeScriptFilesUnder("src/lib"), ...TypeScriptFilesUnder("server")];
  const filesMentioning = (identifier: string) =>
    productionFiles.filter((file) => read(file).includes(identifier)).sort();

  assert.deepEqual(filesMentioning("labelScore("), []);
  assert.deepEqual(filesMentioning("normalizeLabel("), []);
  assert.deepEqual(filesMentioning("semanticIdentityScore("), []);
  assert.deepEqual(filesMentioning("presentationScore("), []);
  assert.deepEqual(filesMentioning("mimePatternMatches("), []);
  assert.deepEqual(filesMentioning("selectPluginImplicitContextPort("), []);
  assert.deepEqual(filesMentioning("selectPluginInputPort("), [
    "server/index.ts",
    "server/plugin-input-values.ts",
  ]);

  const runtimeContract = read("src/lib/runtime-contract.ts");
  const inputResolution = sourceBetween(
    runtimeContract,
    "export function resolveBlockInputs",
    "function collectCandidates",
  );
  assert.match(inputResolution, /authoritativeInputSource\(input\)/);
  assert.match(inputResolution, /resolveCanonicalInput[\s\S]*resolveLegacyExplicitInput/);
  assert.match(
    inputResolution,
    /if \(explicit\)[\s\S]*return \{ input, \.\.\.explicit\.result \};[\s\S]*return \{ input, resolved: false \};/,
  );
  assert.doesNotMatch(inputResolution, /labelScore|normalizeLabel|\.sort\(|available\[0\]/);
  assert.doesNotMatch(
    inputResolution,
    /candidates\.(?:find|filter)\([\s\S]*areRuntimeTypesCompatible/,
    "resolveBlockInputs must not select a compatible candidate after explicit resolution",
  );
  assert.doesNotMatch(
    runtimeContract,
    /key:\s*"selectedItem"|!input\.sourceKey\s*&&|&&\s*!input\.sourceKey/,
  );

  const domain = read("src/lib/domain.ts");
  const canonicalBinding = sourceBetween(
    domain,
    "export type BlockInputSourceBinding",
    "export type BlockInputBinding",
  );
  assert.doesNotMatch(canonicalBinding, /portKey|pluginId|capabilityId|label/);
  assert.match(
    canonicalBinding,
    /kind: "previous_block"[\s\S]*blockId: string;[\s\S]*outputKey: string/,
  );
  assert.match(
    canonicalBinding,
    /kind: "previous_process"[\s\S]*processType: UniversalProcess;[\s\S]*outputKey: string/,
  );

  const bindingMaterialization = read("src/lib/input-source-binding.ts");
  assert.doesNotMatch(bindingMaterialization, /\.label\b|portKey|pluginId|capabilityId/);

  const pluginInputs = read("server/plugin-input-values.ts");
  const portSelection = sourceBetween(
    pluginInputs,
    "export function selectPluginInputPort",
    "export function composePluginPortValue",
  );
  assert.match(portSelection, /if \(!input\.portKey\) return undefined/);
  assert.match(portSelection, /ports\.find\(\(candidate\) => candidate\.key === input\.portKey\)/);
  assert.match(portSelection, /legacyTypeListAccepts\(port\.acceptedTypes, input\.type\)/);
  assert.match(portSelection, /!port\.multiple && usedInputPorts\.has\(port\.key\)/);
  assert.doesNotMatch(
    portSelection,
    /\.sort\(|\.filter\(|acceptedTypes[\s\S]*\[0\]|presentation|sourceKey|input\.label|input\.id/,
    "runtime input port selection must be an exact portKey lookup without ranking or fallback",
  );
});

test("keeps output and validation fallbacks concentrated in the current server boundaries", () => {
  const server = read("server/index.ts");
  const responseMapping = sourceBetween(
    server,
    "function valuesForPluginResponse",
    "function finishPluginBlock",
  );
  const choosingMapping = sourceBetween(
    server,
    "function mappedPluginValues",
    "function declaredItemActionForBlock",
  );
  const pluginOperation = sourceBetween(
    server,
    "async function executePluginBlockInternal",
    'app.post("/api/execute-block"',
  );

  assert.match(responseMapping, /responseValues\[field\.key\][\s\S]*responseValues\.result/);
  assert.match(
    choosingMapping,
    /selectedItemId:\s*responseValues\.selectedItemId\s*\?\?\s*responseValues\.result/,
  );
  assert.equal((server.match(/responseValues\.result/g) ?? []).length, 2);

  assert.match(
    pluginOperation,
    /field\.portKey\s*\?\?[\s\S]*legacyTypeListAccepts\(port\.producedTypes, field\.type\)[\s\S]*capability\.outputPorts\[0\]\?\.key\s*\?\?[\s\S]*field\.key/,
  );
  assert.match(
    pluginOperation,
    /targetBlock\?\.outputs\?\.find\([\s\S]*targetOutputKey[\s\S]*targetBlock\?\.outputs\?\.\[0\]/,
  );
  assert.match(
    pluginOperation,
    /targetOutput[\s\S]*capability\.inputPorts\.find\([\s\S]*legacyTypeListAccepts/,
  );

  const humanWorkflow = read("src/lib/human-workflow.ts");
  const methodNormalization = sourceBetween(
    humanWorkflow,
    "export function normalizeMethodBlocks",
    "export function isEmptyRuntimeValue",
  );
  assert.match(
    methodNormalization,
    /normalized\.find\([\s\S]*targetBlockId[\s\S]*reverse\(\)\.find\([\s\S]*candidate\.type !== "VALIDAR"/,
  );
  assert.match(
    methodNormalization,
    /target\?\.outputs\?\.find\([\s\S]*targetOutputKey[\s\S]*target\?\.outputs\?\.\[0\]/,
  );
});

test("keeps Method resolution authoritative before plugin capability mapping", () => {
  const server = read("server/index.ts");
  const pluginOperation = sourceBetween(
    server,
    "async function executePluginBlockInternal",
    'app.post("/api/execute-block"',
  );
  const resolveInputsAt = pluginOperation.indexOf("resolveBlockInputs({");
  const selectPortAt = pluginOperation.indexOf("selectPluginInputPort(");
  const createJobAt = pluginOperation.indexOf("createPersistentPluginJob(");

  assert.ok(resolveInputsAt >= 0);
  assert.ok(selectPortAt > resolveInputsAt);
  assert.ok(createJobAt > selectPortAt);
  assert.match(pluginOperation, /portKey: item\.input\.portKey!/);
  assert.doesNotMatch(pluginOperation, /port\?\.key \?\? item\.input\.id/);
  assert.doesNotMatch(pluginOperation, /inputContract\[index\]\?\.portKey \?\? item\.input\.id/);
  assert.doesNotMatch(read("server/plugin-input-values.ts"), /targetBlockId|targetOutputKey/);
});
