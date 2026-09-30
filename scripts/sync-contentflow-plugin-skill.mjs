import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const SKILLS = ["contentflow-method-development", "contentflow-plugin-development"];

async function filesUnder(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "__pycache__") continue;
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory())
      files.push(...(await filesUnder(path.join(directory, entry.name), relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

const targets = [
  { label: "checkout", directory: path.join(root, ".agents", "skills") },
  ...(process.argv.includes("--install-user")
    ? [{ label: "Codex do usuário", directory: path.join(os.homedir(), ".codex", "skills") }]
    : []),
];

async function differences(skill, targetRoot) {
  const source = path.join(root, "ecosystem", "skills", skill);
  const target = path.join(targetRoot, skill);
  const sourceFiles = await filesUnder(source);
  const targetFiles = await filesUnder(target);
  const all = Array.from(new Set([...sourceFiles, ...targetFiles])).sort();
  const changed = [];
  for (const relative of all) {
    if (!sourceFiles.includes(relative) || !targetFiles.includes(relative)) {
      changed.push(relative);
      continue;
    }
    const [left, right] = await Promise.all([
      readFile(path.join(source, relative)),
      readFile(path.join(target, relative)),
    ]);
    if (!left.equals(right)) changed.push(relative);
  }
  return changed;
}

if (process.argv.includes("--check")) {
  let failed = false;
  for (const target of targets) {
    for (const skill of SKILLS) {
      const changed = await differences(skill, target.directory);
      for (const file of changed)
        console.error(`${target.label}/${skill}: ${file} fora de sincronia`);
      failed ||= changed.length > 0;
    }
  }
  if (failed) process.exitCode = 1;
  else console.log(`OK: ${SKILLS.length} skills sincronizadas em ${targets.length} destino(s).`);
} else {
  for (const destination of targets) {
    for (const skill of SKILLS) {
      const source = path.join(root, "ecosystem", "skills", skill);
      const target = path.join(destination.directory, skill);
      await rm(target, { recursive: true, force: true });
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, {
        recursive: true,
        filter: (sourcePath) => !sourcePath.endsWith("__pycache__"),
      });
    }
  }
  console.log(
    `OK: ${SKILLS.length} skills copiadas de ecosystem/skills para ${targets.length} destino(s).`,
  );
}
