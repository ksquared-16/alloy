/**
 * Vacilando Governor Phase 4 — machine-exclusive window + quiescence.
 *
 * Authority for runtime_timing_certification. Separate from validate.lock
 * and alloy-compute browser-certification. Does not kill lanes, tmux,
 * Claude sessions, or unmanaged processes.
 *
 * Internal phases (not Execution Run states):
 *   RESERVING_EXCLUSIVE → DRAINING_CONFLICTS → VERIFYING_QUIET → EXCLUSIVE_ACTIVE
 *
 * Writer-preference: once an exclusive request is the eligible head of its
 * queue, current bounded conflicting holders may finish; no NEW conflicting
 * grants occur until this window releases.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { findUnbrokeredHeavyProcesses } from "./heavy-validation-guard.mjs";

export const EXCLUSIVE_RESOURCE_KEY = "runtime_timing_certification";
export const EXCLUSIVE_WINDOW_SCHEMA = "vacilando.machine_exclusive.v1";
export const EXCLUSIVE_PHASES = Object.freeze([
  "RESERVING_EXCLUSIVE",
  "DRAINING_CONFLICTS",
  "VERIFYING_QUIET",
  "EXCLUSIVE_ACTIVE",
]);
export const EXCLUSIVE_DEFAULT_MAX_MS = 20 * 60 * 1000;
export const EXCLUSIVE_DEFAULT_RESERVE_MAX_MS = 30 * 60 * 1000;

export const CONFLICTING_GRANT_KEYS = Object.freeze(["browser_certification"]);

export const EXCLUSIVE_CONFLICT_MATRIX = Object.freeze([
  {
    activity: "browser_certification",
    conflicts: true,
    why: "Chromium/Playwright CPU and I/O distort runtime timing measurements",
    detect: "Governor GRANTED Resource Requests + alloy-compute browser-certification holders",
    prevent: "tryGrantHead refuses new grants while an exclusive window is reserved or active",
    settle: "current GRANTED holder may finish; queued waiters stay queued",
  },
  {
    activity: "validate",
    conflicts: true,
    why: "Host-wide typecheck/build/full-test/playwright saturates CPU",
    detect: "validate.lock owner (host locks dir)",
    prevent: "Governor does not start vac-run; residual raw npm scripts are unmanaged blockers",
    settle: "wait for the lock holder; do not kill",
  },
  {
    activity: "unmanaged_heavy",
    conflicts: true,
    why: "Raw tsc / next build bypass vac-run (web/package.json is still unbrokered)",
    detect: "process scan via isUnbrokeredHeavyCommand (read-only; never kills)",
    prevent: "cannot prevent ungoverned processes; surface as blockers",
    settle: "wait until the process exits; do not kill",
  },
  {
    activity: "full_typecheck_permit",
    conflicts: false,
    why: "alloy-compute full-typecheck is declared but unwired; live path is vac-run/validate",
    detect: "registry only",
    prevent: "do not acquire",
    settle: "n/a",
  },
  {
    activity: "dev_servers",
    conflicts: false,
    why: "Idle Next servers are baseline host noise; stopping them would destroy lanes",
    detect: "sprint-ops pid files (observational)",
    prevent: "none in Phase 4; cap remains 3",
    settle: "n/a",
  },
  {
    activity: "docker_stack",
    conflicts: false,
    why: "Shared alloy-cert stack is baseline for local work; stopping it is lane destruction",
    detect: "alloy-stack leases",
    prevent: "do not release the stack for timing",
    settle: "n/a",
  },
  {
    activity: "claude_tmux",
    conflicts: false,
    why: "Quiescence keeps sessions alive; killing them is out of scope",
    detect: "lane tmux/claude facts",
    prevent: "exclusive module never signals tmux/Claude",
    settle: "n/a",
  },
  {
    activity: "git",
    conflicts: false,
    why: "Ordinary git status/diff is not timing-material compared with tsc/Chromium",
    detect: "none",
    prevent: "none",
    settle: "n/a",
  },
  {
    activity: "focused_unit_tests",
    conflicts: false,
    why: "Focused vitest is intentionally outside the heavy broker; not treated as exclusive conflict",
    detect: "none",
    prevent: "none",
    settle: "n/a",
  },
  {
    activity: "gateway_polling",
    conflicts: false,
    why: "Cheap FS snapshots; process scans run only while draining/verifying",
    detect: "Governor code paths",
    prevent: "skip host process scan during EXCLUSIVE_ACTIVE",
    settle: "n/a",
  },
  {
    activity: "control_plane",
    conflicts: false,
    why: "Gateway must remain the owner of this runtime",
    detect: "control-plane-owner.json",
    prevent: "do not release",
    settle: "n/a",
  },
]);

let resourceApi = {
  readStore: () => ({ requests: [] }),
  queuedFor: () => [],
  patchRequest: () => null,
  emit: () => {},
  onGranted: () => {},
  evaluateConflictingQueues: () => {},
  readComputeHolders: () => [],
  readValidate: () => ({ held: false, health: "available", holders: [] }),
  getExecutionRun: () => null,
  isTerminalRunState: () => false,
  transitionExecutionRun: () => ({ ok: false }),
};

let isolated = false;
let processScanImpl = null;
let extraBlockers = [];

export function bindExclusiveResourceApi(api) {
  resourceApi = { ...resourceApi, ...(api || {}) };
}

export function setExclusiveIsolatedForTests(value) {
  isolated = Boolean(value);
}

export function setExclusiveProcessScanForTests(fn) {
  processScanImpl = typeof fn === "function" ? fn : null;
}

export function setExclusiveBlockersForTests(list) {
  extraBlockers = Array.isArray(list) ? list.slice() : [];
}

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

export function exclusiveWindowPath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "machine-exclusive.json");
}

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function emptyWindow() {
  return { schema_version: EXCLUSIVE_WINDOW_SCHEMA, window: null };
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function readExclusiveWindow(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(exclusiveWindowPath(root), "utf8"));
    return raw?.window && typeof raw.window === "object" ? raw.window : null;
  } catch {
    return null;
  }
}

function writeWindow(window, root) {
  atomicWrite(exclusiveWindowPath(root), {
    schema_version: EXCLUSIVE_WINDOW_SCHEMA,
    window: window || null,
  });
  return window;
}

function newWindowId(requestId, nowMs) {
  return "mex_" + createHash("sha256")
    .update(`${requestId}:${nowMs}:${randomBytes(4).toString("hex")}`)
    .digest("hex")
    .slice(0, 16);
}

function maxMs() {
  const n = Number(process.env.VACILANDO_EXCLUSIVE_MAX_MS);
  return Number.isFinite(n) && n > 0 ? n : EXCLUSIVE_DEFAULT_MAX_MS;
}

function reserveMaxMs() {
  const n = Number(process.env.VACILANDO_EXCLUSIVE_RESERVE_MAX_MS);
  return Number.isFinite(n) && n > 0 ? n : EXCLUSIVE_DEFAULT_RESERVE_MAX_MS;
}

function quietHoldMs() {
  const n = Number(process.env.VACILANDO_EXCLUSIVE_QUIET_HOLD_MS);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function exclusiveHead(root) {
  return (resourceApi.queuedFor(resourceApi.readStore(root), EXCLUSIVE_RESOURCE_KEY) || [])[0] || null;
}

function grantedExclusive(root) {
  return (resourceApi.readStore(root).requests || []).find((r) =>
    r.resource_key === EXCLUSIVE_RESOURCE_KEY && r.state === "GRANTED"
  ) || null;
}

export function exclusiveBlocksNewGrant(resourceKey, root = runtimeRoot()) {
  if (!CONFLICTING_GRANT_KEYS.includes(String(resourceKey || ""))) return false;
  const w = readExclusiveWindow(root);
  if (w?.phase) return true;
  return Boolean(exclusiveHead(root));
}

export function exclusiveWindowHolds(rec, root = runtimeRoot()) {
  if (!rec?.request_id) return false;
  const w = readExclusiveWindow(root);
  return Boolean(
    w
    && w.phase === "EXCLUSIVE_ACTIVE"
    && w.request_id === rec.request_id
  );
}

function dedupeBlockers(list) {
  const seen = new Set();
  const out = [];
  for (const b of list || []) {
    const key = `${b.type}:${b.owner_run_id || b.owner_lane_id || b.pid || b.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

function scanUnmanaged() {
  if (typeof processScanImpl === "function") {
    try { return processScanImpl() || []; } catch { return []; }
  }
  if (isolated) return [];
  try { return findUnbrokeredHeavyProcesses() || []; } catch { return []; }
}

export function collectExclusiveBlockers(root = runtimeRoot()) {
  const blockers = [];
  for (const b of extraBlockers) blockers.push({ ...b });

  const store = resourceApi.readStore(root);
  for (const rec of store.requests || []) {
    if (rec.state !== "GRANTED") continue;
    if (rec.resource_key === "browser_certification") {
      blockers.push({
        type: "browser_certification",
        owner_lane_id: rec.lane_id || null,
        owner_run_id: rec.run_id || null,
        reason: "Browser certification still held",
        governed: true,
      });
    }
  }

  const holders = resourceApi.readComputeHolders?.("browser-certification") || [];
  for (const h of holders) {
    if (h.governor) continue;
    if (h.alive === false) continue;
    blockers.push({
      type: "browser_certification",
      owner_lane_id: null,
      owner_run_id: null,
      reason: "Browser certification held outside Governor",
      governed: true,
    });
  }

  if (!isolated) {
    const validate = resourceApi.readValidate?.() || { held: false };
    if (validate.held && validate.health !== "stale_owner") {
      blockers.push({
        type: "validate",
        owner_lane_id: null,
        owner_run_id: null,
        reason: "Heavy validation lease is held",
        governed: true,
      });
    }
  }

  for (const p of scanUnmanaged()) {
    blockers.push({
      type: "unmanaged_heavy",
      owner_lane_id: null,
      owner_run_id: null,
      pid: p.pid || null,
      reason: "Unmanaged conflicting process detected",
      governed: false,
    });
  }

  return dedupeBlockers(blockers);
}

export function exclusiveQuietnessReport(root = runtimeRoot()) {
  const blockers = collectExclusiveBlockers(root);
  return {
    quiet: blockers.length === 0,
    blockers: blockers.map((b) => ({
      type: b.type,
      owner_lane_id: b.owner_lane_id || null,
      owner_run_id: b.owner_run_id || null,
      reason: b.reason,
      governed: Boolean(b.governed),
      ...(b.pid ? { pid: b.pid } : {}),
    })),
  };
}

function operatorBlockers(report) {
  return (report?.blockers || []).map((b) => ({
    type: b.type,
    owner_lane_id: b.owner_lane_id || null,
    reason: b.reason,
    governed: Boolean(b.governed),
  }));
}

function operatorDetail(phase, report) {
  if (phase === "EXCLUSIVE_ACTIVE") return "Exclusive timing window";
  const n = report?.blockers?.length || 0;
  if (!n) return "Preparing exclusive timing window";
  const unmanaged = report.blockers.some((b) => b.type === "unmanaged_heavy");
  if (unmanaged) return "Unmanaged conflicting process detected";
  if (n === 1) {
    const b = report.blockers[0];
    if (b.type === "browser_certification") return "Waiting for 1 browser certification to finish";
    if (b.type === "validate") return "Waiting for 1 heavy validation to finish";
  }
  return `Waiting for ${n} conflict${n === 1 ? "" : "s"} to settle`;
}

function emitWindow(type, window, root, extra = {}) {
  resourceApi.emit(type, {
    request_id: window?.request_id || null,
    run_id: window?.run_id || null,
    lane_id: window?.lane_id || null,
    resource_key: EXCLUSIVE_RESOURCE_KEY,
    origin: extra.origin || "governor",
  }, root, extra);
}

function clearWindow(root, extra = {}) {
  const prev = readExclusiveWindow(root);
  writeWindow(null, root);
  if (prev) emitWindow("exclusive_released", prev, root, extra);
  return prev;
}

function reserveFor(head, root, nowMs) {
  const existing = readExclusiveWindow(root);
  if (existing && existing.request_id === head.request_id && existing.phase) {
    return existing;
  }
  const window = {
    window_id: newWindowId(head.request_id, nowMs),
    request_id: head.request_id,
    run_id: head.run_id,
    lane_id: head.lane_id,
    resource_key: EXCLUSIVE_RESOURCE_KEY,
    phase: "RESERVING_EXCLUSIVE",
    reserved_at: iso(nowMs),
    granted_at: null,
    quiet_since: null,
    deadline: iso(nowMs + reserveMaxMs()),
    grant_deadline: null,
    owner_holder: `vac-${head.run_id}`,
    operator_detail: "Preparing exclusive timing window",
    timings: {
      reserved_at_ms: nowMs,
      quiet_at_ms: null,
      granted_at_ms: null,
    },
  };
  writeWindow(window, root);
  emitWindow("exclusive_reserved", window, root);
  return window;
}

function patchWindow(patch, root) {
  const cur = readExclusiveWindow(root);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  writeWindow(next, root);
  return next;
}

function failOwnerRun(runId, reason, { root, nowMs, origin = "governor" }) {
  const run = resourceApi.getExecutionRun(runId, root);
  if (!run || resourceApi.isTerminalRunState(run.state)) return;
  const to = run.state === "VALIDATING" || run.state === "WAITING_RESOURCE" || run.state === "EXECUTING" || run.state === "RECOVERING"
    ? "NEEDS_INPUT"
    : null;
  if (!to) return;
  try {
    resourceApi.transitionExecutionRun(run.run_id, to, {
      reason,
      origin,
      nowMs,
      root,
      completion_report: { summary: reason },
    });
  } catch { /* run may already have moved */ }
}

function releaseExclusiveAuthority(root, nowMs, {
  origin = "governor",
  reason = "exclusive_released",
  failOwner = false,
  requestState = "RELEASED",
} = {}) {
  const window = readExclusiveWindow(root);
  if (!window) {
    resourceApi.evaluateConflictingQueues?.(root, nowMs);
    return { ok: true, window: null };
  }
  if (window.request_id) {
    const rec = (resourceApi.readStore(root).requests || []).find((r) => r.request_id === window.request_id);
    if (rec && (rec.state === "GRANTED" || rec.state === "QUEUED" || rec.state === "REQUESTED")) {
      resourceApi.patchRequest(rec.request_id, {
        state: rec.state === "GRANTED" ? requestState : "CANCELLED",
        released_at: iso(nowMs),
        ready_to_resume: false,
        origin,
      }, {
        root,
        event: rec.state === "GRANTED" ? "resource_released" : "resource_cancelled",
        extra: { reason, exclusive: true },
      });
    }
  }
  if (failOwner && window.run_id) {
    failOwnerRun(window.run_id, reason, { root, nowMs, origin });
  }
  clearWindow(root, { origin, reason });
  return { ok: true, window };
}

function grantExclusive(head, window, root, nowMs) {
  const grantedAt = iso(nowMs);
  const next = {
    ...window,
    phase: "EXCLUSIVE_ACTIVE",
    granted_at: grantedAt,
    grant_deadline: iso(nowMs + maxMs()),
    deadline: iso(nowMs + maxMs()),
    quiet_since: window.quiet_since || grantedAt,
    operator_detail: "Exclusive timing window",
    timings: {
      ...(window.timings || {}),
      quiet_at_ms: window.timings?.quiet_at_ms || nowMs,
      granted_at_ms: nowMs,
    },
  };
  writeWindow(next, root);
  const rec = resourceApi.patchRequest(head.request_id, {
    state: "GRANTED",
    granted_at: grantedAt,
    holder: next.owner_holder,
    ready_to_resume: true,
    origin: "governor",
  }, { root, event: "resource_granted", extra: { exclusive: true, window_id: next.window_id } });
  emitWindow("exclusive_granted", next, root);
  const latest = rec || { ...head, state: "GRANTED", granted_at: grantedAt, holder: next.owner_holder };
  try { resourceApi.onGranted({ ...latest }, { root, nowMs }); } catch { /* resume must not fail the grant */ }
  return latest;
}

function ownerHealthy(window, root) {
  if (!window?.run_id) return { ok: false, error: "owner_run_missing" };
  const run = resourceApi.getExecutionRun(window.run_id, root);
  if (!run) return { ok: false, error: "owner_run_missing" };
  if (resourceApi.isTerminalRunState(run.state)) return { ok: false, error: "owner_run_terminal" };
  if (window.lane_id && run.lane_id !== window.lane_id) return { ok: false, error: "owner_lane_mismatch" };
  if (window.phase === "EXCLUSIVE_ACTIVE" && window.request_id) {
    const rec = (resourceApi.readStore(root).requests || []).find((r) => r.request_id === window.request_id);
    if (!rec || rec.state !== "GRANTED") return { ok: false, error: "owner_request_not_granted" };
  }
  return { ok: true, run };
}

export function evaluateExclusiveWindow(root = runtimeRoot(), nowMs = Date.now()) {
  const held = grantedExclusive(root);
  let window = readExclusiveWindow(root);
  const head = exclusiveHead(root);

  if (window && !held && !head) {
    releaseExclusiveAuthority(root, nowMs, {
      origin: "system",
      reason: "exclusive_owner_gone",
      failOwner: false,
    });
    resourceApi.evaluateConflictingQueues?.(root, nowMs);
    return null;
  }

  if (window) {
    const health = ownerHealthy(window, root);
    if (!health.ok) {
      releaseExclusiveAuthority(root, nowMs, {
        origin: "system",
        reason: health.error === "owner_run_terminal" ? "exclusive_owner_terminal" : "exclusive_owner_gone",
        failOwner: health.error === "owner_run_missing" ? false : true,
      });
      resourceApi.evaluateConflictingQueues?.(root, nowMs);
      return evaluateExclusiveWindow(root, nowMs);
    }
    const deadline = Date.parse(window.deadline || "") || 0;
    if (deadline && nowMs >= deadline) {
      releaseExclusiveAuthority(root, nowMs, {
        origin: "governor",
        reason: window.phase === "EXCLUSIVE_ACTIVE" ? "exclusive_window_expired" : "exclusive_reservation_expired",
        failOwner: true,
      });
      resourceApi.evaluateConflictingQueues?.(root, nowMs);
      return evaluateExclusiveWindow(root, nowMs);
    }
  }

  if (held) {
    if (!window || window.request_id !== held.request_id || window.phase !== "EXCLUSIVE_ACTIVE") {
      window = {
        window_id: window?.window_id || newWindowId(held.request_id, nowMs),
        request_id: held.request_id,
        run_id: held.run_id,
        lane_id: held.lane_id,
        resource_key: EXCLUSIVE_RESOURCE_KEY,
        phase: "EXCLUSIVE_ACTIVE",
        reserved_at: window?.reserved_at || held.granted_at || iso(nowMs),
        granted_at: held.granted_at || iso(nowMs),
        quiet_since: window?.quiet_since || held.granted_at || iso(nowMs),
        deadline: iso(nowMs + maxMs()),
        grant_deadline: iso(nowMs + maxMs()),
        owner_holder: held.holder || `vac-${held.run_id}`,
        operator_detail: "Exclusive timing window",
        timings: window?.timings || { granted_at_ms: nowMs },
      };
      writeWindow(window, root);
    }
    return held;
  }

  if (!head) return null;

  window = reserveFor(head, root, nowMs);
  const report = exclusiveQuietnessReport(root);
  const detail = operatorDetail(report.quiet ? "VERIFYING_QUIET" : "DRAINING_CONFLICTS", report);

  if (!report.quiet) {
    if (window.phase !== "DRAINING_CONFLICTS") {
      emitWindow("exclusive_draining", window, root, { blockers: operatorBlockers(report) });
    }
    patchWindow({
      phase: "DRAINING_CONFLICTS",
      quiet_since: null,
      operator_detail: detail,
    }, root);
    resourceApi.patchRequest(head.request_id, {
      state_reason: detail,
    }, { root });
    return null;
  }

  const hold = quietHoldMs();
  const quietSince = window.quiet_since ? Date.parse(window.quiet_since) : 0;
  if (hold > 0 && (!quietSince || nowMs - quietSince < hold)) {
    const since = quietSince && nowMs - quietSince < hold ? window.quiet_since : iso(nowMs);
    patchWindow({
      phase: "VERIFYING_QUIET",
      quiet_since: since,
      operator_detail: "Verifying machine quietness",
      timings: {
        ...(window.timings || {}),
        quiet_at_ms: window.timings?.quiet_at_ms || nowMs,
      },
    }, root);
    return null;
  }

  patchWindow({
    phase: "VERIFYING_QUIET",
    quiet_since: window.quiet_since || iso(nowMs),
    operator_detail: "Verifying machine quietness",
    timings: {
      ...(window.timings || {}),
      quiet_at_ms: window.timings?.quiet_at_ms || nowMs,
    },
  }, root);
  window = readExclusiveWindow(root);
  return grantExclusive(head, window, root, nowMs);
}

export function exclusiveGrantRelease(rec, root = runtimeRoot(), nowMs = Date.now()) {
  const window = readExclusiveWindow(root);
  if (window && rec?.request_id && window.request_id === rec.request_id) {
    clearWindow(root, { origin: rec.origin || "system", reason: "resource_released" });
  }
  return { ok: true };
}

export function reconcileExclusiveWindow(root = runtimeRoot(), nowMs = Date.now()) {
  return evaluateExclusiveWindow(root, nowMs);
}

export function emergencyReleaseExclusive({
  confirm = false,
  actor = "operator",
  origin = "operator",
  root = runtimeRoot(),
  nowMs = Date.now(),
} = {}) {
  if (!confirm) return { ok: false, error: "confirm_required" };
  const window = readExclusiveWindow(root);
  if (!window?.phase) return { ok: false, error: "no_exclusive_window" };
  const out = releaseExclusiveAuthority(root, nowMs, {
    origin,
    reason: "exclusive_emergency_release",
    failOwner: true,
  });
  emitWindow("exclusive_emergency_released", window, root, { actor, origin });
  resourceApi.evaluateConflictingQueues?.(root, nowMs);
  return { ok: true, released: true, window, actor };
}

export function exclusiveProjection(rec, root = runtimeRoot()) {
  if (!rec || rec.resource_key !== EXCLUSIVE_RESOURCE_KEY) return null;
  const w = readExclusiveWindow(root);
  if (w && w.request_id === rec.request_id) {
    return {
      exclusive_phase: w.phase,
      exclusive_detail: w.operator_detail || null,
    };
  }
  if (rec.state === "QUEUED" && exclusiveHead(root)?.request_id === rec.request_id) {
    return { exclusive_phase: "RESERVING_EXCLUSIVE", exclusive_detail: "Preparing exclusive timing window" };
  }
  return null;
}

export function attachLaneExclusivePosture(lanes, root = runtimeRoot()) {
  const list = Array.isArray(lanes) ? lanes : [];
  const w = readExclusiveWindow(root);
  if (!w?.phase) {
    return list.map((lane) => {
      if (!lane?.runtime_posture) return lane;
      const { runtime_posture: _drop, ...rest } = lane;
      return rest;
    });
  }
  const reason = "Runtime Performance timing certification";
  return list.map((lane) => {
    const run = lane?.execution_run;
    if (lane?.lane_id === w.lane_id) {
      const wait = run?.resource_wait || {};
      return {
        ...lane,
        runtime_posture: { state: "EXCLUSIVE_OWNER", reason: w.operator_detail || reason },
        execution_run: run ? {
          ...run,
          runtime_posture: { state: "EXCLUSIVE_OWNER", reason: w.operator_detail || reason },
          resource_wait: {
            ...wait,
            exclusive_phase: w.phase,
            exclusive_detail: w.operator_detail || null,
          },
        } : run,
      };
    }
    const wait = run?.resource_wait;
    const queuedConflict = wait?.request_state === "QUEUED" && CONFLICTING_GRANT_KEYS.includes(wait?.resource_key);
    if (queuedConflict) {
      const posture = { state: "QUIESCED", reason };
      return {
        ...lane,
        runtime_posture: posture,
        execution_run: run ? { ...run, runtime_posture: posture } : run,
      };
    }
    return lane;
  });
}

export function exclusiveSnapshotFields(root = runtimeRoot()) {
  const w = readExclusiveWindow(root);
  if (!w?.phase) {
    return {
      machine_exclusive: {
        active: false,
        phase: null,
        owner_lane_id: null,
        conflict_count: 0,
        quiet: true,
      },
    };
  }
  const report = w.phase === "EXCLUSIVE_ACTIVE"
    ? { quiet: true, blockers: [] }
    : exclusiveQuietnessReport(root);
  return {
    machine_exclusive: {
      active: w.phase === "EXCLUSIVE_ACTIVE",
      phase: w.phase,
      window_id: w.window_id,
      owner_lane_id: w.lane_id || null,
      owner_run_id: w.run_id || null,
      request_id: w.request_id || null,
      reserved_at: w.reserved_at || null,
      granted_at: w.granted_at || null,
      deadline: w.deadline || null,
      detail: w.operator_detail || null,
      conflict_count: report.blockers.length,
      quiet: report.quiet,
      blockers: operatorBlockers(report),
    },
  };
}

export function resetExclusiveForTests(root = runtimeRoot()) {
  isolated = true;
  processScanImpl = null;
  extraBlockers = [];
  try {
    writeWindow(null, root);
  } catch { /* */ }
}
