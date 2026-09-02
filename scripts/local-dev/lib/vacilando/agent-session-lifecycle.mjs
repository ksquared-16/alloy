/**
 * Vacilando Governor Phase 6 — Agent Session lifecycle.
 *
 * Planned rotation and unexpected-death recovery for interactive Claude
 * inside a durable Development Lane. Never uses `claude -p`, never kills
 * the tmux session, never scrapes TUI chrome.
 *
 * Automatic context-percent rotation is the default product behavior.
 * Crossing 85% marks ROTATION_PENDING and rotates at the next safe
 * checkpoint. VACILANDO_AUTO_SESSION_ROTATION=0 disables automatic
 * rotation for diagnostics. Manual Refresh Claude Context remains.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { gitHead } from "./execution-evidence.mjs";
import {
  activeRunForLane,
  candidateRuntimeRoots,
  findExecutionRun,
  getExecutionRun,
  isTerminalRunState,
  transitionExecutionRun,
} from "./execution-run.mjs";
import { readResourceRequestStore } from "./execution-resource.mjs";
import { getDevelopmentLane, inferClaudePresence, LANE_INSTRUCTION_MAX, sendLaneInstruction, cursorExecutableTransport, CURSOR_DELIVERY_UNAVAILABLE } from "./lanes.mjs";
import { PROMPT_NOT_READY_ERROR } from "./provider-prompt-readiness.mjs";
import { collectClaudeSessionTelemetry } from "./providers/claude/telemetry.mjs";
import {
  activeAgentSessionForLane,
  agentSessionEventsPath,
  consumeLaneRestartBudget,
  createAgentSession,
  emitAgentSessionEvent,
  endAgentSession,
  laneEconomics,
  listCurrentAgentSessions,
  markAgentSessionActive,
  patchAgentSession,
  publicAgentSession,
} from "./agent-session.mjs";
import { peekLaneTelemetryCache } from "./lane-telemetry.mjs";
import { readExclusiveWindow } from "./execution-exclusive.mjs";
import { TOOLKIT_DIR } from "./workspace-facts.mjs";
import {
  bindDurableLane,
  findLaneByBinding,
  getDurableLane,
  isRuntimeAdoptionBlocked,
  listDurableLanes,
  setLanePreferredProvider,
  validateRuntimeBinding,
} from "./development-lane.mjs";
import { normalizeExecutionProvider } from "./execution-providers.mjs";
import { localNodeId } from "./execution-node.mjs";

export const ROTATION_POLICY = Object.freeze({
  auto_mode: "on",
  auto_threshold: "automatic",
  threshold_percent: 85,
  recommended_percent: 85,
  restart_budget: 1,
  handoff_max_age_ms: 30 * 60 * 1000,
  exit_wait_ms: 90_000,
});

export function autoSessionRotationEnabled() {
  const v = String(process.env.VACILANDO_AUTO_SESSION_ROTATION ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

export const UNSAFE_GRANTED_RESOURCES = Object.freeze([
  "browser_certification",
  "runtime_timing_certification",
  "validate",
]);

let sendImpl = null;
let observeImpl = null;
let spawnImpl = null;
let countImpl = null;
let telemetryImpl = null;
let startRuntimeImpl = null;
const rotationInflight = new Set();
const startInflight = new Set();
const advanceTimers = new Set();

export const FORBIDDEN_SPAWN_FLAGS = Object.freeze(["-p", "--print", "-c", "--continue", "-r", "--resume", "--tmux", "--fork-session"]);

export function setAgentSessionLifecycleImplForTests(impl = {}) {
  sendImpl = typeof impl.sendLaneInstruction === "function" ? impl.sendLaneInstruction : null;
  observeImpl = typeof impl.observeLane === "function" ? impl.observeLane : null;
  spawnImpl = typeof impl.spawnClaude === "function" ? impl.spawnClaude : null;
  countImpl = typeof impl.countClaude === "function" ? impl.countClaude : null;
  telemetryImpl = typeof impl.collectTelemetry === "function" ? impl.collectTelemetry : null;
  startRuntimeImpl = typeof impl.startRuntime === "function" ? impl.startRuntime : null;
}

export function resetAgentSessionLifecycleForTests() {
  sendImpl = null;
  observeImpl = null;
  spawnImpl = null;
  countImpl = null;
  telemetryImpl = null;
  startRuntimeImpl = null;
  rotationInflight.clear();
  startInflight.clear();
  for (const t of advanceTimers) clearTimeout(t);
  advanceTimers.clear();
}

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function agentHandoffStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "agent-handoffs.json");
}

function readHandoffs(root) {
  try {
    const raw = JSON.parse(readFileSync(agentHandoffStorePath(root), "utf8"));
    return {
      schema_version: "vacilando.agent_handoff.v1",
      handoffs: raw?.handoffs && typeof raw.handoffs === "object" ? raw.handoffs : {},
    };
  } catch {
    return { schema_version: "vacilando.agent_handoff.v1", handoffs: {} };
  }
}

function writeHandoffs(store, root) {
  atomicWrite(agentHandoffStorePath(root), store);
}

export function getHandoff(handoffId, root = runtimeRoot()) {
  return readHandoffs(root).handoffs[String(handoffId || "")] || null;
}

function bound(s, max = 2000) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function gitOut(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

export function captureGitTruth(worktreePath) {
  const cwd = String(worktreePath || "");
  if (!cwd || !existsSync(cwd)) {
    return { branch: null, head: null, dirty: null, porcelain: "", error: "missing_worktree" };
  }
  const porcelain = gitOut(cwd, ["status", "--porcelain"]);
  const lines = porcelain.split("\n").filter(Boolean);
  return {
    branch: gitOut(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || null,
    head: gitHead(cwd) || null,
    dirty: lines.length > 0,
    porcelain,
    modified_count: lines.filter((l) => !l.startsWith("??")).length,
    untracked_count: lines.filter((l) => l.startsWith("??")).length,
  };
}

export function evaluateRotationNeed(telemetry) {
  const pct = telemetry?.context?.percent_used;
  if (!Number.isFinite(pct)) {
    return { kind: "none", unknown: true, reason: "Context unavailable" };
  }
  if (pct >= ROTATION_POLICY.threshold_percent) {
    if (!autoSessionRotationEnabled()) {
      return {
        kind: "recommended",
        reason: `Context ${Math.round(pct)}%. Fresh session recommended`,
        percent_used: pct,
      };
    }
    return {
      kind: "safe_automatic",
      reason: `Context ${Math.round(pct)}%. Refresh pending · waiting for a safe checkpoint`,
      percent_used: pct,
    };
  }
  return { kind: "none", percent_used: pct };
}

function telemetryAppliesToSession(telemetry, session) {
  const telId = telemetry?.agent?.session_id;
  const sid = session?.provider_session_id;
  if (telId && sid && telId !== sid) return false;
  return true;
}

function grantedUnsafe(run, root) {
  if (!run?.run_id) return null;
  const store = readResourceRequestStore(root);
  const rec = (store.requests || []).find((r) =>
    r.run_id === run.run_id
    && r.state === "GRANTED"
    && UNSAFE_GRANTED_RESOURCES.includes(r.resource_key)
  );
  return rec || null;
}

function deliveringContinuation(run, root) {
  if (!run?.run_id) return null;
  return (readResourceRequestStore(root).requests || []).find((r) =>
    r.run_id === run.run_id && r.continuation?.delivery_state === "DELIVERING"
  ) || null;
}

function ambiguousContinuation(run, root) {
  if (!run?.run_id) return null;
  return (readResourceRequestStore(root).requests || []).find((r) => {
    if (r.run_id !== run.run_id) return false;
    const st = r.continuation?.delivery_state;
    return st === "AMBIGUOUS" || r.continuation?.ambiguous === true;
  }) || null;
}

function exclusiveTimingGranted(run, root) {
  if (!run?.run_id) return null;
  return (readResourceRequestStore(root).requests || []).find((r) =>
    r.run_id === run.run_id
    && r.state === "GRANTED"
    && r.resource_key === "runtime_timing_certification"
  ) || null;
}

export function evaluateSafeCheckpoint({ lane, run, root = runtimeRoot() } = {}) {
  const blockers = [];
  if (!lane?.lane_id) blockers.push({ code: "missing_lane", detail: "Lane identity required" });
  if (run && isTerminalRunState(run.state)) blockers.push({ code: "run_terminal", detail: `Run is ${run.state}` });
  if (deliveringContinuation(run, root)) {
    blockers.push({ code: "continuation_delivering", detail: "A resource continuation is still delivering" });
  }
  if (ambiguousContinuation(run, root)) {
    blockers.push({ code: "continuation_ambiguous", detail: "Continuation delivery is ambiguous" });
  }
  const granted = grantedUnsafe(run, root);
  if (run?.state === "VALIDATING" && granted) {
    blockers.push({
      code: "unsafe_resource_phase",
      detail: `${granted.resource_key} is GRANTED during VALIDATING`,
    });
  }
  if (exclusiveTimingGranted(run, root) || granted?.resource_key === "runtime_timing_certification") {
    blockers.push({ code: "exclusive_active", detail: "Exclusive timing window is active" });
  }
  try {
    const win = readExclusiveWindow(root);
    if (win?.phase === "EXCLUSIVE_ACTIVE") {
      blockers.push({ code: "exclusive_active", detail: "Machine-exclusive timing work is active" });
    }
  } catch { /* exclusive snapshot is advisory */ }
  if (run?.destructive_in_flight || run?.unsafe_operation) {
    blockers.push({ code: "unsafe_operation_in_flight", detail: "An unsafe or destructive operation is in flight" });
  }
  return {
    ok: blockers.length === 0,
    blockers,
    dirty_ok: true,
  };
}

export function sessionReportHelperPath(_worktreePath) {
  const toolkit = join(TOOLKIT_DIR, "vac-session-report.mjs");
  if (existsSync(toolkit)) return toolkit;
  return join(String(_worktreePath || ""), "scripts", "local-dev", "vac-session-report.mjs");
}

function jsonFlag(obj) {
  return `'${JSON.stringify(obj).replace(/'/g, "'\\''")}'`;
}

export function buildIdleRefreshInstruction({ lane, git, handoffId }) {
  return [
    "Vacilando is refreshing this Claude session.",
    "",
    "There is no active Execution Run. Do not modify files or begin new work.",
    `Development Lane: ${lane?.lane_id || ""}`,
    git?.branch ? `Observed branch: ${git.branch}` : "",
    git?.head ? `Observed HEAD: ${git.head}` : "",
    "",
    "Exit Claude Code cleanly. Leave tmux running.",
    handoffId ? `Refresh id: ${handoffId}` : "",
  ].filter(Boolean).join("\n");
}

export function buildIdleOrientationInstruction({ lane, git, successorSessionId }) {
  return [
    "Vacilando refreshed the Claude session for this Development Lane.",
    "",
    "There is no active Execution Run. Wait for the next operator instruction.",
    "Do not modify files until instructed.",
    `Lane: ${lane?.lane_id || ""}`,
    successorSessionId ? `Agent session: ${successorSessionId}` : "",
    git?.branch ? `Branch: ${git.branch}` : "",
  ].filter(Boolean).join("\n");
}

export function buildHandoffRequestInstruction({ run, git, handoffId }) {
  const helper = sessionReportHelperPath(run.worktree_path || git?.worktree || "");
  const payload = {
    handoff_id: handoffId,
    completed_work: "<what has been completed>",
    remaining_work: "<what remains>",
    current_phase: "<current phase>",
    validation_state: "<validation/resource state>",
    resource_state: "<resource state>",
    known_blockers: "<blockers>",
    important_decisions: "<decisions>",
    recent_files: "<recent files/areas>",
    next_action: "<exact recommended next action>",
  };
  return [
    "Vacilando session-rotation checkpoint.",
    "",
    "Do not modify files or begin new work.",
    `You are executing Vacilando run ${run.run_id} on Development Lane ${run.lane_id}.`,
    "Produce the required structured continuation handoff for the current Execution Run.",
    "",
    "Include:",
    "- what has been completed",
    "- what remains",
    "- validation/resource state",
    "- blockers/decisions",
    "- current Git/worktree state",
    "- exact recommended next action",
    "",
    "Report HANDOFF_READY with the Gateway-owned helper from this worktree. Do not paste the transcript.",
    `Handoff id: ${handoffId}`,
    git?.branch ? `Observed branch: ${git.branch}` : "",
    git?.head ? `Observed HEAD: ${git.head}` : "",
    "",
    `node ${JSON.stringify(helper)} handoff --run ${run.run_id} --lane ${run.lane_id} --json ${jsonFlag(payload)}`,
    "",
    "After the handoff is accepted, exit Claude Code cleanly. Leave tmux running.",
  ].filter(Boolean).join("\n");
}

function boundOrientationField(value, max) {
  const s = String(value || "");
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 16))}\n…[truncated]`;
}

export function buildContinuationInstruction({ run, handoff, git, successorSessionId, recovery = false }) {
  const queued = run?.state === "QUEUED";
  const approved = queued
    ? "Approved instruction is already queued on this Execution Run. Do not start it until you report ORIENTED. Vacilando pastes it after orientation."
    : boundOrientationField(run?.instruction, 6000);
  const remaining = queued
    ? "Report ORIENTED, then Vacilando delivers the queued instruction."
    : boundOrientationField(handoff?.remaining_work, 2000);
  const lines = [
    recovery
      ? "Vacilando recovered this Development Lane after the previous Claude session ended unexpectedly."
      : "Vacilando refreshed the Claude session for this Development Lane.",
    "",
    "Orient first. Do not modify files until you report ORIENTED.",
    `Lane: ${run.lane_id}`,
    `Execution Run: ${run.run_id} (unchanged)`,
    `Agent session: ${successorSessionId}`,
    `Worktree: ${run.worktree_path || git?.worktree || ""}`,
    `Branch (Vacilando-observed): ${git?.branch || "unknown"}`,
    `HEAD (Vacilando-observed): ${git?.head || "unknown"}`,
    `Git dirty: ${git?.dirty ? "yes" : "no"}`,
    `Run state: ${run.state}`,
    "",
    "Approved instruction:",
    "---",
    approved,
    "---",
    "",
    "Structured handoff:",
    JSON.stringify({
      completed_work: boundOrientationField(handoff?.completed_work, 1200),
      remaining_work: remaining,
      current_phase: handoff?.current_phase || run.current_phase || run.state,
      validation_state: boundOrientationField(handoff?.validation_state, 400),
      resource_state: boundOrientationField(handoff?.resource_state, 400),
      known_blockers: boundOrientationField(handoff?.known_blockers, 400),
      important_decisions: boundOrientationField(handoff?.important_decisions, 800),
      recent_files: boundOrientationField(handoff?.recent_files, 400),
      next_action: handoff?.next_action || "",
    }, null, 2),
    "",
    recovery
      ? "Inspect current Git and worktree state and reconcile before any mutation. Do not assume the previous session's last thought is still true."
      : (queued
        ? "After orientation, Vacilando delivers the queued instruction on this same Execution Run."
        : "After orientation, continue the same Execution Run from next_action."),
    "Report ORIENTED with the Gateway-owned helper once lane, run, worktree, branch, and next action match.",
    `node ${JSON.stringify(sessionReportHelperPath(run.worktree_path || git?.worktree || ""))} oriented --run ${run.run_id} --lane ${run.lane_id} --json ${jsonFlag({
      lane: run.lane_id,
      run: run.run_id,
      worktree: run.worktree_path || git?.worktree || "",
      branch: git?.branch || "",
      current_phase: handoff?.current_phase || run.current_phase || run.state,
      next_action: handoff?.next_action || "",
    })}`,
  ];
  const text = lines.join("\n");
  if (text.length <= LANE_INSTRUCTION_MAX) return text;
  return boundOrientationField(text, LANE_INSTRUCTION_MAX);
}

export async function requestSessionRotation({
  laneId,
  origin = "operator",
  confirm = false,
  nowMs = Date.now(),
  root = runtimeRoot(),
  lane = null,
} = {}) {
  if (origin === "operator" && confirm !== true) {
    return { ok: false, error: "confirm_required" };
  }
  const found = lane || (await getDevelopmentLane(laneId, { includeGitFacts: true })).lane;
  if (!found) return { ok: false, error: "lane_not_found" };
  try {
    const { requestCheckpoint } = await import("./source-control.mjs");
    await requestCheckpoint(found.lane_id, { origin: "session_rotation", nowMs, root });
  } catch { /* checkpoint is preferred, never required for rotation */ }
  const run = activeRunForLane(found.lane_id, root);
  const check = evaluateSafeCheckpoint({ lane: found, run, root });
  if (!check.ok) {
    if (origin === "automatic") {
      emitAgentSessionEvent("rotation_deferred", { lane_id: found.lane_id, run_id: run?.run_id }, root, {
        blockers: check.blockers,
        origin,
      });
      return { ok: false, error: "deferred", deferred: true, blockers: check.blockers };
    }
    emitAgentSessionEvent("rotation_failed", { lane_id: found.lane_id, run_id: run?.run_id }, root, {
      error: check.blockers[0]?.code,
      blockers: check.blockers,
    });
    return { ok: false, error: "unsafe_checkpoint", blockers: check.blockers };
  }
  if (!laneClaudePresent(found)) {
    if (origin === "automatic") {
      emitAgentSessionEvent("rotation_deferred", { lane_id: found.lane_id, run_id: run?.run_id }, root, {
        error: "claude_absent",
        origin,
      });
      return { ok: false, error: "claude_absent", deferred: true };
    }
    if (origin === "operator" && confirm === true) {
      const existing = activeAgentSessionForLane(found.lane_id, root);
      if (!existing) return startLaneAgentSession({ laneId: found.lane_id, nowMs, root });
      return recoverDeadAgentSession({ laneId: found.lane_id, nowMs, root });
    }
    return { ok: false, error: "claude_absent", detail: "Planned rotation needs a live Claude session" };
  }
  let session = activeAgentSessionForLane(found.lane_id, root);
  if (!session) {
    const created = createAgentSession({
      laneId: found.lane_id,
      runId: run?.run_id || null,
      nowMs,
      root,
    });
    if (!created.ok) return created;
    session = markAgentSessionActive(created.session.agent_session_id, { root }) || created.session;
  }
  const git = captureGitTruth(found.worktree?.path || run?.worktree_path);
  const handoffId = `ahf_${randomUUID().slice(0, 12)}`;
  const store = readHandoffs(root);
  store.handoffs[handoffId] = {
    handoff_id: handoffId,
    lane_id: found.lane_id,
    run_id: run?.run_id || null,
    from_session_id: session.agent_session_id,
    created_at: iso(nowMs),
    state: "requested",
    git_truth: git,
  };
  writeHandoffs(store, root);
  patchAgentSession(session.agent_session_id, {
    state: "HANDOFF",
    handoff_id: handoffId,
    run_id: run?.run_id || null,
  }, { root, event: "rotation_requested", extra: { origin, handoff_id: handoffId } });
  emitAgentSessionEvent("rotation_started", session, root, { handoff_id: handoffId, origin });
  emitAgentSessionEvent("handoff_requested", session, root, { handoff_id: handoffId, origin });
  const instruction = run
    ? buildHandoffRequestInstruction({ run, git, handoffId })
    : buildIdleRefreshInstruction({ lane: found, git, handoffId });
  const send = sendImpl || sendLaneInstruction;
  const delivered = await send(found.lane_id, instruction, {
    actor: "governor",
    dedupeKey: `handoff:${handoffId}`,
  });
  if (!delivered?.ok) {
    // The session was patched to HANDOFF before the instruction was delivered,
    // so a refused paste left it there with the handoff still "requested" —
    // and maybeAdvanceSessionRotation only ever aborts a handoff that reached
    // "ready". The session stayed HANDOFF forever. Rotation that could not
    // start must put the session back exactly as it found it.
    const rec = readHandoffs(root);
    if (rec.handoffs[handoffId]) {
      rec.handoffs[handoffId].state = "failed";
      rec.handoffs[handoffId].failed_at = iso(nowMs);
      rec.handoffs[handoffId].error = delivered?.error || "handoff_delivery_failed";
      writeHandoffs(rec, root);
    }
    const promptBlocked = delivered?.error === PROMPT_NOT_READY_ERROR;
    restoreSessionAfterFailedRotation(session, {
      root,
      error: promptBlocked ? PROMPT_NOT_READY_ERROR : "handoff_delivery_failed",
      escalate: !promptBlocked,
      extra: {
        origin,
        handoff_id: handoffId,
        reason: promptBlocked
          ? "Context refresh could not start: the agent terminal is showing a prompt that must be answered there."
          : undefined,
      },
    });
    return {
      ok: false,
      error: "handoff_delivery_failed",
      delivery: delivered,
      handoff_id: handoffId,
      session_restored: "ACTIVE",
    };
  }
  if (!run) {
    const rec = store.handoffs[handoffId];
    rec.state = "ready";
    rec.ready_at = iso(nowMs);
    rec.payload = {
      completed_work: "Idle session refresh; no active Execution Run.",
      remaining_work: "Wait for the next operator instruction.",
      next_action: "Do not begin work until an instruction is sent.",
      current_phase: "idle",
    };
    rec.git_truth = git;
    writeHandoffs(store, root);
    scheduleSessionRotationAdvance(found.lane_id, root);
  }
  return {
    ok: true,
    phase: "HANDOFF",
    handoff_id: handoffId,
    agent_session_id: session.agent_session_id,
    run_id: run?.run_id || null,
    lane_id: found.lane_id,
  };
}

function resolveRunContext({ runId, laneId, root = null } = {}) {
  if (root) {
    const run = (runId && getExecutionRun(runId, root)) || activeRunForLane(laneId, root);
    return run ? { run, root } : null;
  }
  if (runId) {
    const hit = findExecutionRun(runId);
    if (hit?.run) return hit;
  }
  for (const r of candidateRuntimeRoots()) {
    const run = activeRunForLane(laneId, r);
    if (run) return { run, root: r };
  }
  return null;
}

function restoreSessionAfterFailedRotation(session, { root, error, extra = {}, escalate = true } = {}) {
  if (!session?.agent_session_id) return;
  const trigger = session.rotation_trigger && typeof session.rotation_trigger === "object"
    ? { ...session.rotation_trigger, attempted: true }
    : session.rotation_trigger;
  patchAgentSession(session.agent_session_id, {
    state: "ACTIVE",
    rotation_trigger: trigger,
  }, { root, event: "rotation_failed", extra: { error, ...extra } });
  emitAgentSessionEvent("rotation_failed", session, root, { error, ...extra });
  const auto = trigger?.origin === "automatic" || extra.origin === "automatic";
  const run = session.run_id ? getExecutionRun(session.run_id, root) : null;
  // A rotation blocked by a terminal dialog must NOT escalate the run to
  // NEEDS_INPUT. That is the same trap the send path just stopped setting: the
  // operator cannot answer a Claude permission prompt from the composer, and a
  // NEEDS_INPUT run is protected from the governor. The work is still fine —
  // it is the terminal that needs a person, which the provider-health banner
  // and Details already say.
  if (escalate && auto && run) {
    escalateNeedsInput(run, extra.reason || `Automatic context rotation failed: ${error}`, Date.now(), root).catch(() => {});
  }
}

function scheduleSessionRotationAdvance(laneId, root) {
  if (process.env.VACILANDO_SKIP_SESSION_ADVANCE === "1") return;
  const key = `${laneId}:${root}`;
  if ([...advanceTimers].some((t) => t._vacKey === key)) return;
  const timer = setTimeout(() => {
    advanceTimers.delete(timer);
    completeSessionRotation({ laneId, root, waitOutgoing: true }).catch(() => {});
  }, 400);
  timer._vacKey = key;
  advanceTimers.add(timer);
  if (typeof timer.unref === "function") timer.unref();
}

export function acceptHandoffReport({
  laneId,
  runId,
  handoff,
  cwd = null,
  nowMs = Date.now(),
  root = null,
} = {}) {
  const found = resolveRunContext({ runId, laneId, root });
  if (!found?.run) return { ok: false, error: "run_not_found" };
  const run = found.run;
  root = found.root;
  if (laneId && run.lane_id !== laneId) return { ok: false, error: "lane_mismatch" };
  const session = activeAgentSessionForLane(run.lane_id, root);
  if (!session) return { ok: false, error: "session_not_found" };
  const hid = handoff?.handoff_id || session.handoff_id;
  const store = readHandoffs(root);
  const rec = store.handoffs[hid];
  if (!rec) return { ok: false, error: "handoff_not_found" };
  if (rec.from_session_id !== session.agent_session_id) return { ok: false, error: "stale_handoff" };
  if (rec.lane_id !== run.lane_id || rec.run_id !== run.run_id) return { ok: false, error: "stale_handoff" };
  const age = nowMs - Date.parse(rec.created_at || "") ;
  if (Number.isFinite(age) && age > ROTATION_POLICY.handoff_max_age_ms) {
    return { ok: false, error: "stale_handoff" };
  }
  const git = captureGitTruth(cwd || run.worktree_path);
  const descriptive = {
    approved_instruction: bound(run.instruction, 4000),
    current_execution_state: run.state,
    current_phase: bound(handoff?.current_phase || run.current_phase || run.state, 200),
    completed_work: bound(handoff?.completed_work, 4000),
    remaining_work: bound(handoff?.remaining_work, 4000),
    validation_state: bound(handoff?.validation_state, 1000),
    resource_state: bound(handoff?.resource_state, 1000),
    known_blockers: bound(handoff?.known_blockers, 2000),
    important_decisions: bound(handoff?.important_decisions, 2000),
    recent_files: bound(handoff?.recent_files, 2000),
    next_action: bound(handoff?.next_action || "Inspect current state and continue the approved instruction", 1000),
    provider_notes: bound(handoff?.provider_notes, 1000),
  };
  rec.state = "ready";
  rec.ready_at = iso(nowMs);
  rec.payload = descriptive;
  rec.git_truth = git;
  rec.substrate_overrides = [];
  if (handoff?.git_state && /clean/i.test(String(handoff.git_state)) && git.dirty) {
    rec.substrate_overrides.push("git_dirty");
  }
  writeHandoffs(store, root);
  patchAgentSession(session.agent_session_id, { handoff_id: hid }, { root, event: "handoff_ready" });
  emitAgentSessionEvent("handoff_ready", session, root, { handoff_id: hid });
  scheduleSessionRotationAdvance(run.lane_id, root);
  return { ok: true, handoff: rec, git };
}

async function observeLane(laneId, opts) {
  if (observeImpl) return observeImpl(laneId, opts);
  const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
  return found.ok ? found.lane : null;
}

function laneProviderKind(lane, rec) {
  return normalizeExecutionProvider(
    rec?.preferred_provider || rec?.binding?.provider || lane?.binding?.provider || rec?.provider,
    "claude",
  ) || "claude";
}

function cursorSessionLive(rec, lane) {
  if (!rec || !["ACTIVE", "STARTING", "VERIFYING", "RESTARTING", "HANDOFF"].includes(rec.state)) return false;
  return rec.provider === "cursor" || laneProviderKind(lane, rec) === "cursor";
}

export function laneClaudePresent(lane) {
  if (!lane) return false;
  if (lane.tmux && lane.tmux.alive === false) return false;
  if (lane.claude?.presence === "present") return true;
  if (lane.tmux && inferClaudePresence(lane.tmux) === "present") return true;
  const panes = Array.isArray(lane.tmux?.panes) ? lane.tmux.panes : [];
  return panes.some((p) => inferClaudePresence(p) === "present");
}

function countClaudeOnLane(lane) {
  if (countImpl) return countImpl(lane);
  const panes = Array.isArray(lane?.tmux?.panes) ? lane.tmux.panes : null;
  if (panes) return panes.filter((p) => inferClaudePresence(p) === "present").length;
  return laneClaudePresent(lane) ? 1 : 0;
}

function spawnArgv(sessionId) {
  return ["claude", "--session-id", sessionId];
}

function assertSafeSpawnArgv(argv) {
  const list = Array.isArray(argv) ? argv : [];
  const bad = list.filter((a) => FORBIDDEN_SPAWN_FLAGS.includes(String(a)));
  return bad.length ? { ok: false, error: "forbidden_spawn_flag", flags: bad } : { ok: true };
}

async function spawnClaudeInPane({ lane, sessionId }) {
  const argv = spawnArgv(sessionId);
  const forbidden = assertSafeSpawnArgv(argv);
  if (!forbidden.ok) return forbidden;
  if (spawnImpl) return spawnImpl({ lane, sessionId, argv });
  const pane = lane?.tmux?.pane_id;
  const cwd = lane?.worktree?.path;
  if (!pane || !cwd) return { ok: false, error: "missing_pane" };
  try {
    execFileSync("tmux", [
      "respawn-pane", "-k", "-c", cwd, "-t", pane, "--",
      ...argv,
    ], { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, provider_session_id: sessionId, argv };
  } catch (e) {
    return { ok: false, error: "spawn_failed", detail: String(e.stderr || e.message || e).slice(0, 300) };
  }
}

async function escalateNeedsInput(run, reason, nowMs, root) {
  if (!run?.run_id || isTerminalRunState(run.state)) return;
  try {
    transitionExecutionRun(run.run_id, "NEEDS_INPUT", {
      reason,
      origin: "governor",
      nowMs,
      root,
      completion_report: { summary: reason },
    });
  } catch { /* */ }
}

export async function completeSessionRotation({
  laneId,
  nowMs = Date.now(),
  root = runtimeRoot(),
  waitOutgoing = true,
} = {}) {
  if (rotationInflight.has(laneId)) return { ok: true, phase: "IN_FLIGHT" };
  const session = activeAgentSessionForLane(laneId, root);
  if (!session) return { ok: false, error: "session_not_found" };
  if (session.state === "VERIFYING" || session.state === "RESTARTING") {
    return { ok: true, phase: session.state, already: true, agent_session_id: session.agent_session_id, run_id: session.run_id };
  }
  if (session.state !== "HANDOFF" || !session.handoff_id) return { ok: false, error: "handoff_missing" };
  const handoff = getHandoff(session.handoff_id, root);
  if (handoff?.state !== "ready") return { ok: false, error: "handoff_not_ready" };
  const run = session.run_id ? getExecutionRun(session.run_id, root) : null;
  if (session.run_id && !run) return { ok: false, error: "run_not_found" };
  const laneHint = await observeLane(laneId);
  const worktree = run?.worktree_path || laneHint?.worktree?.path || null;
  const git = handoff.git_truth || captureGitTruth(worktree);
  rotationInflight.add(laneId);
  try {
    if (waitOutgoing) {
      const deadline = Date.now() + (observeImpl ? 40 : ROTATION_POLICY.exit_wait_ms);
      let gone = false;
      while (Date.now() < deadline) {
        const lane = await observeLane(laneId);
        if (!laneClaudePresent(lane)) {
          gone = true;
          break;
        }
        await new Promise((r) => setTimeout(r, observeImpl ? 5 : 500));
      }
      if (!gone) {
        const laneNow = await observeLane(laneId);
        if (laneClaudePresent(laneNow)) {
          restoreSessionAfterFailedRotation(session, { root, error: "outgoing_still_present" });
          return { ok: false, error: "outgoing_still_present" };
        }
      }
    }

    const tel = telemetryImpl
      ? await telemetryImpl({ cwd: worktree })
      : collectClaudeSessionTelemetry({ cwd: worktree });
    endAgentSession(session.agent_session_id, {
      reason: "planned_rotation",
      nowMs,
      root,
      telemetry: tel?.available ? tel : null,
    });

    const lane = await observeLane(laneId);
    if (!lane) return { ok: false, error: "lane_not_found" };
    if (countClaudeOnLane(lane) > 0) {
      restoreSessionAfterFailedRotation(session, { root, error: "outgoing_still_present" });
      return { ok: false, error: "outgoing_still_present", detail: "Outgoing Claude still owns the pane" };
    }

    const providerSessionId = randomUUID();
    const created = createAgentSession({
      laneId,
      runId: run?.run_id || null,
      providerSessionId,
      nowMs,
      root,
      predecessorSessionId: session.agent_session_id,
    });
    if (!created.ok) {
      if (run) await escalateNeedsInput(run, "Could not create replacement Agent Session", nowMs, root);
      return created;
    }
    patchAgentSession(session.agent_session_id, {
      successor_session_id: created.session.agent_session_id,
      state: "ENDED",
      ended_at: iso(nowMs),
      end_reason: "planned_rotation",
    }, { root, event: "replacement_started" });
    patchAgentSession(created.session.agent_session_id, { state: "RESTARTING", handoff_id: handoff.handoff_id }, { root });

    const spawned = await spawnClaudeInPane({ lane, sessionId: providerSessionId });
    if (!spawned.ok) {
      patchAgentSession(created.session.agent_session_id, { state: "FAILED" }, { root, event: "rotation_failed" });
      if (run) await escalateNeedsInput(run, "Replacement Claude failed to start", nowMs, root);
      return { ok: false, error: "replacement_start_failed", spawn: spawned };
    }

    const after = await observeLane(laneId);
    const n = countClaudeOnLane(after || lane);
    if (n > 1) {
      patchAgentSession(created.session.agent_session_id, { state: "FAILED" }, { root, event: "rotation_failed" });
      if (run) await escalateNeedsInput(run, "Duplicate Claude detected after replacement", nowMs, root);
      return { ok: false, error: "duplicate_claude" };
    }

    const send = sendImpl || sendLaneInstruction;
    if (!run) {
      markAgentSessionActive(created.session.agent_session_id, {
        root,
        providerSessionId: spawned.provider_session_id || providerSessionId,
      });
      const idleInstruction = buildIdleOrientationInstruction({
        lane,
        git,
        successorSessionId: created.session.agent_session_id,
      });
      const delivered = await send(laneId, idleInstruction, {
        actor: "governor",
        dedupeKey: `orient:${created.session.agent_session_id}`,
      });
      emitAgentSessionEvent("orientation_verified", created.session, root, { idle: true });
      emitAgentSessionEvent("rotation_completed", created.session, root, { idle: true });
      if (!delivered?.ok) {
        return { ok: false, error: "orientation_delivery_failed", delivery: delivered, session: created.session };
      }
      return {
        ok: true,
        phase: "ACTIVE",
        predecessor_session_id: session.agent_session_id,
        agent_session_id: created.session.agent_session_id,
        provider_session_id: spawned.provider_session_id || providerSessionId,
        run_id: null,
        git,
      };
    }

    patchAgentSession(created.session.agent_session_id, {
      state: "VERIFYING",
      provider_session_id: spawned.provider_session_id || providerSessionId,
    }, { root });
    const instruction = buildContinuationInstruction({
      run,
      handoff: handoff.payload,
      git,
      successorSessionId: created.session.agent_session_id,
    });
    const delivered = await send(laneId, instruction, {
      actor: "governor",
      dedupeKey: `orient:${created.session.agent_session_id}`,
    });
    if (!delivered?.ok) {
      return { ok: false, error: "orientation_delivery_failed", delivery: delivered, session: created.session };
    }
    return {
      ok: true,
      phase: "VERIFYING",
      predecessor_session_id: session.agent_session_id,
      agent_session_id: created.session.agent_session_id,
      provider_session_id: spawned.provider_session_id || providerSessionId,
      run_id: run.run_id,
      git,
    };
  } finally {
    rotationInflight.delete(laneId);
  }
}

export function acceptOrientationReport({
  laneId,
  runId,
  orientation,
  cwd = null,
  nowMs = Date.now(),
  root = null,
} = {}) {
  const found = resolveRunContext({ runId, laneId, root });
  if (!found?.run) return { ok: false, error: "run_not_found" };
  const run = found.run;
  root = found.root;
  const session = activeAgentSessionForLane(run.lane_id, root);
  if (!session) return { ok: false, error: "session_not_found" };
  const git = captureGitTruth(cwd || run.worktree_path);
  const mismatches = [];
  if (!orientation?.lane || !orientation?.run) mismatches.push("identity");
  if (orientation?.lane && orientation.lane !== run.lane_id) mismatches.push("lane");
  if (orientation?.run && orientation.run !== run.run_id) mismatches.push("run");
  if (orientation?.branch && git.branch && orientation.branch !== git.branch) mismatches.push("branch");
  if (orientation?.worktree && run.worktree_path && orientation.worktree !== run.worktree_path
    && !String(run.worktree_path).endsWith(String(orientation.worktree))) {
    mismatches.push("worktree");
  }
  if (mismatches.length) {
    patchAgentSession(session.agent_session_id, { state: "FAILED" }, { root, event: "rotation_failed" });
    escalateNeedsInput(run, `orientation mismatch: ${mismatches.join(",")}`, nowMs, root);
    emitAgentSessionEvent("rotation_failed", session, root, { error: "orientation_mismatch", mismatches });
    return { ok: false, error: "orientation_mismatch", mismatches, git };
  }
  markAgentSessionActive(session.agent_session_id, {
    root,
    providerSessionId: session.provider_session_id,
    orientedAt: iso(nowMs),
  });
  emitAgentSessionEvent("orientation_verified", session, root);
  emitAgentSessionEvent("rotation_completed", session, root, { run_id: run.run_id });
  emitAgentSessionEvent("run_resumed_after_rotation", session, root, { run_id: run.run_id, run_state: run.state });
  if (run.state === "QUEUED") {
    import("./execution-run-send.mjs").then(({ deliverExistingQueuedRun }) =>
      deliverExistingQueuedRun(run.run_id, { root, nowMs })
    ).catch(() => {});
  }
  return {
    ok: true,
    run_id: run.run_id,
    run_state: run.state,
    agent_session_id: session.agent_session_id,
    git,
  };
}

export async function recoverDeadAgentSession({
  laneId,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const found = await observeLane(laneId);
  if (!found) return { ok: false, error: "lane_not_found" };
  if (laneClaudePresent(found)) {
    return { ok: false, error: "claude_still_present", consume_budget: false };
  }
  const run = activeRunForLane(laneId, root);
  if (!run) return { ok: false, error: "missing_run" };
  const check = evaluateSafeCheckpoint({ lane: found, run, root });
  if (!check.ok) {
    await escalateNeedsInput(run, check.blockers[0]?.detail || "Claude session ended during an unsafe phase", nowMs, root);
    emitAgentSessionEvent("session_recovery_failed", { lane_id: laneId, run_id: run.run_id }, root, {
      error: "ambiguous_active_operation",
      blockers: check.blockers,
    });
    return { ok: false, error: "ambiguous_active_operation", blockers: check.blockers };
  }
  const budget = consumeLaneRestartBudget(laneId, run.run_id, { root, limit: ROTATION_POLICY.restart_budget });
  if (!budget.ok) {
    await escalateNeedsInput(run, "session restart budget exhausted", nowMs, root);
    emitAgentSessionEvent("session_recovery_failed", { lane_id: laneId, run_id: run.run_id }, root, { error: "budget_exhausted" });
    return { ok: false, error: "budget_exhausted", exhausted: true };
  }
  const session = activeAgentSessionForLane(laneId, root);
  const handoff = session?.handoff_id ? getHandoff(session.handoff_id, root) : null;
  const packet = handoff?.state === "ready" && handoff.payload
    ? handoff.payload
    : {
      completed_work: "",
      remaining_work: "Inspect the worktree and Execution Run before mutating anything.",
      next_action: "Reconcile current Git/worktree state with the approved instruction, then continue only if the state is clear.",
      current_phase: run.state || "",
    };
  emitAgentSessionEvent("session_recovery_started", session || { lane_id: laneId, run_id: run.run_id }, root, {
    used_prior_handoff: Boolean(handoff?.payload),
  });
  if (session) {
    endAgentSession(session.agent_session_id, { reason: "unexpected_death", nowMs, root });
  }
  const providerSessionId = randomUUID();
  const created = createAgentSession({
    laneId,
    runId: run.run_id,
    providerSessionId,
    nowMs,
    root,
    predecessorSessionId: session?.agent_session_id || null,
  });
  if (!created.ok) return created;
  patchAgentSession(created.session.agent_session_id, { state: "RESTARTING" }, { root });
  const spawned = await spawnClaudeInPane({ lane: found, sessionId: providerSessionId });
  if (!spawned.ok) {
    patchAgentSession(created.session.agent_session_id, { state: "FAILED" }, { root, event: "session_recovery_failed" });
    await escalateNeedsInput(run, "Could not start a replacement Claude session", nowMs, root);
    return { ok: false, error: "replacement_start_failed" };
  }
  const n = countClaudeOnLane(found);
  if (n > 1) {
    patchAgentSession(created.session.agent_session_id, { state: "FAILED" }, { root, event: "session_recovery_failed" });
    await escalateNeedsInput(run, "Duplicate Claude detected during recovery", nowMs, root);
    return { ok: false, error: "duplicate_claude" };
  }
  const git = captureGitTruth(found.worktree?.path || run.worktree_path);
  const instruction = buildContinuationInstruction({
    run,
    handoff: packet,
    git,
    successorSessionId: created.session.agent_session_id,
    recovery: true,
  });
  patchAgentSession(created.session.agent_session_id, { state: "VERIFYING", handoff_id: handoff?.handoff_id || null }, { root });
  const send = sendImpl || sendLaneInstruction;
  const delivered = await send(laneId, instruction, {
    actor: "governor",
    dedupeKey: `recover-orient:${created.session.agent_session_id}`,
  });
  if (!delivered?.ok) return { ok: false, error: "orientation_delivery_failed", delivery: delivered };
  return {
    ok: true,
    recovery: true,
    agent_session_id: created.session.agent_session_id,
    run_id: run.run_id,
    used_prior_handoff: Boolean(handoff?.state === "ready" && handoff.payload),
  };
}

export async function reconcileAutomaticContextRotation(lane, { root = runtimeRoot(), nowMs = Date.now() } = {}) {
  if (!autoSessionRotationEnabled()) return { ok: true, skipped: true, auto: false };
  if (!lane?.lane_id) return { ok: true, skipped: true };
  const telemetry = lane.agent_telemetry || peekLaneTelemetryCache(lane.lane_id) || null;
  let session = activeAgentSessionForLane(lane.lane_id, root);
  if (!session || !["ACTIVE", "ROTATION_PENDING"].includes(session.state)) {
    return { ok: true, skipped: true };
  }
  if (!telemetryAppliesToSession(telemetry, session)) {
    return { ok: true, skipped: true, predecessor_telemetry: true };
  }
  const need = evaluateRotationNeed(telemetry);
  if (need.unknown || need.kind === "none" || need.kind === "recommended") {
    if (session.state === "ACTIVE") return { ok: true, skipped: true, unknown: Boolean(need.unknown) };
  }

  if (session.state === "ACTIVE") {
    if (need.kind !== "safe_automatic") return { ok: true, skipped: true };
    const prior = session.rotation_trigger;
    if (prior?.session_id === session.agent_session_id && prior.attempted) {
      return { ok: true, skipped: true, hysteresis: true };
    }
    const trigger = {
      session_id: session.agent_session_id,
      episode_id: prior?.episode_id || `${session.agent_session_id}:auto`,
      origin: "automatic",
      percent: need.percent_used,
      reached_at: iso(nowMs),
      attempted: false,
    };
    session = patchAgentSession(session.agent_session_id, {
      state: "ROTATION_PENDING",
      rotation_trigger: trigger,
    }, { root, event: "context_rotation_threshold_reached", extra: { percent_used: need.percent_used } })
      || { ...session, state: "ROTATION_PENDING", rotation_trigger: trigger };
    emitAgentSessionEvent("context_rotation_threshold_reached", session, root, {
      percent_used: need.percent_used,
    });
  }

  if (session.state !== "ROTATION_PENDING") return { ok: true, skipped: true };

  const run = activeRunForLane(lane.lane_id, root);
  const check = evaluateSafeCheckpoint({ lane, run, root });
  if (!check.ok) {
    const code = check.blockers[0]?.code || "unsafe_checkpoint";
    if (session.rotation_trigger?.last_defer_code !== code) {
      emitAgentSessionEvent("rotation_deferred", session, root, { blockers: check.blockers, origin: "automatic" });
      patchAgentSession(session.agent_session_id, {
        rotation_trigger: { ...(session.rotation_trigger || {}), last_defer_code: code },
      }, { root });
    }
    return { ok: true, deferred: true, blockers: check.blockers };
  }
  if (session.rotation_trigger?.attempted) {
    return { ok: true, skipped: true, hysteresis: true };
  }
  const started = await requestSessionRotation({
    laneId: lane.lane_id,
    origin: "automatic",
    confirm: true,
    nowMs,
    root,
    lane,
  });
  if (started?.ok) {
    patchAgentSession(session.agent_session_id, {
      rotation_trigger: { ...(session.rotation_trigger || {}), attempted: true, origin: "automatic" },
    }, { root });
    return started;
  }
  if (started?.deferred || started?.error === "deferred" || started?.error === "claude_absent") {
    return { ok: true, deferred: true, blockers: started.blockers || [{ code: started.error }] };
  }
  patchAgentSession(session.agent_session_id, {
    rotation_trigger: { ...(session.rotation_trigger || {}), attempted: true, origin: "automatic" },
  }, { root });
  return started;
}

export async function tickAutomaticSessionRotation({ root = runtimeRoot(), nowMs = Date.now() } = {}) {
  if (!autoSessionRotationEnabled()) return { ok: true, skipped: true };
  let considered = 0;
  for (const rec of listCurrentAgentSessions(root)) {
    if (!["ACTIVE", "ROTATION_PENDING", "HANDOFF"].includes(rec.state)) continue;
    const telemetry = peekLaneTelemetryCache(rec.lane_id);
    let lane = { lane_id: rec.lane_id, agent_telemetry: telemetry };
    try {
      const found = await observeLane(rec.lane_id);
      if (found) lane = { ...found, agent_telemetry: telemetry };
    } catch { /* observe is best-effort for the tick */ }
    if (rec.state === "ACTIVE" && evaluateRotationNeed(telemetry).kind !== "safe_automatic") continue;
    await maybeAdvanceSessionRotation(lane, { root, nowMs });
    considered += 1;
  }
  return { ok: true, considered };
}

export async function maybeAdvanceSessionRotation(lane, { root = runtimeRoot(), nowMs = Date.now() } = {}) {
  if (!lane?.lane_id) return { ok: true, skipped: true };
  const auto = await reconcileAutomaticContextRotation(lane, { root, nowMs });
  const session = activeAgentSessionForLane(lane.lane_id, root);
  if (!session || session.state !== "HANDOFF" || !session.handoff_id) return auto;
  const handoff = getHandoff(session.handoff_id, root);
  // A handoff that never left "requested" means the outgoing agent never
  // received the request. With Claude still present there is nothing to hand
  // off TO and nothing to wait for, so after a bounded wait the session goes
  // back to ACTIVE rather than sitting in HANDOFF indefinitely.
  if (handoff && handoff.state !== "ready") {
    const requestedAt = Date.parse(handoff.failed_at || handoff.created_at || "");
    const stalled = handoff.state === "failed"
      || (Number.isFinite(requestedAt) && (nowMs - requestedAt) > ROTATION_POLICY.exit_wait_ms);
    if (stalled && laneClaudePresent(lane)) {
      restoreSessionAfterFailedRotation(session, {
        root,
        error: handoff.error || "handoff_never_delivered",
        escalate: handoff.error !== PROMPT_NOT_READY_ERROR,
        extra: {
          handoff_state: handoff.state,
          waited_ms: Number.isFinite(requestedAt) ? nowMs - requestedAt : null,
          origin: session.rotation_trigger?.origin,
          reason: "Context refresh never started; the session was left running.",
        },
      });
      return { ok: false, error: "handoff_never_delivered", aborted: true, restored: "ACTIVE" };
    }
  }
  if (handoff?.state !== "ready") return auto?.deferred ? auto : { ok: true, skipped: true };
  if (laneClaudePresent(lane)) {
    const started = Date.parse(handoff.ready_at || handoff.created_at || "");
    if (Number.isFinite(started) && (nowMs - started) > ROTATION_POLICY.exit_wait_ms) {
      restoreSessionAfterFailedRotation(session, {
        root,
        error: "outgoing_still_present",
        extra: { waited_ms: nowMs - started, origin: session.rotation_trigger?.origin },
      });
      return { ok: false, error: "outgoing_still_present", aborted: true };
    }
    return { ok: true, waiting_exit: true };
  }
  return completeSessionRotation({ laneId: lane.lane_id, root, waitOutgoing: false });
}

function recentSessionActivity(laneId, root) {
  try {
    const raw = readFileSync(agentSessionEventsPath(root), "utf8");
    const rows = [];
    for (const line of raw.trim().split("\n").slice(-40)) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (e.lane_id !== laneId) continue;
      if (e.type === "orientation_verified" || e.type === "run_resumed_after_rotation") {
        rows.push({ summary: "Claude context refreshed automatically.", at: e.at, lane_id: laneId });
      } else if (e.type === "rotation_failed" || e.type === "session_recovery_failed") {
        rows.push({
          summary: e.error === "orientation_mismatch" ? "Claude orientation failed" : "Claude session refresh failed",
          at: e.at,
          lane_id: laneId,
        });
      }
    }
    return rows.slice(-3).reverse();
  } catch {
    return [];
  }
}

/**
 * Operator Start Session. Creates an Agent Session only after a live provider
 * is present or a pane spawn succeeds. Inspect must never call this.
 * Browser supplies durable lane_id only.
 */
export async function startLaneAgentSession({
  laneId,
  nowMs = Date.now(),
  root = runtimeRoot(),
  origin = "admission",
} = {}) {
  if (startInflight.has(laneId)) return { ok: true, phase: "IN_FLIGHT", start_session_implemented: true };
  startInflight.add(laneId);
  try {
    return await startLaneAgentSessionUnlocked({ laneId, nowMs, root, origin });
  } finally {
    startInflight.delete(laneId);
  }
}

/**
 * S8 — try to free ONE seat because this lane is waiting for provider capacity.
 *
 * Called only from the two places where the ceiling has already refused, so the
 * contention is real rather than predicted. The decision about which seat (if
 * any) may be released belongs to provider-capacity and the seat-state model;
 * this is the caller that supplies the waiting admission.
 *
 * Failure is never fatal: a reclaim that cannot happen leaves the lane on the
 * ordinary queue-or-refuse path it took before S8 existed.
 */
async function reclaimSeatForWaitingLane({ laneId, root, nowMs }) {
  try {
    const { reclaimForWaitingAdmission } = await import("./provider-capacity.mjs");
    const run = activeRunForLane(laneId, root);
    return await reclaimForWaitingAdmission({
      waiting: [{ lane_id: laneId, run_id: run?.run_id || null, admission_id: null }],
      availableSeats: 0,
      root,
      nowMs,
      origin: "agent-session-lifecycle",
    });
  } catch (err) {
    return { ok: false, reclaimed: [], refused: [], plan: { reason: "reclaim_unavailable" }, error: err?.message || String(err) };
  }
}

function occupyingLaneSummaries(cap, root) {
  const live = Array.isArray(cap?.occupying) ? cap.occupying : [];
  const lanes = listDurableLanes(root);
  return live.map((p) => {
    const session = p?.session || null;
    const cwd = p?.cwd || null;
    const hit = lanes.find((l) =>
      (session && l.binding?.tmux_session === session)
      || (cwd && l.binding?.worktree_path === cwd)
    );
    return {
      name: hit?.name || hit?.label || session || "unknown",
      lane_id: hit?.lane_id || null,
      tmux_session: session,
    };
  });
}

function supersedeObservationOnlyCursorSession(lane, rec, { nowMs, root }) {
  const existing = activeAgentSessionForLane(rec.lane_id, root);
  if (!existing || existing.provider !== "cursor") return existing;
  if (cursorExecutableTransport(lane).ok) return existing;
  endAgentSession(existing.agent_session_id, {
    reason: "observation_only_superseded",
    nowMs,
    root,
  });
  return null;
}

function bindClaudeExecutable(rec, extra, { nowMs, root }) {
  const boundPath = extra.worktree_path || rec.binding?.worktree_path;
  const out = bindDurableLane(rec.lane_id, {
    ...rec.binding,
    ...extra,
    provider: "claude",
    worktree_path: boundPath,
  }, { nowMs, root });
  try {
    setLanePreferredProvider(rec.lane_id, "claude", { nowMs, root });
  } catch { /* preferred already Claude is fine */ }
  return out;
}

function bindCursorExecutable(rec, extra, { nowMs, root }) {
  const boundPath = extra.worktree_path || rec.binding?.worktree_path;
  const out = bindDurableLane(rec.lane_id, {
    ...rec.binding,
    ...extra,
    provider: "cursor",
    worktree_path: boundPath,
  }, { nowMs, root });
  try {
    setLanePreferredProvider(rec.lane_id, "cursor", { nowMs, root });
  } catch { /* preferred already Cursor is fine */ }
  return out;
}

/**
 * The direct fallback spawn. It returned the instant `respawn-pane` exited —
 * which is roughly a second before `cursor-agent` (a bash launcher that execs
 * node) has a prompt. The caller took that as an attached transport, the very
 * next `cursorExecutableTransport` read landed while the pane still said `bash`
 * under the outgoing provider's title, and the send failed with
 * `cursor_delivery_unavailable` while Cursor was booting normally.
 *
 * Spawning is not attaching. This now waits for the same prompt contract
 * `startPersistentAgentSession` uses before it claims success.
 */
async function spawnCursorInPane({ lane }) {
  const argv = ["cursor-agent"];
  const forbidden = assertSafeSpawnArgv(argv);
  if (!forbidden.ok) return forbidden;
  if (spawnImpl) return spawnImpl({ lane, argv, provider: "cursor" });
  const pane = lane?.tmux?.pane_id;
  const cwd = lane?.worktree?.path;
  const session = lane?.tmux?.session;
  if (!pane || !cwd) return { ok: false, error: "missing_pane" };
  try {
    execFileSync("tmux", [
      "respawn-pane", "-k", "-c", cwd, "-t", pane, "--",
      ...argv,
    ], { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    return { ok: false, error: "spawn_failed", detail: String(e.stderr || e.message || e).slice(0, 300) };
  }
  if (!session) return { ok: true, argv, provider: "cursor", readiness: null };
  const { waitForAgentPrompt } = await import("./alloy-dev-adapter.mjs");
  const readiness = await waitForAgentPrompt(session, { provider: "cursor" });
  if (!readiness.ok) {
    return {
      ok: false,
      error: readiness.error || "cursor_prompt_timeout",
      waited_ms: readiness.waited_ms,
      retryable: true,
    };
  }
  return { ok: true, argv, provider: "cursor", readiness };
}

function endActiveSessionForProviderSwitch(laneId, { nowMs, root, reason }) {
  const existing = activeAgentSessionForLane(laneId, root);
  if (!existing) return null;
  if (!["ACTIVE", "STARTING", "VERIFYING", "RESTARTING", "HANDOFF"].includes(existing.state)) return existing;
  endAgentSession(existing.agent_session_id, { reason, nowMs, root });
  return null;
}

async function startCursorExecutableSession({ found, rec, boundPath, nowMs, root, origin }) {
  const transport = cursorExecutableTransport(found);
  if (transport.ok) {
    // A SESSION THAT IS NOT BOUND IS NOT CONNECTED TO DELIVERY.
    //
    // This branch adopts a pane that is ALREADY running cursor-agent and used
    // to return without binding it. The Agent Session was created and reported
    // ACTIVE while the durable binding still said `provider: "claude"` and
    // still pointed at the pane id the lane had before the switch — so the very
    // next send resolved the provider as Claude, assessed a Cursor pane against
    // Claude's prompt contract, and refused with provider_prompt_not_ready.
    // Observed exactly this on lane_73a897409906: session ACTIVE on cursor,
    // binding.provider=claude, tmux_pane=%2 while the live Cursor pane was %9.
    //
    // Adoption binds for the same reason a fresh start does.
    bindCursorExecutable(rec, {
      tmux_session: found.tmux?.session || rec.binding?.tmux_session,
      tmux_pane: found.tmux?.pane_id || rec.binding?.tmux_pane,
      worktree_path: boundPath,
    }, { nowMs, root });
    const existing = activeAgentSessionForLane(found.lane_id, root);
    if (existing && ["ACTIVE", "STARTING", "VERIFYING", "RESTARTING", "HANDOFF"].includes(existing.state)) {
      if (existing.state !== "ACTIVE") {
        markAgentSessionActive(existing.agent_session_id, { root });
      }
      return {
        ok: true,
        adopted: true,
        provider: "cursor",
        agent_session_id: existing.agent_session_id,
        start_session_implemented: true,
      };
    }
    const run = activeRunForLane(found.lane_id, root);
    const created = createAgentSession({
      laneId: found.lane_id,
      runId: run?.run_id || null,
      provider: "cursor",
      nowMs,
      root,
    });
    if (!created.ok && created.error === "lane_has_active_session") {
      const sess = created.session || activeAgentSessionForLane(found.lane_id, root);
      return {
        ok: true,
        adopted: true,
        provider: "cursor",
        agent_session_id: sess?.agent_session_id || null,
        start_session_implemented: true,
      };
    }
    if (!created.ok) return created;
    const sess = markAgentSessionActive(created.session.agent_session_id, { root }) || created.session;
    return {
      ok: true,
      started: true,
      adopted: false,
      provider: "cursor",
      agent_session_id: sess.agent_session_id,
      start_session_implemented: true,
    };
  }

  const hasPane = Boolean(found.tmux?.pane_id) && found.tmux?.alive !== false;
  let createdRuntime = null;
  if (!hasPane) {
    const { assessSessionStartCapacity, startPersistentAgentSession } = await import("./alloy-dev-adapter.mjs");
    let cap = await assessSessionStartCapacity({ root });
    let seatReclaim = null;
    if (!cap.ok) {
      // S8. The ceiling has actually bound and THIS lane is what is waiting for
      // it — that is contention, and contention is the only thing permitted to
      // reclaim a seat. Nothing here runs on a timer or on a sweep.
      seatReclaim = await reclaimSeatForWaitingLane({ laneId: found.lane_id, root, nowMs });
      if (seatReclaim?.reclaimed?.length) cap = await assessSessionStartCapacity({ root });
    }
    if (!cap.ok) {
      const occupying = occupyingLaneSummaries(cap, root);
      if (origin === "operator") {
        return {
          ok: false,
          error: "provider_capacity",
          start_session_implemented: true,
          max_providers: cap.max_providers,
          active_providers: cap.active_providers,
          occupying,
          occupying_names: occupying.map((o) => o.name),
          capacity: cap,
          // What the reclaim attempt concluded, so a refusal can say whether a
          // seat could have been freed and why it was not.
          seat_reclaim: seatReclaim ? { reclaimed: seatReclaim.reclaimed, reason: seatReclaim.plan?.reason ?? null, refused: seatReclaim.refused ?? [] } : null,
        };
      }
      const run = activeRunForLane(found.lane_id, root);
      const { createAdmissionRequest } = await import("./execution-admission.mjs");
      const adm = createAdmissionRequest({
        laneId: found.lane_id,
        runId: run?.run_id || null,
        nowMs,
        root,
      });
      return {
        ok: true,
        status: "queued",
        queued: true,
        waiting_for_execution_capacity: true,
        admission_id: adm.request?.admission_id || null,
        start_session_implemented: true,
        occupying,
        occupying_names: occupying.map((o) => o.name),
        capacity: cap,
        seat_reclaim: seatReclaim ? { reclaimed: seatReclaim.reclaimed, reason: seatReclaim.plan?.reason ?? null, refused: seatReclaim.refused ?? [] } : null,
      };
    }
    let started;
    try {
      started = startRuntimeImpl
        ? await startRuntimeImpl({ lane: found, rec, root, nowMs, provider: "cursor" })
        : await startPersistentAgentSession({
          worktreePath: boundPath,
          worktreeName: rec.binding?.worktree_name || found.worktree?.name,
          laneName: rec.name,
          existingTmuxSession: rec.binding?.tmux_session || null,
          expectedBranch: rec.binding?.branch || null,
          runtimeRoot: root,
          expectedRepositoryId: rec.repository_id || null,
          provider: "cursor",
        });
    } catch (e) {
      started = { ok: false, error: CURSOR_DELIVERY_UNAVAILABLE, detail: String(e.message || e).slice(0, 240) };
    }
    if (!started?.ok) {
      return {
        ok: false,
        error: started?.error || CURSOR_DELIVERY_UNAVAILABLE,
        start_session_implemented: true,
        observation_only: true,
        skip_queue: started?.skip_queue !== false,
        rolled_back: Boolean(started?.rolled_back),
      };
    }
    createdRuntime = started;
  } else {
    const { startPersistentAgentSession } = await import("./alloy-dev-adapter.mjs");
    let started;
    try {
      started = startRuntimeImpl
        ? await startRuntimeImpl({ lane: found, rec, root, nowMs, provider: "cursor" })
        : await startPersistentAgentSession({
          worktreePath: boundPath,
          worktreeName: rec.binding?.worktree_name || found.worktree?.name,
          laneName: rec.name,
          existingTmuxSession: rec.binding?.tmux_session || found.tmux?.session || null,
          expectedBranch: rec.binding?.branch || null,
          runtimeRoot: root,
          expectedRepositoryId: rec.repository_id || null,
          provider: "cursor",
        });
    } catch (e) {
      started = { ok: false, error: CURSOR_DELIVERY_UNAVAILABLE, detail: String(e.message || e).slice(0, 240) };
    }
    if (!started?.ok) {
      const spawned = await spawnCursorInPane({ lane: found });
      if (!spawned.ok) {
        return {
          ok: false,
          error: spawned.error || CURSOR_DELIVERY_UNAVAILABLE,
          start_session_implemented: true,
          observation_only: true,
        };
      }
      createdRuntime = { ok: true, tmux_session: found.tmux?.session, pane_id: found.tmux?.pane_id, created: { tmux: false, provider: true } };
    } else {
      createdRuntime = started;
    }
  }

  // CLOSE THE LOOP BEFORE CLAIMING A TRANSPORT.
  //
  // Everything above only STARTS cursor-agent. Whether a writable transport is
  // actually attached is decided by `cursorExecutableTransport` reading the
  // live pane — the same predicate the send path uses. Binding and returning
  // `ok` without re-reading it is what let a still-booting pane be recorded as
  // an attached Cursor session, so the send that followed refused with
  // `cursor_delivery_unavailable`.
  //
  // A pane that has not converged yet is retryable, not a failure: the lane
  // queues and the next attempt finds it up.
  // Only a LIVE pane can contradict a successful start. When discovery shows no
  // live pane yet it has simply not caught up with the session that was just
  // created, and the start's own result is the better evidence — refusing there
  // would fail a Cursor lane that is coming up exactly as intended. When a live
  // pane IS visible and it is not a Cursor transport, the start did not converge
  // and the lane must wait rather than have a send refused against it.
  const attached = await observeLane(found.lane_id);
  if (attached?.tmux?.alive) {
    const verified = cursorExecutableTransport(attached);
    if (!verified.ok) {
      return {
        ok: false,
        error: CURSOR_DELIVERY_UNAVAILABLE,
        detail: verified.detail || "transport_not_attached",
        start_session_implemented: true,
        retryable: true,
        tmux_session: createdRuntime?.tmux_session || found.tmux?.session,
      };
    }
  }

  bindCursorExecutable(rec, {
    tmux_session: createdRuntime?.tmux_session || found.tmux?.session,
    tmux_pane: createdRuntime?.pane_id || found.tmux?.pane_id,
    worktree_path: boundPath,
  }, { nowMs, root });

  endActiveSessionForProviderSwitch(found.lane_id, {
    nowMs,
    root,
    reason: "observation_only_superseded",
  });

  const run = activeRunForLane(found.lane_id, root);
  const created = createAgentSession({
    laneId: found.lane_id,
    runId: run?.run_id || null,
    provider: "cursor",
    nowMs,
    root,
  });
  if (!created.ok && created.error === "lane_has_active_session") {
    const sess = created.session || activeAgentSessionForLane(found.lane_id, root);
    if (sess && sess.provider !== "cursor") {
      endAgentSession(sess.agent_session_id, { reason: "provider_switched", nowMs, root });
      const retry = createAgentSession({
        laneId: found.lane_id,
        runId: run?.run_id || null,
        provider: "cursor",
        nowMs,
        root,
      });
      if (!retry.ok) return retry;
      const next = markAgentSessionActive(retry.session.agent_session_id, { root }) || retry.session;
      return {
        ok: true,
        started: true,
        provider: "cursor",
        agent_session_id: next.agent_session_id,
        tmux_session: createdRuntime?.tmux_session || found.tmux?.session,
        start_session_implemented: true,
      };
    }
    return {
      ok: true,
      adopted: true,
      provider: "cursor",
      agent_session_id: sess?.agent_session_id || null,
      start_session_implemented: true,
    };
  }
  if (!created.ok) return created;
  const sess = markAgentSessionActive(created.session.agent_session_id, { root }) || created.session;
  return {
    ok: true,
    started: true,
    adopted: false,
    provider: "cursor",
    agent_session_id: sess.agent_session_id,
    tmux_session: createdRuntime?.tmux_session || found.tmux?.session,
    start_session_implemented: true,
  };
}

async function startLaneAgentSessionUnlocked({ laneId, nowMs, root, origin = "admission" }) {
  const found = await observeLane(laneId);
  if (!found) return { ok: false, error: "lane_not_found" };
  const rec = getDurableLane(found.lane_id, root);
  if (!rec) return { ok: false, error: "lane_not_found" };
  if (isRuntimeAdoptionBlocked(rec.binding || {})) {
    return { ok: false, error: "runtime_adoption_blocked" };
  }
  const boundPath = rec.binding?.worktree_path || found.worktree?.path;
  if (!boundPath) {
    return { ok: false, error: "binding_missing", start_session_implemented: true };
  }
  const owner = findLaneByBinding({ worktreePath: boundPath, root });
  if (owner && owner.lane_id !== rec.lane_id) {
    return { ok: false, error: "already_connected", lane_id: owner.lane_id };
  }
  const check = validateRuntimeBinding(rec, found);
  if (!check.ok && check.blockers.some((b) => b.code === "worktree_missing" || b.code === "missing_worktree" || b.code === "worktree_mismatch")) {
    return { ok: false, error: check.blockers[0].code, blockers: check.blockers };
  }

  const bound = normalizeExecutionProvider(rec?.binding?.provider, "");
  const preferred = normalizeExecutionProvider(rec?.preferred_provider, bound || "claude");
  let provider;
  if (preferred === "claude") {
    provider = "claude";
  } else if (preferred === "cursor" || bound === "cursor") {
    provider = "cursor";
  } else if (laneClaudePresent(found)) {
    provider = "claude";
  } else {
    provider = laneProviderKind(found, rec);
  }
  if (provider === "cursor") {
    return startCursorExecutableSession({ found, rec, boundPath, nowMs, root, origin });
  }

  supersedeObservationOnlyCursorSession(found, rec, { nowMs, root });

  // SWITCHING BACK IS ALSO A SWITCH.
  //
  // The Cursor path ends a session belonging to the other provider before
  // creating its own (endActiveSessionForProviderSwitch); the Claude path did
  // not. Going Cursor → Claude therefore respawned the pane to Claude and THEN
  // failed with `lane_has_active_session`, because the Cursor session was still
  // ACTIVE — leaving the lane holding a Claude pane under a Cursor Agent
  // Session. Observed exactly this on lane_73a897409906 while certifying the
  // switch back.
  //
  // Only a session for a DIFFERENT provider is ended here. A live Claude
  // session still returns `agent_already_running` below, unchanged.
  const crossProvider = activeAgentSessionForLane(found.lane_id, root);
  if (crossProvider && crossProvider.provider && crossProvider.provider !== "claude") {
    endActiveSessionForProviderSwitch(found.lane_id, {
      nowMs,
      root,
      reason: "provider_switched",
    });
  }

  if (laneClaudePresent(found)) {
    if (countClaudeOnLane(found) > 1) {
      return { ok: false, error: "duplicate_claude" };
    }
    let sess = activeAgentSessionForLane(found.lane_id, root);
    if (sess) {
      return {
        ok: false,
        error: "agent_already_running",
        agent_session_id: sess.agent_session_id,
        start_session_implemented: true,
      };
    }
    const run = activeRunForLane(found.lane_id, root);
    const created = createAgentSession({
      laneId: found.lane_id,
      runId: run?.run_id || null,
      nowMs,
      root,
    });
    if (!created.ok) return created;
    sess = markAgentSessionActive(created.session.agent_session_id, { root }) || created.session;
    bindClaudeExecutable(rec, {
      tmux_session: found.tmux?.session || rec.binding?.tmux_session,
      tmux_pane: found.tmux?.pane_id || rec.binding?.tmux_pane,
      worktree_path: boundPath,
    }, { nowMs, root });
    return {
      ok: true,
      adopted: true,
      provider: "claude",
      agent_session_id: sess.agent_session_id,
      start_session_implemented: true,
    };
  }

  const existingSession = activeAgentSessionForLane(found.lane_id, root);
  if (existingSession && ["STARTING", "RESTARTING", "VERIFYING", "HANDOFF"].includes(existingSession.state)) {
    return {
      ok: true,
      already: true,
      phase: existingSession.state,
      agent_session_id: existingSession.agent_session_id,
      start_session_implemented: true,
    };
  }

  let lane = found;
  let createdRuntime = null;
  const hasPane = Boolean(lane.tmux?.pane_id) && lane.tmux?.alive !== false;
  if (!hasPane) {
    const { assessSessionStartCapacity, startPersistentAgentSession } = await import("./alloy-dev-adapter.mjs");
    let cap = await assessSessionStartCapacity({ root });
    let seatReclaim = null;
    if (!cap.ok) {
      // S8. The ceiling has actually bound and THIS lane is what is waiting for
      // it — that is contention, and contention is the only thing permitted to
      // reclaim a seat. Nothing here runs on a timer or on a sweep.
      seatReclaim = await reclaimSeatForWaitingLane({ laneId: found.lane_id, root, nowMs });
      if (seatReclaim?.reclaimed?.length) cap = await assessSessionStartCapacity({ root });
    }
    if (!cap.ok) {
      const occupying = occupyingLaneSummaries(cap, root);
      if (origin === "operator") {
        return {
          ok: false,
          error: "provider_capacity",
          start_session_implemented: true,
          max_providers: cap.max_providers,
          active_providers: cap.active_providers,
          occupying,
          occupying_names: occupying.map((o) => o.name),
          capacity: cap,
          // What the reclaim attempt concluded, so a refusal can say whether a
          // seat could have been freed and why it was not.
          seat_reclaim: seatReclaim ? { reclaimed: seatReclaim.reclaimed, reason: seatReclaim.plan?.reason ?? null, refused: seatReclaim.refused ?? [] } : null,
        };
      }
      const run = activeRunForLane(found.lane_id, root);
      const { createAdmissionRequest } = await import("./execution-admission.mjs");
      const adm = createAdmissionRequest({
        laneId: found.lane_id,
        runId: run?.run_id || null,
        nowMs,
        root,
      });
      return {
        ok: true,
        status: "queued",
        queued: true,
        waiting_for_execution_capacity: true,
        admission_id: adm.request?.admission_id || null,
        start_session_implemented: true,
        occupying,
        occupying_names: occupying.map((o) => o.name),
        capacity: cap,
        seat_reclaim: seatReclaim ? { reclaimed: seatReclaim.reclaimed, reason: seatReclaim.plan?.reason ?? null, refused: seatReclaim.refused ?? [] } : null,
      };
    }
    const started = startRuntimeImpl
      ? await startRuntimeImpl({ lane, rec, root, nowMs })
      : await startPersistentAgentSession({
        worktreePath: boundPath,
        worktreeName: rec.binding?.worktree_name || lane.worktree?.name,
        laneName: rec.name,
        existingTmuxSession: rec.binding?.tmux_session || null,
        expectedBranch: rec.binding?.branch || null,
        runtimeRoot: root,
        // The lane's attribution travels with the start, so the provider cannot
        // come up in a repository other than the one this lane belongs to.
        expectedRepositoryId: rec.repository_id || null,
        provider: "claude",
      });
    if (!started?.ok) {
      return {
        ok: false,
        error: started?.error || "runtime_start_failed",
        start_session_implemented: true,
        skip_queue: started?.skip_queue !== false,
        rolled_back: Boolean(started?.rolled_back),
      };
    }
    createdRuntime = started;
    bindClaudeExecutable(rec, {
      tmux_session: started.tmux_session,
      tmux_pane: started.pane_id,
      worktree_path: boundPath,
    }, { nowMs, root });
    lane = await observeLane(found.lane_id) || lane;
    if (started.tmux_session && !lane.tmux?.pane_id) {
      lane = {
        ...lane,
        tmux: {
          ...(lane.tmux || {}),
          session: started.tmux_session,
          pane_id: started.pane_id,
          alive: true,
          cwd: boundPath,
        },
        worktree: { ...(lane.worktree || {}), path: boundPath, managed: true },
      };
    }
  }

  if (laneClaudePresent(lane) && createdRuntime?.adopted) {
    const run = activeRunForLane(found.lane_id, root);
    const created = createAgentSession({
      laneId: found.lane_id,
      runId: run?.run_id || null,
      nowMs,
      root,
    });
    if (!created.ok) return created;
    const sess = markAgentSessionActive(created.session.agent_session_id, { root }) || created.session;
    return {
      ok: true,
      adopted: true,
      provider: "claude",
      agent_session_id: sess.agent_session_id,
      start_session_implemented: true,
      tmux_session: createdRuntime.tmux_session,
    };
  }

  const providerSessionId = randomUUID();
  let spawned = { ok: true, provider_session_id: providerSessionId };
  if (!createdRuntime?.created?.provider && !laneClaudePresent(lane)) {
    spawned = await spawnClaudeInPane({ lane, sessionId: providerSessionId });
    if (!spawned.ok) {
      return {
        ok: false,
        error: spawned.error || "start_failed",
        start_session_implemented: true,
        skip_queue: true,
        created: createdRuntime?.created || null,
      };
    }
  }

  const after = await observeLane(found.lane_id);
  if (countClaudeOnLane(after || lane) > 1) {
    return { ok: false, error: "duplicate_claude", start_session_implemented: true };
  }

  const run = activeRunForLane(found.lane_id, root);
  const created = createAgentSession({
    laneId: found.lane_id,
    runId: run?.run_id || null,
    providerSessionId: spawned.provider_session_id || providerSessionId,
    nowMs,
    root,
  });
  if (!created.ok) return created;
  patchAgentSession(created.session.agent_session_id, { state: "STARTING" }, { root });
  const cwd = boundPath;
  if (run && !isTerminalRunState(run.state)) {
    const instruction = buildContinuationInstruction({
      run,
      handoff: {
        completed_work: "",
        remaining_work: run.instruction || "",
        next_action: "Orient on this Development Lane. Do not start approved work until you report ORIENTED.",
        current_phase: run.state,
      },
      git: captureGitTruth(cwd),
      successorSessionId: created.session.agent_session_id,
      recovery: false,
    });
    const send = sendImpl || sendLaneInstruction;
    try {
      const delivered = await send(found.lane_id, instruction, {
        actor: "governor",
        dedupeKey: `orient-start:${created.session.agent_session_id}`,
      });
      patchAgentSession(created.session.agent_session_id, {
        state: delivered?.ok ? "VERIFYING" : "STARTING",
        orientation_attempts: 1,
        last_orientation_attempt_at: iso(nowMs),
      }, { root });
    } catch { /* orientation delivery retries on the next reconcile */ }
  }
  return {
    ok: true,
    started: true,
    status: "starting",
    provider: "claude",
    agent_session_id: created.session.agent_session_id,
    tmux_session: createdRuntime?.tmux_session || lane.tmux?.session || rec.binding?.tmux_session,
    start_session_implemented: true,
  };
}

/**
 * States a session can be reaped from. SUSPENDED is deliberately absent: a
 * suspended session is the thing the operator will resume — the computation
 * stopped, the session did not.
 */
const REAPABLE_SESSION_STATES = Object.freeze([
  "STARTING", "ACTIVE", "ROTATION_PENDING", "HANDOFF", "RESTARTING", "VERIFYING",
]);

/**
 * An Agent Session is a live provider process, not a record.
 *
 * THE DEFECT THIS REPLACES: a durable restore carries agent sessions across as
 * AUTHORITATIVE history — correctly, they are the lane's record — but a session
 * in a non-terminal state also ASSERTS a running provider on the node it was
 * created on. Restoring the MacBook's state onto the Mac mini left
 * agsess_77d709d8-cce ACTIVE, describing a Claude process on a machine this
 * host has never seen. `createAgentSession` refuses `lane_has_active_session`,
 * so the lane could never start a provider again: the third distinct reason a
 * fresh operator send stayed on waiting_for_agent_session.
 *
 * Restore invalidated lane BINDINGS for exactly this reason. A session is the
 * other half of that binding and needed the same treatment.
 *
 * Runs at boot, against observed panes. Never reaps on ignorance: if pane
 * discovery is unavailable the sessions are left exactly as they are — only a
 * positive observation of "no live pane for this lane" ends anything. Claude
 * only: a Claude session always requires a live pane, whereas a Cursor session
 * may legitimately be an observation-only IDE attachment with no pane at all.
 */
export async function reconcileAgentSessionsWithoutRuntime({
  root = runtimeRoot(),
  nowMs = Date.now(),
  panes = null,
  discover = null,
} = {}) {
  const { discoverLivePanes, inferAgentPresence } = await import("./lanes.mjs");
  let live = panes;
  if (!Array.isArray(live)) {
    const seen = await (discover || discoverLivePanes)();
    // Unknown is not absent. A tmux that could not answer ends nothing.
    if (!seen?.ok) return { ok: true, ended: [], skipped: "pane_discovery_unavailable" };
    live = seen.panes;
  }
  const ended = [];
  const skipped = [];
  const localNode = localExecutionNodeId(root);
  for (const session of listCurrentAgentSessions(root)) {
    if (!REAPABLE_SESSION_STATES.includes(session.state)) continue;
    const rec = getDurableLane(session.lane_id, root);

    // A session this node cannot see because it belongs to ANOTHER node is not
    // absent, it is elsewhere. Reaping it here would end a live session on a
    // different machine on the strength of local ignorance.
    const boundNode = rec?.binding?.node_id || null;
    if (localNode && boundNode && boundNode !== localNode) {
      skipped.push({ agent_session_id: session.agent_session_id, why: "session_on_other_node" });
      continue;
    }

    // An attached read-only transcript has no executable pane BY DESIGN. Its
    // missing pane is its normal condition, not proof of death.
    if (!sessionIsExecutable(session, rec)) {
      skipped.push({ agent_session_id: session.agent_session_id, why: "non_executable_attachment" });
      continue;
    }

    const boundSession = rec?.binding?.tmux_session || null;
    const boundPath = rec?.binding?.worktree_path || null;
    // Presence is judged for the session's OWN provider. The Claude-only test
    // this replaces read every Cursor pane as "not Claude, therefore skip",
    // which let a dead Cursor session stay ACTIVE forever and block every
    // replacement with `lane_has_active_session`.
    const providerPanes = live.filter(
      (pane) => inferAgentPresence(pane, { provider: session.provider }) === "present",
    );
    const alive = providerPanes.some((pane) =>
      (boundSession && pane.session === boundSession)
      || (boundPath && (pane.cwd === boundPath || pane.cwd?.startsWith(`${boundPath}/`))));
    if (alive) continue;

    // Positive proof of absence requires that we could actually observe panes
    // for this provider at all. If tmux answered but reported no pane of ANY
    // kind, that is still an answer; if the discovery itself was degraded we
    // returned above without ending anything.
    endAgentSession(session.agent_session_id, { reason: "runtime_absent_on_this_node", nowMs, root });
    ended.push({
      lane_id: session.lane_id,
      agent_session_id: session.agent_session_id,
      provider: session.provider,
      was_state: session.state,
    });
  }
  return { ok: true, ended, skipped };
}

/**
 * Is this Agent Session backed by an executable provider process?
 *
 * Explicit marker first. Legacy records predate the marker: an ATTACHED IDE
 * conversation is recorded with a provider session id and no tmux session on
 * the binding to deliver into, which is exactly the read-only transcript case.
 */
export function sessionIsExecutable(session, rec) {
  if (!session) return false;
  if (session.executable === false) return false;
  if (session.executable === true) return true;
  if (session.provider_session_id && !rec?.binding?.tmux_session) return false;
  return true;
}

function localExecutionNodeId(root) {
  try {
    return localNodeId(root);
  } catch {
    return null;
  }
}

export function observeOrCreateAgentSession(lane, { root = runtimeRoot(), nowMs = Date.now(), telemetry = null } = {}) {
  if (!lane?.lane_id) return null;
  const rec = activeAgentSessionForLane(lane.lane_id, root);
  if (rec && telemetry?.agent?.session_id && rec.state !== "ACTIVE") {
    patchAgentSession(rec.agent_session_id, {
      provider_session_id: rec.provider_session_id || telemetry.agent.session_id,
      model: rec.model || telemetry.agent.model || null,
    }, { root });
  }
  return activeAgentSessionForLane(lane.lane_id, root) || rec;
}

export async function reconcilePendingOrientation({ root = runtimeRoot(), nowMs = Date.now() } = {}) {
  const { listDurableLanes } = await import("./development-lane.mjs");
  let retried = 0;
  for (const rec of listDurableLanes(root)) {
    const session = activeAgentSessionForLane(rec.lane_id, root);
    if (!session || session.oriented_at) continue;
    const run = activeRunForLane(rec.lane_id, root);
    if (!run || run.state !== "QUEUED" || run.state_reason !== "waiting_for_agent_session") continue;
    const attempts = Number(session.orientation_attempts || 0);
    const maxAttempts = session.state === "STARTING" ? 8 : 4;
    if (attempts >= maxAttempts) continue;
    const last = session.last_orientation_attempt_at ? Date.parse(session.last_orientation_attempt_at) : 0;
    if (last && nowMs - last < 8000) continue;
    const found = await observeLane(rec.lane_id);
    if (!found || !laneClaudePresent(found)) continue;
    const cwd = rec.binding?.worktree_path || found.worktree?.path;
    const instruction = buildContinuationInstruction({
      run,
      handoff: {
        completed_work: "",
        remaining_work: run.instruction || "",
        next_action: "Orient on this Development Lane. Do not start approved work until you report ORIENTED.",
        current_phase: run.state,
      },
      git: captureGitTruth(cwd),
      successorSessionId: session.agent_session_id,
      recovery: false,
    });
    const send = sendImpl || sendLaneInstruction;
    let delivered = { ok: false };
    try {
      delivered = await send(rec.lane_id, instruction, {
        actor: "governor",
        dedupeKey: `orient-retry:${session.agent_session_id}:${attempts + 1}`,
      }) || { ok: false };
    } catch {
      delivered = { ok: false };
    }
    patchAgentSession(session.agent_session_id, {
      state: delivered.ok ? "VERIFYING" : session.state,
      orientation_attempts: attempts + 1,
      last_orientation_attempt_at: iso(nowMs),
    }, { root });
    if (delivered.ok) retried += 1;
  }
  return { ok: true, retried };
}

export function attachLaneAgentSessions(lanes, root = runtimeRoot()) {
  const list = Array.isArray(lanes) ? lanes : [];
  return list.map((lane) => {
    const rec = observeOrCreateAgentSession(lane, { root, telemetry: lane.agent_telemetry });
    const need = evaluateRotationNeed(lane.agent_telemetry);
    const economics = laneEconomics(lane.lane_id, root);
    const pending = rec?.state === "ROTATION_PENDING" || need.kind === "safe_automatic";
    const rotating = rec && ["HANDOFF", "RESTARTING", "VERIFYING"].includes(rec.state);
    const present = laneClaudePresent(lane);
    const cursorLive = cursorSessionLive(rec, lane);
    const run = lane.execution_run;
    let sessionHint = need.reason || null;
    const liveRun = run && ["EXECUTING", "VALIDATING", "WAITING_RESOURCE", "NEEDS_INPUT", "RECOVERING"].includes(run.state);
    if (rec && rec.state === "ACTIVE" && !present && liveRun && rec.provider !== "cursor") {
      sessionHint = "Claude session ended unexpectedly";
    }
    const posture = rotating
      ? { state: "SESSION_ROTATING", reason: "Refreshing Claude context" }
      : (pending
        ? { ...(lane.runtime_posture || {}), session_hint: sessionHint || "Refresh pending · waiting for a safe checkpoint" }
        : (sessionHint && need.kind === "recommended"
          ? { ...(lane.runtime_posture || {}), session_hint: sessionHint }
          : lane.runtime_posture));
    let nextRun = run;
    if (nextRun && rotating) {
      nextRun = { ...nextRun, runtime_posture: { state: "SESSION_ROTATING", reason: "Refreshing Claude context" } };
    }
    const sessionActivity = recentSessionActivity(lane.lane_id, root);
    const prior = Array.isArray(lane.recent_system_activity) ? lane.recent_system_activity : [];
    const showSession = rec && (present || cursorLive || rotating || pending || Boolean(sessionHint && liveRun) || ["STARTING", "VERIFYING", "RESTARTING"].includes(rec.state));
    const live = present || cursorLive;
    return {
      ...lane,
      runtime_posture: rotating ? posture : (pending ? posture : lane.runtime_posture),
      execution_run: nextRun,
      agent_session: showSession ? publicAgentSession(rec, economics) : null,
      runtime: live ? "online" : "offline",
      start_session: live ? null : {
        available: Boolean(lane.worktree?.path || lane.binding?.worktree_path),
        implemented: Boolean(lane.worktree?.path || lane.binding?.worktree_path),
      },
      session_rotation: {
        policy: ROTATION_POLICY.auto_threshold,
        need: rotating ? "in_progress" : (pending ? "pending" : (need.unknown ? "none" : need.kind)),
        hint: rotating
          ? (rec.state === "HANDOFF" ? "Waiting for Claude to exit" : "Refreshing Claude context")
          : (pending ? "Refresh pending · waiting for a safe checkpoint" : sessionHint),
        unknown: Boolean(need.unknown),
      },
      recent_system_activity: [...sessionActivity, ...prior].slice(0, 3),
    };
  });
}

export function resetAgentHandoffsForTests(root = runtimeRoot()) {
  writeHandoffs({ schema_version: "vacilando.agent_handoff.v1", handoffs: {} }, root);
}
