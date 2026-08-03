/**
 * Node package manager caches + duplicated node_modules pressure.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

function dirBytes(path, { timeoutMs = 20000 } = {}) {
  if (!existsSync(path)) return 0;
  try {
    const out = execFileSync("du", ["-sk", path], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Number(out.trim().split(/\s+/)[0] || 0) * 1024;
  } catch {
    return 0;
  }
}

function worktreeRoot() {
  return process.env.ALLOY_WORKTREE_ROOT
    || join(os.homedir(), "Code/alloy-worktrees");
}

function sampleNodeModules(root, { quick = false } = {}) {
  if (!existsSync(root)) return { count: 0, bytes: 0, samples: [] };
  const samples = [];
  let count = 0;
  let bytes = 0;
  let names = [];
  try { names = readdirSync(root); } catch { return { count: 0, bytes: 0, samples: [] }; }
  const nmPaths = [];
  for (const name of names) {
    const nm = join(root, name, "web", "node_modules");
    if (!existsSync(nm)) continue;
    nmPaths.push({ name, nm });
  }
  count = nmPaths.length;
  // Quick: estimate from first 8 + assume median; deep: measure all
  const toMeasure = quick ? nmPaths.slice(0, 8) : nmPaths;
  for (const { name, nm } of toMeasure) {
    const b = dirBytes(nm, { timeoutMs: quick ? 4000 : 8000 });
    bytes += b;
    samples.push({ path: nm, worktree: name, bytes: b });
  }
  if (quick && nmPaths.length > toMeasure.length && samples.length) {
    const avg = bytes / samples.length;
    bytes = Math.round(avg * nmPaths.length);
  }
  samples.sort((a, b) => b.bytes - a.bytes);
  return {
    count,
    bytes,
    gb: Math.round((bytes / 1024 ** 3) * 10) / 10,
    samples: samples.slice(0, 12),
    estimated: quick && nmPaths.length > 8,
  };
}

export function collectNode({ quick = false } = {}) {
  const home = os.homedir();
  const npm = join(home, ".npm");
  const npmCache = join(home, ".npm/_cacache");
  const pnpmCandidates = [
    join(home, "Library/pnpm"),
    join(home, ".local/share/pnpm"),
    join(home, ".pnpm-store"),
  ];
  const yarn = join(home, "Library/Caches/Yarn");
  const pnpmPath = pnpmCandidates.find((p) => existsSync(p)) || null;
  const npmBytes = dirBytes(npmCache, { timeoutMs: 8000 }) || dirBytes(npm, { timeoutMs: 8000 });
  const pnpmBytes = pnpmPath ? dirBytes(pnpmPath, { timeoutMs: 8000 }) : 0;
  const yarnBytes = existsSync(yarn) ? dirBytes(yarn, { timeoutMs: 8000 }) : 0;
  const wt = sampleNodeModules(worktreeRoot(), { quick });

  return {
    ok: true,
    collector: "node",
    npm_cache: { path: npmCache, bytes: npmBytes, gb: Math.round((npmBytes / 1024 ** 3) * 10) / 10 },
    pnpm_cache: { path: pnpmPath, bytes: pnpmBytes, gb: Math.round((pnpmBytes / 1024 ** 3) * 10) / 10 },
    yarn_cache: { path: yarn, bytes: yarnBytes, gb: Math.round((yarnBytes / 1024 ** 3) * 10) / 10 },
    worktree_node_modules: wt,
    worktree_root: worktreeRoot(),
  };
}
