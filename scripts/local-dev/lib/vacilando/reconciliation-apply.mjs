/**
 * S7 governed reconciliation apply — metadata corrections only.
 *
 * DOCTRINE: reality corrects metadata; metadata never kills reality. This
 * executor may write Vacilando's own records to match what is observably true.
 * It may not touch the thing being observed. There is no kill, no stop, no
 * worktree removal, no branch deletion and no filesystem deletion in here, and
 * a source guard asserts that.
 *
 * It invents no reconciliation logic: classification and correction planning
 * stay in resource-reconciliation.mjs. This module observes, fingerprints,
 * re-checks and writes.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { planCorrections, classifyPort } from "./resource-reconciliation.mjs";

export const RECONCILIATION_PLAN_SCHEMA = "vacilando.reconciliation_plan.v1";
export const RECONCILIATION_POLICY_VERSION = "routine_reconciliation_metadata_v1";

/**
 * The ONLY corrections this executor may apply. Every one writes Vacilando
 * metadata and nothing else. Adding a kind here without an apply implementation
 * that is metadata-only is the mistake this list exists to make visible.
 */
export const SAFE_CORRECTION_KINDS = Object.freeze([
  "clear_dead_pid_record",
  "adopt_observed_server",
  "adopt_unmanaged_worktree",
  "adopt_live_unregistered_worktree",
]);

/** Named so the exclusion is visible rather than implied by absence. */
export const WITHHELD_CORRECTION_KINDS = Object.freeze([
  "retire_worktree", "reassign_port", "any_correction",
]);

/**
 * Split planner output into what this executor may apply and what it may not.
 * Exported so the split is testable directly: today every planner action
 * happens to be allowlisted, so an inline filter would be a no-op no control
 * could see failing.
 */
export function applicableCorrections(actions = []) {
  return {
    corrections: actions.filter((a) => isSafeCorrection(a?.kind)),
    unsupported: actions.filter((a) => !isSafeCorrection(a?.kind)),
  };
}

export function isSafeCorrection(kind) {
  return SAFE_CORRECTION_KINDS.includes(String(kind || ""));
}

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

  // Worktrees: only what git itself reports is adoptable.
  const onDisk = worktreeParent && existsSync(worktreeParent)
    ? readdirSync(worktreeParent, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^wt/.test(d.name)).map((d) => d.name)
    : [];
  const gitKnown = Array.isArray(gitWorktrees) ? gitWorktrees.map((w) => String(w).split("/").pop()) : null;
  const worktrees = onDisk.map((name) => {
    const isRegistered = registeredNames.includes(name);
    // A directory git does not list is NOT a worktree and may never be adopted.
    const inGit = gitKnown ? gitKnown.includes(name) : null;
    return {
      path: name,
      managed: isRegistered,
      in_git_worktree_list: inGit,
      state: isRegistered ? "active" : "unmanaged",
      unregistered_but_live: false,
    };
  });

  return { ports, worktrees, registered_names: registeredNames, observed_at: null };
}

/* ── Plan identity ────────────────────────────────────────────────────────── */

/**
 * The fingerprint covers the correction set AND the safety-relevant observation
 * each correction rests on. If the world moves under an approved plan, the
 * fingerprint moves with it and the plan is stale — it can never act on a
 * process, port or worktree that changed after it was approved.
 */
export function planFingerprint({ corrections = [], observation = {} } = {}) {
  const safetyState = (observation.ports || []).map((p) => ({
    port: p.port, verdict: normalizeVerdict(p.verdict), alive: Boolean(p.alive),
    recorded_pid: p.recorded_pid ?? null, serving_pid: p.serving_pid ?? null,
    registered: p.registered ?? null,
  })).sort((a, b) => a.port - b.port);
  const wtState = (observation.worktrees || []).map((w) => ({
    path: w.path, state: w.state, managed: Boolean(w.managed), in_git: w.in_git_worktree_list ?? null,
  })).sort((a, b) => String(a.path).localeCompare(String(b.path)));
  const set = corrections.map((c) => ({
    kind: c.kind, port: c.port ?? null, path: c.path ?? null, worktree: c.worktree ?? null,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256")
    .update(JSON.stringify({ set, safetyState, wtState }), "utf8")
    .digest("hex").slice(0, 32);
}

export function buildReconciliationPlan(observation, { nowMs = Date.now(), planId = null } = {}) {
  const normalized = {
    ...observation,
    ports: (observation.ports || []).map((p) => ({ ...p, verdict: normalizeVerdict(p.verdict) })),
  };
  const planned = planCorrections({ ports: normalized.ports, worktrees: normalized.worktrees || [] });
  // Only allowlisted kinds may ever be presented as applicable.
  const { corrections, unsupported } = applicableCorrections(planned.actions);
  return {
    schema_version: RECONCILIATION_PLAN_SCHEMA,
    plan_id: planId || `rplan_${createHash("sha256").update(String(nowMs) + JSON.stringify(corrections)).digest("hex").slice(0, 12)}`,
    policy_version: RECONCILIATION_POLICY_VERSION,
    generated_at: new Date(nowMs).toISOString(),
    corrections,
    withheld: planned.withheld,
    // An action the planner produced that this executor does not implement is
    // surfaced, never silently dropped into the applicable set.
    unsupported,
    observation: normalized,
    fingerprint: planFingerprint({ corrections, observation: normalized }),
  };
}

/** Is an approved plan still describing the world it was approved against? */
export function planIsCurrent(plan, freshObservation) {
  if (!plan || !freshObservation) return { current: false, reason: "missing_plan_or_observation" };
  const fresh = buildReconciliationPlan(freshObservation, { nowMs: 0, planId: plan.plan_id });
  if (fresh.fingerprint !== plan.fingerprint) {
    return { current: false, reason: "observed_state_changed", expected: plan.fingerprint, actual: fresh.fingerprint };
  }
  return { current: true, fresh };
}

/* ── Apply ────────────────────────────────────────────────────────────────
 * Every verb below writes Vacilando metadata and returns what it did. None of
 * them signals, stops or removes anything.
 */

function discoveredRecordPath(root, name) {
  return join(root, "reconciliation", `${name}.json`);
}

function writeDiscovered(root, name, record) {
  const dir = join(root, "reconciliation");
  mkdirSync(dir, { recursive: true });
  writeFileSync(discoveredRecordPath(root, name), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

/**
 * Apply one correction, re-checking ITS OWN safety condition first. A plan is
 * permission for a set; it is never permission for a member whose own
 * precondition has since failed.
 */
export function applyCorrection(correction, { root, observation, nowMs = Date.now() } = {}) {
  const kind = correction?.kind;
  if (!isSafeCorrection(kind)) return { ok: false, kind, skipped: "not_in_safe_allowlist" };
  const ports = observation?.ports || [];
  const worktrees = observation?.worktrees || [];

  if (kind === "clear_dead_pid_record") {
    const p = ports.find((x) => x.port === correction.port);
    if (!p) return { ok: false, kind, skipped: "port_no_longer_observed" };
    if (normalizeVerdict(p.verdict) !== "stale_record") return { ok: false, kind, skipped: "no_longer_stale" };
    if (p.alive) return { ok: false, kind, skipped: "recorded_pid_is_alive" };
    if (p.serving_pid) return { ok: false, kind, skipped: "a_live_process_now_serves_this_port" };
    const pidFile = join(root, "pids", `${p.registered}.pid`);
    if (!existsSync(pidFile)) return { ok: true, kind, port: p.port, already: true };
    unlinkSync(pidFile);                       // a dead pid RECORD, not a process
    return { ok: true, kind, port: p.port, cleared_record: `${p.registered}.pid` };
  }

  if (kind === "adopt_observed_server") {
    const p = ports.find((x) => x.port === correction.port);
    if (!p) return { ok: false, kind, skipped: "port_no_longer_observed" };
    if (normalizeVerdict(p.verdict) !== "unregistered_server") return { ok: false, kind, skipped: "no_longer_unregistered" };
    if (!p.serving_pid) return { ok: false, kind, skipped: "no_live_server_observed" };
    writeDiscovered(root, `port-${p.port}`, {
      schema_version: RECONCILIATION_PLAN_SCHEMA, kind, port: p.port,
      observed_pid: p.serving_pid, provenance: "discovered", managed: false,
      adopted_at: new Date(nowMs).toISOString(),
    });
    return { ok: true, kind, port: p.port, provenance: "discovered" };
  }

  if (kind === "adopt_unmanaged_worktree" || kind === "adopt_live_unregistered_worktree") {
    const w = worktrees.find((x) => x.path === correction.path);
    if (!w) return { ok: false, kind, skipped: "worktree_no_longer_observed" };
    // Only git may say a directory is a worktree. Unknown is not yes.
    if (w.in_git_worktree_list !== true) return { ok: false, kind, skipped: "not_in_git_worktree_list" };
    if (w.managed) return { ok: false, kind, skipped: "already_managed" };
    writeDiscovered(root, `worktree-${w.path}`, {
      schema_version: RECONCILIATION_PLAN_SCHEMA, kind, path: w.path,
      // Adoption makes it VISIBLE. It never claims Vacilando created it.
      provenance: "discovered", managed: false, retirement_state: null,
      adopted_at: new Date(nowMs).toISOString(),
    });
    return { ok: true, kind, path: w.path, provenance: "discovered" };
  }

  return { ok: false, kind, skipped: "unimplemented_correction" };
}

/**
 * Apply an approved plan against freshly observed state.
 *
 * The plan is re-derived from the live world first. A stale plan applies
 * NOTHING — not even the corrections that happen to still be valid — because
 * partial application of a stale plan is how one changed correction silently
 * authorises another.
 */
export function applyReconciliationPlan(plan, { root, freshObservation, nowMs = Date.now() } = {}) {
  const currency = planIsCurrent(plan, freshObservation);
  if (!currency.current) {
    return {
      ok: false, error: "stale_plan", reason: currency.reason,
      expected_fingerprint: currency.expected ?? plan?.fingerprint ?? null,
      actual_fingerprint: currency.actual ?? null,
      applied: [], skipped: [], withheld: plan?.withheld || [],
    };
  }
  const applied = [];
  const skipped = [];
  for (const c of plan.corrections) {
    const out = applyCorrection(c, { root, observation: freshObservation, nowMs });
    (out.ok ? applied : skipped).push(out);
  }
  return {
    ok: true,
    plan_id: plan.plan_id,
    fingerprint: plan.fingerprint,
    requested: plan.corrections.length,
    applied,
    skipped,
    withheld: plan.withheld || [],
    unsupported: plan.unsupported || [],
  };
}
