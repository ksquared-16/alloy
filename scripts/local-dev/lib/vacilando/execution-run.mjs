/**
 * Vacilando Gateway — Execution Run (Phase 1).
 *
 * One operator-approved instruction tracked from acceptance to
 * COMPLETE / NEEDS_INPUT / FAILED / ABANDONED. Not a Claude session, not a tmux pane,
 * not a resource scheduler.
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { LANE_ID_RE, LANE_INSTRUCTION_MAX, runReceiptToken, textProvesInstructionReceipt } from "./lanes.mjs";
import { canonicalLaneStoreId, getDurableLane } from "./development-lane.mjs";
import { cleanupRunResources, onExecutionRunTransition, resetResourceRequestsForTests } from "./execution-resource.mjs";
import { TOOLKIT_DIR } from "./workspace-facts.mjs";
import { localNodeId, vacilandoGatewayRoot } from "./execution-node.mjs";
import * as attachmentsModule from "./lane-attachments.mjs";

export const EXECUTION_RUN_SCHEMA = "vacilando.execution_run.v1";
/**
 * Storage bound on run HISTORY, not a ceiling on lanes. Durable work is not
 * scarce (see provider-capacity.mjs), so this is generous and is about disk,
 * not concurrency. Lanes beyond it keep working; only their oldest history is
 * pruned.
 */
export const EXECUTION_RUN_MAX_LANES = 256;
export const EXECUTION_RUN_MAX_PER_LANE = 16;
export const EXECUTION_RUN_MAX_TRANSITIONS = 40;
export const EXECUTION_RUN_SUMMARY_MAX = 2000;
export const EXECUTION_RUN_REASON_MAX = 500;

export const RUN_STATES = Object.freeze([
  "QUEUED",
  "EXECUTING",
  "WAITING_RESOURCE",
  "VALIDATING",
  "NEEDS_INPUT",
  "RECOVERING",
  "COMPLETE",
  "FAILED",
  "ABANDONED",
]);

export const TERMINAL_RUN_STATES = Object.freeze(["COMPLETE", "FAILED", "ABANDONED"]);
/** Truly irreversible. ABANDONED is terminal for scheduling, but recoverable. */
export const IRREVERSIBLE_RUN_STATES = Object.freeze(["COMPLETE", "FAILED"]);
export const RUN_ORIGINS = Object.freeze(["operator", "agent", "governor", "system", "certification"]);

const LEGAL = Object.freeze({
  // QUEUED -> NEEDS_INPUT: the pane was not at an actionable prompt, so the
  // instruction could not be delivered and needs the operator to clear a modal.
  // The instruction is preserved; NEEDS_INPUT -> EXECUTING then retries it.
  QUEUED: ["EXECUTING", "NEEDS_INPUT", "FAILED", "ABANDONED"],
  EXECUTING: ["WAITING_RESOURCE", "VALIDATING", "NEEDS_INPUT", "RECOVERING", "COMPLETE", "FAILED", "ABANDONED"],
  WAITING_RESOURCE: ["EXECUTING", "VALIDATING", "NEEDS_INPUT", "FAILED"],
  VALIDATING: ["EXECUTING", "WAITING_RESOURCE", "RECOVERING", "NEEDS_INPUT", "COMPLETE", "FAILED"],
  // COMPLETE is reachable from RECOVERING: work that finished must never be
  // impossible to close merely because Vacilando abandoned the run mid-sprint.
  RECOVERING: ["EXECUTING", "VALIDATING", "WAITING_RESOURCE", "NEEDS_INPUT", "COMPLETE", "FAILED"],
  NEEDS_INPUT: ["EXECUTING", "WAITING_RESOURCE", "COMPLETE", "FAILED"],
  COMPLETE: [],
  FAILED: [],
  // ABANDONED is recoverable, not dead. RECOVERING is its ONLY exit, and it is
  // reachable only through recoverExecutionRun() with proven worker ownership.
  // Arbitrary ABANDONED -> EXECUTING stays illegal.
  ABANDONED: ["RECOVERING"],
});

const REPORT_STATES = new Set([
  "EXECUTING", "WAITING_RESOURCE", "VALIDATING", "NEEDS_INPUT", "RECOVERING", "COMPLETE", "FAILED",
]);

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

export function executionRunStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "runs.json");
}

export function executionRunEventsPath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "events.jsonl");
}

function emptyStore() {
  return { schema_version: EXECUTION_RUN_SCHEMA, lanes: {} };
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function readExecutionRunStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(executionRunStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    const lanes = raw.lanes && typeof raw.lanes === "object" ? raw.lanes : {};
    return { schema_version: EXECUTION_RUN_SCHEMA, lanes };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  atomicWrite(executionRunStorePath(root), store);
  return store;
}

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function newRunId(laneId, nowMs) {
  return "erun_" + createHash("sha256")
    .update(`${laneId}:${nowMs}:${randomBytes(6).toString("hex")}`)
    .digest("hex")
    .slice(0, 16);
}

function bound(s, max) {
  const t = String(s || "").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export function isTerminalRunState(state) {
  return TERMINAL_RUN_STATES.includes(state);
}

/** COMPLETE/FAILED can never be reopened. ABANDONED can be recovered. */
export function isIrreversibleRunState(state) {
  return IRREVERSIBLE_RUN_STATES.includes(state);
}

export function isLegalRunTransition(from, to) {
  return (LEGAL[from] || []).includes(to);
}

/**
 * Gateway certification / soak / transport-only prompts. These must not become
 * persistent production work on a durable lane.
 */
export function isCertificationInstruction(text) {
  const s = String(text || "");
  if (!s.trim()) return false;
  if (/\bVACILANDO_[A-Z0-9_]+\b/.test(s)) return true;
  if (/\bGateway two-lane\b/i.test(s)) return true;
  if (/\bsoak only\b/i.test(s)) return true;
  if (/\bCASE C session\b/i.test(s)) return true;
  if (/^Certification only:/im.test(s)) return true;
  if (/\btransport-only\b/i.test(s)) return true;
  if (/Do not modify files, run commands, or change the worktree/i.test(s)) return true;
  return false;
}

function resolveRunOrigin(origin, text) {
  if (origin === "certification" || isCertificationInstruction(text)) return "certification";
  if (RUN_ORIGINS.includes(origin)) return origin;
  return "operator";
}

export function activeRunForLane(laneId, root = runtimeRoot()) {
  const requested = String(laneId || "");
  const id = canonicalLaneStoreId(requested, root);
  if (!LANE_ID_RE.test(id) && !LANE_ID_RE.test(requested)) return null;
  const store = readExecutionRunStore(root);
  const pack = store.lanes[id] || store.lanes[requested];
  if (!pack?.current_run_id) return null;
  const run = (pack.runs || []).find((r) => r.run_id === pack.current_run_id);
  if (!run || isTerminalRunState(run.state)) return null;
  return run;
}

export function getExecutionRun(runId, root = runtimeRoot()) {
  const id = String(runId || "").trim();
  if (!id) return null;
  const store = readExecutionRunStore(root);
  for (const pack of Object.values(store.lanes || {})) {
    const run = (pack.runs || []).find((r) => r.run_id === id);
    if (run) return run;
  }
  return null;
}

export function listExecutionRunsForLane(laneId, root = runtimeRoot()) {
  const requested = String(laneId || "");
  const id = canonicalLaneStoreId(requested, root);
  if (!LANE_ID_RE.test(id) && !LANE_ID_RE.test(requested)) return [];
  const store = readExecutionRunStore(root);
  const pack = store.lanes[id] || store.lanes[requested];
  return [...(pack?.runs || [])];
}

export function gatewayRuntimeRoot() {
  return vacilandoGatewayRoot();
}

export function candidateRuntimeRoots() {
  const env = process.env.ALLOY_RUNTIME_ROOT?.trim();
  return [...new Set([env, gatewayRuntimeRoot(), runtimeRoot()].filter(Boolean))];
}

export function findExecutionRun(runId) {
  const id = String(runId || "").trim();
  if (!id) return null;
  for (const root of candidateRuntimeRoots()) {
    const run = getExecutionRun(id, root);
    if (run) return { run, root };
  }
  return null;
}

function pruneLanePack(pack) {
  const runs = Array.isArray(pack.runs) ? pack.runs.slice(0, EXECUTION_RUN_MAX_PER_LANE) : [];
  let current = pack.current_run_id || null;
  if (current && !runs.some((r) => r.run_id === current)) current = runs[0]?.run_id || null;
  return { current_run_id: current, runs };
}

function pruneStore(store) {
  const ids = Object.keys(store.lanes || {});
  if (ids.length <= EXECUTION_RUN_MAX_LANES) return store;
  const ranked = ids
    .map((id) => {
      const latest = store.lanes[id]?.runs?.[0]?.updated_at;
      return { id, at: Date.parse(latest) || 0 };
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, EXECUTION_RUN_MAX_LANES);
  const lanes = {};
  for (const { id } of ranked) lanes[id] = store.lanes[id];
  store.lanes = lanes;
  return store;
}

function putRun(store, run) {
  const pack = store.lanes[run.lane_id] || { current_run_id: null, runs: [] };
  const runs = (pack.runs || []).filter((r) => r.run_id !== run.run_id);
  runs.unshift(run);
  pack.runs = runs.slice(0, EXECUTION_RUN_MAX_PER_LANE);
  if (isTerminalRunState(run.state)) {
    if (pack.current_run_id === run.run_id) pack.current_run_id = null;
  } else {
    pack.current_run_id = run.run_id;
  }
  store.lanes[run.lane_id] = pruneLanePack(pack);
  return pruneStore(store);
}

function appendTransition(run, { from, to, reason, origin, nowMs }) {
  const rec = {
    from_state: from,
    to_state: to,
    occurred_at: iso(nowMs),
    reason: bound(reason, EXECUTION_RUN_REASON_MAX),
    origin: RUN_ORIGINS.includes(origin) ? origin : "system",
  };
  run.transitions = [...(run.transitions || []), rec].slice(-EXECUTION_RUN_MAX_TRANSITIONS);
  return rec;
}

/**
 * Worker liveness. A report that does not change state is still positive proof
 * that the worker is alive. Before this existed, `vac run-status <run> executing`
 * on an already-EXECUTING run was discarded as a noop, so a working agent left
 * no evidence at all and the governor read it as an orphan.
 */
function touchWorkerLiveness(run, { nowMs, origin, progress = null }) {
  if (origin !== "agent") return false;
  run.last_worker_report_at = iso(nowMs);
  run.worker_report_count = (Number(run.worker_report_count) || 0) + 1;
  if (progress) {
    run.latest_progress = { summary: bound(progress, EXECUTION_RUN_SUMMARY_MAX), at: iso(nowMs) };
  }
  return true;
}

function appendRunEvent(rec, root) {
  try {
    const path = executionRunEventsPath(root);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(rec)}\n`, "utf8");
  } catch { /* events are best-effort */ }
}

function scheduleOutcomePush(run, root) {
  return import("./lane-push.mjs").then(async (mod) => {
    let label = run.lane_id;
    try {
      label = getDurableLane(run.lane_id, root)?.name || label;
    } catch { /* keep id */ }
    const out = await mod.pushRunOutcome(run, { label, root });
    appendRunEvent({
      type: "execution_run.push_dispatch",
      run_id: run.run_id,
      lane_id: run.lane_id,
      state: run.state,
      sent: out?.sent || 0,
      skipped: out?.skipped || null,
      error: out?.error || null,
      at: new Date().toISOString(),
    }, root);
    return out;
  }).catch((err) => {
    const fail = { ok: false, error: "push_dispatch_failed", sent: 0, detail: String(err?.message || err) };
    appendRunEvent({
      type: "execution_run.push_dispatch",
      run_id: run.run_id,
      lane_id: run.lane_id,
      state: run.state,
      sent: 0,
      error: fail.error,
      at: new Date().toISOString(),
    }, root);
    return fail;
  });
}

function emitOutcomeEvent(run, root, { recordEvent = true } = {}) {
  if (!["COMPLETE", "NEEDS_INPUT", "FAILED", "ABANDONED"].includes(run.state)) {
    return Promise.resolve(null);
  }
  if (recordEvent) {
    appendRunEvent({
      type: `execution_run.${run.state.toLowerCase()}`,
      run_id: run.run_id,
      lane_id: run.lane_id,
      state: run.state,
      reason: run.state_reason || null,
      at: run.updated_at,
    }, root);
  }
  if (["COMPLETE", "NEEDS_INPUT", "FAILED", "ABANDONED"].includes(run.state)) {
    return scheduleOutcomePush(run, root);
  }
  return Promise.resolve(null);
}

/**
 * Attachment metadata for a run, resolved synchronously.
 *
 * publicExecutionRun is called from synchronous code all over the projection
 * layer, so this cannot be a dynamic import. The module is small and has no
 * cycle back into execution-run.
 */
function attachmentsForRunSync(runId) {
  if (!runId || !attachmentsModule) return [];
  return attachmentsModule.listRunAttachments(runId);
}

export function publicExecutionRun(run, { includeInstruction = false, includeTransitions = false } = {}) {
  if (!run) return null;
  // Attachments belong to the prompt, so they travel with the run projection —
  // metadata and an authenticated URL only, never bytes and never a real path.
  let attachments = [];
  try {
    attachments = attachmentsForRunSync(run.run_id);
  } catch { /* the conversation still renders without them */ }
  const out = {
    run_id: run.run_id,
    attachments,
    lane_id: run.lane_id,
    state: run.state,
    state_reason: run.state_reason || null,
    current_phase: run.current_phase || null,
    created_at: run.created_at,
    started_at: run.started_at || null,
    completed_at: run.completed_at || null,
    updated_at: run.updated_at,
    origin: run.origin || null,
    mission_id: run.mission_id || null,
    worktree_path: run.worktree_path || null,
    node_id: run.node_id || null,
    latest_progress: run.latest_progress || null,
    completion_report: run.completion_report || null,
    resource_wait: run.resource_wait || null,
    governed_action: run.governed_action || null,
    checkpoint_ready: Boolean(run.checkpoint_ready),
    checkpoint_summary: run.checkpoint_summary || null,
    last_worker_report_at: run.last_worker_report_at || null,
    worker_report_count: Number(run.worker_report_count) || 0,
    recovery_state: run.recovery_state || null,
    recovered_count: Number(run.recovered_count) || 0,
    output_fingerprint_at_send: run.output_fingerprint_at_send || null,
    delivery: run.delivery && typeof run.delivery === "object" ? run.delivery : null,
    // A completion that was later found unattributable stays visible as such.
    // Hiding it would leave the operator reading a green COMPLETE for work that
    // never ran.
    false_completion: run.false_completion || null,
    // The structured report that owns the visible assistant message. Projected
    // in full — a truncation here would defeat the whole contract.
    agent_report: run.agent_report || null,
    agent_report_count: Array.isArray(run.agent_reports) ? run.agent_reports.length : 0,
    provider_suspension: run.provider_suspension || null,
  };
  if (run.state === "ABANDONED") {
    const probe = executionRunRecoverability(run);
    out.recoverable = Boolean(probe.recoverable);
    out.recovery_blocked_reason = probe.recoverable ? null : probe.reason;
  }
  if (includeInstruction) out.instruction = run.instruction;
  if (includeTransitions) out.transitions = run.transitions || [];
  return out;
}

export function lastInstructionFromRun(run) {
  if (!run?.instruction) return null;
  if (!run.started_at) {
    if (run.state === "FAILED") {
      return {
        instruction: run.instruction,
        delivered_at: null,
        status: "failed",
        instruction_size: run.instruction.length,
        run_id: run.run_id,
        run_state: run.state,
        output_fingerprint_at_send: run.output_fingerprint_at_send || null,
      };
    }
    if (run.state !== "QUEUED") return null;
    return {
      instruction: run.instruction,
      delivered_at: null,
      queued_at: run.updated_at || run.created_at || null,
      status: "queued",
      instruction_size: run.instruction.length,
      run_id: run.run_id,
      run_state: run.state,
      output_fingerprint_at_send: run.output_fingerprint_at_send || null,
    };
  }
  return {
    instruction: run.instruction,
    delivered_at: run.started_at,
    status: "delivered",
    instruction_size: run.instruction.length,
    run_id: run.run_id,
    run_state: run.state,
    output_fingerprint_at_send: run.output_fingerprint_at_send || null,
    delivery: run.delivery && typeof run.delivery === "object" ? run.delivery : null,
  };
}

export function runListHint(run) {
  if (!run?.state) return null;
  switch (run.state) {
    case "NEEDS_INPUT": return "Needs input";
    case "FAILED": return "Failed";
    case "COMPLETE": return "Complete";
    case "ABANDONED": return "Abandoned";
    case "WAITING_RESOURCE": {
      if (run.governed_action && ["requested", "awaiting_director", "awaiting_operator", "executing"].includes(run.governed_action.status)) {
        return "Waiting on Director";
      }
      if (run.resource_wait?.resource_key === "director_governed_action") return "Waiting on Director";
      if (run.resource_wait?.resuming) {
        return `${run.resource_wait.label || "Resource"} available`;
      }
      if (run.resource_wait?.ready_to_resume) return "Ready to resume";
      const label = run.resource_wait?.label;
      if (label) {
        const s = String(label);
        return /^waiting\b/i.test(s) ? s : `Waiting for ${s}`;
      }
      return run.state_reason || "Waiting for resource";
    }
    case "VALIDATING": return "Validating";
    case "RECOVERING": return "Recovering";
    case "EXECUTING": return "Executing";
    case "QUEUED": return "Queued";
    default: return null;
  }
}

export function inspectLaneRun(laneId, root = runtimeRoot()) {
  const requested = String(laneId || "");
  const id = canonicalLaneStoreId(requested, root);
  if (!LANE_ID_RE.test(id) && !LANE_ID_RE.test(requested)) return { ok: false, error: "invalid_lane_id" };
  const runs = listExecutionRunsForLane(id, root);
  const active = activeRunForLane(id, root);
  const previous = !active ? runs.find((r) => isTerminalRunState(r.state)) : null;
  return {
    ok: true,
    lane_id: id,
    execution_run: publicExecutionRun(active, { includeInstruction: true, includeTransitions: true }),
    previous_run: publicExecutionRun(previous, { includeInstruction: true, includeTransitions: true }),
  };
}

export function attachLaneRuns(lanes, root = runtimeRoot(), { includeInstruction = false } = {}) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  const store = readExecutionRunStore(root);
  return list.map((lane) => {
    const id = lane?.lane_id;
    const pack = id
      ? (store.lanes[id] || store.lanes[canonicalLaneStoreId(id, root)] || (lane.aliases || []).map((a) => store.lanes[a]).find(Boolean) || null)
      : null;
    const currentId = pack?.current_run_id;
    const runs = pack?.runs || [];
    const current = currentId ? runs.find((r) => r.run_id === currentId) : null;
    const active = current && !isTerminalRunState(current.state) ? current : null;
    const previous = !active ? runs.find((r) => isTerminalRunState(r.state)) : null;
    if (!active && !previous) return lane;
    const last = lastInstructionFromRun(active) || lastInstructionFromRun(previous);
    return {
      ...lane,
      execution_run: active ? publicExecutionRun(active, { includeInstruction }) : null,
      previous_run: previous ? publicExecutionRun(previous) : null,
      last_instruction: last || lane.last_instruction,
    };
  });
}

export function createQueuedRun({
  laneId,
  instruction,
  worktreePath = null,
  nowMs = Date.now(),
  origin = "operator",
  root = runtimeRoot(),
} = {}) {
  const id = canonicalLaneStoreId(laneId, root);
  if (!LANE_ID_RE.test(id)) return { ok: false, error: "invalid_lane_id" };
  const text = String(instruction ?? "");
  if (!text.trim()) return { ok: false, error: "instruction_empty" };
  if (text.length > LANE_INSTRUCTION_MAX) return { ok: false, error: "instruction_too_large" };
  const store = readExecutionRunStore(root);
  const pack = store.lanes[id];
  const current = pack?.current_run_id
    ? (pack.runs || []).find((r) => r.run_id === pack.current_run_id)
    : null;
  if (current && !isTerminalRunState(current.state)) {
    return { ok: false, error: "current_run_active", run: publicExecutionRun(current) };
  }

  const resolvedOrigin = resolveRunOrigin(origin, text);
  const run = {
    schema_version: EXECUTION_RUN_SCHEMA,
    run_id: newRunId(id, nowMs),
    lane_id: id,
    instruction: text,
    created_at: iso(nowMs),
    started_at: null,
    completed_at: null,
    state: "QUEUED",
    current_phase: null,
    state_reason: null,
    origin: resolvedOrigin,
    latest_progress: null,
    completion_report: null,
    agent_session_id: null,
    resource_wait: null,
    recovery_state: null,
    last_worker_report_at: null,
    worker_report_count: 0,
    recovered_count: 0,
    worktree_path: worktreePath
      ? String(worktreePath)
      : (getDurableLane(id, root)?.binding?.worktree_path || null),
    node_id: localNodeId(root),
    mission_id: getDurableLane(id, root)?.mission_id || null,
    output_fingerprint_at_send: null,
    delivery: { acknowledged: false, provider: null, error: null, at: null },
    agent_report: null,
    agent_reports: [],
    provider_suspension: null,
    transitions: [],
    updated_at: iso(nowMs),
  };
  appendTransition(run, {
    from: null,
    to: "QUEUED",
    reason: resolvedOrigin === "certification" ? "certification_send" : "operator_send",
    origin: resolvedOrigin,
    nowMs,
  });
  writeStore(putRun(store, run), root);
  return { ok: true, run };
}

export function transitionExecutionRun(runId, toState, {
  reason = null,
  origin = "system",
  nowMs = Date.now(),
  root = runtimeRoot(),
  phase = undefined,
  progress = null,
  completion_report = null,
  resource_wait = null,
  fingerprint = null,
  worktreePath = null,
} = {}) {
  const store = readExecutionRunStore(root);
  let found = null;
  let packId = null;
  for (const [laneId, pack] of Object.entries(store.lanes || {})) {
    const hit = (pack.runs || []).find((r) => r.run_id === runId);
    if (hit) { found = hit; packId = laneId; break; }
  }
  if (!found) return { ok: false, error: "run_not_found" };
  const to = String(toState || "").toUpperCase();
  if (!RUN_STATES.includes(to)) return { ok: false, error: "invalid_state" };
  if (found.state === to) {
    // Same-state report. Not a transition, but still liveness evidence: persist
    // it so the stale governor can tell a working agent from an orphan.
    const touched = touchWorkerLiveness(found, { nowMs, origin, progress });
    if (touched || progress) {
      if (progress && !touched) {
        found.latest_progress = { summary: bound(progress, EXECUTION_RUN_SUMMARY_MAX), at: iso(nowMs) };
      }
      found.updated_at = iso(nowMs);
      if (phase !== undefined) found.current_phase = bound(phase, 80);
      writeStore(putRun(store, found), root);
    }
    // Retry push if the first dispatch never delivered. Dedup lives in lane-push.
    const push = ["COMPLETE", "NEEDS_INPUT", "FAILED", "ABANDONED"].includes(to)
      ? emitOutcomeEvent(found, root, { recordEvent: false })
      : Promise.resolve(null);
    return { ok: true, run: found, noop: true, heartbeat: touched, push };
  }
  if (!isLegalRunTransition(found.state, to)) {
    return { ok: false, error: "illegal_transition", from: found.state, to };
  }

  const from = found.state;
  found.state = to;
  found.state_reason = bound(reason, EXECUTION_RUN_REASON_MAX);
  found.updated_at = iso(nowMs);
  if (phase !== undefined) found.current_phase = bound(phase, 80);
  if (to === "EXECUTING" && !found.started_at) found.started_at = iso(nowMs);
  if (to === "COMPLETE" || to === "FAILED" || to === "ABANDONED") found.completed_at = iso(nowMs);
  if (progress) {
    found.latest_progress = { summary: bound(progress, EXECUTION_RUN_SUMMARY_MAX), at: iso(nowMs) };
  }
  if (completion_report) {
    found.completion_report = {
      // A bounded one-liner for rows and lists. It is NOT the user-facing final
      // message — that is agent_report.message, stored unbounded. The link back
      // lets a reader see which report this summary was cut from.
      summary: bound(completion_report.summary || completion_report, EXECUTION_RUN_SUMMARY_MAX),
      at: iso(nowMs),
      ...(completion_report.report_id ? { report_id: String(completion_report.report_id) } : {}),
    };
  }
  if (to === "WAITING_RESOURCE") {
    const key = resource_wait?.resource_key || resource_wait?.key || null;
    found.resource_wait = {
      resource_key: key ? String(key).slice(0, 80) : null,
      label: bound(resource_wait?.label || reason || key, 120),
      summary: bound(resource_wait?.summary || resource_wait?.purpose, 240),
      governed_request_id: resource_wait?.governed_request_id || null,
      action_key: resource_wait?.action_key || resource_wait?.actionKey || null,
      target: resource_wait?.target || null,
      purpose: bound(resource_wait?.purpose, 1000),
      artifact_refs: Array.isArray(resource_wait?.artifact_refs)
        ? resource_wait.artifact_refs.map(String).slice(0, 8)
        : (resource_wait?.artifact ? [String(resource_wait.artifact)] : null),
      reason_worker_cannot_execute: bound(
        resource_wait?.reason_worker_cannot_execute || resource_wait?.reasonWorkerCannotExecute,
        1000,
      ),
      requested_mode: resource_wait?.requested_mode || resource_wait?.requestedMode || null,
      mission_id: resource_wait?.mission_id || resource_wait?.missionId || null,
    };
  } else if (to !== "WAITING_RESOURCE" && from === "WAITING_RESOURCE") {
    found.resource_wait = found.resource_wait;
  }
  if (resource_wait?.governed_action) found.governed_action = resource_wait.governed_action;
  if (fingerprint) found.output_fingerprint_at_send = found.output_fingerprint_at_send || String(fingerprint);
  if (worktreePath && !found.worktree_path) found.worktree_path = String(worktreePath);
  touchWorkerLiveness(found, { nowMs, origin });
  appendTransition(found, { from, to, reason, origin, nowMs });
  writeStore(putRun(store, found), root);
  const push = emitOutcomeEvent(found, root);
  try {
    onExecutionRunTransition({
      run: found,
      from,
      to,
      resource: resource_wait,
      reason,
      origin,
      nowMs,
      root,
    });
  } catch { /* resource coordinator must not fail the run transition */ }
  return { ok: true, run: getExecutionRun(runId, root) || found, from, to, push };
}

export function patchRunFields(runId, fields = {}, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readExecutionRunStore(root);
  for (const pack of Object.values(store.lanes || {})) {
    const found = (pack.runs || []).find((r) => r.run_id === runId);
    if (!found) continue;
    if (fields.checkpoint_ready !== undefined) found.checkpoint_ready = Boolean(fields.checkpoint_ready);
    if (fields.checkpoint_summary !== undefined) found.checkpoint_summary = bound(fields.checkpoint_summary, 200);
    if (fields.checkpoint_requested !== undefined) found.checkpoint_requested = Boolean(fields.checkpoint_requested);
    if (fields.state_reason !== undefined) found.state_reason = fields.state_reason == null ? null : bound(fields.state_reason, EXECUTION_RUN_REASON_MAX);
    if (fields.governed_action !== undefined) found.governed_action = fields.governed_action || null;
    if (fields.recovery_state !== undefined) found.recovery_state = fields.recovery_state || null;
    if (fields.recovered_count !== undefined) found.recovered_count = Number(fields.recovered_count) || 0;
    if (fields.completed_at !== undefined) found.completed_at = fields.completed_at || null;
    if (fields.instruction !== undefined) {
      const text = String(fields.instruction ?? "");
      if (!text.trim()) return { ok: false, error: "instruction_empty" };
      if (text.length > LANE_INSTRUCTION_MAX) return { ok: false, error: "instruction_too_large" };
      found.instruction = text;
    }
    if (fields.delivery !== undefined && fields.delivery && typeof fields.delivery === "object") {
      found.delivery = { ...(found.delivery || {}), ...fields.delivery };
    }
    if (fields.output_fingerprint_at_send !== undefined) {
      found.output_fingerprint_at_send = fields.output_fingerprint_at_send
        ? String(fields.output_fingerprint_at_send)
        : found.output_fingerprint_at_send;
    }
    if (fields.false_completion !== undefined) {
      found.false_completion = fields.false_completion || null;
    }
    // Provider suspension (provider-suspension.mjs): the durable record of a
    // parked lane whose process was put down — question, resumable session and
    // correlation baseline, all kept so the work survives the computation.
    if (fields.provider_suspension !== undefined) {
      found.provider_suspension = fields.provider_suspension || null;
    }
    // Structured agent reports (execution-run-report.mjs). Stored verbatim:
    // the user-facing message must never be shortened on its way to disk.
    if (fields.agent_report !== undefined) {
      found.agent_report = fields.agent_report || null;
    }
    if (fields.agent_reports !== undefined) {
      found.agent_reports = Array.isArray(fields.agent_reports) ? fields.agent_reports : [];
    }
    found.updated_at = iso(nowMs);
    writeStore(putRun(store, found), root);
    return { ok: true, run: found };
  }
  return { ok: false, error: "run_not_found" };
}

export function patchRunResourceWait(runId, resourceWait, root = runtimeRoot()) {
  const store = readExecutionRunStore(root);
  for (const pack of Object.values(store.lanes || {})) {
    const found = (pack.runs || []).find((r) => r.run_id === runId);
    if (!found) continue;
    found.resource_wait = resourceWait || null;
    found.updated_at = iso();
    writeStore(putRun(store, found), root);
    return found;
  }
  return null;
}

export function cwdOwnsRun(run, cwd) {
  if (!run?.worktree_path || cwd == null || cwd === "") return false;
  const real = (p) => {
    try { return realpathSync(p); } catch { return resolve(String(p)); }
  };
  const root = real(run.worktree_path);
  const here = real(cwd);
  return here === root || here.startsWith(`${root}/`);
}

export const RECOVERY_MAX_PER_RUN = 8;

/**
 * Would recovery succeed right now? A dry run of recoverExecutionRun's ownership
 * gate, used by the UI so an ABANDONED run can be shown as recoverable and
 * offered a continuation action instead of forcing a fake new run.
 */
export function executionRunRecoverability(run, { root = null } = {}) {
  if (!run?.run_id) return { recoverable: false, reason: "no_run" };
  if (isIrreversibleRunState(run.state)) return { recoverable: false, reason: "irreversible" };
  if (run.state === "RECOVERING") return { recoverable: false, reason: "already_recovering" };
  if (run.state !== "ABANDONED") return { recoverable: false, reason: "not_abandoned" };
  const storeRoot = root || (findExecutionRun(run.run_id)?.root) || runtimeRoot();
  const lane = getDurableLane(run.lane_id, storeRoot);
  if (!lane) return { recoverable: false, reason: "lane_missing" };
  const bound = lane?.binding?.worktree_path || null;
  if (!run.worktree_path || !bound || realOrSelf(bound) !== realOrSelf(run.worktree_path)) {
    return { recoverable: false, reason: "binding_mismatch" };
  }
  const active = activeRunForLane(run.lane_id, storeRoot);
  if (active && active.run_id !== run.run_id) {
    return { recoverable: false, reason: "lane_has_active_run", active_run_id: active.run_id };
  }
  if ((Number(run.recovered_count) || 0) >= RECOVERY_MAX_PER_RUN) {
    return { recoverable: false, reason: "recovery_budget_exhausted" };
  }
  return { recoverable: true, reason: "ownership_provable", abandoned_reason: run.state_reason || null };
}

/**
 * Canonical ABANDONED -> RECOVERING path (Phase 3).
 *
 * Recovery is never automatic on state alone. It requires positive ownership
 * proof, so an abandoned run cannot be hijacked by another lane or worktree:
 *
 *   1. the run is ABANDONED (COMPLETE/FAILED stay irreversible);
 *   2. the durable lane still exists;
 *   3. the claimed lane matches the run's lane;
 *   4. the claimant proves worktree ownership (cwd inside the run's worktree),
 *      or is the operator acting on a lane whose binding still matches;
 *   5. the lane has no other active run to displace.
 *
 * History is never rewritten: the abandonment transition is preserved and the
 * recovery is appended after it.
 */
export function recoverExecutionRun(runId, {
  laneId = null,
  cwd = null,
  origin = "agent",
  reason = null,
  nowMs = Date.now(),
  root = null,
} = {}) {
  const found = root ? { run: getExecutionRun(runId, root), root } : findExecutionRun(runId);
  if (!found?.run) return { ok: false, error: "run_not_found" };
  const run = found.run;
  const storeRoot = found.root;

  if (isIrreversibleRunState(run.state)) {
    return { ok: false, error: "run_irreversible", state: run.state };
  }
  if (run.state === "RECOVERING") {
    // Idempotent: a duplicate recovery attempt is a no-op, not a second recovery.
    return { ok: true, run, already_recovering: true, noop: true };
  }
  if (run.state !== "ABANDONED") {
    return { ok: true, run, not_abandoned: true, noop: true };
  }

  const lane = getDurableLane(run.lane_id, storeRoot);
  if (!lane) return { ok: false, error: "lane_missing" };

  if (laneId) {
    const claimed = canonicalLaneStoreId(laneId, storeRoot);
    const owned = canonicalLaneStoreId(run.lane_id, storeRoot);
    if (claimed !== owned && String(laneId) !== run.lane_id) {
      return { ok: false, error: "lane_mismatch" };
    }
  }

  let proof = null;
  if (cwd) {
    if (!cwdOwnsRun(run, cwd)) return { ok: false, error: "worktree_mismatch" };
    proof = "worktree_cwd";
  } else if (origin === "operator") {
    const bound_ = lane?.binding?.worktree_path || null;
    if (!run.worktree_path || !bound_ || realOrSelf(bound_) !== realOrSelf(run.worktree_path)) {
      return { ok: false, error: "binding_mismatch" };
    }
    proof = "operator_binding";
  } else {
    return { ok: false, error: "ownership_unproven" };
  }

  const active = activeRunForLane(run.lane_id, storeRoot);
  if (active && active.run_id !== run.run_id) {
    return { ok: false, error: "lane_has_active_run", active_run_id: active.run_id };
  }
  if ((Number(run.recovered_count) || 0) >= RECOVERY_MAX_PER_RUN) {
    return { ok: false, error: "recovery_budget_exhausted" };
  }

  const abandonedAt = run.completed_at || run.updated_at;
  const out = transitionExecutionRun(run.run_id, "RECOVERING", {
    reason: reason || "ownership_proven_recovery",
    origin: origin === "operator" ? "operator" : "agent",
    nowMs,
    root: storeRoot,
  });
  if (!out.ok) return out;

  patchRunFields(run.run_id, {
    recovery_state: {
      recovered_at: iso(nowMs),
      abandoned_at: abandonedAt || null,
      abandoned_reason: run.state_reason || null,
      ownership_proof: proof,
      origin,
    },
    recovered_count: (Number(run.recovered_count) || 0) + 1,
    completed_at: null,
  }, { nowMs, root: storeRoot });

  appendRunEvent({
    type: "execution_run.recovered",
    run_id: run.run_id,
    lane_id: run.lane_id,
    ownership_proof: proof,
    abandoned_reason: run.state_reason || null,
    abandoned_at: abandonedAt || null,
    origin,
    at: iso(nowMs),
  }, storeRoot);

  return {
    ok: true,
    recovered: true,
    ownership_proof: proof,
    run: getExecutionRun(run.run_id, storeRoot) || out.run,
  };
}

function realOrSelf(p) {
  try { return realpathSync(String(p)); } catch { return resolve(String(p)); }
}

export function reportRunState(runId, state, {
  reason = null,
  summary = null,
  resource = null,
  resource_event = null,
  origin = "agent",
  cwd = null,
  expectedLaneId = null,
  nowMs = Date.now(),
  root = null,
  checkpoint_ready = false,
  checkpoint_summary = null,
  payload = null,
} = {}) {
  const found = root
    ? { run: getExecutionRun(runId, root), root }
    : findExecutionRun(runId);
  if (!found?.run) return { ok: false, error: "run_not_found" };
  const run = found.run;
  const storeRoot = found.root;
  if (expectedLaneId && run.lane_id !== expectedLaneId
      && canonicalLaneStoreId(run.lane_id, storeRoot) !== canonicalLaneStoreId(expectedLaneId, storeRoot)) {
    return { ok: false, error: "lane_mismatch" };
  }
  if (cwd && !cwdOwnsRun(run, cwd)) {
    return { ok: false, error: "worktree_mismatch" };
  }
  // Phase 3/4: a worker reporting on a run Vacilando abandoned is itself proof
  // the abandonment was wrong. Recover it (ownership already proven above by
  // lane + cwd) rather than answering illegal_transition and stranding a live
  // sprint with no way to reach COMPLETE.
  let autoRecovered = null;
  if (run.state === "ABANDONED") {
    const rec = recoverExecutionRun(run.run_id, {
      laneId: expectedLaneId || run.lane_id,
      cwd: cwd || null,
      origin: cwd ? "agent" : origin,
      reason: "worker_reported_on_abandoned_run",
      nowMs,
      root: storeRoot,
    });
    if (!rec.ok) return rec;
    autoRecovered = rec.recovered ? rec.ownership_proof : null;
    Object.assign(run, getExecutionRun(run.run_id, storeRoot) || run);
  }
  const ready = checkpoint_ready === true || String(checkpoint_ready).toLowerCase() === "true" || String(checkpoint_ready) === "1";
  if (ready) {
    patchRunFields(run.run_id, {
      checkpoint_ready: true,
      checkpoint_summary: checkpoint_summary || summary,
    }, { nowMs, root: storeRoot });
  }
  const to = state ? normalizeReportedState(state) : null;
  if (!to && ready) {
    return afterCheckpointReport({
      ok: true,
      run: getExecutionRun(run.run_id, storeRoot) || run,
    }, run.lane_id, storeRoot, nowMs, summary || checkpoint_summary);
  }
  if (!to || !REPORT_STATES.has(to)) return { ok: false, error: "invalid_state" };
  // A completion may only close an instruction that was actually delivered.
  // Without this, a report produced by an earlier turn can terminalize a run
  // whose instruction never reached the provider.
  if (to === "COMPLETE") {
    const admissible = runCompletionAdmissible(run);
    if (!admissible.ok) {
      return { ok: false, error: admissible.error, run: publicExecutionRun(run) };
    }
  }
  const progress = summary || (to === "NEEDS_INPUT" || to === "FAILED" || to === "COMPLETE" ? reason : null);
  const completion = to === "COMPLETE" || to === "FAILED" || to === "NEEDS_INPUT"
    ? { summary: summary || reason }
    : null;
  const waitExtra = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const out = transitionExecutionRun(run.run_id, to, {
    reason,
    origin,
    nowMs,
    root: storeRoot,
    phase: to === "VALIDATING" ? "validation" : (to === "WAITING_RESOURCE" ? "resource_wait" : undefined),
    progress,
    completion_report: completion,
    resource_wait: resource ? {
      resource_key: resource,
      label: reason || resource,
      ...waitExtra,
    } : null,
  });
  if (String(resource_event || "").toLowerCase() === "released" && out.ok) {
    cleanupRunResources(run.run_id, { origin, nowMs, root: storeRoot });
    out.resource_released = true;
    out.run = getExecutionRun(run.run_id, storeRoot) || out.run;
  }
  if (out.ok && to === "WAITING_RESOURCE" && !ready) {
    try {
      import("./source-control.mjs").then((scm) => scm.requestCheckpoint(run.lane_id, {
        origin: "resource_wait",
        nowMs,
        root: storeRoot,
      })).catch(() => {});
    } catch { /* */ }
  }
  if (autoRecovered && out.ok) out.recovered = autoRecovered;
  if (out.ok && ready) {
    return afterCheckpointReport(out, run.lane_id, storeRoot, nowMs, summary || checkpoint_summary);
  }
  return out;
}

function afterCheckpointReport(out, laneId, root, nowMs, summary) {
  import("./source-control.mjs").then((scm) => scm.maybeCreateCheckpoint({
    laneId,
    origin: "agent",
    summary,
    nowMs,
    root,
  })).then((checkpoint) => {
    out.checkpoint = checkpoint;
  }).catch(() => {});
  return out;
}

/**
 * Delivery truth. `delivery.acknowledged` is authoritative when present; runs
 * that predate the field fall back to started_at so history stays readable.
 */
export function runDeliveryAcknowledged(run) {
  if (!run) return false;
  if (run.delivery && typeof run.delivery === "object") return run.delivery.acknowledged === true;
  return Boolean(run.started_at);
}

/**
 * May this run be closed as COMPLETE?
 *
 * A completion is a claim about work that an agent did in response to a
 * specific instruction. If the instruction was never delivered, there is no
 * work to have completed — whatever produced the completion belongs to some
 * earlier turn. This is the guard that stops an old completion from closing a
 * newer instruction.
 */
export function runCompletionAdmissible(run) {
  if (!run) return { ok: false, error: "run_not_found" };
  // Either proof of delivery is enough, and both are needed as alternatives:
  // `delivery.acknowledged` is the modern receipt, `started_at` covers runs
  // that reached EXECUTING through recovery or an older code path. What neither
  // covers — and what this refuses — is a run that never started at all.
  if (runDeliveryAcknowledged(run) || run.started_at) return { ok: true, error: null };
  return { ok: false, error: "completion_before_delivery" };
}

/**
 * Record that this run's own receipt token was seen in newly advanced pane
 * output. Idempotent, and only ever moves false -> true.
 */
export function noteInstructionReceipt(runId, {
  text = "",
  fingerprint = null,
  nowMs = Date.now(),
  root = null,
} = {}) {
  const found = root ? { run: getExecutionRun(runId, root), root } : findExecutionRun(runId);
  if (!found?.run) return { ok: false, error: "run_not_found" };
  const run = found.run;
  if (!runReceiptToken(run)) return { ok: true, confirmed: false, reason: "no_receipt_token" };
  if (run.delivery?.receipt_confirmed === true) return { ok: true, confirmed: true, already: true, run };
  if (!textProvesInstructionReceipt(run, text, fingerprint)) {
    return { ok: true, confirmed: false, reason: "not_yet_observed", run };
  }
  const patched = patchRunFields(run.run_id, {
    delivery: {
      ...(run.delivery || {}),
      receipt_confirmed: true,
      receipt_confirmed_at: iso(nowMs),
    },
  }, { nowMs, root: found.root });
  return { ok: true, confirmed: true, run: patched.run || run };
}

/**
 * Reconcile a completion that was never attributable to its run. COMPLETE is
 * irreversible by law (see LEGAL) and this does not break that: the run stays
 * COMPLETE in the ledger and is marked superseded, with its instruction
 * preserved verbatim so the operator can retry it on a ready pane. A run that
 * is NOT yet terminal is failed outright with the same reason.
 */
export function supersedeFalseCompletion(runId, {
  reason = "provider_prompt_not_ready",
  origin = "system",
  nowMs = Date.now(),
  root = null,
} = {}) {
  const found = root ? { run: getExecutionRun(runId, root), root } : findExecutionRun(runId);
  if (!found?.run) return { ok: false, error: "run_not_found" };
  const run = found.run;
  const storeRoot = found.root;
  const preserved = String(run.instruction || "");
  if (run.false_completion?.superseded === true) {
    return { ok: true, already: true, mode: "superseded", run, retry_instruction: preserved };
  }
  if (isTerminalRunState(run.state)) {
    const patched = patchRunFields(run.run_id, {
      false_completion: {
        superseded: true,
        reason,
        at: iso(nowMs),
        prior_state: run.state,
        preserved_instruction: preserved,
      },
    }, { nowMs, root: storeRoot });
    return {
      ok: true,
      mode: "superseded",
      run: patched.run || run,
      retry_instruction: preserved,
    };
  }
  const failed = transitionExecutionRun(run.run_id, "FAILED", {
    reason,
    origin,
    nowMs,
    root: storeRoot,
    completion_report: { summary: `Superseded: ${reason}. Instruction preserved for retry.` },
  });
  if (failed.ok) {
    patchRunFields(run.run_id, {
      false_completion: {
        superseded: true,
        reason,
        at: iso(nowMs),
        prior_state: run.state,
        preserved_instruction: preserved,
      },
    }, { nowMs, root: storeRoot });
  }
  return {
    ok: failed.ok,
    mode: "failed",
    error: failed.ok ? null : failed.error,
    run: getExecutionRun(run.run_id, storeRoot) || run,
    retry_instruction: preserved,
  };
}

export function normalizeReportedState(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/-/g, "_");
  const map = {
    queued: "QUEUED",
    executing: "EXECUTING",
    waiting_resource: "WAITING_RESOURCE",
    validating: "VALIDATING",
    needs_input: "NEEDS_INPUT",
    recovering: "RECOVERING",
    complete: "COMPLETE",
    completed: "COMPLETE",
    failed: "FAILED",
    fail: "FAILED",
  };
  return map[s] || (RUN_STATES.includes(String(raw || "").toUpperCase()) ? String(raw).toUpperCase() : null);
}

export function executionEnvelope(runId, instruction, { laneId = null } = {}) {
  const vac = join(TOOLKIT_DIR, "vac");
  const laneFlag = laneId ? ` --lane ${laneId}` : "";
  return [
    `You are executing Vacilando run ${runId}.`,
    "",
    "Complete the approved instruction below.",
    "Report bounded execution-state changes with the Gateway-owned CLI (absolute path; do not rely on PATH `vac`):",
    `  ${vac} run-status ${runId} executing|validating|waiting-resource|needs-input|complete|failed [--reason \"...\"] [--summary \"...\"] [--resource <key>]${laneFlag}`,
    `When the turn is finished, you MUST file the last output: ${vac} run-status ${runId} complete --summary \"<last output>\"${laneFlag}. A turn is not complete without that summary.`,
    "When a coherent implementation checkpoint is reached, also report:",
    `  ${vac} run-status ${runId} executing --checkpoint-ready --summary \"feat(area): bounded commit subject\"${laneFlag}`,
    "When you need a Director-owned capability this lane cannot execute (for example a read-only database census), report:",
    `  ${vac} governed-action --run ${runId}${laneId ? ` --lane ${laneId}` : " --lane <lane_id>"} --json '{...}'`,
    "Do not retry a capability you have already proven this lane cannot execute.",
    "Do not ask the operator to paste SQL, credentials, or census results.",
    "Do not wait for the operator merely because a validation resource is temporarily unavailable.",
    "",
    "Approved instruction:",
    "---",
    String(instruction || ""),
    "---",
  ].join("\n");
}

export function resetExecutionRunsForTests(root = runtimeRoot()) {
  writeStore(emptyStore(), root);
  try {
    const p = executionRunEventsPath(root);
    if (existsSync(p)) writeFileSync(p, "", "utf8");
  } catch { /* */ }
  resetResourceRequestsForTests(root);
}
