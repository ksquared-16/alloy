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
import { existsSync, mkdirSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { normalizeVerdict, observeReconciliation } from "./reconciliation-observe.mjs";
import { buildReconciliationPlan, planIsCurrent, planFingerprint, RECONCILIATION_PLAN_SCHEMA, RECONCILIATION_POLICY_VERSION, SAFE_CORRECTION_KINDS, WITHHELD_CORRECTION_KINDS, isSafeCorrection, applicableCorrections } from "./reconciliation-plan.mjs";

export { normalizeVerdict, observeReconciliation } from "./reconciliation-observe.mjs";
export {
  buildReconciliationPlan, planIsCurrent, planFingerprint,
  RECONCILIATION_PLAN_SCHEMA, RECONCILIATION_POLICY_VERSION,
  SAFE_CORRECTION_KINDS, WITHHELD_CORRECTION_KINDS,
  isSafeCorrection, applicableCorrections,
} from "./reconciliation-plan.mjs";

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
