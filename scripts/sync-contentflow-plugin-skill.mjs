import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
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

async function differences(skill) {
  const source = path.join(root, "ecosystem", "skills", skill);
  const target = path.join(root, ".agents", "skills", skill);
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
  for (const skill of SKILLS) {
    const changed = await differences(skill);
    for (const file of changed) console.error(`${skill}: ${file} fora de sincronia`);
    failed ||= changed.length > 0;
  }
  if (failed) process.exitCode = 1;
  else console.log(`OK: ${SKILLS.length} skills sincronizadas.`);
} else {
  for (const skill of SKILLS) {
    const source = path.join(root, "ecosystem", "skills", skill);
    const target = path.join(root, ".agents", "skills", skill);
    await rm(target, { recursive: true, force: true });
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, {
      recursive: true,
      filter: (sourcePath) => !sourcePath.endsWith("__pycache__"),
    });
  }
  console.log(`OK: ${SKILLS.length} skills copiadas de ecosystem/skills para .agents/skills.`);
}
