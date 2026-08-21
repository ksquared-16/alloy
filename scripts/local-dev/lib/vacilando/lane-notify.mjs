/**
 * Bounded post-send output watch → one Web Push per delivered instruction.
 * Watches only lanes with a pending un-notified send. Not an all-lane poller.
 */
import { getDevelopmentLane, getLaneOutput } from "./lanes.mjs";
import {
  maybeSetSendBaseline,
  noteOutputAfterInstruction,
  pendingNotificationWatches,
} from "./lane-runtime.mjs";
import { pushPayloadForLane, sendPushToSubscriptions } from "./lane-push.mjs";
import { listExecutionRunsForLane } from "./execution-run.mjs";
import { detectProviderHealth, providerHealthKey, providerHealthPushPayload } from "./provider-health.mjs";

export const NOTIFY_WATCH_INTERVAL_MS = 8_000;
export const NOTIFY_WATCH_MAX_MS = 30 * 60 * 1000;

const watches = new Map();
/** One notification per lane per condition, not one per poll. */
const providerHealthNotified = new Set();

export function resetProviderHealthNotificationsForTests() {
  providerHealthNotified.clear();
}

/**
 * A lane sitting on a login prompt looks perfectly healthy by every durable
 * signal. Tell the operator, once, with the command that fixes it.
 */
export async function notifyProviderHealth(laneId, text, {
  provider = null,
  sendPush = sendPushToSubscriptions,
  seen = providerHealthNotified,
} = {}) {
  const health = detectProviderHealth(text, { provider });
  if (!health) return { ok: true, notified: false, reason: "healthy" };
  const key = providerHealthKey(laneId, health);
  if (seen.has(key)) return { ok: true, notified: false, reason: "already_notified", health };
  seen.add(key);
  const payload = providerHealthPushPayload(laneId, health);
  try { await sendPush(payload); } catch { /* push failure must not break the watch */ }
  return { ok: true, notified: true, health, payload };
}

export function resetLaneNotifyWatchesForTests() {
  for (const rec of watches.values()) {
    try { clearInterval(rec.timer); } catch { /* */ }
  }
  watches.clear();
}

export function activeNotifyWatchLaneIds() {
  return [...watches.keys()];
}

async function emitIfNeeded(laneId, fingerprint, {
  nowMs = Date.now(),
  sendPush = sendPushToSubscriptions,
  resolveLabel = defaultLabel,
  hasManagedRun = defaultHasManagedRun,
} = {}) {
  const decision = noteOutputAfterInstruction(laneId, fingerprint, nowMs);
  if (!decision.notify) return decision;
  let managed = false;
  try { managed = await hasManagedRun(laneId); } catch { managed = false; }
  if (managed) {
    return { ...decision, notify: false, reason: "managed_run_outcomes_only" };
  }
  let title = laneId;
  try { title = await resolveLabel(laneId); } catch { /* */ }
  const payload = pushPayloadForLane({ lane_id: laneId, title });
  await sendPush(payload);
  return decision;
}

function defaultHasManagedRun(laneId) {
  return listExecutionRunsForLane(laneId).length > 0;
}

async function defaultLabel(laneId) {
  const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
  return found?.lane?.label || laneId;
}

async function tickWatch(laneId, rec) {
  if (rec.inflight) return;
  rec.inflight = true;
  try {
    if (Date.now() - rec.startedAt > rec.maxMs) {
      stopOutputWatch(laneId);
      return;
    }
    const out = await rec.getOutput(laneId);
    if (!out?.ok || !out.fingerprint) return;
    if (out.text) {
      await notifyProviderHealth(laneId, out.text, {
        provider: rec.provider,
        sendPush: rec.sendPush,
      });
    }
    if (!rec.baselined) {
      maybeSetSendBaseline(laneId, out.fingerprint, Date.now());
      rec.baselined = true;
    }
    const decision = await emitIfNeeded(laneId, out.fingerprint, {
      sendPush: rec.sendPush,
      resolveLabel: rec.resolveLabel,
      hasManagedRun: rec.hasManagedRun,
    });
    if (decision.notify || decision.reason === "already_emitted" || decision.reason === "managed_run_outcomes_only") {
      stopOutputWatch(laneId);
    }
  } catch { /* keep watching until timeout */ }
  finally {
    rec.inflight = false;
  }
}

export function startOutputWatch(laneId, {
  intervalMs = NOTIFY_WATCH_INTERVAL_MS,
  maxMs = NOTIFY_WATCH_MAX_MS,
  getOutput = getLaneOutput,
  sendPush = sendPushToSubscriptions,
  resolveLabel = defaultLabel,
  hasManagedRun = defaultHasManagedRun,
  provider = null,
} = {}) {
  const id = String(laneId || "");
  if (!id) return { ok: false };
  stopOutputWatch(id);
  const rec = {
    timer: null,
    startedAt: Date.now(),
    maxMs,
    getOutput,
    sendPush,
    resolveLabel,
    hasManagedRun,
    provider,
    inflight: false,
    baselined: false,
  };
  rec.timer = setInterval(() => { tickWatch(id, rec); }, intervalMs);
  rec.timer.unref?.();
  watches.set(id, rec);
  tickWatch(id, rec);
  return { ok: true, lane_id: id };
}

export function stopOutputWatch(laneId) {
  const rec = watches.get(laneId);
  if (!rec) return;
  try { clearInterval(rec.timer); } catch { /* */ }
  watches.delete(laneId);
}

export function stopAllOutputWatches() {
  resetLaneNotifyWatchesForTests();
}

export function resumePendingOutputWatches(opts = {}) {
  const ids = pendingNotificationWatches(Date.now());
  for (const id of ids) startOutputWatch(id, opts);
  return ids;
}

export async function afterLaneInstructionDelivered(laneId, rec, opts = {}) {
  const { recordDeliveredInstruction } = await import("./lane-runtime.mjs");
  const saved = recordDeliveredInstruction(laneId, rec);
  if (saved.ok) startOutputWatch(laneId, opts);
  return saved;
}
