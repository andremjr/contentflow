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
    /\bPluginInputPort\b/,
    /\bPluginOutputPort\b/,
    /\bPluginFieldContract\b/,
    /\bresponseValues\b/,
    /\bPluginManifest\b/,
    /\btargetPortKey\b/,
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
  assert.match(inputResolution, /const binding = input\.binding/);
  assert.match(inputResolution, /if \(!binding\) return \{ input, resolved: false \}/);
  assert.doesNotMatch(inputResolution, /authoritativeInputSource|resolveLegacyExplicitInput/);
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
  assert.deepEqual(filesMentioning("canonicalInputBindingFromLegacy("), [
    "src/lib/input-source-binding.ts",
    "src/lib/legacy-method-adapter.ts",
  ]);
  const legacyAdapter = read("src/lib/legacy-method-adapter.ts");
  assert.match(
    legacyAdapter,
    /Explicit compatibility boundary for historical Method representations/,
  );
  assert.match(legacyAdapter, /candidates\.length !== 1/);
  assert.doesNotMatch(legacyAdapter, /labelScore|normalizeLabel|\.sort\(/);

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

test("keeps plugin output bindings and executor response normalization explicit", () => {
  const server = read("server/index.ts");
  const outputContracts = read("server/plugin-output-contract.ts");
  const responseNormalizer = read("server/plugin-response-normalization.ts");
  const responseMapping = sourceBetween(
    server,
    "function normalizedPluginValues",
    "function declaredItemActionForBlock",
  );
  const pluginOperation = sourceBetween(
    server,
    "async function executePluginBlockInternal",
    'app.post("/api/execute-block"',
  );

  assert.match(responseMapping, /requireNormalizedPluginResponseValues/);
  assert.doesNotMatch(server, /valuesForPluginResponse|mappedPluginValues|responseValues\.result/);
  assert.doesNotMatch(server, /selectedItemId\s*:\s*[^\n]*\?\?/);
  assert.match(responseNormalizer, /contractsByPort\.has\(responseKey\)/);
  assert.match(responseNormalizer, /contractsByPort\.get\(contract\.portKey\)/);
  assert.match(responseNormalizer, /Object\.hasOwn\(input\.responseValues, contract\.portKey\)/);
  assert.doesNotMatch(
    responseNormalizer,
    /responseValues\[contract\.key\]|outputContract\[0\]|\.sort\(|\.find\([^\n]*label/,
  );
  assert.match(responseNormalizer, /STRATEGIC_KEY_ALIAS_NOT_ALLOWED/);
  assert.match(responseNormalizer, /GENERIC_RESULT_ALIAS_NOT_ALLOWED/);
  assert.match(responseNormalizer, /UNKNOWN_OUTPUT_PORT/);
  assert.match(responseNormalizer, /MISSING_REQUIRED_OUTPUT/);
  assert.match(responseNormalizer, /INCOMPATIBLE_OUTPUT_TYPE/);

  assert.match(outputContracts, /if \(!field\.portKey\) return true/);
  assert.match(
    outputContracts,
    /ports\.find\(\(candidate\) => candidate\.key === field\.portKey\)/,
  );
  assert.match(outputContracts, /legacyTypeListAccepts\(port\.producedTypes, field\.type\)/);
  assert.match(outputContracts, /portKey: field\.portKey!/);
  assert.doesNotMatch(outputContracts, /ports\.filter|ports\[0\]|portKey:\s*field\.key/);
  assert.doesNotMatch(
    pluginOperation,
    /field\.portKey\s*\?\?|capability\.outputPorts\.find\([\s\S]*producedTypes|portKey:\s*field\.key/,
  );
  assert.match(
    pluginOperation,
    /validatePluginOutputContract\(block\.outputs \?\? \[\], capability\.outputPorts\)/,
  );
  assert.match(
    pluginOperation,
    /if \(validatedOutputs\.unsupportedFields\.length\)[\s\S]*status: 422/,
  );
  assert.match(pluginOperation, /:\s*validatedOutputs\.outputContract/);

  // ESCOLHER remains a single, explicitly delimited historical compatibility path.
  assert.equal((pluginOperation.match(/capability\.outputPorts\[0\]/g) ?? []).length, 1);
  assert.match(pluginOperation, /ESCOLHER keeps its historical collection-selection contract/);
  assert.doesNotMatch(
    pluginOperation,
    /targetBlock\?\.outputs\?\.\[0\]|targetBlock\.outputs\?\.\[0\]/,
  );
  assert.match(
    pluginOperation,
    /validation\.targetOutputKey[\s\S]*targetBlock\.outputs\?\.find\([\s\S]*field\.key === validation\.targetOutputKey/,
  );
  assert.match(
    pluginOperation,
    /validation\.targetPortKey[\s\S]*capability\.inputPorts\.find\([\s\S]*port\.key === validation\.targetPortKey[\s\S]*legacyTypeListAccepts/,
  );
  assert.doesNotMatch(
    pluginOperation,
    /capability\.inputPorts\.find\(\s*\(port\) =>\s*legacyTypeListAccepts/,
  );
  assert.doesNotMatch(pluginOperation, /capability\.inputPorts\[0\]/);

  const humanWorkflow = read("src/lib/human-workflow.ts");
  const methodNormalization = sourceBetween(
    humanWorkflow,
    "export function normalizeMethodBlocks",
    "export function isEmptyRuntimeValue",
  );
  assert.match(methodNormalization, /candidate\.id === currentValidation\?\.targetBlockId/);
  assert.match(methodNormalization, /output\.key === currentValidation\?\.targetOutputKey/);
  assert.doesNotMatch(
    methodNormalization,
    /reverse\(\)|candidate\.type !== "VALIDAR"|\["list", "files", "multiselect"\]|outputs\?\.\[0\]/,
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
  const validateOutputsAt = pluginOperation.indexOf("validatePluginOutputContract(");
  const createJobAt = pluginOperation.indexOf("createPersistentPluginJob(");

  assert.ok(resolveInputsAt >= 0);
  assert.ok(selectPortAt > resolveInputsAt);
  assert.ok(validateOutputsAt > selectPortAt);
  assert.ok(createJobAt > validateOutputsAt);
  assert.match(pluginOperation, /portKey: item\.input\.portKey!/);
  assert.doesNotMatch(pluginOperation, /port\?\.key \?\? item\.input\.id/);
  assert.doesNotMatch(pluginOperation, /inputContract\[index\]\?\.portKey \?\? item\.input\.id/);
  assert.doesNotMatch(read("server/plugin-input-values.ts"), /targetBlockId|targetOutputKey/);
});
