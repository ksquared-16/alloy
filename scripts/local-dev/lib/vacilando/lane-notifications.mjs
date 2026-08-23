/**
 * Vacilando notifications — one durable record per operator prompt.
 *
 * WHAT A NOTIFICATION IS. An operator sends one prompt; that prompt becomes one
 * Execution Run; the run eventually reaches a condition the operator needs to
 * know about (it needs input, it finished, it failed, or Vacilando closed it).
 * That is ONE notification. Not one per state transition, not one per poll, and
 * not one per delivery attempt.
 *
 * WHY THIS MODULE EXISTS. Deduplication used to be keyed on
 * `${run_id}:${state}`, which is a per-TRANSITION key wearing a per-prompt
 * name. Measured on this host across 93 dispatches: 8 runs notified twice for a
 * single prompt because NEEDS_INPUT and then COMPLETE are different states of
 * the same question — erun_0a749119d8f48a77 sent NEEDS_INPUT, NEEDS_INPUT and
 * then COMPLETE. The key here is the RUN alone, so a prompt notifies once, on
 * whichever qualifying condition it reaches first, and never again.
 *
 * WHY THE RECORD IS WRITTEN BEFORE DELIVERY. The old code recorded the dedupe
 * marker only when `sent > 0`. Every failed delivery therefore left no memory
 * that it had been tried, so the next transition tried again — and on this host
 * 30 of 93 dispatches failed with `web_push_unavailable`, so the failure path
 * was the common one. Worse, a failed push meant the operator had no record of
 * the event ANYWHERE. Here the durable record is the truth: it is written first,
 * it survives a failed push, and it is what the Lanes page and the app badge
 * read. External delivery is a best-effort projection of it.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const NOTIFICATION_STORE_SCHEMA = "vacilando.notifications.v1";
export const NOTIFICATION_SUMMARY_MAX = 240;
/** Keep the store bounded; the operator never scrolls a thousand of these. */
export const NOTIFICATION_RETAIN_MAX = 500;

/**
 * The run states that are worth interrupting an operator for.
 *
 * ABANDONED is here deliberately: a run Vacilando closed on the operator's
 * behalf is the outcome they least expect and most need to hear about.
 * Everything else — QUEUED, EXECUTING, VALIDATING, WAITING_RESOURCE,
 * RECOVERING — is Vacilando working, which is not news.
 */
export const NOTIFY_STATES = Object.freeze(["NEEDS_INPUT", "COMPLETE", "FAILED", "ABANDONED"]);

const EVENT_FOR_STATE = Object.freeze({
  NEEDS_INPUT: "needs_input",
  COMPLETE: "complete",
  FAILED: "failed",
  ABANDONED: "abandoned",
});

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

export function notificationStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "notifications.json");
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

function emptyStore() {
  return { schema_version: NOTIFICATION_STORE_SCHEMA, notifications: [] };
}

export function readNotificationStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(notificationStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return {
      schema_version: NOTIFICATION_STORE_SCHEMA,
      notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store, root) {
  // Newest first, bounded. Seen records are dropped before unseen ones, because
  // an unseen notification is still owed to the operator.
  const all = [...(store.notifications || [])].sort(
    (a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0),
  );
  if (all.length > NOTIFICATION_RETAIN_MAX) {
    const unseen = all.filter((n) => !n.seen_at);
    const seen = all.filter((n) => n.seen_at);
    const keepSeen = Math.max(0, NOTIFICATION_RETAIN_MAX - unseen.length);
    store.notifications = [...unseen, ...seen.slice(0, keepSeen)].sort(
      (a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0),
    );
  } else {
    store.notifications = all;
  }
  atomicWrite(notificationStorePath(root), store);
  return store;
}

export function bound(text, max = NOTIFICATION_SUMMARY_MAX) {
  const s = String(text ?? "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** The state a run must be in to be worth telling the operator about. */
export function isNotifyingState(state) {
  return NOTIFY_STATES.includes(String(state || "").toUpperCase());
}

export function eventTypeForState(state) {
  return EVENT_FOR_STATE[String(state || "").toUpperCase()] || null;
}

/**
 * The operator-facing sentence.
 *
 * Prefer what the agent actually said over a generic template — the first line
 * of its structured report is the whole reason the operator is being paged.
 */
function summaryForRun(run, state) {
  const message = run?.agent_report?.message;
  if (message) {
    // A markdown heading is a LABEL, not the message. "Heading" is a useless
    // notification body, so prefer the first line of actual prose and fall
    // back to the heading only when the report is nothing but a heading.
    let heading = null;
    for (const raw of String(message).split("\n")) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (/^#{1,6}\s+/.test(trimmed)) {
        if (!heading) heading = trimmed.replace(/^#{1,6}\s*/, "").trim();
        continue;
      }
      const line = trimmed.replace(/^[-*]\s+/, "").trim();
      if (line) return bound(line);
    }
    if (heading) return bound(heading);
  }
  const reason = bound(run?.state_reason);
  if (reason) return reason;
  if (state === "NEEDS_INPUT") return "Needs your input.";
  if (state === "COMPLETE") return "Work complete and ready for review.";
  if (state === "FAILED") return "Could not continue.";
  if (state === "ABANDONED") return "Closed as no longer live. Open the lane to continue it.";
  return "";
}

export function publicNotification(rec) {
  if (!rec) return null;
  return {
    notification_id: rec.notification_id,
    run_id: rec.run_id,
    lane_id: rec.lane_id,
    lane_name: rec.lane_name || rec.lane_id,
    event_type: rec.event_type,
    state: rec.state,
    summary: rec.summary || "",
    path: rec.path,
    created_at: rec.created_at,
    seen_at: rec.seen_at || null,
    seen: Boolean(rec.seen_at),
    delivery: rec.delivery || null,
  };
}

export function notificationForRun(runId, root = runtimeRoot()) {
  const id = String(runId || "");
  if (!id) return null;
  return readNotificationStore(root).notifications.find((n) => n.run_id === id) || null;
}

/**
 * Record the one notification this prompt is allowed.
 *
 * Returns `{ok, created, record}`. `created:false` with a record means the
 * prompt has already notified — a replayed event, a reconnect, a worker retry
 * or a later transition of the same run all land here and change nothing.
 */
export function recordRunNotification(run, {
  laneName = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const state = String(run?.state || "").toUpperCase();
  if (!run?.run_id) return { ok: false, error: "missing_run", created: false };
  if (!isNotifyingState(state)) {
    return { ok: true, created: false, skipped: "not_operator_relevant" };
  }
  const store = readNotificationStore(root);
  const existing = store.notifications.find((n) => n.run_id === run.run_id);
  if (existing) {
    // The prompt already asked for attention once. A later COMPLETE after a
    // NEEDS_INPUT is the SAME question being resolved, not a new one.
    return { ok: true, created: false, duplicate: true, record: existing };
  }
  const laneId = String(run.lane_id || "");
  const rec = {
    schema_version: NOTIFICATION_STORE_SCHEMA,
    notification_id: `ntf_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    run_id: run.run_id,
    lane_id: laneId || null,
    lane_name: bound(laneName || laneId, 80),
    state,
    event_type: eventTypeForState(state),
    summary: summaryForRun(run, state),
    path: laneId ? `/#/lanes/${encodeURIComponent(laneId)}` : "/#/lanes",
    created_at: iso(nowMs),
    seen_at: null,
    delivery: { attempted: false, sent: 0, error: null, at: null },
  };
  store.notifications.push(rec);
  writeStore(store, root);
  return { ok: true, created: true, record: rec };
}

/**
 * Attach what happened when we tried to hand this to the platform.
 *
 * Delivery outcome is metadata ON the record; it is never allowed to decide
 * whether the record exists. A push that never left the machine still leaves
 * the operator a lane indicator and a badge.
 */
export function recordNotificationDelivery(notificationId, {
  sent = 0,
  error = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const store = readNotificationStore(root);
  const rec = store.notifications.find((n) => n.notification_id === notificationId);
  if (!rec) return { ok: false, error: "notification_not_found" };
  rec.delivery = {
    attempted: true,
    sent: Number(sent) || 0,
    error: error ? String(error) : null,
    at: iso(nowMs),
  };
  writeStore(store, root);
  return { ok: true, record: rec };
}

export function listNotifications({ laneId = null, unseenOnly = false, limit = 100, root = runtimeRoot() } = {}) {
  const wanted = laneId ? String(laneId) : null;
  return readNotificationStore(root).notifications
    .filter((n) => (!wanted || n.lane_id === wanted) && (!unseenOnly || !n.seen_at))
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))
    .slice(0, Math.max(0, limit))
    .map(publicNotification);
}

/** The single number the app badge shows. */
export function unseenNotificationCount(root = runtimeRoot()) {
  return readNotificationStore(root).notifications.filter((n) => !n.seen_at).length;
}

/** Unseen count per lane, for the lane list indicators. */
export function unseenCountByLane(root = runtimeRoot()) {
  const out = {};
  for (const n of readNotificationStore(root).notifications) {
    if (n.seen_at || !n.lane_id) continue;
    out[n.lane_id] = (out[n.lane_id] || 0) + 1;
  }
  return out;
}

export function markNotificationSeen(notificationId, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readNotificationStore(root);
  const rec = store.notifications.find((n) => n.notification_id === notificationId);
  if (!rec) return { ok: false, error: "notification_not_found" };
  if (!rec.seen_at) {
    rec.seen_at = iso(nowMs);
    writeStore(store, root);
  }
  return { ok: true, record: publicNotification(rec), unseen_count: unseenNotificationCount(root) };
}

/**
 * Opening a lane is the acknowledgement. Reading the answer IS seeing it, so
 * the operator never has to dismiss a notification for work they just read.
 */
export function markLaneNotificationsSeen(laneId, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const id = String(laneId || "");
  if (!id) return { ok: false, error: "missing_lane_id" };
  const store = readNotificationStore(root);
  const marked = [];
  for (const n of store.notifications) {
    if (n.lane_id === id && !n.seen_at) {
      n.seen_at = iso(nowMs);
      marked.push(n.notification_id);
    }
  }
  if (marked.length) writeStore(store, root);
  return { ok: true, lane_id: id, marked, unseen_count: unseenNotificationCount(root) };
}

export function markAllNotificationsSeen({ nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readNotificationStore(root);
  const marked = [];
  for (const n of store.notifications) {
    if (!n.seen_at) { n.seen_at = iso(nowMs); marked.push(n.notification_id); }
  }
  if (marked.length) writeStore(store, root);
  return { ok: true, marked, unseen_count: 0 };
}

export function resetNotificationsForTests(root = runtimeRoot()) {
  writeStore(emptyStore(), root);
}
