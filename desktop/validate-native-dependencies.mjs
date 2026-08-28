import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const nativePackage = "@napi-rs/keyring-win32-x64-msvc";
const packageJsonPath = require.resolve(`${nativePackage}/package.json`);
const bindingPath = path.join(path.dirname(packageJsonPath), "keyring.win32-x64-msvc.node");

if (!existsSync(bindingPath)) {
  throw new Error(
    `Dependência nativa obrigatória ausente: ${nativePackage}. A release Windows seria incapaz de iniciar a API local.`,
  );
}

console.log(`Dependência nativa Windows validada: ${bindingPath}`);
