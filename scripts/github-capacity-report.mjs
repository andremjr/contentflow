import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const owner = "andremjr";
const repository = "contentflow";
const root = process.cwd();
const formatBytes = (bytes) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(bytes / 1024 / 1024) + " MiB";

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function localGitBytes() {
  const gitDirectory = git("rev-parse", "--git-dir");
  const absolute = path.resolve(root, gitDirectory);
  if (!existsSync(absolute)) return 0;
  const match = execFileSync("git", ["count-objects", "-vH"], {
    cwd: root,
    encoding: "utf8",
  }).match(/size-pack:\s+([\d.]+)\s+(\w+)/);
  const multipliers = { bytes: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 };
  return Number(match?.[1] ?? 0) * (multipliers[match?.[2]] ?? 0);
}

const response = await fetch(
  `https://api.github.com/repos/${owner}/${repository}/releases?per_page=100`,
  {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "contentflow-local-capacity-report",
    },
  },
);
if (!response.ok) throw new Error(`GitHub respondeu HTTP ${response.status}.`);
const releases = await response.json();
const assets = releases.flatMap((release) => release.assets ?? []);
const releaseBytes = assets.reduce((total, asset) => total + Number(asset.size ?? 0), 0);
const largestAsset = assets.reduce(
  (largest, asset) => (!largest || asset.size > largest.size ? asset : largest),
  null,
);
let lfs =
  "Git LFS não está instalado localmente; o uso real da conta deve ser consultado no billing do GitHub.";
try {
  lfs = execFileSync("git", ["lfs", "env"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    ? "Git LFS está disponível localmente. A cota real continua sendo medida pela conta no GitHub."
    : lfs;
} catch {}

console.log("Relatório local de capacidade GitHub — ContentFlow");
console.log(`Gerado: ${new Date().toISOString()}`);
console.log(`Repositório Git local (pack): ${formatBytes(localGitBytes())}`);
console.log(
  `Assets publicados em Releases: ${assets.length} arquivo(s), ${formatBytes(releaseBytes)} no total`,
);
console.log(
  `Maior asset: ${largestAsset ? `${largestAsset.name} (${formatBytes(largestAsset.size)})` : "nenhum"}`,
);
console.log(
  "Releases: sem quota total de armazenamento ou banda; cada asset deve ter menos de 2 GiB.",
);
console.log(
  "Git LFS Free: 10 GiB de armazenamento e 10 GiB de banda por mês; isso não se aplica a assets de Release.",
);
console.log(lfs);
