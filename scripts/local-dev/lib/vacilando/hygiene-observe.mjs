/**
 * Measure the hygiene estate against real host state.
 *
 * Split from the contract for the same reason `worktree-retirement-observe` is:
 * the contract stays pure and testable, and every executor re-measures through
 * here rather than trusting a plan it was handed.
 *
 * THE BLIND SPOT THIS FIXES. S7's observation lists worktrees with
 * `readdirSync(...).filter((d) => /^wt/.test(d.name))`. Four permanent lanes —
 * financials, payments, troubleshooting, ui-vac — do not start with `wt`, so
 * they were not classified at all: not preserved, not protected, not UNKNOWN,
 * simply absent from the population. §2 requires every managed resource to end
 * in one explicit state, and a resource nobody enumerates ends in none. The
 * population here is the union of git's own registration list and the parent
 * directory, with no name filter anywhere.
 *
 * NOTHING HERE MUTATES. Every command is a read: `git worktree list`, `ps`,
 * `du`, `lsof`, `stat`, and the toolkit CLI in its plan mode, which deletes
 * nothing and says so in its own output.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { observeRetirementCandidates } from "./worktree-retirement-observe.mjs";
import { classifyArtifactPath, summarizeArtifactEstate } from "./artifact-retention.mjs";
import {
  classifyArtifactHygiene,
  classifyRegistrationHygiene,
  classifyToolkitHygiene,
  classifyWorktreeHygiene,
  hygieneScoreboard,
} from "./hygiene-classification.mjs";
import { lastCycleSummary } from "./hygiene-reclaim.mjs";

export const HYGIENE_OBSERVE_SCHEMA = "vacilando.hygiene_observe.v1";

/** `lsof` is not on PATH in a launchd context. Naming the absolute path is the fix, and the reason. */
const LSOF = "/usr/sbin/lsof";

function run(cmd, args, { cwd = undefined, timeout = 20_000 } = {}) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch { return null; }
}

export function defaultCanonicalRoot() { return join(homedir(), "Alloy"); }
export function defaultWorktreeParent() { return join(homedir(), "Code", "alloy-worktrees"); }

/** Every process, or null when the table could not be read. Null is never "no processes". */
export function readProcesses() {
  const text = run("ps", ["-Ao", "pid=,ppid=,args="], { timeout: 15_000 });
  if (text == null) return null;
  return text.split("\n")
    .map((l) => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); return m ? { pid: Number(m[1]), ppid: Number(m[2]), command: m[3] } : null; })
    .filter(Boolean);
}

/** Registered worktrees, straight from git. Each row records whether its path is present. */
export function readGitWorktrees(canonicalRoot = defaultCanonicalRoot()) {
  const text = run("git", ["worktree", "list", "--porcelain"], { cwd: canonicalRoot });
  if (text == null) return null;
  const rows = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) rows.push(current);
      current = { path: line.slice("worktree ".length).trim(), prunable: false, locked: false, branch: null };
    } else if (current && line.startsWith("prunable")) current.prunable = true;
    else if (current && line.startsWith("locked")) current.locked = true;
    else if (current && line.startsWith("branch ")) current.branch = line.slice("branch ".length).trim();
  }
  if (current) rows.push(current);
  for (const r of rows) r.path_exists = existsSync(r.path);
  return rows;
}

/**
 * The complete worktree population under the managed parent.
 *
 * Union, not intersection: a directory git has forgotten and a registration
 * whose directory is gone are both real and both need a state.
 */
export function worktreePopulation({
  canonicalRoot = defaultCanonicalRoot(),
  worktreeParent = defaultWorktreeParent(),
  gitWorktrees = null,
} = {}) {
  const git = gitWorktrees ?? readGitWorktrees(canonicalRoot);
  const names = new Map();
  for (const row of git || []) {
    if (!row.path.startsWith(`${worktreeParent}/`)) continue;
    names.set(basename(row.path), { name: basename(row.path), path: row.path, in_git_worktree_list: true, path_exists: row.path_exists, branch: row.branch });
  }
  if (existsSync(worktreeParent)) {
    for (const d of readdirSync(worktreeParent, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      // NO NAME FILTER. See the header.
      if (!names.has(d.name)) {
        names.set(d.name, { name: d.name, path: join(worktreeParent, d.name), in_git_worktree_list: git == null ? null : false, path_exists: true, branch: null });
      }
    }
  }
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Directory sizes in bytes, in one `du` pass. Unreadable stays null, never zero. */
export function measureBytes(paths = []) {
  const out = new Map();
  if (!paths.length) return out;
  const text = run("du", ["-sk", ...paths], { timeout: 300_000 });
  if (text == null) return out;
  for (const line of text.split("\n")) {
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) out.set(m[2].trim(), Number(m[1]) * 1024);
  }
  return out;
}

/** Does any process hold this file open? `null` when lsof is unusable — unmeasured, not "no". */
export function fileHasLiveWriter(path) {
  if (!existsSync(LSOF)) return null;
  try {
    const text = execFileSync(LSOF, ["-t", "--", path], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] });
    return String(text).trim().length > 0;
  } catch (e) {
    // lsof exits non-zero when NOTHING holds the file open. That is a real
    // measurement of "no writer", and conflating it with a failed probe is the
    // Phase 3 curl mistake exactly. Status 1 with empty output is the answer.
    if (e && e.status === 1 && !String(e.stdout || "").trim()) return false;
    return null;
  }
}

/** Worktree hygiene for the whole population. */
export function observeWorktreeHygiene({
  root,
  canonicalRoot = defaultCanonicalRoot(),
  worktreeParent = defaultWorktreeParent(),
  requestingWorktree = null,
  repository = "repo_alloy",
  processes = null,
  gitWorktrees = null,
  withBytes = true,
} = {}) {
  const git = gitWorktrees ?? readGitWorktrees(canonicalRoot);
  const population = worktreePopulation({ canonicalRoot, worktreeParent, gitWorktrees: git });
  const procs = processes ?? readProcesses() ?? [];
  const evaluations = observeRetirementCandidates({
    root,
    s7Worktrees: population.map((w) => ({ path: w.name, state: "observed", in_git_worktree_list: w.in_git_worktree_list, reasons: [] })),
    processes: procs,
    worktreeParent,
    requestingWorktree,
    repository,
  });
  const sizes = withBytes ? measureBytes(population.filter((w) => w.path_exists).map((w) => w.path)) : new Map();
  return evaluations.map((e) => {
    const hit = population.find((w) => w.name === e.path) || null;
    // Provenance travels with the evaluation: `observeRetirementCandidates`
    // resolves it from the registration owner, and the managed case protects.
    const cls = classifyWorktreeHygiene(e, { managed: e.managed, provenance: e.provenance });
    return {
      ...cls,
      resource_kind: "worktree",
      resource_id: e.path,
      path: hit?.path ?? null,
      bytes: hit ? (sizes.get(hit.path) ?? null) : null,
      fingerprint: e.fingerprint,
      head_sha: e.head_sha,
      branch: e.branch,
      blocked_by: e.blocked_by,
      durability: e.durability,
      safety_state: e.state,
      managed: e.managed,
      provenance: e.provenance,
    };
  });
}

/** Registration hygiene, straight from git's own view. */
export function observeRegistrationHygiene({ canonicalRoot = defaultCanonicalRoot(), gitWorktrees = null } = {}) {
  const rows = gitWorktrees ?? readGitWorktrees(canonicalRoot);
  if (rows == null) {
    return [{ ...classifyRegistrationHygiene({}), resource_kind: "registration", resource_id: "*", path: null }];
  }
  return rows.map((r) => ({
    ...classifyRegistrationHygiene({ path: r.path, pathExists: r.path_exists, prunableByGit: r.prunable }),
    resource_kind: "registration",
    resource_id: r.path,
    path: r.path,
    locked: r.locked,
    branch: r.branch,
  }));
}

/**
 * Toolkit hygiene, by asking the certified planner rather than reimplementing it.
 *
 * `vac-toolkit-prune.mjs` with no flags is a plan and removes nothing — that is
 * asserted by its own suite. Composing it here means there is exactly one
 * implementation of "which toolkit versions matter", and no second reader that
 * can drift from it.
 */
export function observeToolkitHygiene({ cliPath = null, toolkitRoot = null, timeoutMs = 180_000 } = {}) {
  const cli = cliPath || new URL("../../vac-toolkit-prune.mjs", import.meta.url).pathname;
  const env = { ...process.env };
  if (toolkitRoot) env.ALLOY_TOOLKIT_ROOT = toolkitRoot;
  let text = null;
  try {
    text = execFileSync(process.execPath, [cli, "--json"], {
      encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env, stdio: ["ignore", "pipe", "ignore"],
    });
  } catch { text = null; }
  if (text == null) {
    return { ok: false, error: "toolkit_plan_unavailable", plan: null, versions: [] };
  }
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { return { ok: false, error: "toolkit_plan_unparseable", plan: null, versions: [] }; }
  const plan = parsed.plan || parsed;
  const inventory = parsed.inventory || [];
  // The plan alone lists retained versions with reasons and prunable versions
  // with paths; that is enough to classify without a second inventory read.
  const records = inventory.length ? inventory : [
    ...(plan.retained_detail || []).map((r) => ({
      version: r.version, disk_bytes: r.disk_bytes, protection_reasons: r.reasons || [],
      live_process_references: (r.live_pids || []).map((pid) => ({ pid })), prunable: false,
    })),
    ...(plan.prune || []).map((p) => ({
      version: p.version, path: p.path, disk_bytes: p.disk_bytes,
      protection_reasons: [], live_process_references: [], prunable: true,
    })),
  ];
  return {
    ok: true,
    plan,
    versions: records.map((r) => ({
      ...classifyToolkitHygiene(r, plan),
      resource_kind: "toolkit",
      resource_id: r.version,
      path: r.path ?? null,
      bytes: r.disk_bytes ?? null,
    })),
  };
}

/**
 * Artefact estate.
 *
 * Enumerated at a bounded granularity — top-level runtime entries plus one
 * level inside `logs/` and `vacilando/` — because the unit of retention is a
 * log file or a store, not an individual JSON row. A deeper walk would produce
 * thousands of rows that all classify identically from their parent.
 */
export function artifactCandidates(root) {
  const out = [];
  const push = (abs, rel) => {
    let st = null;
    try { st = statSync(abs); } catch { st = null; }
    out.push({ abs, rel, mtime_ms: st ? st.mtimeMs : null, is_dir: st ? st.isDirectory() : null });
  };
  if (!existsSync(root)) return out;
  for (const d of readdirSync(root, { withFileTypes: true })) {
    const abs = join(root, d.name);
    if (d.name === "logs" || d.name === "vacilando") {
      if (!existsSync(abs)) continue;
      for (const inner of readdirSync(abs, { withFileTypes: true })) push(join(abs, inner.name), `${d.name}/${inner.name}`);
      continue;
    }
    push(abs, d.name);
  }
  return out;
}

export function observeArtifactHygiene({ root, now = Date.now(), withBytes = true } = {}) {
  const candidates = artifactCandidates(root);
  const sizes = withBytes ? measureBytes(candidates.map((c) => c.abs)) : new Map();
  return candidates.map((c) => {
    const bytes = sizes.get(c.abs) ?? null;
    // Evidence is measured only for the paths whose rules require it. A log's
    // live-writer probe is the expensive one and it runs on logs alone.
    const evidence = {};
    if (/^logs\//.test(c.rel)) evidence.writer_live = fileHasLiveWriter(c.abs);
    if (/^browser-profiles/.test(c.rel) || /playwright|test-results/.test(c.rel)) evidence.active_session_refs = [];
    if (/^validate-results/.test(c.rel)) evidence.active_run_refs = [];
    const classification = classifyArtifactPath({
      relPath: c.rel, evidence, now, mtimeMs: c.mtime_ms, bytes,
    });
    return {
      ...classifyArtifactHygiene(classification),
      resource_kind: "artifact",
      resource_id: c.rel,
      path: c.abs,
      bytes,
      retention_class: classification.retention_class,
      mechanism: classification.mechanism ?? null,
    };
  });
}

/** The whole estate, in one call, with the scoreboard §17 asks for. */
export function observeHygiene({
  root,
  canonicalRoot = defaultCanonicalRoot(),
  worktreeParent = defaultWorktreeParent(),
  requestingWorktree = null,
  toolkitRoot = null,
  now = Date.now(),
  withBytes = true,
  findings = [],
} = {}) {
  const git = readGitWorktrees(canonicalRoot);
  const worktrees = observeWorktreeHygiene({ root, canonicalRoot, worktreeParent, requestingWorktree, gitWorktrees: git, withBytes });
  const registrations = observeRegistrationHygiene({ canonicalRoot, gitWorktrees: git });
  const toolkit = observeToolkitHygiene({ toolkitRoot });
  const artifacts = observeArtifactHygiene({ root, now, withBytes });
  const scoreboard = hygieneScoreboard({
    worktrees, registrations, artifacts,
    toolkits: toolkit.versions,
    toolkitPlan: toolkit.plan,
    lastCycle: lastCycleSummary(root),
    findings, now,
  });
  return {
    schema_version: HYGIENE_OBSERVE_SCHEMA,
    observed_at: new Date(now).toISOString(),
    worktrees, registrations, artifacts,
    toolkits: toolkit.versions,
    toolkit_plan: toolkit.plan,
    toolkit_error: toolkit.ok ? null : toolkit.error,
    artifact_estate: summarizeArtifactEstate(
      artifacts.map((a) => ({ retention_class: a.retention_class, bytes: a.bytes, reclaimable: a.hygiene_state === "RECLAIMABLE" })),
    ),
    scoreboard,
  };
}
