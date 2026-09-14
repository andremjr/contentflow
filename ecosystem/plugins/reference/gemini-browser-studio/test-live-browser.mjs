import { execute, __test } from "./handler.mjs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const profileName = process.argv[2] || "default";
const profilesRoot = join(homedir(), ".contentflow", "gemini-browser-profiles");
const profileDir = join(profilesRoot, profileName);
const outputDir = join(profilesRoot, ".contentflow-output");
mkdirSync(outputDir, { recursive: true });

console.log("==================================================================");
console.log(" 🚀 TESTE REAL — GEMINI BROWSER STUDIO NO CHROME");
console.log("==================================================================");
console.log(`Perfil:     ${profileName}`);
console.log(`Pasta base: ${profileDir}`);
console.log("==================================================================\n");

const request = {
  capabilityId: "generate-text-in-browser",
  resolvedInstruction:
    "Responda apenas: 'Gemini Browser Studio funcionando perfeitamente sem falso limite!'",
  configuration: {
    accountProfile: profileName,
    promptTemplate: "{{BLOCK_INSTRUCTIONS}}",
    generationMode: "single",
  },
  settings: {
    allowExistingChromeProfile: true,
    keepBrowserOpen: true,
    startMinimized: false,
    diagnosticTrace: true,
  },
  context: {
    processType: "script",
  },
};

const services = {
  signal: AbortSignal.timeout(180000),
  getWorkspacePath: (name) => join(profilesRoot, name),
  getOutputPath: (name) => join(outputDir, name),
};

console.log("Iniciando execução no Chrome...");
try {
  const result = await execute(request, services);
  console.log("\n==================================================================");
  console.log(" RESULTADO DA EXECUÇÃO:");
  console.log("==================================================================");
  console.log("Status:", result.status);
  if (result.status === "success") {
    console.log("\nTexto gerado:");
    console.log(result.values?.result || JSON.stringify(result.values, null, 2));
    if (result.conversation?.id) {
      console.log("\nConversa URL:", result.conversation.id);
    }
    console.log("\n✔ TESTE REAL CONCLUÍDO COM SUCESSO!");
  } else {
    console.error("\n❌ Erro retornado:");
    console.error("Código:   ", result.code);
    console.error("Mensagem: ", result.message);
    if (result.retryAfterMs) console.error("Retry after:", result.retryAfterMs, "ms");
  }
} catch (err) {
  console.error("\n❌ EXCEÇÃO:", err);
}
