/**
 * Vacilando Governor Phase 6 — Agent Session store.
 *
 * Development Lane ≠ Execution Run ≠ Agent Session.
 * A lane may have many sequential Claude sessions. Session id is never lane_id.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { canonicalLaneStoreId } from "./development-lane.mjs";

export const AGENT_SESSION_SCHEMA = "vacilando.agent_session.v1";
export const AGENT_SESSION_STATES = Object.freeze([
  "STARTING",
  "ACTIVE",
  "ROTATION_PENDING",
  "HANDOFF",
  "RESTARTING",
  "VERIFYING",
  // The provider process was put down while its work stayed. The lane, run,
  // question, worktree, branch and conversation are all intact; only the
  // computation stopped. See provider-suspension.mjs.
  "SUSPENDED",
  "ENDED",
  "FAILED",
]);

/**
 * States where the session still OWNS the lane. SUSPENDED belongs here: the
 * session is the thing that will be resumed, so it must remain the lane's
 * active session — it simply is not consuming a provider seat.
 */
const ACTIVEISH = new Set(["STARTING", "ACTIVE", "ROTATION_PENDING", "HANDOFF", "RESTARTING", "VERIFYING", "SUSPENDED"]);

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

export function agentSessionStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "agent-sessions.json");
}

export function agentSessionEventsPath(root = runtimeRoot()) {
  return join(root, "vacilando", "execution-runs", "agent-session-events.jsonl");
}

function emptyStore() {
  return { schema_version: AGENT_SESSION_SCHEMA, lanes: {} };
}

function readStore(root) {
  try {
    const raw = JSON.parse(readFileSync(agentSessionStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return {
      schema_version: AGENT_SESSION_SCHEMA,
      lanes: raw.lanes && typeof raw.lanes === "object" ? raw.lanes : {},
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  atomicWrite(agentSessionStorePath(root), store);
  return store;
}

export function emitAgentSessionEvent(type, rec, root = runtimeRoot(), extra = {}) {
  const line = JSON.stringify({
    type,
    at: iso(),
    lane_id: rec?.lane_id || extra.lane_id || null,
    run_id: rec?.run_id || extra.run_id || null,
    agent_session_id: rec?.agent_session_id || extra.agent_session_id || null,
    provider_session_id: rec?.provider_session_id || extra.provider_session_id || null,
    ...extra,
  });
  try {
    const path = agentSessionEventsPath(root);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${line}\n`, "utf8");
  } catch { /* best-effort */ }
}

function packFor(store, laneId, root = runtimeRoot()) {
  const id = canonicalLaneStoreId(laneId, root);
  store.lanes[id] = store.lanes[id] || { current_session_id: null, sessions: [] };
  return store.lanes[id];
}

export function newAgentSessionId() {
  return `agsess_${randomUUID().slice(0, 12)}`;
}

export function activeAgentSessionForLane(laneId, root = runtimeRoot()) {
  const requested = String(laneId || "");
  const id = canonicalLaneStoreId(requested, root);
  const store = readStore(root);
  const pack = store.lanes[id] || store.lanes[requested];
  if (!pack?.current_session_id) return null;
  const rec = (pack.sessions || []).find((s) => s.agent_session_id === pack.current_session_id);
  if (!rec || !ACTIVEISH.has(rec.state)) return null;
  return rec;
}

export function getAgentSession(sessionId, root = runtimeRoot()) {
  const id = String(sessionId || "");
  if (!id) return null;
  for (const pack of Object.values(readStore(root).lanes || {})) {
    const rec = (pack.sessions || []).find((s) => s.agent_session_id === id);
    if (rec) return rec;
  }
  return null;
}

export function listAgentSessionsForLane(laneId, root = runtimeRoot()) {
  const requested = String(laneId || "");
  const id = canonicalLaneStoreId(requested, root);
  const store = readStore(root);
  const pack = store.lanes[id] || store.lanes[requested];
  return [...(pack?.sessions || [])];
}

export function listCurrentAgentSessions(root = runtimeRoot()) {
  const out = [];
  for (const pack of Object.values(readStore(root).lanes || {})) {
    if (!pack?.current_session_id) continue;
    const rec = (pack.sessions || []).find((s) => s.agent_session_id === pack.current_session_id);
    if (rec && ACTIVEISH.has(rec.state)) out.push(rec);
  }
  return out;
}

export function consumeLaneRestartBudget(laneId, runId, { root = runtimeRoot(), limit = 1 } = {}) {
  const id = String(laneId || "");
  const rid = String(runId || "");
  if (!id || !rid) return { ok: false, error: "missing_ids" };
  const store = readStore(root);
  const pack = packFor(store, id, root);
  pack.restarts = pack.restarts && typeof pack.restarts === "object" ? pack.restarts : {};
  const used = Number(pack.restarts[rid]) || 0;
  if (used >= limit) return { ok: false, error: "budget_exhausted", exhausted: true, used };
  pack.restarts[rid] = used + 1;
  writeStore(store, root);
  return { ok: true, used: used + 1 };
}

export function laneRestartBudgetUsed(laneId, runId, root = runtimeRoot()) {
  const requested = String(laneId || "");
  const id = canonicalLaneStoreId(requested, root);
  const pack = readStore(root).lanes[id] || readStore(root).lanes[requested];
  return Number(pack?.restarts?.[String(runId || "")]) || 0;
}

export function createAgentSession({
  laneId,
  runId = null,
  provider = "claude",
  providerSessionId = null,
  model = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
  predecessorSessionId = null,
  // Does this session own an executable provider process, or is it an attached
  // read-only IDE transcript? The reaper needs the difference: an attachment
  // has no pane BY DESIGN and must never be ended for lacking one.
  executable = true,
} = {}) {
  const lane_id = canonicalLaneStoreId(laneId, root);
  if (!lane_id) return { ok: false, error: "missing_lane_id" };
  const existing = activeAgentSessionForLane(lane_id, root);
  if (existing) return { ok: false, error: "lane_has_active_session", session: existing };
  const rec = {
    schema_version: AGENT_SESSION_SCHEMA,
    agent_session_id: newAgentSessionId(),
    lane_id,
    run_id: runId || null,
    provider,
    provider_session_id: providerSessionId || null,
    model: model || null,
    executable: executable !== false,
    state: "STARTING",
    started_at: iso(nowMs),
    ended_at: null,
    end_reason: null,
    context_usage: null,
    usage: null,
    cost: null,
    predecessor_session_id: predecessorSessionId || null,
    successor_session_id: null,
    handoff_id: null,
    recovery_attempts: 0,
  };
  if (rec.agent_session_id === lane_id) return { ok: false, error: "session_id_collision" };
  const store = readStore(root);
  const pack = packFor(store, lane_id, root);
  pack.sessions.push(rec);
  pack.current_session_id = rec.agent_session_id;
  if (pack.sessions.length > 40) pack.sessions = pack.sessions.slice(-40);
  writeStore(store, root);
  emitAgentSessionEvent("agent_session_started", rec, root);
  return { ok: true, session: rec };
}

export function patchAgentSession(sessionId, patch, { root = runtimeRoot(), event = null, extra = {} } = {}) {
  const store = readStore(root);
  for (const pack of Object.values(store.lanes || {})) {
    const rec = (pack.sessions || []).find((s) => s.agent_session_id === sessionId);
    if (!rec) continue;
    Object.assign(rec, patch);
    writeStore(store, root);
    if (event) emitAgentSessionEvent(event, rec, root, extra);
    return rec;
  }
  return null;
}

export function markAgentSessionActive(sessionId, { root = runtimeRoot(), providerSessionId = null, model = null, orientedAt = null } = {}) {
  return patchAgentSession(sessionId, {
    state: "ACTIVE",
    ...(providerSessionId ? { provider_session_id: providerSessionId } : {}),
    ...(model ? { model } : {}),
    ...(orientedAt ? { oriented_at: orientedAt } : {}),
  }, { root });
}

export function endAgentSession(sessionId, {
  reason = "ended",
  nowMs = Date.now(),
  root = runtimeRoot(),
  telemetry = null,
  successorSessionId = null,
} = {}) {
  const rec = getAgentSession(sessionId, root);
  if (!rec) return { ok: false, error: "session_not_found" };
  const patch = {
    state: rec.state === "FAILED" ? "FAILED" : "ENDED",
    ended_at: rec.ended_at || iso(nowMs),
    end_reason: reason,
    successor_session_id: successorSessionId || rec.successor_session_id,
  };
  if (telemetry) {
    patch.context_usage = telemetry.context || rec.context_usage;
    patch.usage = telemetry.usage || rec.usage;
    patch.cost = telemetry.cost || rec.cost;
    if (telemetry.agent?.model) patch.model = telemetry.agent.model;
    if (telemetry.agent?.session_id) patch.provider_session_id = telemetry.agent.session_id;
  }
  const updated = patchAgentSession(sessionId, patch, {
    root,
    event: "agent_session_ended",
    extra: { end_reason: reason },
  });
  const store = readStore(root);
  const pack = store.lanes[rec.lane_id];
  if (pack?.current_session_id === sessionId && !successorSessionId) {
    pack.current_session_id = null;
    writeStore(store, root);
  }
  return { ok: true, session: updated };
}

export function laneEconomics(laneId, root = runtimeRoot()) {
  const sessions = listAgentSessionsForLane(laneId, root);
  const ended = sessions.filter((s) => s.state === "ENDED" || s.state === "FAILED");
  const sum = (key) => ended.reduce((n, s) => n + (Number(s.usage?.[key]) || 0), 0);
  const modes = new Set(ended.map((s) => s.cost?.billing_mode).filter(Boolean));
  const reported = ended
    .map((s) => s.cost?.reported_usd)
    .filter((n) => Number.isFinite(n));
  const subscriptionOnly = [...modes].every((m) => /max|subscription/i.test(String(m))) && reported.length === 0;
  return {
    session_count: sessions.length,
    ended_count: ended.length,
    lifetime_usage: {
      input_tokens: sum("input_tokens") || null,
      output_tokens: sum("output_tokens") || null,
      cache_read_tokens: sum("cache_read_tokens") || null,
      cache_write_tokens: sum("cache_write_tokens") || null,
    },
    lifetime_cost: {
      reported_usd: reported.length ? reported.reduce((a, b) => a + b, 0) : null,
      estimated_usd: null,
      billing_mode: modes.size === 1 ? [...modes][0] : (subscriptionOnly ? "claude_max_subscription" : null),
      note: subscriptionOnly ? "Not reported · Claude Max subscription" : null,
    },
  };
}

export function publicAgentSession(rec, economics = null) {
  if (!rec) return null;
  return {
    agent_session_id: rec.agent_session_id,
    lane_id: rec.lane_id,
    run_id: rec.run_id,
    provider: rec.provider,
    provider_session_id: rec.provider_session_id,
    model: rec.model,
    state: rec.state,
    started_at: rec.started_at,
    ended_at: rec.ended_at,
    end_reason: rec.end_reason,
    predecessor_session_id: rec.predecessor_session_id,
    successor_session_id: rec.successor_session_id,
    handoff_id: rec.handoff_id,
    lane_economics: economics,
  };
}

export function resetAgentSessionsForTests(root = runtimeRoot()) {
  writeStore(emptyStore(), root);
  try {
    const p = agentSessionEventsPath(root);
    if (existsSync(p)) writeFileSync(p, "", "utf8");
  } catch { /* */ }
}
