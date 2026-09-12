/**
 * WEEKLY HOST MAINTENANCE — orchestration, and deliberately nothing else.
 *
 * THE ONE THING THIS OWNS is a maintenance window: an id, a phase, timestamps,
 * a defer count and a report. Every fact it acts on is asked of the owner that
 * already holds it, and every mutation it causes is performed by that owner.
 *
 * Audited before writing a line, and NOT rebuilt:
 *
 *   launchd `com.alloy.vacilando-gateway`  RunAtLoad + KeepAlive — already
 *                                          restores the Gateway at boot
 *   control-plane-health                   currentRuntimeGeneration(),
 *                                          ownershipIsCurrent() — a reboot
 *                                          already mints a new generation
 *   execution-recovery                     listStaleGenerationOwnedProcesses(),
 *                                          scanStaleSlotPidFiles()
 *   control-plane-recovery                 observe / classify / plan / episodes
 *   host-steward-cycle                     the 5-minute cycle, the cycle lock,
 *                                          hygieneDue() — the scheduler
 *   host-admission                         classifyHostAdmission() — admission
 *   hygiene-reclaim                        intent/outcome ledger and
 *                                          reconcileInterrupted()
 *   worktree-lifecycle (DevOps 3)          classification and reclamation
 *   lane-bootstrap / lane-freshness        drift and staleness
 *   lane-knowledge (DevOps 4)              durable restart context
 *   promotion-train (DevOps 6)             drainStateForMaintenance()
 *   critical-invariants (DevOps 5)         the post-boot proof
 *   toolkit-convergence                    installed toolkit identity
 *
 * The single capability that genuinely did not exist is "ask the host to
 * restart", and this file does not do that either: it emits an INTENT that a
 * caller must execute, so the orchestrator cannot reboot anything by being
 * imported, and every phase below it is testable without a machine that
 * disappears.
 *
 * WHY NOT A DAEMON. A weekly reboot needs a decision once a week, and there is
 * already a loop asking "is anything due?" every five minutes with a lock around
 * it. `maintenanceDue()` is the same shape as `hygieneDue()` and reads the same
 * steward state file. A second scheduler would be a second thing to supervise,
 * to recover, and to explain when it disagrees with the first.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { drainStateForMaintenance, TRAIN_STATE } from "./promotion-train.mjs";

export const MAINTENANCE_SCHEMA = "vacilando.host_maintenance.v1";

/**
 * THE PHASES.
 *
 * DEFERRED and CONSTRAINED are not decoration. DEFERRED is the answer when
 * protected work is in flight and the window has not expired — the common case,
 * and the one that must not escalate into force. CONSTRAINED is where a failed
 * post-boot certification lands, because the dangerous alternative is a host
 * that returns to NORMAL admission having proven nothing.
 */
export const PHASE = Object.freeze({
  NORMAL: "NORMAL",
  MAINTENANCE_PENDING: "MAINTENANCE_PENDING",
  DRAINING: "DRAINING",
  READY_TO_REBOOT: "READY_TO_REBOOT",
  REBOOTING: "REBOOTING",
  RECOVERING: "RECOVERING",
  VERIFYING: "VERIFYING",
  DEFERRED: "DEFERRED",
  CONSTRAINED: "CONSTRAINED",
});

/** Phases in which new heavy work and new promotion trains are not admitted. */
export const CLOSED_TO_NEW_WORK = Object.freeze([
  PHASE.DRAINING, PHASE.READY_TO_REBOOT, PHASE.REBOOTING, PHASE.RECOVERING, PHASE.VERIFYING,
]);

/**
 * THE SCHEDULE, CHOSEN FROM MEASURED HOST ACTIVITY.
 *
 * 31,087 admission events over 24 days, bucketed by local hour and weekday:
 *
 *   Tue–Fri carry 4,679 / 8,533 / 9,016 / 8,690 events.
 *   Sat 124, Mon 38, Sun 7.
 *   Sunday is empty in EVERY hour except 08:00 (4 events) and 12:00 (3).
 *
 * The emptiest contiguous four-hour slots in the week are Sun 00:00 through
 * Sun 04:00, all with zero events across the whole sample.
 *
 * 03:00 SUNDAY is chosen rather than 00:00 because the defer window has to land
 * somewhere too: Sunday 00:00–07:00 is uniformly dead, so a start at 03:00 can
 * defer the full four hours and still finish inside quiet time, whereas a start
 * at midnight would push a deferred attempt into Sunday 08:00 where activity
 * resumes. The window is the reason for the hour, not the hour for itself.
 *
 * ONE ATTEMPT PER PERIOD. `maintenanceDue` compares against the last attempt,
 * not the last success — a maintenance that deferred still consumed its attempt
 * and must not spin. Retrying inside the window is what `defer` is for, and it
 * is bounded.
 */
export const MAINTENANCE_POLICY = Object.freeze({
  weekday: numberFromEnv("ALLOY_MAINTENANCE_WEEKDAY", 0),        // 0 = Sunday
  hour_local: numberFromEnv("ALLOY_MAINTENANCE_HOUR", 3),
  period_ms: numberFromEnv("ALLOY_MAINTENANCE_PERIOD_MS", 7 * 24 * 60 * 60 * 1000),
  /** How long a blocked maintenance may keep retrying before it gives up to the operator. */
  defer_window_ms: numberFromEnv("ALLOY_MAINTENANCE_DEFER_WINDOW_MS", 4 * 60 * 60 * 1000),
  /** How often a deferred attempt re-checks. The steward cycle is 5 minutes; this is a multiple of it. */
  defer_recheck_ms: numberFromEnv("ALLOY_MAINTENANCE_DEFER_RECHECK_MS", 15 * 60 * 1000),
  max_defers: numberFromEnv("ALLOY_MAINTENANCE_MAX_DEFERS", 16),
});

function numberFromEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/* ── A: what survives a reboot ────────────────────────────────────────────── */

/**
 * WHAT A REBOOT DOES TO EACH KIND OF STATE.
 *
 * This is a classification, not a mechanism: every row names the owner that
 * already implements it. Writing it down is the point — the failure this
 * prevents is an operator, or a future mission, restoring a PROCESS because it
 * existed before, rather than restoring the WORK it was doing.
 *
 * DO_NOT_RESTORE is the row people get wrong. A dev server that was running is
 * not evidence that a dev server should be running; it is evidence that a lane
 * needed one at some point. Bringing back thirteen of them because they were
 * there is how a maintenance reboot produces a busier host than it started with.
 */
export const SURVIVAL = Object.freeze({
  PERSIST: "PERSIST",
  RECREATE: "RECREATE",
  RECONCILE: "RECONCILE",
  DO_NOT_RESTORE: "DO_NOT_RESTORE",
});

export const REBOOT_SURVIVAL = Object.freeze([
  Object.freeze({ subject: "development lane identity", class: SURVIVAL.PERSIST, owner: "development-lane / durable lane records" }),
  Object.freeze({ subject: "execution runs", class: SURVIVAL.RECONCILE, owner: "execution-run / execution-recovery", note: "a run whose provider is gone is reconciled, not resumed in place" }),
  Object.freeze({ subject: "agent/provider sessions", class: SURVIVAL.RECREATE, owner: "agent-session-lifecycle / execution-session-recovery", note: "recreated from durable lane and run context when the lifecycle says resumable" }),
  Object.freeze({ subject: "worktrees", class: SURVIVAL.PERSIST, owner: "filesystem + worktree-registration" }),
  Object.freeze({ subject: "branch and commit state", class: SURVIVAL.PERSIST, owner: "git" }),
  Object.freeze({ subject: "development slots", class: SURVIVAL.RECONCILE, owner: "managed-slots registry", note: "the registry persists; pid files do not" }),
  Object.freeze({ subject: "dev servers", class: SURVIVAL.DO_NOT_RESTORE, owner: "dev-server-ownership", note: "started on demand by the lane that needs one" }),
  Object.freeze({ subject: "QA browser sessions", class: SURVIVAL.DO_NOT_RESTORE, owner: "browser-auth", note: "an expired QA session needs an operator sign-in; it cannot be revived by a reboot" }),
  Object.freeze({ subject: "lane knowledge", class: SURVIVAL.PERSIST, owner: "lane-memory / lane-knowledge (DevOps 4)" }),
  Object.freeze({ subject: "governed action execution claims", class: SURVIVAL.RECONCILE, owner: "governed-action-request", note: "an accepted async execution must settle as interrupted, never silently vanish" }),
  Object.freeze({ subject: "promotion train state", class: SURVIVAL.RECONCILE, owner: "promotion-train (DevOps 6)", note: "candidates persist; an in-flight train does not survive and must not appear to" }),
  Object.freeze({ subject: "owned process records", class: SURVIVAL.DO_NOT_RESTORE, owner: "execution-recovery", note: "every one is previous-generation by construction" }),
  Object.freeze({ subject: "runtime generation", class: SURVIVAL.RECREATE, owner: "control-plane-health", note: "derived from boot time; a reboot necessarily mints a new one" }),
]);

export function survivalFor(subject) {
  return REBOOT_SURVIVAL.find((r) => r.subject === subject) || null;
}

/* ── C: drain ─────────────────────────────────────────────────────────────── */

/**
 * MUTATIONS A REBOOT MUST NEVER INTERRUPT.
 *
 * Not "important work" — work whose interruption cannot be undone by re-running
 * it. A merge that half-happened, a migration applied without its ledger row (a
 * shape this host has already produced twice), a toolkit install between
 * unpacking and linking. Each leaves the system in a state no recovery pass can
 * infer, which is the definition of the class.
 *
 * A read census is deliberately absent: interrupting one loses nothing but time.
 */
export const PROTECTED_MUTATIONS = Object.freeze([
  "repository.merge_pull_request",
  "repository.push",
  "promotion.open_pr",
  "database.apply_migration",
  "database.apply_promoted_migration",
  "database.repair_migration_ledger",
  "host.install_toolkit",
  "vacilando.retire_worktree",
  "vacilando.apply_reconciliation_plan",
]);

export const IN_FLIGHT_STATUSES = Object.freeze(["executing", "accepted", "approved", "in_flight", "running"]);

export function protectedMutationsInFlight(governedActions = []) {
  return governedActions.filter((a) => PROTECTED_MUTATIONS.includes(a?.action_key)
    && IN_FLIGHT_STATUSES.includes(String(a?.status || "").toLowerCase()));
}

/**
 * MAY THE HOST BE REBOOTED RIGHT NOW?
 *
 * Composes the owners rather than re-measuring: DevOps 6 answers for trains,
 * DevOps 3's classification answers for worktrees, and the governed-action store
 * answers for mutations. Everything it refuses on, it names.
 *
 * DIRTY AND UNDURABLE WORKTREES DEFER, THEY DO NOT GET CLEANED. A reboot does
 * not harm a dirty worktree, so on its own it would be safe to proceed — but a
 * maintenance cycle that reboots past uncommitted work will eventually be the
 * thing blamed for losing it, and the cost of waiting a week is nothing. The
 * bounded defer window is what makes this affordable.
 */
export function evaluateDrain({
  runs = [],
  governedActions = [],
  trains = [],
  queue = [],
  worktrees = [],
  stackLeases = [],
  nowMs = Date.now(),
} = {}) {
  const blockers = [];
  const warnings = [];

  const protectedInFlight = protectedMutationsInFlight(governedActions);
  for (const a of protectedInFlight) {
    blockers.push({
      kind: "protected_mutation_in_flight",
      detail: `${a.action_key} is ${a.status}`,
      reference: a.request_id || null,
      owner: "governed-action-request",
    });
  }

  // DevOps 6 owns this answer. It is asked, not reimplemented.
  const drain = drainStateForMaintenance({ trains, queue });
  if (!drain.safe_to_begin_maintenance) {
    blockers.push({
      kind: "promotion_train_in_flight",
      detail: drain.reason,
      reference: (drain.active_trains || []).map((t) => t.train).filter(Boolean).join(", ") || null,
      owner: "promotion-train",
    });
  }

  const activeRuns = runs.filter((r) => !["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"].includes(String(r?.state || "").toUpperCase()));
  for (const r of activeRuns) {
    // An active run is a blocker only while it is genuinely executing. A run
    // waiting on a resource or on the operator loses nothing to a reboot and
    // would otherwise keep maintenance out of the window indefinitely.
    if (String(r.state || "").toUpperCase() === "EXECUTING") {
      blockers.push({ kind: "run_executing", detail: r.run_id || "run", reference: r.lane_id || null, owner: "execution-run" });
    } else {
      warnings.push({ kind: "run_waiting", detail: `${r.run_id || "run"} is ${r.state}`, owner: "execution-run" });
    }
  }

  for (const w of worktrees) {
    if (w?.dirty) blockers.push({ kind: "dirty_worktree", detail: w.name || w.path, owner: "worktree-lifecycle" });
    else if (w?.undurable) blockers.push({ kind: "undurable_commits", detail: w.name || w.path, owner: "worktree-lifecycle" });
  }

  for (const l of stackLeases) {
    if (l?.protected) warnings.push({ kind: "protected_stack_lease", detail: l.name || l.id || "lease", owner: "alloy-stack" });
  }

  return {
    safe: blockers.length === 0,
    blockers,
    warnings,
    active_runs: activeRuns.length,
    protected_mutations: protectedInFlight.length,
    train: { drained: drain.drained, queued_candidates: drain.queued_candidates },
    measured_at: new Date(nowMs).toISOString(),
  };
}

/* ── D: checkpoint ────────────────────────────────────────────────────────── */

/**
 * WHAT MUST BE DURABLE BEFORE THE MACHINE GOES AWAY.
 *
 * Each requirement names the owner that satisfies it, and an UNMEASURED
 * requirement blocks exactly as a failed one does — a checkpoint you could not
 * verify is not a checkpoint. This is the DevOps 5 law applied to a reboot.
 *
 * It records no transcripts. The restart context is a pointer set: which lane,
 * which run, what it was about to do, what is blocking it. A future session
 * reads it and continues; it does not re-read a conversation.
 */
export const CHECKPOINT_REQUIREMENTS = Object.freeze([
  Object.freeze({ id: "lane_next_action_recorded", owner: "lane-memory / lane-knowledge", why: "an operator must not have to reconstruct what ten lanes were doing" }),
  Object.freeze({ id: "lane_blockers_recorded", owner: "lane-memory", why: "a lane that resumes without its blocker repeats the work that found it" }),
  Object.freeze({ id: "accepted_executions_durable", owner: "governed-action-request", why: "an accepted async execution living only in a Promise dies silently with the process" }),
  Object.freeze({ id: "worktree_durability_known", owner: "worktree-retirement branch durability", why: "unmeasured durability is the one state that must never precede a reclaim" }),
  Object.freeze({ id: "run_handoff_filed", owner: "execution-run-report", why: "the run's own account of where it got to" }),
]);

export function evaluateCheckpoint({ measurements = {} } = {}) {
  const rows = CHECKPOINT_REQUIREMENTS.map((r) => {
    const v = measurements[r.id];
    return { ...r, value: v ?? null, satisfied: v === true, unmeasured: v === null || v === undefined };
  });
  const unmeasured = rows.filter((r) => r.unmeasured);
  const failed = rows.filter((r) => !r.satisfied && !r.unmeasured);
  return {
    durable: unmeasured.length === 0 && failed.length === 0,
    rows,
    unmeasured: unmeasured.map((r) => r.id),
    failed: failed.map((r) => r.id),
    reason: failed.length ? `not durable: ${failed.map((r) => r.id).join(", ")}`
      : unmeasured.length ? `unmeasured: ${unmeasured.map((r) => r.id).join(", ")}`
        : "restart context is durable",
  };
}

/* ── G: update classes ───────────────────────────────────────────────────── */

/**
 * "Weekly maintenance" is not "update everything".
 *
 * The classification is here so maintenance has somewhere to ask; the POLICY —
 * what is actually safe, what a canary run proves — is DevOps 9's and is not
 * implemented. `classifyUpdate` returns MANUAL_DEFERRED for anything it does not
 * recognise, because the fail-closed direction for an update is to not apply it.
 */
export const UPDATE_CLASS = Object.freeze({
  AUTO_SAFE: "AUTO_SAFE",
  CANARY_REQUIRED: "CANARY_REQUIRED",
  MANUAL_DEFERRED: "MANUAL_DEFERRED",
});

export const UPDATE_CLASSIFICATION = Object.freeze([
  Object.freeze({ match: "tooling_patch", class: UPDATE_CLASS.AUTO_SAFE, why: "patch-level movement in an already-approved tool" }),
  Object.freeze({ match: "certificate_catalog", class: UPDATE_CLASS.AUTO_SAFE, why: "signatures and catalogs, no behaviour change" }),
  Object.freeze({ match: "claude_code", class: UPDATE_CLASS.CANARY_REQUIRED, why: "agent behaviour change; must be proven before the fleet depends on it" }),
  Object.freeze({ match: "model_version", class: UPDATE_CLASS.CANARY_REQUIRED, why: "the same instruction can produce different work" }),
  Object.freeze({ match: "toolchain_minor", class: UPDATE_CLASS.CANARY_REQUIRED, why: "minor runtime movement has broken builds here before" }),
  Object.freeze({ match: "macos_major", class: UPDATE_CLASS.MANUAL_DEFERRED, why: "can require interactive approval and can break recovery itself" }),
  Object.freeze({ match: "node_major", class: UPDATE_CLASS.MANUAL_DEFERRED, why: "the Gateway runs on it; a failed boot has no operator" }),
  Object.freeze({ match: "database_major", class: UPDATE_CLASS.MANUAL_DEFERRED, why: "schema and runtime compatibility is not a maintenance decision" }),
  Object.freeze({ match: "credential_architecture", class: UPDATE_CLASS.MANUAL_DEFERRED, why: "a reboot must not be the first test of a new credential path" }),
]);

export function classifyUpdate(kind) {
  const hit = UPDATE_CLASSIFICATION.find((u) => u.match === kind);
  return hit ? { kind, class: hit.class, why: hit.why }
    : { kind, class: UPDATE_CLASS.MANUAL_DEFERRED, why: "unrecognised update kinds are never applied automatically" };
}

/** Where DevOps 9's canary policy attaches. Named, deliberately not implemented. */
export function canarySeam() {
  return {
    seam: "vacilando.toolchain_canary.v1",
    owner: "DevOps 9",
    contract: "given an update of class CANARY_REQUIRED, return { proven: boolean, evidence_ref } before maintenance may apply it",
    implemented_here: false,
    behaviour_without_it: "CANARY_REQUIRED updates are not applied and are reported as deferred",
  };
}

/* ── H: the reboot gate ──────────────────────────────────────────────────── */

/**
 * THE GATE, AND THE INTENT.
 *
 * Four conditions, all required, none overridable — there is no `force`
 * parameter, asserted by a control. What comes back on success is an INTENT: a
 * command somebody else runs. This module cannot restart a machine, which is
 * what makes every phase above it testable and makes an accidental import
 * harmless.
 */
export function rebootDecision({
  preflight = null,
  drain = null,
  checkpoint = null,
  phase = PHASE.DRAINING,
  nowMs = Date.now(),
} = {}) {
  const refusals = [];
  if (!preflight || preflight.pass !== true) refusals.push({ gate: "preflight", detail: preflight?.reason || "maintenance preflight did not pass" });
  if (!drain || drain.safe !== true) refusals.push({ gate: "drain", detail: drain ? `${drain.blockers.length} blocker(s)` : "drain not measured" });
  if (!checkpoint || checkpoint.durable !== true) refusals.push({ gate: "checkpoint", detail: checkpoint?.reason || "checkpoint not measured" });
  if (drain && drain.protected_mutations > 0) refusals.push({ gate: "protected_mutation", detail: `${drain.protected_mutations} irreversible mutation(s) in flight` });

  if (refusals.length) {
    return { may_reboot: false, phase: PHASE.DEFERRED, refusals, intent: null };
  }
  return {
    may_reboot: true,
    phase: PHASE.READY_TO_REBOOT,
    refusals: [],
    // The mechanism, named once. `shutdown -r` is the macOS owner of a planned
    // restart; launchd's RunAtLoad brings the Gateway back without help.
    intent: {
      mechanism: "shutdown",
      argv: ["-r", "now"],
      requires_privilege: true,
      restores_gateway_via: "launchd com.alloy.vacilando-gateway (RunAtLoad + KeepAlive)",
      decided_at: new Date(nowMs).toISOString(),
    },
  };
}

/* ── I: scheduling, on the existing steward cycle ────────────────────────── */

export function maintenanceStatePath(root) {
  return join(root, "vacilando", "host-maintenance", "window.json");
}

function readJson(path, fallback = null) {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback; } catch { return fallback; }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
  return value;
}

export function readMaintenanceWindow({ root } = {}) {
  if (!root) return null;
  return readJson(maintenanceStatePath(root), null);
}

/**
 * Is a weekly maintenance due?
 *
 * Same shape as `hygieneDue`, reading its own key in the same state root, so the
 * Host Steward's existing five-minute cycle can ask this question the way it
 * already asks the others. `lastAttemptMs` is deliberately the ATTEMPT, not the
 * success: a maintenance that deferred all the way out has consumed its period
 * and must wait for the next one rather than retrying forever.
 */
export function maintenanceDue({
  root = null,
  window = undefined,
  nowMs = Date.now(),
  policy = MAINTENANCE_POLICY,
} = {}) {
  const rec = window !== undefined ? window : readMaintenanceWindow({ root });
  const last = Number(rec?.last_attempt_ms) || 0;
  const sincePeriod = nowMs - last >= policy.period_ms;

  const d = new Date(nowMs);
  const inSlot = d.getDay() === policy.weekday && d.getHours() === policy.hour_local;

  if (rec && !isTerminalPhase(rec.phase)) {
    // A window already open is resumed rather than re-opened, which is what
    // makes a maintenance attempt idempotent across a Gateway restart.
    return { due: true, reason: "window_open", resuming: true, window: rec };
  }
  if (!sincePeriod) {
    return { due: false, reason: "within_period", next_eligible: new Date(last + policy.period_ms).toISOString() };
  }
  if (!inSlot) {
    return { due: false, reason: "outside_slot", slot: `weekday ${policy.weekday} hour ${policy.hour_local}` };
  }
  return { due: true, reason: "scheduled", resuming: false };
}

export function isTerminalPhase(phase) {
  return phase === PHASE.NORMAL || phase === PHASE.CONSTRAINED || phase === undefined || phase === null;
}

export function openMaintenanceWindow({ root, nowMs = Date.now(), generation = null, toolkit = null, id = null } = {}) {
  const window = {
    schema: MAINTENANCE_SCHEMA,
    maintenance_id: id || `maint_${new Date(nowMs).toISOString().slice(0, 10)}_${Math.random().toString(36).slice(2, 8)}`,
    phase: PHASE.MAINTENANCE_PENDING,
    requested_at: new Date(nowMs).toISOString(),
    last_attempt_ms: nowMs,
    ready_at: null,
    reboot_initiated_at: null,
    completed_at: null,
    reason: "weekly scheduled maintenance",
    defers: 0,
    pre_reboot_generation: generation,
    post_reboot_generation: null,
    toolkit_before: toolkit,
    toolkit_after: null,
    updates: [],
    report: null,
  };
  if (root) writeJson(maintenanceStatePath(root), window);
  return window;
}

export function advanceMaintenance(window, { phase, root = null, nowMs = Date.now(), patch = {} } = {}) {
  const next = { ...window, ...patch, phase, updated_at: new Date(nowMs).toISOString() };
  if (phase === PHASE.READY_TO_REBOOT && !next.ready_at) next.ready_at = new Date(nowMs).toISOString();
  if (phase === PHASE.REBOOTING && !next.reboot_initiated_at) next.reboot_initiated_at = new Date(nowMs).toISOString();
  if (phase === PHASE.NORMAL || phase === PHASE.CONSTRAINED) next.completed_at = new Date(nowMs).toISOString();
  if (root) writeJson(maintenanceStatePath(root), next);
  return next;
}

/**
 * Blocked, and the window has not expired: wait and try again.
 *
 * Bounded twice — by elapsed time and by attempt count — and when either runs
 * out the answer is ATTENTION, never force. A maintenance that cannot get a
 * clean window is information about the host, not an obstacle to overcome.
 */
export function deferMaintenance(window, { root = null, nowMs = Date.now(), policy = MAINTENANCE_POLICY, drain = null } = {}) {
  const opened = Date.parse(window?.requested_at || "") || nowMs;
  const elapsed = nowMs - opened;
  const defers = Number(window?.defers || 0) + 1;
  const exhausted = elapsed >= policy.defer_window_ms || defers > policy.max_defers;

  const next = advanceMaintenance(window, {
    phase: exhausted ? PHASE.CONSTRAINED : PHASE.DEFERRED,
    root,
    nowMs,
    patch: {
      defers,
      last_blockers: (drain?.blockers || []).map((b) => `${b.kind}: ${b.detail}`).slice(0, 8),
    },
  });

  return {
    window: next,
    deferred: !exhausted,
    exhausted,
    retry_at: exhausted ? null : new Date(nowMs + policy.defer_recheck_ms).toISOString(),
    operator_attention: exhausted,
    reason: exhausted
      ? `maintenance could not find a safe window in ${Math.round(policy.defer_window_ms / 3600000)}h after ${defers} attempts; surfacing to the operator rather than forcing a reboot`
      : `deferred ${defers}x; ${(drain?.blockers || []).length} blocker(s) still in flight`,
  };
}

/* ── E: cleanliness, consumed from existing projections ──────────────────── */

/**
 * Host cleanliness, composed from the projections the health framework already
 * produces. No measurement is performed here — a second measurement of the same
 * fact is a second answer waiting to disagree with the first.
 */
export function assessCleanliness({
  worktreeLifecycle = null,
  laneBootstrap = null,
  laneFreshness = null,
  laneKnowledge = null,
  slotOwnership = null,
  staleOwned = null,
  controlPlane = null,
  disk = null,
  promotion = null,
} = {}) {
  const sections = [];
  const unmeasured = [];
  const push = (name, value, measured) => {
    if (!measured) { unmeasured.push(name); sections.push({ section: name, measured: false }); }
    else sections.push({ section: name, measured: true, ...value });
  };

  push("worktrees", worktreeLifecycle ? {
    total: worktreeLifecycle.worktrees,
    reclaimable: worktreeLifecycle.reclaimable,
    blocked: worktreeLifecycle.blocked,
    reclaimable_disk_mb: worktreeLifecycle.reclaimable_disk_mb,
    by_state: worktreeLifecycle.by_state,
  } : null, Boolean(worktreeLifecycle));

  push("lanes", (laneBootstrap || laneFreshness || laneKnowledge) ? {
    bootstrap_drift: laneBootstrap?.drift ?? laneBootstrap?.unresolved ?? null,
    stale: laneFreshness?.stale ?? null,
    freshness_blocked: laneFreshness?.blocked ?? null,
    knowledge_missing: laneKnowledge?.rows ? laneKnowledge.rows.filter((r) => r.state === "MISSING").length : null,
  } : null, Boolean(laneBootstrap || laneFreshness || laneKnowledge));

  push("resources", (slotOwnership || staleOwned !== null) ? {
    slot_conflicts: slotOwnership?.conflicts?.length ?? slotOwnership?.conflicts ?? 0,
    previous_generation_owned: staleOwned,
  } : null, Boolean(slotOwnership) || staleOwned !== null);

  push("control_plane", controlPlane ? {
    recovery_backlog: controlPlane.recovery_backlog ?? null,
    toolkit: controlPlane.toolkit ?? null,
    gateway_healthy: controlPlane.gateway_healthy ?? null,
  } : null, Boolean(controlPlane));

  push("disk", disk ? { free_gb: disk.free_gb ?? null, state_store_mb: disk.state_store_mb ?? null } : null, Boolean(disk));

  push("promotion", promotion ? {
    ready_for_staging: promotion.ready_for_staging ?? 0,
    active_train: promotion.active_train ?? false,
  } : null, Boolean(promotion));

  return { sections, unmeasured, complete: unmeasured.length === 0 };
}

/* ── F: cleanup, delegated ───────────────────────────────────────────────── */

/**
 * WHAT MAINTENANCE MAY CLEAN, AND WHO ACTUALLY DOES IT.
 *
 * Every entry names an existing owner and a preview that must come from the SAME
 * evaluator as the mutation — the property DevOps 3 established, restated here
 * because a cleanup step that previews with different arithmetic than it acts on
 * is a dry run that stops predicting the run.
 *
 * `planCleanup` returns intents. It performs nothing.
 */
export const CLEANUP_OPERATIONS = Object.freeze([
  Object.freeze({ id: "reclaim_worktrees", owner: "worktree-lifecycle + vacilando.retire_worktree", requires: "RECLAIMABLE or SUPERSEDED after all safety gates", refuses: "dirty, undurable, unmeasured" }),
  Object.freeze({ id: "retire_stale_ownership", owner: "execution-recovery / host-steward", requires: "previous-generation ownership", refuses: "current-generation records" }),
  Object.freeze({ id: "rotate_bounded_logs", owner: "artifact-retention / toolkit-retention", requires: "existing retention policy", refuses: "audit evidence policy requires" }),
  Object.freeze({ id: "prune_toolkits", owner: "toolkit-retention runToolkitPrune", requires: "not current, not soaking", refuses: "the installed toolkit" }),
  Object.freeze({ id: "reconcile_slot_claims", owner: "managed-slots + worktree-lifecycle detectSlotOwnershipConflicts", requires: "a registry-backed conflict", refuses: "editing a lane record to make health green" }),
]);

export function planCleanup({ cleanliness = null, allow = CLEANUP_OPERATIONS.map((o) => o.id) } = {}) {
  const intents = [];
  const skipped = [];
  const section = (name) => (cleanliness?.sections || []).find((s) => s.section === name);

  for (const op of CLEANUP_OPERATIONS) {
    if (!allow.includes(op.id)) { skipped.push({ id: op.id, why: "not permitted this cycle" }); continue; }
    if (op.id === "reclaim_worktrees") {
      const w = section("worktrees");
      if (!w?.measured) { skipped.push({ id: op.id, why: "worktree inventory unmeasured" }); continue; }
      if (!w.reclaimable) { skipped.push({ id: op.id, why: "nothing reclaimable" }); continue; }
      intents.push({ id: op.id, owner: op.owner, count: w.reclaimable, disk_mb: w.reclaimable_disk_mb ?? null });
      continue;
    }
    if (op.id === "reconcile_slot_claims") {
      const r = section("resources");
      if (!r?.measured) { skipped.push({ id: op.id, why: "resource ownership unmeasured" }); continue; }
      if (!r.slot_conflicts) { skipped.push({ id: op.id, why: "no slot conflicts" }); continue; }
      intents.push({ id: op.id, owner: op.owner, count: r.slot_conflicts });
      continue;
    }
    intents.push({ id: op.id, owner: op.owner, count: null });
  }
  return { intents, skipped, performs_nothing_itself: true };
}

/* ── J/L: post-boot ──────────────────────────────────────────────────────── */

/**
 * DID THE HOST COME BACK, AND CAN IT PROVE IT?
 *
 * Generation is the load-bearing check and it is free: `currentRuntimeGeneration`
 * is derived from boot time, so a genuine reboot cannot produce the old value and
 * a Gateway that merely restarted cannot claim to have rebooted. If the
 * generation did not change, maintenance did not happen, however healthy
 * everything else looks.
 *
 * UNMEASURED BLOCKS, as everywhere else in this programme. A certification that
 * could not run is not a certification, and the consequence — returning to full
 * admission on the strength of checks nobody performed — is exactly the failure
 * the whole gate exists to prevent.
 */
export function certifyPostBoot({
  preGeneration = null,
  postGeneration = null,
  expectedToolkit = null,
  runningToolkit = null,
  staleOwnedCount = null,
  slotConflicts = null,
  admission = null,
  recoveryBacklog = null,
  invariants = null,
  diskFreeGb = null,
  minDiskFreeGb = 10,
} = {}) {
  const checks = [];
  const add = (id, outcome, detail) => checks.push({ id, outcome, detail });

  if (!preGeneration || !postGeneration) add("generation_changed", "UNMEASURED", "a generation was not recorded on one side of the reboot");
  else if (preGeneration === postGeneration) add("generation_changed", "FAIL", "the runtime generation did not change; the host did not actually reboot");
  else add("generation_changed", "PASS", `${String(preGeneration).slice(0, 16)} → ${String(postGeneration).slice(0, 16)}`);

  if (!expectedToolkit || !runningToolkit) add("toolkit_identity", "UNMEASURED", "toolkit identity was not read on one side");
  else if (expectedToolkit !== runningToolkit) add("toolkit_identity", "FAIL", `expected ${expectedToolkit}, running ${runningToolkit}`);
  else add("toolkit_identity", "PASS", runningToolkit);

  if (staleOwnedCount === null) add("no_stale_generation_ownership", "UNMEASURED", "previous-generation ownership was not counted");
  else if (staleOwnedCount > 0) add("no_stale_generation_ownership", "FAIL", `${staleOwnedCount} previous-generation owned resource(s) still present`);
  else add("no_stale_generation_ownership", "PASS", "none");

  if (slotConflicts === null) add("no_slot_conflicts", "UNMEASURED", "slot ownership was not measured");
  else if (slotConflicts > 0) add("no_slot_conflicts", "FAIL", `${slotConflicts} slot(s) claimed twice`);
  else add("no_slot_conflicts", "PASS", "none");

  if (!admission) add("admission_healthy", "UNMEASURED", "host admission was not classified");
  else if (!["HEALTHY", "WATCH"].includes(String(admission).toUpperCase())) add("admission_healthy", "FAIL", String(admission));
  else add("admission_healthy", "PASS", String(admission));

  if (recoveryBacklog === null) add("recovery_backlog", "UNMEASURED", "recovery backlog was not read");
  else if (recoveryBacklog > 0) add("recovery_backlog", "FAIL", `${recoveryBacklog} unresolved recovery episode(s)`);
  else add("recovery_backlog", "PASS", "clear");

  if (!invariants) add("critical_invariants", "UNMEASURED", "the invariant pack did not run");
  else if (invariants.blocks_integration) add("critical_invariants", invariants.verdict === "UNMEASURED" ? "UNMEASURED" : "FAIL", invariants.verdict);
  else add("critical_invariants", "PASS", invariants.verdict);

  if (diskFreeGb === null) add("disk_headroom", "UNMEASURED", "free space was not read");
  else if (diskFreeGb < minDiskFreeGb) add("disk_headroom", "FAIL", `${diskFreeGb}GB free, below ${minDiskFreeGb}GB`);
  else add("disk_headroom", "PASS", `${diskFreeGb}GB free`);

  const failed = checks.filter((c) => c.outcome === "FAIL");
  const unmeasured = checks.filter((c) => c.outcome === "UNMEASURED");
  const certified = failed.length === 0 && unmeasured.length === 0;

  return {
    certified,
    phase: certified ? PHASE.NORMAL : PHASE.CONSTRAINED,
    admission_restored: certified,
    checks,
    failed: failed.map((c) => c.id),
    unmeasured: unmeasured.map((c) => c.id),
    reason: failed.length ? `post-boot certification failed: ${failed.map((c) => c.id).join(", ")}`
      : unmeasured.length ? `post-boot certification incomplete: ${unmeasured.map((c) => c.id).join(", ")}`
        : "host certified; normal admission restored",
  };
}

/* ── K: session resume, from canonical context ───────────────────────────── */

/**
 * WHAT TO RESUME, DECIDED FROM LANE TRUTH RATHER THAN FROM A LIST OF TERMINALS.
 *
 * The tempting design is a file of named sessions to reopen. It is wrong here
 * for a specific reason: Vacilando already knows the lane, the run, the
 * worktree, the branch, the checkpoint and the next action, and a parallel list
 * of terminal names would be a second authority that goes stale the moment a
 * lane moves — while knowing strictly less.
 *
 * RESUME is for a provider session the lifecycle says can come back. RECREATE is
 * the normal answer: a new session built from durable context, which is why the
 * checkpoint requirements above are gates rather than suggestions. A lane with
 * no durable next action is reported as NEEDS_OPERATOR — honestly unresumable
 * rather than silently restarted into nothing.
 */
export const RESUME_DISPOSITION = Object.freeze({
  RESUME: "RESUME",
  RECREATE: "RECREATE",
  HOLD: "HOLD",
  NEEDS_OPERATOR: "NEEDS_OPERATOR",
});

export function planSessionRestore({ lanes = [], sessionLifecycle = null } = {}) {
  const rows = [];
  for (const lane of lanes) {
    const ctx = lane.restart_context || {};
    const resumable = sessionLifecycle ? sessionLifecycle(lane) : null;

    if (resumable?.resumable === true) {
      rows.push({ lane_id: lane.lane_id, disposition: RESUME_DISPOSITION.RESUME, session: resumable.session_id || null, basis: "provider lifecycle says the session survives" });
      continue;
    }
    if (lane.blocked_on) {
      rows.push({ lane_id: lane.lane_id, disposition: RESUME_DISPOSITION.HOLD, basis: `blocked on ${lane.blocked_on}`, next_action: ctx.next_action || null });
      continue;
    }
    if (ctx.next_action) {
      rows.push({ lane_id: lane.lane_id, disposition: RESUME_DISPOSITION.RECREATE, basis: "durable next action recorded", next_action: ctx.next_action, worktree: ctx.worktree || null, branch: ctx.branch || null });
      continue;
    }
    rows.push({ lane_id: lane.lane_id, disposition: RESUME_DISPOSITION.NEEDS_OPERATOR, basis: "no durable next action; nothing to resume into" });
  }
  const by = {};
  for (const r of rows) by[r.disposition] = (by[r.disposition] || 0) + 1;
  return { rows, by_disposition: by, operator_reconstruction_required: rows.filter((r) => r.disposition === RESUME_DISPOSITION.NEEDS_OPERATOR).length };
}

/* ── M: the report ───────────────────────────────────────────────────────── */

/** Cap on the report, so evidence stays evidence rather than becoming a log. */
export const REPORT_MAX_BYTES = 4096;

/**
 * The maintenance report: what changed, what was refused, what still warns.
 *
 * Bounded by construction and asserted by a control. Raw command output in a
 * durable record is the unbounded log DevOps 4's knowledge model exists to
 * prevent, so nothing here carries stdout.
 */
export function maintenanceReport(window = {}, {
  cleanup = null, certification = null, restore = null, cleanliness = null, drain = null,
} = {}) {
  const report = {
    schema: MAINTENANCE_SCHEMA,
    maintenance_id: window.maintenance_id || null,
    phase: window.phase || null,
    requested_at: window.requested_at || null,
    ready_at: window.ready_at || null,
    reboot_initiated_at: window.reboot_initiated_at || null,
    completed_at: window.completed_at || null,
    defers: window.defers || 0,
    generation: { before: window.pre_reboot_generation || null, after: window.post_reboot_generation || null },
    toolkit: { before: window.toolkit_before || null, after: window.toolkit_after || null },
    updates_applied: (window.updates || []).filter((u) => u.applied).map((u) => u.kind),
    updates_deferred: (window.updates || []).filter((u) => !u.applied).map((u) => `${u.kind}:${u.class}`),
    worktrees_reclaimed: (cleanup?.performed || []).filter((p) => p.id === "reclaim_worktrees").reduce((s, p) => s + (p.count || 0), 0),
    disk_reclaimed_mb: (cleanup?.performed || []).reduce((s, p) => s + (p.disk_mb || 0), 0),
    stale_resources_repaired: (cleanup?.performed || []).filter((p) => p.id === "retire_stale_ownership").reduce((s, p) => s + (p.count || 0), 0),
    lanes_resumed: restore?.by_disposition?.RESUME || 0,
    sessions_recreated: restore?.by_disposition?.RECREATE || 0,
    lanes_blocked: (restore?.by_disposition?.HOLD || 0) + (restore?.by_disposition?.NEEDS_OPERATOR || 0),
    health_outcome: certification?.certified ? "CERTIFIED" : (certification?.reason || "not certified"),
    invariant_outcome: (certification?.checks || []).find((c) => c.id === "critical_invariants")?.outcome || null,
    warnings: [
      ...(drain?.warnings || []).map((w) => `${w.kind}: ${w.detail}`),
      ...(cleanliness?.unmeasured || []).map((u) => `unmeasured: ${u}`),
      ...(certification?.failed || []).map((f) => `failed: ${f}`),
      ...(certification?.unmeasured || []).map((u) => `unmeasured: ${u}`),
    ].slice(0, 12),
  };
  const json = JSON.stringify(report);
  if (json.length > REPORT_MAX_BYTES) {
    report.warnings = report.warnings.slice(0, 4);
    report.truncated = true;
  }
  return report;
}

/* ── O: DevOps 8 seam ────────────────────────────────────────────────────── */

/**
 * Where DevOps 8's instruction audit runs, named and not implemented.
 *
 * A configuration audit is read-only and has no reason to hold up a reboot, so
 * it runs in VERIFYING, after the host has proven itself — and its result is
 * reported, never used to gate admission. Failing a reboot on prompt hygiene
 * would be a category error.
 */
export function configurationAuditSeam({ audit = null, phase = PHASE.VERIFYING } = {}) {
  return {
    seam: "vacilando.agent_configuration_audit.v1",
    owner: "DevOps 8",
    runs_in_phase: phase,
    gates_admission: false,
    contract: "return { findings: [...], clean: boolean } from a read-only audit of agent configuration",
    implemented_here: false,
    result: audit || null,
    reported_as: audit ? `${(audit.findings || []).length} configuration finding(s)` : "no audit registered",
  };
}
