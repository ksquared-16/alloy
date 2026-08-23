/**
 * Isolated Gateway Web Push credentials + subscriptions.
 * VAPID private key stays in the Gateway runtime root — never the repo.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const PUSH_STORE_SCHEMA = "vacilando.gateway.push.v1";
export const PUSH_MAX_SUBSCRIPTIONS = 8;
export const VAPID_SUBJECT = "mailto:vacilando@workwithalloy.com";
export const TEST_PUSH_TITLE = "Vacilando";
export const TEST_PUSH_BODY = "Notification test";

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

export function pushStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "web-push.json");
}

function emptyStore() {
  return {
    schema_version: PUSH_STORE_SCHEMA,
    vapid: null,
    subscriptions: [],
    outcomes: {},
    dispatch: null,
    last_test: null,
  };
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

/**
 * Resolve web-push from wherever this copy of the toolkit actually lives.
 *
 * MEASURED FAILURE. `alloy-toolkit` extracts scripts/local-dev straight out of
 * the git object store, and node_modules is not in git — so the installed
 * toolkit tree has package.json but no dependencies. A bare require() resolves
 * relative to THIS file, walks up ~/.local/share/alloy/... and finds nothing,
 * so every push from the live Gateway failed with `web_push_unavailable`:
 * 10 of 10 dispatches after the Gateway moved onto the installed toolkit, and
 * 30 of 93 across the whole recorded history.
 *
 * The installer now provisions dependencies, but an ALREADY-installed toolkit
 * must not stay mute until someone reinstalls it, so this also looks in the
 * sibling toolkit versions and the canonical checkout before giving up.
 */
function webPushCandidateRoots() {
  const here = dirname(fileURLToPath(import.meta.url));
  const toolkit = join(here, "..", "..");
  return [
    join(toolkit, "node_modules", "web-push", "package.json"),
    join(homedir(), ".local", "share", "alloy", "toolkit", "current", "node_modules", "web-push", "package.json"),
    join(homedir(), "Alloy", "scripts", "local-dev", "node_modules", "web-push", "package.json"),
  ];
}

let webPushCache;
function loadWebPush() {
  if (webPushCache !== undefined) return webPushCache;
  try {
    webPushCache = require("web-push");
    return webPushCache;
  } catch { /* fall through to explicit candidates */ }
  for (const manifest of webPushCandidateRoots()) {
    try {
      if (!existsSync(manifest)) continue;
      webPushCache = require(dirname(manifest));
      if (webPushCache) return webPushCache;
    } catch { /* try the next candidate */ }
  }
  webPushCache = null;
  return webPushCache;
}

/** Tests need to re-probe after changing where modules live. */
export function resetWebPushResolutionForTests() {
  webPushCache = undefined;
}

/** Whether this runtime can actually deliver a push at all. */
export function webPushRuntimeAvailable() {
  return Boolean(loadWebPush());
}

export function normalizePageOrigin(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function isHttpLoopbackOrigin(origin) {
  const n = normalizePageOrigin(origin);
  if (!n) return false;
  try {
    const u = new URL(n);
    return u.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(u.hostname);
  } catch {
    return false;
  }
}

export function isHttpPageOrigin(origin) {
  const n = normalizePageOrigin(origin);
  if (!n) return false;
  try {
    return new URL(n).protocol === "http:";
  } catch {
    return false;
  }
}

export function requestPublicOrigin(headers = {}, url = null) {
  const fromHeader = normalizePageOrigin(headers.origin || headers.Origin);
  if (fromHeader) return fromHeader;
  const proto = String(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "")
    .split(",")[0]
    .trim()
    || (url?.protocol ? String(url.protocol).replace(":", "") : "");
  const host = String(headers["x-forwarded-host"] || headers["X-Forwarded-Host"] || headers.host || headers.Host || "")
    .split(",")[0]
    .trim();
  if (host && proto) return normalizePageOrigin(`${proto}://${host}`);
  if (url?.origin && url.origin !== "null") return normalizePageOrigin(url.origin);
  return null;
}

export function pushProviderKind(endpoint) {
  try {
    const host = new URL(String(endpoint || "")).hostname.toLowerCase();
    if (host.includes("googleapis.com") || host.includes("fcm")) return "fcm";
    if (host.includes("push.apple.com") || host.endsWith("apple.com")) return "apns";
    if (host.includes("mozilla.com") || host.includes("autopush")) return "mozilla";
    return "web_push";
  } catch {
    return "web_push";
  }
}

export function classifyPushError(err) {
  const status = Number(err?.statusCode || err?.status || 0);
  if (status === 404 || status === 410) return "gone";
  if (status === 403) return "forbidden";
  if (status === 401) return "unauthorized";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  const msg = String(err?.message || err || "");
  if (msg === "web_push_unavailable") return "web_push_unavailable";
  if (/vapid/i.test(msg) || msg === "vapid_unavailable") return "vapid";
  if (status >= 400) return "provider_error";
  return "send_failed";
}

function publicDispatch(rec) {
  if (!rec || typeof rec !== "object") return null;
  return {
    at: rec.at || null,
    type: rec.type || null,
    sent: Number(rec.sent || 0),
    failed: Number(rec.failed || 0),
    pruned: Number(rec.pruned || 0),
    error: rec.error || null,
    targeted: rec.targeted || null,
  };
}

export function readPushStore(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(pushStorePath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return {
      schema_version: PUSH_STORE_SCHEMA,
      vapid: raw.vapid && typeof raw.vapid === "object" ? raw.vapid : null,
      subscriptions: Array.isArray(raw.subscriptions) ? raw.subscriptions : [],
      outcomes: raw.outcomes && typeof raw.outcomes === "object" ? raw.outcomes : {},
      dispatch: raw.dispatch && typeof raw.dispatch === "object" ? raw.dispatch : null,
      last_test: raw.last_test && typeof raw.last_test === "object" ? raw.last_test : null,
    };
  } catch {
    return emptyStore();
  }
}

function writePushStore(store, root = runtimeRoot()) {
  atomicWrite(pushStorePath(root), {
    schema_version: PUSH_STORE_SCHEMA,
    vapid: store.vapid || null,
    subscriptions: Array.isArray(store.subscriptions) ? store.subscriptions : [],
    outcomes: store.outcomes && typeof store.outcomes === "object" ? store.outcomes : {},
    dispatch: store.dispatch || null,
    last_test: store.last_test || null,
  });
}

export function ensureVapidKeys(root = runtimeRoot()) {
  const store = readPushStore(root);
  if (store.vapid?.publicKey && store.vapid?.privateKey) return store.vapid;
  // Public without private: do not rotate. Rotation would invalidate every device.
  if (store.vapid?.publicKey && !store.vapid?.privateKey) return null;
  const webpush = loadWebPush();
  if (!webpush?.generateVAPIDKeys) return null;
  const keys = webpush.generateVAPIDKeys();
  store.vapid = {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    subject: VAPID_SUBJECT,
  };
  writePushStore(store, root);
  return store.vapid;
}

export function vapidAvailable(root = runtimeRoot()) {
  const store = readPushStore(root);
  return Boolean(store.vapid?.publicKey && store.vapid?.privateKey);
}

export function publicPushConfig(root = runtimeRoot()) {
  const vapid = ensureVapidKeys(root);
  return {
    ok: true,
    vapid_public_key: vapid?.publicKey || null,
    subject: vapid?.subject || VAPID_SUBJECT,
    available: Boolean(vapid?.publicKey && vapid?.privateKey),
  };
}

export function publicPushHealth({ requestOrigin = null, root = runtimeRoot() } = {}) {
  const store = readPushStore(root);
  const origin = normalizePageOrigin(requestOrigin);
  const subs = store.subscriptions || [];
  const currentOrigin = origin
    ? subs.filter((s) => s?.page_origin && s.page_origin === origin).length
    : null;
  const staleHttp = subs.filter((s) => isHttpPageOrigin(s?.page_origin)).length;
  const unknownOrigin = subs.filter((s) => !s?.page_origin).length;
  return {
    ok: true,
    vapid_available: Boolean(store.vapid?.publicKey && store.vapid?.privateKey),
    subscription_count: subs.length,
    current_origin_subscriptions: currentOrigin,
    stale_http_origin_subscriptions: staleHttp,
    unknown_origin_subscriptions: unknownOrigin,
    request_origin: origin,
    last_dispatch: publicDispatch(store.dispatch),
    last_test: publicDispatch(store.last_test),
  };
}

function validSubscription(body) {
  const endpoint = String(body?.endpoint || "").trim();
  const p256dh = String(body?.keys?.p256dh || "").trim();
  const auth = String(body?.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) return null;
  if (body?.token || body?.gateway_token || body?.instruction || body?.output) {
    return { error: "forbidden_field" };
  }
  let url;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== "https:") return null;
  return { endpoint, keys: { p256dh, auth } };
}

export function savePushSubscription(body, {
  userAgent = null,
  nowMs = Date.now(),
  root = runtimeRoot(),
  origin = null,
} = {}) {
  const parsed = validSubscription(body);
  if (parsed?.error) return { ok: false, error: parsed.error };
  if (!parsed) return { ok: false, error: "invalid_subscription" };
  ensureVapidKeys(root);
  const store = readPushStore(root);
  const pageOrigin = normalizePageOrigin(body?.origin || origin);
  const existing = store.subscriptions.find((s) => s?.endpoint === parsed.endpoint);
  const next = {
    endpoint: parsed.endpoint,
    keys: parsed.keys,
    created_at: existing?.created_at || new Date(nowMs).toISOString(),
    last_seen_at: new Date(nowMs).toISOString(),
    last_ok_at: existing?.last_ok_at || null,
    last_error: null,
    user_agent: userAgent ? String(userAgent).slice(0, 180) : (existing?.user_agent || null),
    page_origin: pageOrigin || existing?.page_origin || null,
  };
  store.subscriptions = [
    next,
    ...store.subscriptions.filter((s) => s?.endpoint !== parsed.endpoint),
  ].slice(0, PUSH_MAX_SUBSCRIPTIONS);
  writePushStore(store, root);
  return { ok: true, endpoint: parsed.endpoint, count: store.subscriptions.length };
}

export function deletePushSubscription(endpoint, root = runtimeRoot()) {
  const ep = String(endpoint || "").trim();
  if (!ep) return { ok: false, error: "missing_endpoint" };
  const store = readPushStore(root);
  const before = store.subscriptions.length;
  store.subscriptions = store.subscriptions.filter((s) => s?.endpoint !== ep);
  writePushStore(store, root);
  return { ok: true, removed: before - store.subscriptions.length };
}

export function prunePushSubscription(endpoint, root = runtimeRoot()) {
  return deletePushSubscription(endpoint, root);
}

export function listPushSubscriptions(root = runtimeRoot()) {
  return readPushStore(root).subscriptions;
}

export function pushPayloadForLane({ lane_id, title } = {}) {
  const id = String(lane_id || "").trim();
  const label = String(title || id || "Development Lane");
  return {
    type: "lane_unseen_after_instruction",
    lane_id: id || null,
    title: label,
    body: "New Claude output is available.",
    path: id ? `/#/lanes/${encodeURIComponent(id)}` : "/#/lanes",
  };
}

export function testPushPayload({ lane_id } = {}) {
  const id = String(lane_id || "").trim();
  return {
    type: "vacilando.test",
    lane_id: id || null,
    title: TEST_PUSH_TITLE,
    body: TEST_PUSH_BODY,
    path: id ? `/#/lanes/${encodeURIComponent(id)}` : "/#/lanes",
  };
}

/**
 * ABANDONED notifies too. It was excluded, so a run that Vacilando closed on
 * the operator's behalf ended in silence — measured on this host: 73 abandonment
 * events and not one push. That is the outcome the operator most needs to hear
 * about, because it is the one they did not ask for.
 */
export const OUTCOME_PUSH_STATES = Object.freeze(["COMPLETE", "NEEDS_INPUT", "FAILED", "ABANDONED"]);

export function outcomePushKey(runId, state) {
  return `${String(runId || "").trim()}:${String(state || "").trim().toUpperCase()}`;
}

export function hasPushedRunOutcome(runId, state, root = runtimeRoot()) {
  const store = readPushStore(root);
  return Boolean(store.outcomes?.[outcomePushKey(runId, state)]);
}

export function recordPushedRunOutcome(runId, state, { lane_id = null, nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const store = readPushStore(root);
  store.outcomes = store.outcomes || {};
  store.outcomes[outcomePushKey(runId, state)] = {
    at: new Date(nowMs).toISOString(),
    lane_id: lane_id || null,
  };
  writePushStore(store, root);
}

/** The opening line of the agent's own message, for the notification body. */
function firstReportLine(run) {
  const msg = run?.agent_report?.message;
  if (!msg) return null;
  for (const raw of String(msg).split("\n")) {
    const line = raw.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s+/, "").trim();
    if (line) return line.slice(0, 140);
  }
  return null;
}

export function outcomePushPayload({ lane_id, title, state, reason } = {}) {
  const id = String(lane_id || "").trim();
  const label = String(title || id || "Development Lane").slice(0, 80);
  const st = String(state || "").toUpperCase();
  let body = "Work complete and ready for review.";
  if (st === "NEEDS_INPUT") {
    const extra = String(reason || "").trim().slice(0, 140);
    body = extra ? `needs your input. ${extra}` : "needs your input.";
  } else if (st === "FAILED") {
    body = "could not continue.";
  } else if (st === "ABANDONED") {
    const extra = String(reason || "").trim().slice(0, 140);
    body = extra
      ? `was closed as no longer live (${extra}). Open the lane to continue it.`
      : "was closed as no longer live. Open the lane to continue it.";
  }
  return {
    type: `execution_run.${st.toLowerCase()}`,
    lane_id: id || null,
    title: label,
    body,
    state: st,
    path: id ? `/#/lanes/${encodeURIComponent(id)}` : "/#/lanes",
  };
}

export async function pushRunOutcome(run, {
  label = null,
  root = runtimeRoot(),
  send = null,
} = {}) {
  const state = String(run?.state || "").toUpperCase();
  if (!OUTCOME_PUSH_STATES.includes(state)) {
    return { ok: true, sent: 0, skipped: "not_outcome" };
  }
  if (!run?.run_id) return { ok: false, error: "missing_run", sent: 0 };
  // A notification is a promise that there is something to read. A run that
  // reached COMPLETE / NEEDS_INPUT / FAILED through the structured report path
  // carries its message; if the report is somehow not there, do not tell the
  // operator it is. There must be no state where a Complete notification
  // arrives and the final message is absent.
  if (["COMPLETE", "NEEDS_INPUT", "FAILED"].includes(state)
      && run.completion_report?.report_id
      && !run.agent_report?.message) {
    return { ok: true, sent: 0, skipped: "report_not_durable" };
  }
  // ONE record per prompt. The old key was `${run_id}:${state}`, which is a
  // per-TRANSITION key: a run that reached NEEDS_INPUT and later COMPLETE
  // notified twice for a single operator question. Measured here: 8 runs did
  // exactly that. The notification store keys on the run alone.
  const { recordRunNotification, recordNotificationDelivery } =
    await import("./lane-notifications.mjs");
  const noted = recordRunNotification(run, { laneName: label || run.lane_id, root });
  if (!noted.created) {
    return { ok: true, sent: 0, skipped: noted.duplicate ? "duplicate_prompt" : (noted.skipped || "not_recorded") };
  }
  const notificationId = noted.record.notification_id;
  // Legacy marker, kept so an older Gateway reading this store still dedupes.
  if (!hasPushedRunOutcome(run.run_id, state, root)) {
    recordPushedRunOutcome(run.run_id, state, { lane_id: run.lane_id, root });
  }
  const payload = outcomePushPayload({
    lane_id: run.lane_id,
    title: label || run.lane_id,
    state,
    reason: ["NEEDS_INPUT", "ABANDONED"].includes(state)
      ? (firstReportLine(run) || run.state_reason)
      : null,
  });
  // Delivery is a projection of the record, never its precondition. Recording
  // only on `sent > 0` is what made a failed push re-fire on the next
  // transition AND leave the operator with no in-app trace of the event.
  let out;
  try {
    out = await sendPushToSubscriptions(payload, { root, send });
  } catch (err) {
    out = { ok: false, error: "send_failed", sent: 0, detail: String(err?.message || err) };
  }
  recordNotificationDelivery(notificationId, {
    sent: Number(out?.sent || 0),
    error: out?.ok === false ? (out.error || "send_failed") : (out?.errors?.[0]?.reason || null),
    root,
  });
  return { ...out, notification_id: notificationId, notification_created: true };
}

export function assertSafePushPayload(payload) {
  const keys = Object.keys(payload || {});
  const forbidden = ["token", "gateway_token", "instruction", "output", "text", "cookie"];
  return !forbidden.some((k) => keys.includes(k) || payload?.[k]);
}

function recordDispatch(root, rec, { test = false } = {}) {
  const store = readPushStore(root);
  const next = {
    at: new Date().toISOString(),
    type: rec.type || null,
    sent: Number(rec.sent || 0),
    failed: Number(rec.failed || 0),
    pruned: Number(rec.pruned || 0),
    error: rec.error || null,
    targeted: rec.targeted || null,
  };
  store.dispatch = next;
  if (test) store.last_test = next;
  writePushStore(store, root);
  return next;
}

export async function sendPushToSubscriptions(payload, {
  root = runtimeRoot(),
  send = null,
  onlyEndpoints = null,
} = {}) {
  if (!assertSafePushPayload(payload)) {
    return { ok: false, error: "unsafe_payload", sent: 0, failed: 0, pruned: 0 };
  }
  const store = readPushStore(root);
  const vapid = store.vapid?.publicKey && store.vapid?.privateKey
    ? store.vapid
    : ensureVapidKeys(root);
  if (!vapid?.publicKey || !vapid?.privateKey) {
    const out = { ok: false, error: "vapid_unavailable", sent: 0, failed: 0, pruned: 0 };
    recordDispatch(root, { ...out, type: payload?.type || null });
    return out;
  }
  const allow = Array.isArray(onlyEndpoints) ? new Set(onlyEndpoints.map(String)) : null;
  const subs = (store.subscriptions || []).filter((s) => s?.endpoint && (!allow || allow.has(s.endpoint)));
  if (!subs.length) {
    return {
      ok: true,
      sent: 0,
      failed: 0,
      pruned: 0,
      skipped: allow ? "device_not_subscribed" : "no_subscribers",
    };
  }
  const webpush = send ? null : loadWebPush();
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let lastError = null;
  const dead = [];
  const results = [];
  for (const sub of subs) {
    const provider = pushProviderKind(sub.endpoint);
    try {
      if (send) {
        await send(sub, payload);
      } else {
        if (!webpush) throw new Error("web_push_unavailable");
        webpush.setVapidDetails(vapid.subject || VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys,
        }, body, { TTL: 300, urgency: "normal" });
      }
      sent += 1;
      sub.last_ok_at = new Date().toISOString();
      sub.last_error = null;
      results.push({ ok: true, provider });
    } catch (e) {
      failed += 1;
      const status = Number(e?.statusCode || e?.status || 0);
      const error = classifyPushError(e);
      lastError = error;
      sub.last_error = error;
      results.push({ ok: false, provider, error, status: status || undefined });
      if (status === 404 || status === 410 || status === 403) dead.push(sub.endpoint);
    }
  }
  const live = readPushStore(root);
  live.subscriptions = (live.subscriptions || [])
    .filter((s) => !dead.includes(s?.endpoint))
    .map((s) => {
      const fresh = subs.find((x) => x.endpoint === s.endpoint);
      return fresh || s;
    });
  live.dispatch = {
    at: new Date().toISOString(),
    type: payload?.type || null,
    sent,
    failed,
    pruned: dead.length,
    error: sent > 0 ? null : lastError,
    targeted: allow ? "device" : "all",
  };
  writePushStore(live, root);
  return {
    ok: sent > 0,
    sent,
    failed,
    pruned: dead.length,
    error: sent > 0 ? undefined : (lastError || (dead.length ? "gone" : "send_failed")),
    results,
  };
}

export async function sendTestPush({
  endpoint = null,
  lane_id = null,
  origin = null,
  root = runtimeRoot(),
  send = null,
} = {}) {
  const payload = testPushPayload({ lane_id });
  const ep = String(endpoint || "").trim();
  if (!ep) {
    const out = { ok: false, error: "missing_endpoint", sent: 0, failed: 0, pruned: 0 };
    recordDispatch(root, { ...out, type: payload.type, targeted: "device" }, { test: true });
    return out;
  }
  const match = listPushSubscriptions(root).find((s) => s?.endpoint === ep);
  if (!match) {
    const out = { ok: false, error: "device_not_subscribed", sent: 0, failed: 0, pruned: 0 };
    recordDispatch(root, { ...out, type: payload.type, targeted: "device" }, { test: true });
    return out;
  }
  const pageOrigin = normalizePageOrigin(origin);
  if (pageOrigin && match.page_origin && match.page_origin !== pageOrigin) {
    const out = { ok: false, error: "origin_mismatch", sent: 0, failed: 0, pruned: 0 };
    recordDispatch(root, { ...out, type: payload.type, targeted: "device" }, { test: true });
    return out;
  }
  const out = await sendPushToSubscriptions(payload, { root, send, onlyEndpoints: [ep] });
  recordDispatch(root, {
    type: payload.type,
    sent: out.sent || 0,
    failed: out.failed || 0,
    pruned: out.pruned || 0,
    error: out.ok ? null : (out.error || "send_failed"),
    targeted: "device",
  }, { test: true });
  return {
    ok: Boolean(out.ok),
    sent: out.sent || 0,
    failed: out.failed || 0,
    pruned: out.pruned || 0,
    error: out.ok ? undefined : (out.error || out.skipped || "send_failed"),
    type: payload.type,
    title: payload.title,
    body: payload.body,
    path: payload.path,
  };
}
