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
import { homedir } from "node:os";
import { join } from "node:path";
import { classifyPort, classifyWorktree } from "./resource-reconciliation.mjs";
import { resolveWorktreeRegistration } from "./worktree-registration.mjs";

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
    // A pid RECORD is the claim of a live runtime. Its absence is not a lie —
    // it is a stopped server with its durable assignment intact.
    const hasRuntimeClaim = Boolean(pidFile && existsSync(pidFile));
    const recorded = hasRuntimeClaim ? Number(readFileSync(pidFile, "utf8").trim()) : null;
    const alive = pidAlive(recorded);
    const serving = processes.find((p) => new RegExp(`-p\\s+${port}\\b`).test(p.command || "")) || null;
    // Ask the classifier. This observer used to re-derive its own verdict ladder,
    // which had no foreign_owner case at all — so a live server holding a port the
    // registry assigns to SOMEONE ELSE was reported as unregistered_server and
    // adopted forever. classifyPort's own comment warns against exactly that
    // collapse. There is one owner of "what is true about this port".
    const observedOwner = serving ? (serving.worktree || null) : null;
    const { verdict } = classifyPort({
      port,
      recordedWorktree: owner,
      recordedPid: recorded,
      recordedPidAlive: alive,
      hasRuntimeClaim,
      listening: Boolean(serving),
      observedPid: serving ? serving.pid : null,
      observedOwnerWorktree: observedOwner,
      ownershipProven: Boolean(observedOwner),
    });
    ports.push({
      port, registered: owner, recorded_worktree: owner, recorded_pid: recorded, alive,
      has_runtime_claim: hasRuntimeClaim,
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
    // THE OWNER answers registration. Scanning metadata/*.env here is what
    // made a discovered worktree invisible: adoption wrote somewhere else, so
    // the same correction was proposed forever.
    const registration = resolveWorktreeRegistration({ root, name, repositoryId: "repo_alloy" });
    const isRegistered = registration.known;
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
      // Provenance comes from the owner. A discovered worktree is KNOWN —
      // registration and lifecycle are independent, so it can be discovered
      // and active at the same time.
      registration: isRegistered ? { provenance: registration.provenance } : null,
      liveProviders,
      liveDevServer,
      activeRuns: active,
      gitState,
      branchDurable,
      referencedBy: (referencesByWorktree && referencesByWorktree[name]) || [],
    });
    return {
      ...classified,
      in_git_worktree_list: inGit,
      provenance: registration.provenance,
      known: registration.known,
      managed: registration.managed === true,
    };
  });

  return { ports, worktrees, registered_names: registeredNames, observed_at: null };
}




/**
 * Observe reality WITHOUT being handed it.
 *
 * The trusted executor must re-observe for itself: certification caught it
 * calling observeReconciliation with `inputs.processes || []`, so it modelled
 * a host with no running servers, every port reclassified, and the plan could
 * never match its own fingerprint — a permanent stale_plan. A re-observation
 * that depends on the caller supplying reality is not a re-observation.
 */
export function gatherObservation({ root, worktreeParent = null } = {}) {
  let processes = [];
  try {
    processes = execFileSync("ps", ["-Ao", "pid=,args="], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 15000 })
      .split("\n").map((l) => { const m = l.trim().match(/^(\d+)\s+(.*)$/); return m ? { pid: Number(m[1]), command: m[2] } : null; })
      .filter(Boolean);
  } catch { processes = []; }

  let gitWorktrees = null;
  for (const cwd of [join(homedir(), "Alloy"), process.cwd()]) {
    try {
      gitWorktrees = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd, encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] })
        .split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.replace("worktree ", ""));
      break;
    } catch { /* try the next */ }
  }

  const activeRunsByWorktree = {};
  try {
    const p = join(root, "vacilando", "execution-runs", "runs.json");
    if (existsSync(p)) {
      const j = JSON.parse(readFileSync(p, "utf8"));
      const terminal = new Set(["COMPLETE", "FAILED", "ABANDONED"]);
      for (const v of Object.values(j.lanes || {})) {
        const rs = Array.isArray(v) ? v : (v.runs || Object.values(v).find(Array.isArray) || []);
        for (const r of rs) {
          if (!r || terminal.has(String(r.state).toUpperCase()) || !r.worktree_path) continue;
          (activeRunsByWorktree[String(r.worktree_path).split("/").pop()] ||= []).push({ run_id: r.run_id });
        }
      }
    }
  } catch { /* unknown stays unknown */ }

  return observeReconciliation({
    root,
    processes,
    worktreeParent: worktreeParent || join(homedir(), "Code", "alloy-worktrees"),
    gitWorktrees,
    activeRunsByWorktree,
  });
}
