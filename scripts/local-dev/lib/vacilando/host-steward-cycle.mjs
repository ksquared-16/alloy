/**
 * The Host Steward cycle — one bounded loop, coordinating owners it does not replace.
 *
 * observe -> classify -> admit -> plan -> execute through canonical owners ->
 * verify -> audit.
 *
 * WHAT THIS IS NOT. It is not a second scheduler, not a resource manager, and
 * not a process supervisor. Every action names a canonical executor that was
 * certified separately, and the steward's only job is deciding WHETHER and
 * WHEN. When an owner does not exist, the item is reported, never improvised —
 * the wt1 dev server proved what ad hoc signalling costs.
 *
 * FAIL SAFE, PER RESOURCE. One unreadable process table, one missing owner, one
 * failed postcondition stops work on THAT resource and nothing else. A health
 * loop that aborts wholesale on its first bad resource stops observing exactly
 * when observation matters most.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { buildStewardPlan, OWNERSHIP } from "./host-steward.mjs";
import { classifyHostAdmission } from "./host-admission.mjs";

import { findingsForSteward } from "./operational-findings.mjs";
import { ATTEMPT_CEILINGS, readEpisode } from "./control-plane-recovery.mjs";
import { hygienePosture } from "./hygiene-reclaim.mjs";

export const STEWARD_CYCLE_SCHEMA = "vacilando.host_steward_cycle.v1";

/**
 * Cadence. Measured, not guessed: a full observation cycle on this host costs
 * ~2.3 s of mostly-idle wall time (ps + run store + vm_stat), so a 5-minute
 * sweep is well under 1% duty and a 30-second one would not be.
 */
export const CADENCE_MS = 5 * 60_000;
/** After a mutating action, look again soon rather than waiting a whole sweep. */
export const RECHECK_MS = 30_000;
/** A cycle that has not completed in this long is treated as failed, not running. */
export const CYCLE_TIMEOUT_MS = 4 * 60_000;
/** A steward that has not completed a cycle within this window is a health finding. */
export const STALE_CYCLE_MS = 3 * CADENCE_MS;

/**
 * Hygiene runs on its own, far slower cadence inside the same loop.
 *
 * NOT because it is unimportant — because it is expensive and the estate moves
 * slowly. One hygiene observation costs a toolkit `du` over ~100 directories
 * and an `lsof` per log; running that every five minutes would take the
 * steward's duty cycle from under 1% to something worth noticing, to reclaim
 * bytes that were equally reclaimable six hours ago. Four sweeps a day is the
 * cadence the resource actually has.
 */
export const HYGIENE_CADENCE_MS = 6 * 60 * 60_000;

/**
 * Anti-thrash. A resource acted on may not be acted on again until its cooldown
 * expires, whatever the next observation says. Without it, a dev server stopped
 * by the steward and immediately recreated by a live owner becomes a loop that
 * looks like cleanup and is actually a fight.
 */
export const ACTION_COOLDOWN_MS = 15 * 60_000;
/** How many consecutive failures before a resource is parked for the operator. */
export const MAX_ACTION_ATTEMPTS = 3;

/**
 * Deterministic priority (§12). NOT age — age is not evidence, and ordering by
 * it would put a long-idle safe item ahead of a spinning one.
 */
export const ACTION_PRIORITY = Object.freeze({
  terminate_terminal_test_process: 1,
  repair_stale_port_registration: 2,
  prune_policy_eligible_toolkit: 3,
  reclaim_idle_provider_seat: 4,
  stop_terminal_dev_server: 5,
  // Hygiene is last on purpose. Nothing about the host's health depends on it,
  // and a cycle under pressure should spend its budget on live resources.
  reconcile_stale_worktree_registration: 6,
  reclaim_diagnostic_log: 7,
  retire_worktree: 8,
});

/**
 * Which canonical subsystem owns each action, and whether the steward may
 * invoke it without a human. An action with no owner is reported, never done.
 */
export const ACTION_OWNERS = Object.freeze({
  terminate_terminal_test_process: { owner: "host-steward-execute", authority: "automatic", certified: true },
  prune_policy_eligible_toolkit: { owner: "s9-toolkit-retention", authority: "automatic", certified: true },
  repair_stale_port_registration: { owner: "s7-reconciliation-apply", authority: "director", certified: true },
  reclaim_idle_provider_seat: { owner: "s8-provider-reclamation", authority: "automatic", certified: true },
  // Deliberately NOT certified: there is no canonical stop for a non-slot
  // worktree, and the steward's raw signal executor must not become the
  // permanent dev-server lifecycle API.
  stop_terminal_dev_server: { owner: "canonical-dev-server-lifecycle", authority: "operator", certified: false },
  // V3 Phase 4. Each names the certified executor it delegates to; none of them
  // contains a removal of its own except the bounded log rewrite.
  reconcile_stale_worktree_registration: { owner: "hygiene-execute:git-worktree-prune", authority: "automatic", certified: true },
  reclaim_diagnostic_log: { owner: "hygiene-execute:truncate-to-tail", authority: "automatic", certified: true },
  retire_worktree: { owner: "trusted-host-worktree-retirement", authority: "automatic", certified: true },
});

/** When did hygiene last complete, and is it due? Recorded in the steward's own state. */
export function hygieneDue({ root, nowMs = Date.now(), cadenceMs = HYGIENE_CADENCE_MS } = {}) {
  const at = readState(root).hygiene_last_ms ?? null;
  if (at == null) return { due: true, last_ms: null, reason: "hygiene has never run in this root" };
  return { due: (nowMs - at) >= cadenceMs, last_ms: at, reason: null };
}

export function recordHygieneCycle({ root, nowMs = Date.now(), summary = null } = {}) {
  const state = readState(root);
  state.hygiene_last_ms = nowMs;
  state.hygiene_last = summary ? { at: new Date(nowMs).toISOString(), ...summary } : { at: new Date(nowMs).toISOString() };
  writeState(root, state);
  return { ok: true };
}

export function stewardStatePath(root) {
  return join(root, "host-steward", "state.json");
}

function readState(root) {
  try {
    const j = JSON.parse(readFileSync(stewardStatePath(root), "utf8"));
    return {
      schema_version: STEWARD_CYCLE_SCHEMA,
      cycles: j.cycles || [], cooldowns: j.cooldowns || {}, running: j.running || null,
      hygiene_last_ms: j.hygiene_last_ms ?? null, hygiene_last: j.hygiene_last ?? null,
    };
  } catch {
    return { schema_version: STEWARD_CYCLE_SCHEMA, cycles: [], cooldowns: {}, running: null, hygiene_last_ms: null, hygiene_last: null };
  }
}

function writeState(root, state) {
  const p = stewardStatePath(root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  // Bounded history: audit must be readable, not unbounded.
  state.cycles = state.cycles.slice(-50);
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tmp, p);
}

/**
 * Serialize cycles. Two mutating cycles must never overlap, and a crashed cycle
 * must not wedge the loop forever — hence the timeout rather than a plain flag.
 */
export function acquireCycleLock({ root, nowMs = Date.now(), timeoutMs = CYCLE_TIMEOUT_MS } = {}) {
  const state = readState(root);
  const running = state.running;
  if (running && (nowMs - running.started_ms) < timeoutMs) {
    return { ok: false, error: "cycle_already_running", running };
  }
  const cycleId = `hsc_${createHash("sha256").update(`${nowMs}:${process.pid}`).digest("hex").slice(0, 12)}`;
  state.running = { cycle_id: cycleId, started_ms: nowMs, pid: process.pid, took_over: Boolean(running) };
  writeState(root, state);
  return { ok: true, cycle_id: cycleId, reclaimed_stale_lock: Boolean(running) };
}

export function releaseCycleLock({ root, cycleId, record = null, nowMs = Date.now() } = {}) {
  const state = readState(root);
  if (state.running?.cycle_id === cycleId) state.running = null;
  if (record) state.cycles.push({ ...record, ended_at: new Date(nowMs).toISOString() });
  writeState(root, state);
  return { ok: true };
}

/** True when this resource is inside its cooldown and must not be acted on again. */
export function inCooldown({ root, resourceKey, nowMs = Date.now(), cooldownMs = ACTION_COOLDOWN_MS } = {}) {
  const state = readState(root);
  const c = state.cooldowns[resourceKey];
  if (!c) return false;
  return (nowMs - c.at_ms) < cooldownMs;
}

export function recordAction({ root, resourceKey, action, result, nowMs = Date.now() } = {}) {
  const state = readState(root);
  const prev = state.cooldowns[resourceKey];
  state.cooldowns[resourceKey] = {
    at_ms: nowMs,
    action,
    ok: Boolean(result?.ok),
    attempts: (prev?.attempts || 0) + 1,
  };
  writeState(root, state);
  return state.cooldowns[resourceKey];
}

/** A resource that keeps failing is parked for a human rather than retried forever. */
export function attemptsExhausted({ root, resourceKey, max = MAX_ACTION_ATTEMPTS } = {}) {
  const c = readState(root).cooldowns[resourceKey];
  return Boolean(c && !c.ok && c.attempts >= max);
}

/**
 * Build the canonical cycle plan (§3).
 *
 * Every proposed action carries its owner, authority, priority, postcondition
 * and the evidence that produced it. A plan entry that cannot name its executor
 * is not executable by construction.
 */
export function buildCyclePlan({
  cycleId,
  resources = [],
  admission = null,
  root = null,
  nowMs = Date.now(),
  cooldownMs = ACTION_COOLDOWN_MS,
} = {}) {
  const base = buildStewardPlan(resources, { nowMs });
  const proposed = [];
  const suppressed = [];

  for (const d of base.autonomous) {
    const owner = ACTION_OWNERS[d.action] || null;
    const key = resourceKey(d);
    const entry = {
      resource_key: key,
      // The resource's own id, carried explicitly. Reaching for it through
      // `evidence` returned undefined, so the registry record was never closed
      // and its final disposition stayed null even on a successful reconcile.
      resource_id: d.id ?? null,
      resource_class: d.resource_class,
      ownership: d.ownership,
      action: d.action,
      owner: owner?.owner ?? null,
      authority: owner?.authority ?? "operator",
      certified: owner?.certified === true,
      priority: ACTION_PRIORITY[d.action] ?? 99,
      reason: d.reason,
      evidence: d.evidence,
      postcondition: POSTCONDITIONS[d.action] ?? "resource no longer classified as residue",
    };
    if (!owner) { suppressed.push({ ...entry, suppressed_because: "no canonical owner" }); continue; }
    if (!owner.certified) { suppressed.push({ ...entry, suppressed_because: "owner not certified for automatic use" }); continue; }
    if (owner.authority !== "automatic") { suppressed.push({ ...entry, suppressed_because: `authority is ${owner.authority}` }); continue; }
    if (root && inCooldown({ root, resourceKey: key, nowMs, cooldownMs })) {
      suppressed.push({ ...entry, suppressed_because: "cooldown" }); continue;
    }
    if (root && attemptsExhausted({ root, resourceKey: key })) {
      suppressed.push({ ...entry, suppressed_because: "repeated failure; parked for the operator" }); continue;
    }
    proposed.push(entry);
  }
  proposed.sort((a, b) => a.priority - b.priority || String(a.resource_key).localeCompare(String(b.resource_key)));

  return {
    schema_version: STEWARD_CYCLE_SCHEMA,
    cycle_id: cycleId,
    observed_at: new Date(nowMs).toISOString(),
    admission_state: admission?.state ?? null,
    admission_reasons: admission?.reasons ?? [],
    classifications: countBy(base, resources.length),
    proposed,
    suppressed,
    preserved: base.preserved.length,
    waiting: base.waiting.length,
    surfaced: base.surfaced.map((d) => ({ resource_class: d.resource_class, detail: d.detail })),
    plan_fingerprint: base.fingerprint,
  };
}

export function resourceKey(d) {
  return `${d.resource_class}:${d.id ?? d.evidence?.pgid ?? d.evidence?.pid ?? "unknown"}`;
}

const POSTCONDITIONS = Object.freeze({
  terminate_terminal_test_process: "process group absent and no unrelated process affected",
  prune_policy_eligible_toolkit: "current, live pins and rollback window still present",
  repair_stale_port_registration: "correction absent from the next S7 plan",
  reclaim_idle_provider_seat: "seat released and dormancy/resume state preserved",
  reconcile_stale_worktree_registration: "registration absent and every ref unchanged",
  reclaim_diagnostic_log: "file smaller than before with its tail intact",
  retire_worktree: "path and registration absent, branch still resolvable",
});

function countBy(base, total) {
  return {
    total,
    live: base.preserved.length,
    residue_actionable: base.autonomous.length,
    within_grace: base.waiting.length,
    unknown_or_foreign: base.surfaced.length,
  };
}

/**
 * Summarise recent cycles for the operator and for health.
 *
 * Routine automatic actions belong in history, never on the approval bar. Only
 * what the steward could NOT safely do is an escalation.
 */
export function stewardStatus({ root, nowMs = Date.now(), staleMs = STALE_CYCLE_MS } = {}) {
  const state = readState(root);
  const cycles = state.cycles || [];
  const last = cycles[cycles.length - 1] || null;
  const lastOkAt = last?.ended_at ? Date.parse(last.ended_at) : null;
  const stale = lastOkAt == null ? true : (nowMs - lastOkAt) > staleMs;
  const recent = cycles.slice(-10);
  return {
    schema_version: STEWARD_CYCLE_SCHEMA,
    enabled: true,
    last_cycle_id: last?.cycle_id ?? null,
    last_cycle_at: last?.ended_at ?? null,
    last_cycle_ms: last?.duration_ms ?? null,
    cycles_recorded: cycles.length,
    // A steward that has not run is itself a finding: silence is not health.
    stale,
    stale_after_ms: staleMs,
    running: state.running,
    actions_executed: recent.reduce((n, c) => n + (c.executed?.length || 0), 0),
    actions_refused: recent.reduce((n, c) => n + (c.refused?.length || 0), 0),
    history: recent.flatMap((c) => (c.executed || []).map((e) => ({
      at: c.ended_at, action: e.action, resource: e.resource_key, owner: e.owner, ok: e.ok,
    }))).slice(-20),
    escalations: recent.flatMap((c) => (c.suppressed || [])
      .filter((s) => s.suppressed_because !== "cooldown")
      .map((s) => ({ at: c.ended_at, resource: s.resource_key, why: s.suppressed_because, action: s.action }))).slice(-10),
    admission_before: last?.admission_before ?? null,
    admission_after: last?.admission_after ?? null,
    /*
     * FINDINGS ARE CONSUMED HERE, AND OWNED ELSEWHERE.
     *
     * The Steward needs to know which durable operational problems currently
     * affect operation, which constrain planning, and which are owed to the
     * Director. It reads that view and never writes to it, so findings cannot
     * become a second source of operational truth beside the run, lane and
     * health owners the Steward already coordinates.
     *
     * Read defensively: a findings store that cannot be read must degrade the
     * Steward's awareness, never its cycle. The Steward's job is the host, and
     * it has to keep doing it when a satellite store is unavailable.
     */
    findings: stewardFindingsView(root),
    /*
     * The control-plane recovery scoreboard, composed here rather than given its
     * own surface: §11 asks that the Director not have to read six JSON stores,
     * and the Steward is already where host state is answered.
     *
     * Synchronous and evidence-free by design — this reports the LAST recorded
     * episode, it does not probe. Probing belongs to whoever is driving a cycle,
     * because a status call must never restart anything as a side effect.
     */
    control_plane_recovery: recoveryPosture(root),
    /*
     * HYGIENE, ANSWERED WITHOUT MEASURING. §13 asks the Steward to be able to
     * say what was reclaimed and what is blocked. It reports the LAST recorded
     * hygiene cycle and never observes — a status call that ran a `du` over a
     * 29 GB estate would be a status call nobody dares make.
     */
    hygiene: hygienePostureFor(root, readState(root)),
  };
}

function hygienePostureFor(root, state) {
  try {
    return {
      ...hygienePosture(root),
      last_cycle_at: state.hygiene_last?.at ?? null,
      last_recorded_cycle: state.hygiene_last ?? null,
      due: state.hygiene_last_ms == null ? true : (Date.now() - state.hygiene_last_ms) >= HYGIENE_CADENCE_MS,
      cadence_ms: HYGIENE_CADENCE_MS,
    };
  } catch {
    return { unavailable: true };
  }
}

function recoveryPosture(root) {
  try {
    const read = readEpisode(root);
    if (!read.ok) return { unavailable: true, reason: read.error };
    const ep = read.episode;
    if (!ep) return { episode_active: false, failure_class: null, recovery_level: 0, director_action_required: false };
    return {
      episode_active: !ep.resolved_at,
      episode_id: ep.episode_id,
      failure_class: ep.failure_class,
      recovery_level: ep.level,
      attempts_used: (ep.attempts || []).length,
      attempts_allowed: ATTEMPT_CEILINGS[ep.failure_class] ?? 0,
      first_observed_at: ep.first_observed_at,
      resolved_at: ep.resolved_at,
      last_known_good: ep.last_known_good,
      director_action_required: Boolean(ep.escalated) || (ep.attempts || []).length >= (ATTEMPT_CEILINGS[ep.failure_class] ?? 0),
    };
  } catch {
    return { unavailable: true };
  }
}

function stewardFindingsView(root) {
  try {
    return findingsForSteward(root);
  } catch {
    // A findings store that cannot be read must degrade the Steward's
    // awareness, never its cycle. The Steward's job is the host.
    return { schema_version: "vacilando.findings_steward_view.v1", unavailable: true };
  }
}

export { classifyHostAdmission, OWNERSHIP };
