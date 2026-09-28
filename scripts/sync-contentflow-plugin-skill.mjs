import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const source = path.join(root, "ecosystem", "skills", "contentflow-plugin-development");
const target = path.join(root, ".agents", "skills", "contentflow-plugin-development");

async function filesUnder(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory())
      files.push(...(await filesUnder(path.join(directory, entry.name), relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

async function differences() {
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
  const changed = await differences();
  if (changed.length) {
    console.error(`Skill local fora de sincronia: ${changed.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("OK: skill contentflow-plugin-development sincronizada.");
  }
} else {
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  console.log(
    "OK: skill contentflow-plugin-development sincronizada a partir de ecosystem/skills.",
  );
}
