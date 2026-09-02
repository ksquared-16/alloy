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
});

export function stewardStatePath(root) {
  return join(root, "host-steward", "state.json");
}

function readState(root) {
  try {
    const j = JSON.parse(readFileSync(stewardStatePath(root), "utf8"));
    return { schema_version: STEWARD_CYCLE_SCHEMA, cycles: j.cycles || [], cooldowns: j.cooldowns || {}, running: j.running || null };
  } catch { return { schema_version: STEWARD_CYCLE_SCHEMA, cycles: [], cooldowns: {}, running: null }; }
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
  };
}

export { classifyHostAdmission, OWNERSHIP };
