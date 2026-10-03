import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Site snapshot only. Live discovery uses the two repositories directly.
const root = process.cwd();
const plugins = JSON.parse(
  readFileSync(path.resolve(root, "../plugins-contentflow/catalog.json"), "utf8"),
);
const methods = JSON.parse(
  readFileSync(path.resolve(root, "../methods-contentflow/catalog.json"), "utf8"),
);
const output = path.resolve(root, "release/ecosystem");
mkdirSync(output, { recursive: true });
writeFileSync(
  path.join(output, "catalog.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      plugins: plugins.plugins,
      methods: methods.methods,
    },
    null,
    2,
  ) + "\n",
);
console.log("Catálogo do site preparado a partir dos repositórios independentes.");
