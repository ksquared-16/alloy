/**
 * The bridge from a provider prompt to a governed action, and back.
 *
 * A provider-native prompt is evidence that the provider is attempting an
 * action. When that action is a capability Vacilando already governs, the
 * prompt must become that capability's canonical request — filed, decided,
 * executed by the capability's own executor, and then the provider resumed with
 * the result. The prompt is the trigger; it is never the approval.
 *
 * DURABLE BY REQUIREMENT. The bridge outlives a Gateway restart, because the
 * window between filing a migration request and an operator deciding it is
 * exactly the window in which a restart happens, and a bridge lost there leaves
 * a provider blocked behind a modal with an approved action nobody reconnects.
 *
 * AT MOST ONE LIVE REQUEST PER IDENTITY. Identity is the capability's content
 * fingerprint, not the prompt text: the same migration attempted twice is one
 * decision, and a provider retrying its command must not manufacture a second
 * approval for the operator.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

export const BRIDGE_SCHEMA = "vacilando.provider_governed_bridge.v1";

/** Lifecycle. Every state is observable and every transition is recorded. */
export const BRIDGE_STATES = Object.freeze([
  "captured",            // prompt seen and classified
  "governed",            // resolved to a registered capability
  "waiting_decision",    // canonical governed action filed, awaiting Director/operator
  "executing_elsewhere", // the trusted executor is performing it
  "resolved",            // action effective; provider continued
  "dismissed",           // modal closed without approving the raw command
  "stale",               // prompt moved on before the decision landed
  "failed",              // execution or verification failed
]);

/** States from which no further automatic transition is attempted. */
export const TERMINAL_BRIDGE_STATES = Object.freeze(["resolved", "dismissed", "stale", "failed"]);

export function bridgeStorePath(root) {
  return join(root, "provider-bridges", "bridges.json");
}

function readStore(root) {
  try {
    const j = JSON.parse(readFileSync(bridgeStorePath(root), "utf8"));
    return { schema_version: BRIDGE_SCHEMA, bridges: j.bridges || {} };
  } catch { return { schema_version: BRIDGE_SCHEMA, bridges: {} }; }
}

function writeStore(root, store) {
  const p = bridgeStorePath(root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(tmp, p);
}

export function bridgeId({ contentFingerprint, laneId }) {
  return `pbr_${createHash("sha256").update(`${laneId}:${contentFingerprint}`).digest("hex").slice(0, 14)}`;
}

/** Every live bridge, i.e. every one still expecting something to happen. */
export function liveBridges({ root } = {}) {
  return Object.values(readStore(root).bridges).filter((b) => !TERMINAL_BRIDGE_STATES.includes(b.state));
}

export function getBridge({ root, id } = {}) {
  return readStore(root).bridges[id] || null;
}

export function listBridges({ root } = {}) {
  return Object.values(readStore(root).bridges);
}

/**
 * Open (or re-attach to) the bridge for one attempted operation.
 *
 * `existingActions` is the canonical governed-action set. Dedupe consults it
 * rather than the bridge store, because the authority is the action, and a
 * bridge that disagreed with it would be a second bookkeeping system.
 */
export function openBridge({
  root, laneId, runId, sessionId,
  promptFingerprint, resolution, executor,
  existingActions = [], nowMs = Date.now(),
} = {}) {
  if (!root) return { ok: false, error: "missing_runtime_root" };
  if (!resolution || resolution.resolution !== "registered_governed_capability") {
    return { ok: false, error: "not_a_registered_capability" };
  }
  if (!resolution.content_fingerprint && resolution.executable !== false) {
    return { ok: false, error: "missing_content_fingerprint" };
  }

  const id = bridgeId({ contentFingerprint: resolution.content_fingerprint || `blocked:${resolution.migration_path}`, laneId });
  const store = readStore(root);
  const existing = store.bridges[id];

  // A capability whose content cannot execute yet is recorded truthfully and
  // never filed. An approval the executor can only fail is worse than none.
  if (resolution.executable === false) {
    const rec = {
      schema_version: BRIDGE_SCHEMA, id, lane_id: laneId, run_id: runId, session_id: sessionId,
      prompt_fingerprint: promptFingerprint, capability: resolution.capability,
      content_fingerprint: resolution.content_fingerprint || null,
      executor_mode: executor?.mode || null,
      state: "governed", executable: false,
      blocked_reason: resolution.blocked_reason, prerequisite: resolution.prerequisite,
      governed_request_id: null,
      created_at: existing?.created_at || new Date(nowMs).toISOString(),
      updated_at: new Date(nowMs).toISOString(),
      history: [...(existing?.history || []), { at: new Date(nowMs).toISOString(), state: "governed", note: resolution.blocked_reason }],
    };
    store.bridges[id] = rec;
    writeStore(root, store);
    return { ok: true, bridge: rec, dedupe: "not_executable" };
  }

  // ── Dedupe against the canonical action set.
  const match = existingActions.find((a) =>
    a.action_key === resolution.capability
    && String(a.inputs?.expectedSha || "") === String(resolution.canonical_inputs.expectedSha)
    && String(a.inputs?.environment || "") === String(resolution.canonical_inputs.environment));

  let dedupe = "file_new";
  let requestId = null;
  let state = "governed";
  if (match) {
    const st = String(match.status || "").toLowerCase();
    requestId = match.request_id;
    if (["awaiting_operator", "requested"].includes(st)) { dedupe = "attached_pending"; state = "waiting_decision"; }
    else if (["approved", "executing"].includes(st)) { dedupe = "attached_executing"; state = "executing_elsewhere"; }
    else if (["complete", "completed"].includes(st)) { dedupe = "reuse_complete"; state = "executing_elsewhere"; }
    else if (["failed", "denied"].includes(st)) {
      // A failed action is NOT a pending approval. Saying otherwise asks the
      // operator to approve something that already refused to work.
      dedupe = "prior_failed"; state = "governed"; requestId = null;
    } else { dedupe = "file_new"; requestId = null; }
  }

  const rec = {
    schema_version: BRIDGE_SCHEMA, id,
    lane_id: laneId, run_id: runId, session_id: sessionId,
    prompt_fingerprint: promptFingerprint,
    attempted_operation: { capability: resolution.capability, migration_path: resolution.migration_path ?? null, environment: resolution.environment ?? null },
    capability: resolution.capability,
    content_fingerprint: resolution.content_fingerprint,
    canonical_inputs: resolution.canonical_inputs,
    executor_mode: executor?.mode || null,
    may_answer_provider: executor?.may_answer_provider === true,
    executable: true,
    state,
    governed_request_id: requestId,
    dedupe,
    created_at: existing?.created_at || new Date(nowMs).toISOString(),
    updated_at: new Date(nowMs).toISOString(),
    resolved_at: null,
    continuation: null,
    history: [...(existing?.history || []), { at: new Date(nowMs).toISOString(), state, note: dedupe }],
  };
  store.bridges[id] = rec;
  writeStore(root, store);
  return { ok: true, bridge: rec, dedupe };
}

/** Record that a canonical governed action now backs this bridge. */
export function attachGovernedRequest({ root, id, requestId, nowMs = Date.now() } = {}) {
  const store = readStore(root);
  const b = store.bridges[id];
  if (!b) return { ok: false, error: "unknown_bridge" };
  b.governed_request_id = requestId;
  b.state = "waiting_decision";
  b.updated_at = new Date(nowMs).toISOString();
  b.history.push({ at: b.updated_at, state: "waiting_decision", note: requestId });
  writeStore(root, store);
  return { ok: true, bridge: b };
}

/**
 * Advance a bridge from the canonical action's truth.
 *
 * `effective` is separate from `complete` on purpose: for a migration a
 * successful exit is not proof the schema changed, and resuming the provider on
 * exit code alone would report success for work that did not land.
 */
export function advanceBridge({ root, id, actionStatus, effective = null, failure = null, nowMs = Date.now() } = {}) {
  const store = readStore(root);
  const b = store.bridges[id];
  if (!b) return { ok: false, error: "unknown_bridge" };
  const st = String(actionStatus || "").toLowerCase();

  let next = b.state;
  if (["awaiting_operator", "requested"].includes(st)) next = "waiting_decision";
  else if (["approved", "executing"].includes(st)) next = "executing_elsewhere";
  else if (["complete", "completed"].includes(st)) {
    if (effective === true) next = "resolved";
    else if (effective === false) next = "failed";
    else next = "executing_elsewhere"; // complete but unverified is NOT resolved
  } else if (st === "denied") next = "dismissed";
  else if (st === "failed") next = "failed";

  b.state = next;
  b.updated_at = new Date(nowMs).toISOString();
  if (["resolved", "dismissed", "failed"].includes(next)) b.resolved_at = b.updated_at;
  if (failure) b.failure = failure;
  if (effective != null) b.effective = effective;
  b.history.push({ at: b.updated_at, state: next, note: `action ${st}${effective == null ? "" : ` effective=${effective}`}` });
  writeStore(root, store);
  return { ok: true, bridge: b };
}

/**
 * What to do to the provider once the decision resolves.
 *
 * For a trusted-executor capability the answer is never affirmative. The modal
 * is CANCELLED — the raw command must not run — and the provider is continued
 * with the canonical result instead.
 */
export function continuationPlan(bridge) {
  if (!bridge) return null;
  const base = { bridge_id: bridge.id, session_id: bridge.session_id, run_id: bridge.run_id };
  if (bridge.may_answer_provider === true) {
    return { ...base, action: "answer_narrow_affirmative",
      why: "the capability declares the managed provider as its legitimate executor" };
  }
  switch (bridge.state) {
    case "resolved":
      return { ...base, action: "dismiss_then_continue", dismissal: "decline_raw_command",
        message: `Vacilando applied ${bridge.attempted_operation?.migration_path || bridge.capability} through its trusted executor. Continue from the next step.`,
        why: "the trusted executor performed it; the provider's raw command must not also run" };
    case "dismissed":
      return { ...base, action: "dismiss_then_continue", dismissal: "decline_raw_command",
        message: `The operator denied ${bridge.capability}. Do not attempt it again; report and stop.`,
        why: "denied actions are never answered affirmatively" };
    case "failed":
      return { ...base, action: "dismiss_then_continue", dismissal: "decline_raw_command",
        message: `Vacilando attempted ${bridge.capability} and it failed: ${bridge.failure || "see governed action"}.`,
        why: "the provider receives failure evidence, not a retry invitation" };
    case "waiting_decision":
    case "executing_elsewhere":
      return { ...base, action: "hold", why: "the governed action has not resolved" };
    default:
      return { ...base, action: "hold", why: `no continuation defined for ${bridge.state}` };
  }
}

/** Bridges whose prompt has moved on since capture. */
export function markStale({ root, id, observedFingerprint, nowMs = Date.now() } = {}) {
  const store = readStore(root);
  const b = store.bridges[id];
  if (!b) return { ok: false, error: "unknown_bridge" };
  if (b.prompt_fingerprint === observedFingerprint) return { ok: true, stale: false, bridge: b };
  b.state = "stale";
  b.updated_at = new Date(nowMs).toISOString();
  b.resolved_at = b.updated_at;
  b.history.push({ at: b.updated_at, state: "stale", note: `observed ${observedFingerprint}` });
  writeStore(root, store);
  return { ok: true, stale: true, bridge: b };
}

/** Control-plane failures this bridge can be in. Consumed by health. */
export function bridgeHealthViolations({ bridges = [], governedActions = [], nowMs = Date.now(), staleAfterMs = 60 * 60_000 } = {}) {
  const v = [];
  const byId = new Map(governedActions.map((a) => [a.request_id, a]));
  const liveByFingerprint = new Map();
  for (const b of bridges) {
    if (TERMINAL_BRIDGE_STATES.includes(b.state)) continue;
    if (b.executable !== false && !b.governed_request_id && b.state !== "governed") {
      v.push({ kind: "governed_prompt_without_request", bridge_id: b.id, lane_id: b.lane_id,
        detail: "a provider prompt resolved to a governed capability but no canonical request backs it" });
    }
    const a = b.governed_request_id ? byId.get(b.governed_request_id) : null;
    if (a && ["complete", "completed"].includes(String(a.status).toLowerCase()) && b.state !== "resolved") {
      v.push({ kind: "request_complete_provider_still_blocked", bridge_id: b.id, request_id: a.request_id,
        detail: "the governed action completed but the provider was never continued" });
    }
    const key = `${b.lane_id}:${b.content_fingerprint}`;
    liveByFingerprint.set(key, (liveByFingerprint.get(key) || 0) + 1);
    if (b.updated_at && (nowMs - Date.parse(b.updated_at)) > staleAfterMs) {
      v.push({ kind: "stale_bridge", bridge_id: b.id, detail: "a bridge has not advanced within its window" });
    }
  }
  for (const [key, n] of liveByFingerprint) {
    if (n > 1) v.push({ kind: "duplicate_active_bridges", identity: key, count: n,
      detail: "more than one live bridge exists for the same exact operation" });
  }
  return v;
}
