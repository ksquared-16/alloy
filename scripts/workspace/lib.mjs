/**
 * Shared helpers for Alloy workspace orchestration diagnostics.
 * Read-only by default — no mutations, no secret exposure.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

/** @returns {string} */
export function repoRoot() {
  return REPO_ROOT;
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, maxBuffer?: number }} [opts]
 */
export function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      cwd: opts.cwd ?? REPO_ROOT,
      maxBuffer: opts.maxBuffer ?? 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const stdout = err.stdout?.toString?.() ?? "";
    const stderr = err.stderr?.toString?.() ?? "";
    const detail = [stdout, stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail || err.message || `Command failed: ${cmd}`);
  }
}

/** @returns {boolean} */
export function commandExists(cmd) {
  const result = spawnSync("which", [cmd], { encoding: "utf8" });
  return result.status === 0 && Boolean(result.stdout?.trim());
}

/** @returns {{ totalMb: number, usedMb: number, freeMb: number, usedPct: number } | null} */
export function swapUsage() {
  if (process.platform !== "darwin") return null;
  try {
    const raw = run("sysctl", ["vm.swapusage"]);
    const match = raw.match(
      /total = ([\d.]+)M\s+used = ([\d.]+)M\s+free = ([\d.]+)M/,
    );
    if (!match) return null;
    const totalMb = Number(match[1]);
    const usedMb = Number(match[2]);
    const freeMb = Number(match[3]);
    return {
      totalMb,
      usedMb,
      freeMb,
      usedPct: totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0,
    };
  } catch {
    return null;
  }
}

/** @returns {number | null} */
export function totalRamGb() {
  if (process.platform !== "darwin") return null;
  try {
    const raw = run("sysctl", ["hw.memsize"]);
    const match = raw.match(/hw\.memsize:\s*(\d+)/);
    return match ? Math.round(Number(match[1]) / 1024 / 1024 / 1024) : null;
  } catch {
    return null;
  }
}

/** @returns {Array<{ pid: number, ppid: number, rssKb: number, rssMb: number, etime: string, command: string }>} */
export function listProcesses() {
  const raw = run("ps", ["-axo", "pid=,ppid=,rss=,etime=,command="]);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
      if (!match) return null;
      const rssKb = Number(match[3]);
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        rssKb,
        rssMb: Math.round((rssKb / 1024) * 10) / 10,
        etime: match[4],
        command: match[5],
      };
    })
    .filter(Boolean);
}

/** @param {ReturnType<typeof listProcesses>[number]} proc */
export function classifyProcess(proc) {
  const cmd = proc.command;
  if (/extension-host/i.test(cmd)) {
    const label = cmd.match(/extension-host\s+([^\s]+(?:\s+\[[^\]]+\])?)/i)?.[1] ?? "unknown";
    return { kind: "cursor-extension-host", label, staleRisk: "low" };
  }
  if (/fileWatcher/i.test(cmd)) return { kind: "cursor-file-watcher", label: "fileWatcher", staleRisk: "low" };
  if (/tsserver/i.test(cmd) || /typescript.*language/i.test(cmd)) {
    return { kind: "tsserver", label: "tsserver", staleRisk: "low" };
  }
  if (/next dev|next-server/i.test(cmd)) return { kind: "next-dev", label: "next-dev", staleRisk: "medium" };
  if (/\btsc\b/i.test(cmd) && /typescript/.test(cmd)) return { kind: "tsc", label: "tsc", staleRisk: "high" };
  if (/vitest/i.test(cmd)) return { kind: "vitest", label: "vitest", staleRisk: "medium" };
  if (/playwright/i.test(cmd)) return { kind: "playwright", label: "playwright", staleRisk: "medium" };
  if (/cursorsandbox/i.test(cmd)) return { kind: "cursor-sandbox", label: "cursorsandbox", staleRisk: "medium" };
  if (/\brg\b/.test(cmd) && /node_modules/.test(cmd)) {
    return { kind: "stale-search", label: "rg-full-tree", staleRisk: "high" };
  }
  if (/\bnode\b/.test(cmd)) return { kind: "node-other", label: "node", staleRisk: "low" };
  return { kind: "other", label: "other", staleRisk: "low" };
}

/** @param {string} etime */
export function etimeToMinutes(etime) {
  if (/^\d+:\d{2}$/.test(etime)) {
    const [m, s] = etime.split(":").map(Number);
    return m + s / 60;
  }
  if (/^\d+-\d{2}:\d{2}:\d{2}$/.test(etime)) {
    const [, h, m, s] = etime.match(/^(\d+)-(\d{2}):(\d{2}):(\d{2})$/);
    return Number(h) * 1440 + Number(m) * 60 + Number(s) / 60;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(etime)) {
    const [h, m, s] = etime.split(":").map(Number);
    return h * 60 + m + s / 60;
  }
  return 0;
}

/**
 * @param {string} worktreePath
 * @returns {string | null}
 */
export function worktreeLabelFromPath(worktreePath) {
  const normalized = path.resolve(worktreePath);
  const cursorMatch = normalized.match(/\/\.cursor\/worktrees\/Alloy\/([^/]+)/);
  if (cursorMatch) return cursorMatch[1];
  const worktreesMatch = normalized.match(/\/\.worktrees\/([^/]+)/);
  if (worktreesMatch) return worktreesMatch[1];
  if (normalized === REPO_ROOT || normalized.endsWith("/Alloy")) return "main";
  const base = path.basename(normalized);
  return base || null;
}

/** @returns {Array<Record<string, unknown>>} */
export function listWorktrees() {
  const raw = run("git", ["worktree", "list", "--porcelain"], { cwd: REPO_ROOT });
  /** @type {Array<Record<string, unknown>>} */
  const entries = [];
  /** @type {Record<string, unknown>} */
  let current = {};
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) entries.push(current);
      current = { path: line.slice("worktree ".length).trim() };
      continue;
    }
    if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length).trim();
    if (line.startsWith("branch ")) {
      current.branch = line.slice("branch refs/heads/".length).trim();
    }
    if (line === "detached") current.detached = true;
    if (line === "bare") current.bare = true;
  }
  if (current.path) entries.push(current);

  let stagingSha = "";
  try {
    stagingSha = run("git", ["rev-parse", "origin/staging"], { cwd: REPO_ROOT });
  } catch {
    stagingSha = "";
  }

  return entries.map((entry) => {
    const wtPath = /** @type {string} */ (entry.path);
    const head = /** @type {string} */ (entry.head ?? "");
    const branch = entry.branch
      ? /** @type {string} */ (entry.branch)
      : entry.detached
        ? "(detached)"
        : "(unknown)";
    let dirtyCount = 0;
    let dirtyFiles = [];
    let behind = null;
    let ahead = null;
    let mergedIntoStaging = null;
    let nodeModules = false;
    let nodeModulesSize = null;
    let lastModified = null;

    try {
      dirtyFiles = run("git", ["status", "--porcelain"], { cwd: wtPath })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      dirtyCount = dirtyFiles.length;
    } catch {
      dirtyCount = -1;
    }

    if (stagingSha) {
      try {
        run("git", ["merge-base", "--is-ancestor", head, stagingSha], { cwd: wtPath });
        mergedIntoStaging = true;
      } catch {
        mergedIntoStaging = false;
      }
      try {
        behind = Number(run("git", ["rev-list", "--count", `${head}..${stagingSha}`], { cwd: wtPath }));
        ahead = Number(run("git", ["rev-list", "--count", `${stagingSha}..${head}`], { cwd: wtPath }));
      } catch {
        behind = null;
        ahead = null;
      }
    }

    const nmPath = path.join(wtPath, "web", "node_modules");
    nodeModules = fs.existsSync(nmPath);
    if (nodeModules) {
      try {
        const stat = fs.statSync(nmPath);
        lastModified = stat.mtime.toISOString().slice(0, 16).replace("T", " ");
      } catch {
        lastModified = null;
      }
    }

    const label = worktreeLabelFromPath(wtPath);
    const classification = classifyWorktree({
      path: wtPath,
      branch,
      head,
      dirtyCount,
      mergedIntoStaging,
      behind,
      ahead,
      label,
    });

    return {
      path: wtPath,
      label,
      branch,
      head: head.slice(0, 12),
      dirtyCount,
      behindStaging: behind,
      aheadStaging: ahead,
      mergedIntoStaging,
      hasNodeModules: nodeModules,
      nodeModulesSize,
      lastModified,
      classification,
      pruneSafe: classification === "merged-removable" && dirtyCount === 0,
    };
  });
}

/**
 * @param {Record<string, unknown>} wt
 * @returns {string}
 */
export function classifyWorktree(wt) {
  const branch = String(wt.branch ?? "");
  const merged = wt.mergedIntoStaging === true;
  const dirty = Number(wt.dirtyCount ?? 0) > 0;
  const behind = Number(wt.behindStaging ?? 0);
  const ahead = Number(wt.aheadStaging ?? 0);
  const label = String(wt.label ?? "");

  if (label === "main" || branch === "staging") return "main-staging-checkout";
  if (branch.startsWith("infra/")) return "active-infra";
  if (merged && !dirty && ahead === 0) return "merged-removable";
  if (merged && dirty) return "merged-dirty-review";
  if (!merged && ahead > 0 && dirty) return "waiting-for-pr";
  if (!merged && ahead > 0) return "active-implementation";
  if (behind > 100) return "abandoned-stale";
  if (dirty) return "unknown-dirty";
  return "unknown-review";
}

/** @param {string} cmd */
export function sanitizeCommandDisplay(cmd) {
  return cmd
    .replace(/\b[A-Z][A-Z0-9_]{2,}=[^\s]+/g, "[env]")
    .replace(/\b(BITCOIN|SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*=[^\s]+/gi, "[redacted]")
    .slice(0, 200);
}

/** @returns {Set<string>} */
export function openCursorWorktreeLabels() {
  const labels = new Set();
  for (const proc of listProcesses()) {
    if (!/extension-host/i.test(proc.command)) continue;
    const match = proc.command.match(/extension-host\s+(\S+)/i);
    if (!match) continue;
    const label = match[1];
    if (label !== "empty") labels.add(label);
  }
  return labels;
}

/** @param {Record<string, unknown>} wt */
export function isMainCheckoutWorktree(wt) {
  const wtPath = path.resolve(String(wt.path ?? ""));
  return wt.label === "main" || wtPath === REPO_ROOT;
}

/**
 * @param {Record<string, unknown>} wt
 * @param {Set<string>} openCursorLabels
 * @returns {string[]}
 */
export function evaluateWorktreeExecuteBlockers(wt, openCursorLabels) {
  /** @type {string[]} */
  const reasons = [];
  if (isMainCheckoutWorktree(wt)) reasons.push("main-checkout");
  if (Number(wt.dirtyCount) > 0) reasons.push("dirty-worktree");
  if (Number(wt.dirtyCount) < 0) reasons.push("unknown-git-state");
  if (openCursorLabels.has(String(wt.label))) reasons.push("active-cursor-window");
  if (wt.classification !== "merged-removable") {
    reasons.push(`classification:${wt.classification}`);
  }
  if (!wt.pruneSafe) reasons.push("not-prune-safe");
  return reasons;
}

/**
 * @param {{ kind: string }} meta
 * @param {number} ageMin
 * @returns {string[]}
 */
export function evaluateProcessKillBlockers(meta, ageMin) {
  /** @type {string[]} */
  const reasons = [];
  if (meta.kind === "tsserver") reasons.push("active-language-server");
  if (meta.kind === "next-dev") reasons.push("active-dev-server");
  if (meta.kind === "cursor-extension-host" || meta.kind === "cursor-file-watcher") {
    reasons.push("active-cursor");
  }
  if (meta.kind === "vitest" || meta.kind === "playwright") reasons.push("active-test-runner");
  if (meta.kind === "node-other" || meta.kind === "other") reasons.push("unknown-ownership");
  if (meta.kind === "cursor-sandbox" && ageMin < 30) reasons.push("sandbox-too-recent");
  if (meta.kind === "stale-search" && ageMin < 5) reasons.push("search-too-recent");
  if (meta.kind === "tsc" && ageMin < 60) reasons.push("tsc-too-recent");
  return reasons;
}

/**
 * @param {boolean} execute
 * @param {string[]} blockers
 * @param {string} actionLabel
 */
export function refuseExecuteIfBlocked(execute, blockers, actionLabel) {
  if (!execute || blockers.length === 0) return false;
  console.error(`Refusing ${actionLabel}: ${blockers.join(", ")}`);
  return true;
}

/** @returns {Array<Record<string, unknown>>} */
export function listeningPorts() {
  if (!commandExists("lsof")) return [];
  try {
    const raw = run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"]);
    return raw
      .split("\n")
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const portMatch = line.match(/:(\d+)\s+\(LISTEN\)/);
        const pidMatch = line.match(/^\S+\s+(\d+)/);
        const command = line.split(/\s+/)[0];
        if (!pidMatch) return null;
        return {
          command,
          pid: Number(pidMatch[1]),
          address: portMatch ? `:${portMatch[1]}` : null,
          port: portMatch ? Number(portMatch[1]) : null,
        };
      })
      .filter(Boolean)
      .filter((row) => /node|next/i.test(String(row.command)));
  } catch {
    return [];
  }
}

/** @param {string} [format] */
export function printJson(data, format = "json") {
  if (format === "json") {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(data);
}

/** @param {string} title */
export function printSection(title) {
  console.log(`\n## ${title}`);
}

/** @param {Record<string, string | number | boolean | null | undefined>} row */
export function printRow(row) {
  console.log(
    Object.entries(row)
      .map(([k, v]) => `${k}=${v ?? ""}`)
      .join("  "),
  );
}

/** @returns {string} */
export function platformSummary() {
  return `${os.platform()} ${os.arch()} · Node ${process.version}`;
}
