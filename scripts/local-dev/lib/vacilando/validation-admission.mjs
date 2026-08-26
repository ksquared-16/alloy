/**
 * S5 — validation admission and worker-budget enforcement.
 *
 * THE STATEMENT THIS MAKES TRUE. Two providers may independently request
 * expensive validation, and their combined governed workload cannot exceed the
 * canonical host capacity policy. The original incident — two unconstrained
 * multi-worker suites driving an 8-core host to load 54.47 — is no longer
 * reachable through a supported execution path.
 *
 * ENFORCEMENT HAPPENS BEFORE ADMISSION, NEVER AFTER. Vacilando does not
 * terminate a running validation to reclaim tokens. Killing a suite at minute
 * eighteen destroys work and teaches providers to route around the broker,
 * which is how the bypass was born. This module contains no signal, no kill and
 * no spawn; a test reads its source and fails if any appear.
 *
 * WAITING IS NOT FAILING. A workload that cannot start now is queued with the
 * specific axes blocking it, its owner, and what it needs. It is never failed
 * merely because capacity is temporarily unavailable.
 *
 * CRASH SAFETY. A claim records the pid holding it. A claim whose holder is
 * gone is reaped on the next read — that is recovery, not termination, and it
 * is what makes a wrapper crash release capacity without anyone intervening.
 *
 * CANONICAL OWNERS ONLY. Ownership comes from S1 attribution, identity and cost
 * from S3 classification, limits from S4 capacity policy. This module owns one
 * new thing: the decision to admit or wait, and the ledger that makes it true.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { WORKLOAD_CLASSES } from "./workload-classification.mjs";
import { EXCLUSIVE } from "./capacity-policy.mjs";

export const VALIDATION_CLAIMS_SCHEMA = "vacilando.validation_claims.v1";

/**
 * Classes subject to token enforcement.
 *
 * `interactive` and `light_validation` are deliberately absent: throttling
 * ordinary provider conversation would make Vacilando unusable exactly when the
 * operator most needs it, and a lint of three files is not a capacity event.
 */
export const ENFORCED_CLASSES = Object.freeze([
  "targeted_test", "heavy_test", "typecheck", "production_build", "browser_e2e", "machine_exclusive",
]);

/**
 * Classes gated by live memory pressure.
 *
 * `targeted_test` is deliberately absent. Blocking a single-file test on a
 * swapping host makes validation unusable exactly when an operator most needs to
 * check something, and a weight-2 one-worker run is not what pushed the machine
 * over. Pressure reduces EXPENSIVE work, which is what S4's language says.
 */
export const MEMORY_PRESSURE_GATED_CLASSES = Object.freeze([
  "heavy_test", "typecheck", "production_build", "browser_e2e", "machine_exclusive",
]);

/** Classes whose admission needs disk headroom above the S4 reserve. */
export const DISK_SENSITIVE_CLASSES = Object.freeze(["production_build", "typecheck", "browser_e2e"]);

export function isEnforced(workloadClass) {
  return ENFORCED_CLASSES.includes(workloadClass);
}

// ── Ledger ───────────────────────────────────────────────────────────────────

function defaultStorePath(root) {
  const base = root || process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");
  return join(base, "vacilando", "validation-claims.json");
}

function emptyStore() {
  return { schema_version: VALIDATION_CLAIMS_SCHEMA, claims: [], queue: [], events: [] };
}

export function readClaimStore({ root = null, path = null, pidAlive = defaultPidAlive } = {}) {
  const file = path || defaultStorePath(root);
  let store = emptyStore();
  try {
    if (existsSync(file)) store = { ...emptyStore(), ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    // A corrupt ledger must not wedge validation. An empty ledger is safe: it
    // under-reports usage, which admits conservatively rather than over-admitting.
    store = emptyStore();
  }
  // Reap claims whose holder is gone. THIS is the crash-safety mechanism, and it
  // is recovery — the process is already dead; nothing is being terminated.
  const live = [];
  const reaped = [];
  for (const c of store.claims) {
    if (c?.pid && !pidAlive(c.pid)) reaped.push(c);
    else live.push(c);
  }
  store.claims = live;
  store.reaped = reaped;

  // The same recovery for WAITERS. A queued entry whose waiter has died is a
  // phantom: it blocks nothing, but it is reported as contention and it
  // survives forever, because nothing else ever removes it. Entries from before
  // waiter_pid existed carry none, and are left alone rather than guessed at.
  const liveQueue = [];
  const abandoned = [];
  for (const q of store.queue || []) {
    if (q?.waiter_pid && !pidAlive(q.waiter_pid)) abandoned.push(q);
    else liveQueue.push(q);
  }
  store.queue = liveQueue;
  store.abandoned_waiters = abandoned;
  return store;
}

function writeClaimStore(store, { root = null, path = null } = {}) {
  const file = path || defaultStorePath(root);
  mkdirSync(dirname(file), { recursive: true });
  const { reaped, abandoned_waiters, ...persist } = store;
  // Write-then-rename: a crash mid-write must not leave a half-parsed ledger.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(persist, null, 2)}\n`);
  renameSync(tmp, file);
  return store;
}

function defaultPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function heldWeight(store) {
  return (store.claims || []).reduce((sum, c) => sum + (c.exclusive ? 0 : Number(c.weight) || 0), 0);
}
export function exclusiveHeld(store) {
  return (store.claims || []).some((c) => c.exclusive === true);
}

// ── Worker cap ───────────────────────────────────────────────────────────────

const WORKER_FLAG_RE = /^--(?:max-?workers|maxWorkers|max-threads)(?:=.*)?$/i;

/**
 * Apply the S4 per-job worker ceiling to a runner's argv.
 *
 * ONLY concurrency flags are touched. Test selection, reporters, config paths
 * and every other flag pass through untouched — this changes how fast a suite
 * runs, never which tests run or what they assert.
 */
export function applyWorkerCeiling(args = [], ceiling, { tool = null } = {}) {
  if (!Number.isFinite(ceiling) || ceiling < 1) return { args: [...args], changed: false, granted: null };
  if (tool && !["vitest", "jest"].includes(String(tool).toLowerCase())) {
    // An unsupported runner is not rewritten. Guessing at another tool's flags
    // is how a "concurrency" change becomes a semantics change.
    return { args: [...args], changed: false, granted: null, reason: "unsupported_runner" };
  }
  const out = [];
  let replaced = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = String(args[i]);
    if (WORKER_FLAG_RE.test(a)) {
      out.push(`--maxWorkers=${ceiling}`);
      replaced = true;
      if (!a.includes("=") && /^\d+$/.test(String(args[i + 1] || ""))) i += 1;
      continue;
    }
    out.push(a);
  }
  if (!replaced) out.push(`--maxWorkers=${ceiling}`);
  return { args: out, changed: true, granted: ceiling, reason: replaced ? "reduced_explicit_request" : "applied_host_ceiling" };
}

// ── Admission ────────────────────────────────────────────────────────────────

/**
 * Decide whether a classified workload may start now.
 *
 * Multi-axis and never collapsed into a score: a caller must be able to see
 * WHICH axis blocked it. Every blocking axis is reported, not just the first.
 */
export function evaluateAdmission({ workload, capacity, store, now = Date.now() }) {
  const cls = workload?.workload_class;
  if (!isEnforced(cls)) {
    return { admit: true, enforced: false, blocked_by: [], reason: "class_not_enforced", weight: 0 };
  }

  const axes = capacity?.axes || {};
  const blocked = [];

  // Machine-exclusive is NOT a token request. It needs the field clear, and it
  // keeps the field clear while it holds.
  if (cls === "machine_exclusive") {
    const held = heldWeight(store);
    if (held > 0) {
      blocked.push({ axis: "validation_capacity", reason: `machine-exclusive requires governed validation to drain; ${held} weight still held`, required: 0, current: held });
    }
    if (exclusiveHeld(store)) {
      blocked.push({ axis: "machine_exclusive", reason: "another machine-exclusive workload holds the host", required: "clear", current: "held" });
    }
    return blocked.length
      ? { admit: false, enforced: true, blocked_by: blocked, weight: EXCLUSIVE, exclusive: true }
      : { admit: true, enforced: true, blocked_by: [], weight: EXCLUSIVE, exclusive: true };
  }

  // Anything else must wait behind an exclusive holder.
  if (exclusiveHeld(store)) {
    blocked.push({ axis: "machine_exclusive", reason: "a machine-exclusive workload holds the host", required: "clear", current: "held" });
  }

  const weight = Number(workload?.expected_weight) || 0;
  const budget = Number(axes.validation_capacity?.tokens) || 0;
  const held = heldWeight(store);
  if (held + weight > budget) {
    blocked.push({
      axis: "validation_capacity",
      reason: `weight ${weight} would take held ${held} past the budget of ${budget}`,
      required: weight, current: held, budget,
    });
  }

  // Compute: an already-saturated host must not be handed more expensive work.
  const load = axes.compute_capacity?.load;
  const loadProblem = axes.compute_capacity?.problem_at;
  if (Number.isFinite(load) && Number.isFinite(loadProblem) && load > loadProblem) {
    blocked.push({ axis: "compute_capacity", reason: `load ${load.toFixed(2)} exceeds ${loadProblem}`, required: `<=${loadProblem}`, current: load });
  }

  // Memory: live pressure, per S2's rate model — never a lifetime counter.
  // Only expensive classes are gated; see MEMORY_PRESSURE_GATED_CLASSES.
  if (axes.memory_capacity?.under_pressure === true && MEMORY_PRESSURE_GATED_CLASSES.includes(cls)) {
    blocked.push({ axis: "memory_capacity", reason: "host is actively swapping", required: "no_swap_activity", current: "swapping" });
  }
  const memRemaining = axes.memory_capacity?.remaining_gb;
  if (Number.isFinite(memRemaining) && memRemaining < 0 && MEMORY_PRESSURE_GATED_CLASSES.includes(cls)) {
    blocked.push({ axis: "memory_capacity", reason: `free memory is ${Math.abs(memRemaining).toFixed(1)} GB below the reserve`, required: "above_reserve", current: memRemaining });
  }

  // Disk: only for classes that expand it.
  if (DISK_SENSITIVE_CLASSES.includes(cls) && axes.disk_headroom?.below_reserve === true) {
    blocked.push({
      axis: "disk_headroom",
      reason: `free ${axes.disk_headroom.free_gb} GB is below the ${axes.disk_headroom.reserve_gb} GB reserve`,
      required: axes.disk_headroom.reserve_gb, current: axes.disk_headroom.free_gb,
    });
  }

  return {
    admit: blocked.length === 0,
    enforced: true,
    blocked_by: blocked,
    weight,
    budget,
    held,
    exclusive: false,
    decided_at: now,
  };
}

// ── Claim lifecycle ──────────────────────────────────────────────────────────

let claimSeq = 0;
function claimId(now) { claimSeq += 1; return `vcl_${now.toString(36)}_${claimSeq}`; }

/**
 * Acquire capacity, or enqueue truthfully.
 *
 * Read-decide-write happens in one pass over a freshly read ledger, so two
 * simultaneous acquisitions cannot both see the same free budget: the second
 * read includes the first claim.
 */
export function acquireCapacity({
  workload, capacity, pid, root = null, path = null, now = Date.now(),
  pidAlive = defaultPidAlive, workersRequested = null, workersGranted = null,
}) {
  const store = readClaimStore({ root, path, pidAlive });
  const decision = evaluateAdmission({ workload, capacity, store, now });

  if (!decision.enforced) {
    return { ...decision, claim: null, queued: false, store_reaped: store.reaped?.length || 0 };
  }

  if (!decision.admit) {
    // A WAITER RE-ACQUIRES; IT DOES NOT RE-QUEUE.
    //
    // The waiting loops in vac-governed-validate and vac-validate-admit call
    // this again on every retry. Appending each time left FOURTEEN queue rows
    // for one waiter inside a minute — observed live under real memory
    // pressure — so status and health would report fourteen blocked workloads
    // where there was one. Worse, each new row carried a FRESH wait_deadline,
    // so the S6-shaped bound could never be reached: a wait that renews its own
    // deadline is an unbounded wait wearing a bound.
    //
    // The existing row is updated in place and keeps its original
    // waiting_since, wait_deadline and request_id.
    const priorIndex = (store.queue || []).findIndex((q) => q.workload_id === workload.workload_id);
    if (priorIndex >= 0) {
      const prior = store.queue[priorIndex];
      const updated = {
        ...prior,
        blocked_by: decision.blocked_by,
        current_held: decision.held ?? heldWeight(store),
        budget: decision.budget ?? prior.budget ?? null,
        observations: Number(prior.observations || 0) + 1,
        last_observed_at: now,
      };
      store.queue[priorIndex] = updated;
      writeClaimStore(store, { root, path });
      return { ...decision, claim: null, queued: true, queue_entry: updated, requeued: false, store_reaped: store.reaped?.length || 0 };
    }
    const entry = {
      request_id: `vq_${now.toString(36)}_${(store.queue?.length || 0) + 1}`,
      // So a waiter that dies can be reaped, exactly as a dead claim is.
      waiter_pid: pid ?? null,
      workload_id: workload.workload_id,
      lane_id: workload.lane_id ?? null,
      execution_run_id: workload.execution_run_id ?? null,
      root_provider_pid: workload.root_provider_pid ?? null,
      workload_class: workload.workload_class,
      workload_label: WORKLOAD_CLASSES[workload.workload_class] || null,
      workers_requested: workersRequested,
      workers_granted: workersGranted,
      required_weight: decision.weight === EXCLUSIVE ? "exclusive" : decision.weight,
      current_held: decision.held ?? heldWeight(store),
      budget: decision.budget ?? null,
      blocked_by: decision.blocked_by,
      waiting_since: now,
      // A wait must never be unowned or unbounded. S6 generalises bounds; S5's
      // waits already carry an owner and a deadline.
      wait_deadline: now + WAIT_DEADLINE_MS,
      state: "waiting",
    };
    store.queue.push(entry);
    store.events.push({ at: now, event: "queued", request_id: entry.request_id, lane_id: entry.lane_id, blocked_by: entry.blocked_by.map((b) => b.axis) });
    writeClaimStore(store, { root, path });
    return { ...decision, claim: null, queued: true, queue_entry: entry, store_reaped: store.reaped?.length || 0 };
  }

  const claim = {
    claim_id: claimId(now),
    workload_id: workload.workload_id,
    pid,
    lane_id: workload.lane_id ?? null,
    execution_run_id: workload.execution_run_id ?? null,
    root_provider_pid: workload.root_provider_pid ?? null,
    workload_class: workload.workload_class,
    weight: decision.exclusive ? 0 : decision.weight,
    exclusive: Boolean(decision.exclusive),
    workers_requested: workersRequested,
    workers_granted: workersGranted,
    acquired_at: now,
  };
  store.claims.push(claim);
  store.events.push({ at: now, event: "acquired", claim_id: claim.claim_id, lane_id: claim.lane_id, weight: claim.weight, exclusive: claim.exclusive });
  writeClaimStore(store, { root, path });
  return { ...decision, claim, queued: false, store_reaped: store.reaped?.length || 0 };
}

export const WAIT_DEADLINE_MS = 60 * 60 * 1000;

/**
 * Release a claim on ANY exit path.
 *
 * Success, test failure, wrapper crash — all release. The crash case is also
 * covered by pid reaping on read, so capacity is never stranded by a process
 * that died before it could tidy up.
 */
export function releaseCapacity(claimId_, { root = null, path = null, now = Date.now(), pidAlive = defaultPidAlive, exitCode = null } = {}) {
  const store = readClaimStore({ root, path, pidAlive });
  const before = store.claims.length;
  const released = store.claims.find((c) => c.claim_id === claimId_) || null;
  store.claims = store.claims.filter((c) => c.claim_id !== claimId_);
  store.events.push({ at: now, event: "released", claim_id: claimId_, exit_code: exitCode, found: Boolean(released) });
  writeClaimStore(store, { root, path });
  return { ok: true, released, removed: before - store.claims.length, reaped: store.reaped?.length || 0 };
}

/**
 * Which queued requests can now start?
 *
 * Called when capacity changes — on release — rather than polled. No busy loop.
 */
export function drainQueue({ capacity, root = null, path = null, now = Date.now(), pidAlive = defaultPidAlive } = {}) {
  const store = readClaimStore({ root, path, pidAlive });
  const ready = [];
  const stillWaiting = [];
  const expired = [];
  for (const entry of store.queue || []) {
    if (Number.isFinite(entry.wait_deadline) && now > entry.wait_deadline) {
      expired.push({ ...entry, state: "expired" });
      continue;
    }
    const probe = evaluateAdmission({
      workload: {
        workload_class: entry.workload_class,
        expected_weight: entry.required_weight === "exclusive" ? undefined : entry.required_weight,
        workload_id: entry.workload_id, lane_id: entry.lane_id,
      },
      capacity, store, now,
    });
    if (probe.admit) ready.push({ ...entry, state: "ready" });
    else stillWaiting.push({ ...entry, blocked_by: probe.blocked_by });
  }
  store.queue = stillWaiting;
  if (ready.length || expired.length) {
    store.events.push({ at: now, event: "queue_drained", ready: ready.map((r) => r.request_id), expired: expired.map((e) => e.request_id) });
  }
  writeClaimStore(store, { root, path });
  return { ready, still_waiting: stillWaiting, expired };
}

// ── Drift and unbrokered accounting ──────────────────────────────────────────

/**
 * Did a governed workload exceed the workers it was granted?
 *
 * Reported, and used to account conservatively for the NEXT admission. The
 * running workload is never touched, and its persistent class is never
 * rewritten — a measurement must not be able to relabel a workload.
 */
export function detectWorkerCapDrift({ claim, observedWorkers }) {
  const granted = Number(claim?.workers_granted);
  const observed = Number(observedWorkers);
  if (!Number.isFinite(granted) || !Number.isFinite(observed) || observed <= granted) return null;
  return {
    claim_id: claim.claim_id,
    lane_id: claim.lane_id ?? null,
    workload_class: claim.workload_class,
    workers_granted: granted,
    observed_workers: observed,
    implied_weight: observed * 2,
    declared_weight: claim.weight,
    violation: "worker_cap_exceeded",
    action: "reported_and_accounted_conservatively_not_killed",
  };
}

/**
 * Pressure from work Vacilando did NOT admit.
 *
 * An unbrokered suite discovered after it started is attributed and counted
 * against remaining capacity so the NEXT admission is conservative. It is never
 * killed — enforcement is a gate at the door, not a bailiff.
 */
export function unbrokeredPressure({ workloads = [], claims = [] }) {
  const claimedIds = new Set(claims.map((c) => c.workload_id));
  const unbrokered = workloads.filter((w) => isEnforced(w.workload_class) && !claimedIds.has(w.workload_id));
  const weight = unbrokered.reduce((s, w) => s + (Number(w.expected_weight) || 0), 0);
  return {
    unbrokered_count: unbrokered.length,
    unbrokered_weight: weight,
    workloads: unbrokered.map((w) => ({
      workload_id: w.workload_id, pid: w.pid, lane_id: w.lane_id,
      workload_class: w.workload_class, expected_weight: w.expected_weight,
      attribution: w.root_provider_pid != null ? "attributed" : "unattributed",
    })),
    action: "counted_against_capacity_never_terminated",
  };
}

/** Effective remaining budget, counting governed claims AND observed bypasses. */
export function effectiveRemaining({ capacity, store, unbrokeredWeight = 0 }) {
  const budget = Number(capacity?.axes?.validation_capacity?.tokens) || 0;
  const held = heldWeight(store);
  return {
    budget,
    governed_held: held,
    unbrokered_observed: unbrokeredWeight,
    remaining: Math.max(0, budget - held - unbrokeredWeight),
    exclusive_held: exclusiveHeld(store),
  };
}
