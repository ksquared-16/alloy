/**
 * S7 reconciliation OBSERVATION.
 *
 * Split from the apply executor deliberately. Observing reality needs to run
 * git and read the process table; APPLYING must be provably incapable of
 * touching anything. Keeping them in one file meant the apply module's source
 * guard had to tolerate execFileSync, which is exactly the exception that
 * makes such a guard worthless. Reading lives here; writing lives there.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyWorktree } from "./resource-reconciliation.mjs";

/* ── Observation ──────────────────────────────────────────────────────────
 * The same rules `vac health` already uses, in one owner so the plan and the
 * health report cannot disagree about what is true.
 */

const PORTS = Object.freeze([3011, 3012, 3013, 3014, 3015, 3016]);

/** Verdicts arrive hyphenated from the probe and underscored from the classifier. */
export function normalizeVerdict(v) {
  return String(v || "").replace(/-/g, "_");
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function observeReconciliation({
  root,
  processes = [],
  worktreeParent = null,
  gitWorktrees = null,
  activeRunsByWorktree = null,
  referencesByWorktree = null,
} = {}) {
  const metaDir = join(root, "metadata");
  const registered = new Map();
  const registeredNames = [];
  if (existsSync(metaDir)) {
    for (const f of readdirSync(metaDir)) {
      if (!f.endsWith(".env")) continue;
      const name = f.replace(/\.env$/, "");
      registeredNames.push(name);
      const m = readFileSync(join(metaDir, f), "utf8").match(/PORT="?(\d+)"?/);
      if (m) registered.set(Number(m[1]), name);
    }
  }

  const ports = [];
  for (const port of PORTS) {
    const owner = registered.get(port) || null;
    const pidFile = owner ? join(root, "pids", `${owner}.pid`) : null;
    const recorded = pidFile && existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : null;
    const alive = pidAlive(recorded);
    const serving = processes.find((p) => new RegExp(`-p\\s+${port}\\b`).test(p.command || "")) || null;
    let verdict;
    if (serving && owner && alive) verdict = "matched";
    else if (serving && (!owner || !alive)) verdict = "unregistered_server";
    else if (!serving && owner && !alive) verdict = "stale_record";
    else if (!serving && !owner) verdict = "free";
    else verdict = "matched";
    ports.push({
      port, registered: owner, recorded_worktree: owner, recorded_pid: recorded, alive,
      serving_pid: serving ? serving.pid : null,
      observed_owner: serving ? (serving.worktree || null) : null,
      verdict,
    });
  }

  // WORKTREES, through the CANONICAL CLASSIFIER.
  //
  // The previous version called every registered worktree "active" and every
  // unregistered one "unmanaged", so the retirement gates never ran and
  // withheld came back 0 — which reads as "nothing needs an operator" when it
  // actually meant "nothing was ever classified". Every worktree now goes
  // through classifyWorktree with real evidence, and UNKNOWN safety state
  // protects rather than retires.
  const onDisk = worktreeParent && existsSync(worktreeParent)
    ? readdirSync(worktreeParent, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^wt/.test(d.name)).map((d) => d.name)
    : [];
  const gitKnown = Array.isArray(gitWorktrees) ? gitWorktrees.map((w) => String(w).split("/").pop()) : null;

  const worktrees = onDisk.map((name) => {
    const full = join(worktreeParent, name);
    const isRegistered = registeredNames.includes(name);
    const inGit = gitKnown ? gitKnown.includes(name) : null;

    // A provider or dev server whose command names this worktree.
    const liveProviders = processes.filter((pr) => String(pr.command || "").includes(name))
      .map((pr) => ({ pid: pr.pid }));
    const liveDevServer = ports.some((pt) => pt.registered === name && pt.alive);
    const active = (activeRunsByWorktree && activeRunsByWorktree[name]) || [];

    // Git state. Unreadable stays NULL, which the classifier treats as a
    // retirement blocker rather than a clean tree.
    let gitState = null;
    let branchDurable = null;
    if (inGit === true && existsSync(full)) {
      try {
        const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: full, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] })
          .split("\n").map((l) => l.trim()).filter(Boolean);
        gitState = { dirty_paths: dirty };
      } catch { gitState = null; }
      try {
        // Durable == the branch head is reachable from the canonical remote.
        const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: full, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] }).trim();
        execFileSync("git", ["merge-base", "--is-ancestor", head, "origin/staging"], { cwd: full, timeout: 15000, stdio: "ignore" });
        branchDurable = true;
      } catch { branchDurable = null; }
    }

    const classified = classifyWorktree({
      path: name,
      registration: isRegistered ? { provenance: "managed" } : null,
      liveProviders,
      liveDevServer,
      activeRuns: active,
      gitState,
      branchDurable,
      referencedBy: (referencesByWorktree && referencesByWorktree[name]) || [],
    });
    return { ...classified, in_git_worktree_list: inGit };
  });

  return { ports, worktrees, registered_names: registeredNames, observed_at: null };
}


