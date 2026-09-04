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
/**
 * THE ATTENTION CLASSES. One canonical vocabulary, so every surface answers the
 * same question the same way.
 *
 *   actionable    — the operator must do something. Approvals, needs-input.
 *   informational — worth reading once; nothing is required. Completions.
 *   resolved      — read, or the underlying question is answered. Not counted.
 *   superseded    — a later record owns this subject, or the request was
 *                   withdrawn/duplicated. Never counted, never shown as live.
 */
export const NOTIFICATION_CLASSES = Object.freeze(["actionable", "informational", "resolved", "superseded"]);

/** Run states map to a class; NEEDS_INPUT is the only one that asks for a hand. */
export function classForRunState(state) {
  const s = String(state || "").toUpperCase();
  if (s === "NEEDS_INPUT") return "actionable";
  if (s === "COMPLETE" || s === "FAILED" || s === "ABANDONED") return "informational";
  return null;
}

/**
 * Governed-action status -> class.
 *
 * `awaiting_operator` is the only status that needs a click. An action the
 * Director has already approved and that is executing is INFORMATIONAL — it
 * must not raise an approval badge. A failed one is actionable again, because
 * somebody has to decide what happens next.
 */
export function classForGovernedStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "awaiting_operator") return "actionable";
  if (s === "failed") return "actionable";
  if (s === "requested" || s === "executing" || s === "approved") return "informational";
  if (s === "complete") return "informational";
  if (s === "superseded" || s === "withdrawn" || s === "denied") return "superseded";
  return null;
}

/**
 * THE DIRECTOR'S FOUR QUESTIONS.
 *
 * The notification stream answers exactly one thing: do I need to know, or do
 * something? Everything the Director is shown resolves to one of these, and
 * anything that resolves to none of them is not a notification — it is
 * activity, and belongs in the lane history and the audit log.
 *
 * These are deliberately about the OPERATOR'S OBLIGATION rather than about
 * what the system did. "Governed action executed" describes the system;
 * "nothing is required of you" describes the obligation, and only the second
 * one helps someone decide whether to look.
 */
export const DIRECTOR_CATEGORIES = Object.freeze([
  "needs_answer",  // a decision or missing information only the Director has
  "stuck",         // cannot continue autonomously
  "attention",     // state looks unhealthy and cannot safely self-reconcile
  "completed",     // meaningful work finished
]);

/**
 * Routine progress that must NEVER page the Director.
 *
 * Each of these was a real notification before the Director Attention Model,
 * and not one of them asked anything of anybody. A push completing is the
 * system working; being told about it is the system interrupting.
 *
 * Note what is NOT here: nothing that failed, and nothing awaiting an
 * operator. Suppression covers success and progress only.
 */
const ROUTINE_PROGRESS_EVENTS = Object.freeze([
  "pull_request_opened", "push_completed", "authorization_satisfied",
  "governed_action_started", "governed_action_approved", "toolkit_install_started",
  "lane_queued", "lane_admitted", "server_restarted", "reconciliation_completed",
  "provider_seat_released", "capacity_decision_succeeded",
]);

/**
 * Does this event deserve the Director's attention at all?
 *
 * Auto-authorisation is the case that matters. Once routine actions execute
 * inside policy they never reach `awaiting_operator`, so the approval flood
 * disappears by construction rather than by filtering — but a governed action
 * that ran automatically still must not announce itself on the way past.
 */
export function isRoutineProgress(event) {
  return ROUTINE_PROGRESS_EVENTS.includes(String(event || "").toLowerCase());
}

/**
 * Collapse related events onto ONE finding.
 *
 * A stale Payments run holding a provider seat while Surfaces waits behind it
 * is one problem with three symptoms. Notifying per symptom pages the Director
 * three times about a single thing and hides the causal link, which is the
 * only part that helps. When an issue key is known, the notification is keyed
 * on the ISSUE, so the follow-on symptoms update that finding in place —
 * diagnosed, recovering, resolved — instead of stacking beside it.
 *
 * Falls back to the run when no issue is named, which preserves the existing
 * one-notification-per-prompt behaviour exactly.
 */
export function collapseKeyFor({ issueKey = null, runId = null } = {}) {
  const issue = String(issueKey || "").trim();
  if (issue) return `issue:${issue}`;
  const run = String(runId || "").trim();
  return run ? `run:${run}` : null;
}

/**
 * Map a run state to the Director's obligation.
 *
 * FAILED and ABANDONED are deliberately different. A failure is "stuck": the
 * work wanted to continue and could not, and somebody has to unblock it. An
 * abandoned run is "attention": nothing is asking to proceed, but the state is
 * not something the system could settle by itself.
 */
export function directorCategoryForRunState(state) {
  const s = String(state || "").toUpperCase();
  if (s === "NEEDS_INPUT") return "needs_answer";
  if (s === "FAILED") return "stuck";
  if (s === "ABANDONED") return "attention";
  if (s === "COMPLETE") return "completed";
  return null;
}

/**
 * Map a governed-action status to the Director's obligation.
 *
 * `awaiting_operator` survives as "needs_answer" because it is now RARE and
 * therefore meaningful: under the attention model it is reached only by
 * something a policy genuinely does not cover, or whose gates could not be
 * measured. Every routine status returns null — not a quieter notification, no
 * notification.
 */
export function directorCategoryForGovernedStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "awaiting_operator") return "needs_answer";
  if (s === "failed") return "stuck";
  return null;
}

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
/**
 * A system notification is plain text — it renders no markdown.
 *
 * Observed in the wild on this very run: the delivered body read
 * "**The attached logo never arrived.** The run record carries…", asterisks
 * and all, because only heading and bullet markers were stripped. Inline
 * emphasis, code ticks and link syntax have to go too.
 */
function plainText(raw) {
  return String(raw ?? "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")   // [text](url) / images -> text
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")        // `code`
    .replace(/(\*\*|__)(.*?)\1/g, "$2")          // **bold** / __bold__
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, "$1$2") // *italic*
    .replace(/^>\s*/, "")                         // blockquote
    .replace(/\s+/g, " ")
    .trim();
}

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
        if (!heading) heading = plainText(trimmed.replace(/^#{1,6}\s*/, ""));
        continue;
      }
      const line = plainText(trimmed.replace(/^[-*]\s+/, ""));
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
    updated_at: rec.updated_at || rec.created_at,
    seen_at: rec.seen_at || null,
    seen: Boolean(rec.seen_at),
    // The class is what the UI renders from, so a surface never re-derives
    // "does this need me" from the event type.
    subject_key: rec.subject_key || (rec.run_id ? `run:${rec.run_id}` : null),
    request_id: rec.request_id || null,
    attention_class: rec.attention_class || "informational",
    counts_for_attention: countsForAttention(rec),
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
  issueKey = null,
} = {}) {
  const state = String(run?.state || "").toUpperCase();
  if (!run?.run_id) return { ok: false, error: "missing_run", created: false };
  if (!isNotifyingState(state)) {
    return { ok: true, created: false, skipped: "not_operator_relevant" };
  }
  const laneId = String(run.lane_id || "");
  // ONE SUBJECT PER PROMPT, AND IT IS ALLOWED TO CHANGE CLASS.
  //
  // The old behaviour returned early on any existing record, so a run that went
  // NEEDS_INPUT and then COMPLETE kept an ACTIONABLE notification forever: the
  // question had been answered and the badge still said the operator was
  // needed. It is still one notification per prompt — it now stops demanding
  // attention when the prompt stops needing it.
  const out = upsertNotification({
    subjectKey: collapseKeyFor({ issueKey, runId: run.run_id }),
    runId: run.run_id,
    laneId: laneId || null,
    laneName,
    eventType: eventTypeForState(state),
    state,
    attentionClass: classForRunState(state) || "informational",
    // What the Director is actually being asked for, alongside the older
    // class. The class says how loud; this says which of the four questions
    // it answers, which is what decides whether it is worth looking at.
    directorCategory: directorCategoryForRunState(state),
    summary: summaryForRun(run, state),
    path: laneId ? `/#/lanes/${encodeURIComponent(laneId)}` : "/#/lanes",
    nowMs,
    root,
  });
  if (!out.ok) return { ok: false, error: out.error, created: false };
  // `created:false` keeps the historical contract: callers use it to decide
  // whether to attempt an external push, and a transition is not a new page.
  return { ok: true, created: out.created, duplicate: !out.created, record: out.record };
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

export function listNotifications({
  laneId = null,
  unseenOnly = false,
  attentionOnly = false,
  includeSuperseded = true,
  limit = 100,
  root = runtimeRoot(),
} = {}) {
  const wanted = laneId ? String(laneId) : null;
  return readNotificationStore(root).notifications
    .filter((n) => (!wanted || n.lane_id === wanted)
      && (!unseenOnly || !n.seen_at)
      // The drawer may show history; these two let a caller ask for exactly
      // the set the badge counts instead of re-filtering it itself.
      && (!attentionOnly || countsForAttention(n))
      && (includeSuperseded || n.attention_class !== "superseded"))
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))
    .slice(0, Math.max(0, limit))
    .map(publicNotification);
}

/**
 * DOES THIS RECORD STILL WANT THE OPERATOR'S ATTENTION?
 *
 * The one rule every surface uses: an item counts while it is actionable, or
 * while it is informational and unread. Resolved and superseded never count,
 * and a record that has been seen stops counting even if it was actionable —
 * the operator has looked at it.
 */
export function countsForAttention(rec) {
  if (!rec) return false;
  const cls = rec.attention_class || "informational";
  if (cls === "resolved" || cls === "superseded") return false;
  if (rec.seen_at) return false;
  return cls === "actionable" || cls === "informational";
}

/** How many items are actionable and still unattended. */
export function actionableNotificationCount(root = runtimeRoot()) {
  return readNotificationStore(root).notifications
    .filter((n) => countsForAttention(n) && n.attention_class === "actionable").length;
}

/**
 * THE ONE NUMBER. Home badge, drawer, lane indicators and the installed-app
 * tile all read this, so they cannot disagree.
 *
 * Historically the badge counted "records without seen_at", which made it a
 * count of unread HISTORY: a NEEDS_INPUT that had since completed still counted,
 * and a governed action that had been approved and executed still counted as
 * though it needed a click.
 */
export function canonicalNotificationCount(root = runtimeRoot()) {
  return readNotificationStore(root).notifications.filter(countsForAttention).length;
}

/** Retained name; delegates so no caller can compute a second answer. */
export function unseenNotificationCount(root = runtimeRoot()) {
  return canonicalNotificationCount(root);
}

/** Per-lane counts for the lane list indicators, same rule as the badge. */
export function unseenCountByLane(root = runtimeRoot()) {
  const out = {};
  for (const n of readNotificationStore(root).notifications) {
    if (!countsForAttention(n) || !n.lane_id) continue;
    out[n.lane_id] = (out[n.lane_id] || 0) + 1;
  }
  return out;
}

/** The count broken out by class, for surfaces that want to explain the badge. */
export function notificationCounts(root = runtimeRoot()) {
  const all = readNotificationStore(root).notifications;
  const live = all.filter(countsForAttention);
  return {
    total: live.length,
    actionable: live.filter((n) => n.attention_class === "actionable").length,
    informational: live.filter((n) => n.attention_class !== "actionable").length,
    resolved: all.filter((n) => n.attention_class === "resolved" || n.seen_at).length,
    superseded: all.filter((n) => n.attention_class === "superseded").length,
  };
}

/**
 * ONE SUBJECT, ONE CURRENT NOTIFICATION.
 *
 * A governed action moves requested -> approved -> executing -> complete. Each
 * step used to append its own event to a separate JSONL log, so one decision
 * produced four unrelated notifications, none of which had a read state and
 * none of which the badge could reconcile. The subject key is the DECISION
 * (`governed:<request_id>`, `run:<run_id>`), so a later step mutates the record
 * the operator is already looking at.
 *
 * Re-classifying to informational or resolved clears `seen_at` only when the
 * item becomes actionable again — an approval that failed must come back.
 */
export function upsertNotification({
  subjectKey,
  laneId = null,
  laneName = null,
  runId = null,
  requestId = null,
  eventType,
  state = null,
  attentionClass = "informational",
  summary = "",
  path = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
} = {}) {
  const key = String(subjectKey || "");
  if (!key) return { ok: false, error: "missing_subject_key" };
  if (!NOTIFICATION_CLASSES.includes(attentionClass)) {
    return { ok: false, error: "invalid_attention_class" };
  }
  const store = readNotificationStore(root);
  const existing = store.notifications.find((n) => n.subject_key === key);
  if (existing) {
    const wasActionable = existing.attention_class === "actionable";
    existing.attention_class = attentionClass;
    existing.event_type = eventType || existing.event_type;
    if (state) existing.state = state;
    if (summary) existing.summary = bound(summary);
    if (path) existing.path = path;
    existing.updated_at = iso(nowMs);
    // Becoming actionable again is a NEW demand on the operator, so it returns
    // to unread. Every other transition leaves an acknowledged item acknowledged.
    if (!wasActionable && attentionClass === "actionable") existing.seen_at = null;
    writeStore(store, root);
    return { ok: true, created: false, updated: true, record: existing };
  }
  const rec = {
    schema_version: NOTIFICATION_STORE_SCHEMA,
    notification_id: `ntf_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    subject_key: key,
    run_id: runId || null,
    request_id: requestId || null,
    lane_id: laneId || null,
    lane_name: bound(laneName || laneId || "", 80),
    state,
    event_type: eventType,
    attention_class: attentionClass,
    summary: bound(summary),
    path: path || (laneId ? `/#/lanes/${encodeURIComponent(laneId)}` : "/#/lanes"),
    created_at: iso(nowMs),
    updated_at: iso(nowMs),
    seen_at: null,
    delivery: { attempted: false, sent: 0, error: null, at: null },
  };
  store.notifications.push(rec);
  writeStore(store, root);
  return { ok: true, created: true, record: rec };
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
