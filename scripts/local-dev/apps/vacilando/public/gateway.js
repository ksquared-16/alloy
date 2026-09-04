/**
 * Vacilando Gateway V2 — browser controller.
 * Fetches only lane APIs. Does not poll /api/resources (reuses the existing 60s snapshot).
 */
import * as View from "./gateway-view.mjs";

const G = {
  lanes: [],
  selected: null,
  lane: null,
  output: null,
  recentOutput: null,
  outputMode: "recent",
  sending: false,
  notice: null,
  drafts: {},
  pollOut: null,
  pollList: null,
  visible: false,
  loading: false,
  listReady: false,
  outInflight: false,
  listInflight: false,
  showGen: 0,
  burstUntil: 0,
  watchRefresh: false,
  sawRefreshProgress: false,
  statusOpen: null,
  laneFoldOpen: null,
  asideOpen: null,
  asideHistory: false,
  latestResponse: null,
  threadEntered: false,
  threadLaneId: null,
  threadKey: null,
  threadNewUpdate: false,
  threadUserScrolled: false,
  userMessageExpanded: false,
  telemetry: null,
  telemetryByLane: {},
  pollTel: null,
  telInflight: false,
  copyFeedback: null,
  developmentResources: null,
  copyTimer: null,
  connect: { step: "chooser", candidates: [], candidate: null, name: "", instruction: "", loading: false, submitting: false, error: null },
  executionCapacity: null,
  unseenCount: 0,
  unseenByLane: {},
  notificationCounts: null,
  attentionCount: 0,
  attachments: [],
  attachmentsUploading: 0,
  attachmentError: null,
  lightbox: null,
  folders: [],
  repositories: [],
  repositorySheet: null,
  laneWizard: null,
  cancelPending: false,
  blockingScreen: null,
  screenPending: null,
  collapsedFolders: null,
  releasing: false,
  providers: null,
  providersInflight: false,
  notify: {
    permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
    enabled: false,
    subscribed: false,
    secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    standalone: false,
    isIOS: false,
    error: null,
    originKind: null,
    origin: null,
    swControlling: false,
    vapidAvailable: null,
    lastTestAt: null,
    lastTestOk: null,
  },
  notifyEndpoint: null,
  // ---- UI V2 ----------------------------------------------------------
  // The three standalone destinations each keep their own last payload, so
  // switching between them repaints instantly and refetches in the background
  // rather than flashing an empty page on every navigation.
  page: "home",
  laneTab: "overview",
  home: null,
  homeInflight: false,
  activity: null,
  activityInflight: false,
  system: null,
  systemInflight: false,
  activityFilters: { lane: null, kind: "all", outcome: "all", provider: null },
  usageWindow: "today",
  placeholders: false,
  // Which messages the operator has opened. Ids only — the text is never held
  // here, and an id for a message that has scrolled out of the thread is
  // harmless.
  expandedMessages: new Set(),
};

function routeName() {
  return View.parseGatewayHash(location.hash).name;
}

function routeLaneId() {
  const r = View.parseGatewayHash(location.hash);
  return r.name === "lanes" ? r.sub : null;
}

async function fetchProviders(force = false) {
  if (G.providersInflight && !force) return G.providers;
  G.providersInflight = true;
  try {
    const r = await gwFetch("/api/providers");
    G.providers = await r.json();
    if (G.providers?.pending) {
      setTimeout(() => { fetchProviders(true).then(() => paint()).catch(() => {}); }, 2500);
    }
  } catch { /* keep last probe */ }
  G.providersInflight = false;
  return G.providers;
}

function draftKey(id) { return `vac.gw.draft.${id}`; }
function getDraft(id) {
  if (!id) return "";
  if (G.drafts[id] == null) {
    try {
      G.drafts[id] = sessionStorage.getItem(draftKey(id)) || "";
      if (!G.drafts[id] && G.lane?.aliases) {
        for (const alias of G.lane.aliases) {
          const prev = sessionStorage.getItem(draftKey(alias));
          if (prev) {
            G.drafts[id] = prev;
            sessionStorage.setItem(draftKey(id), prev);
            sessionStorage.removeItem(draftKey(alias));
            break;
          }
        }
      }
    } catch { G.drafts[id] = ""; }
  }
  return G.drafts[id];
}
function setDraft(id, val) {
  if (!id) return;
  G.drafts[id] = val;
  try {
    if (val) sessionStorage.setItem(draftKey(id), val);
    else sessionStorage.removeItem(draftKey(id));
  } catch { /* private mode */ }
}

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function commitKnownLane(id) {
  const known = View.knownLane(G.lanes, id);
  if (!known) return false;
  G.lane = known;
  G.loading = false;
  return true;
}

function outputLane(id) {
  return G.lane && View.laneMatchesId(G.lane, id) ? G.lane : View.knownLane(G.lanes, id);
}

function paneOutputForLane(id) {
  if (View.outputBelongsToLane(G.recentOutput, id, outputLane(id))) return G.recentOutput;
  if (G.outputMode === "recent" && View.outputBelongsToLane(G.output, id, outputLane(id))) return G.output;
  return null;
}

function lastInstructionFor(id) {
  if (!id) return null;
  const fromLane = G.lane?.lane_id === id ? G.lane.last_instruction : null;
  const fromList = View.knownLane(G.lanes, id)?.last_instruction;
  const fromRecent = paneOutputForLane(id)?.last_instruction || null;
  const fromOut = G.output?.lane_id === id ? G.output.last_instruction : null;
  return fromRecent || fromOut || fromLane || fromList || null;
}

function attentionMap() {
  const store = storage();
  const map = {};
  for (const lane of G.lanes || []) {
    const viewing = G.selected === lane.lane_id;
    map[lane.lane_id] = View.deriveLaneStatus({
      lane,
      output: paneOutputForLane(lane.lane_id),
      lastInstruction: lastInstructionFor(lane.lane_id) || lane.last_instruction,
      viewed: View.readViewed(lane.lane_id, store, lane.aliases || []),
      viewing,
    });
  }
  return map;
}

function markViewed(id) {
  if (!id) return;
  View.writeViewed(id, {
    fingerprint: paneOutputForLane(id)?.fingerprint || null,
    activity_ms: G.lane?.lane_id === id ? (G.lane.last_activity_ms || null) : null,
    viewed_at: Date.now(),
  }, storage());
}

function notifyEnabled() {
  try { return storage()?.getItem(View.NOTIFY_ENABLED_KEY) === "1"; } catch { return false; }
}

function refreshNotifyFlags() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const origin = typeof location !== "undefined" ? location.origin : "";
  G.notify = {
    permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
    enabled: notifyEnabled(),
    subscribed: G.notify?.subscribed || false,
    secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    standalone: typeof window !== "undefined" && (
      window.navigator?.standalone === true
      || (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches)
    ),
    isIOS: /iPad|iPhone|iPod/.test(ua),
    error: G.notify?.error || null,
    originKind: View.pageOriginKind(origin, { secureContext: typeof window !== "undefined" ? window.isSecureContext : true }),
    origin,
    swControlling: typeof navigator !== "undefined" && Boolean(navigator.serviceWorker?.controller),
    vapidAvailable: G.notify?.vapidAvailable ?? null,
    lastTestAt: G.notify?.lastTestAt || null,
    lastTestOk: G.notify?.lastTestOk ?? null,
  };
}

function urlBase64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(String(b64 || "").replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch { /* fall through */ }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("copy_failed");
}

/**
 * The copy icon must yield the COMPLETE assistant response.
 *
 * In "recent" mode `output.text` is a bounded snapshot of the visible pane, so
 * copying it silently handed over a fragment. When the visible output is
 * bounded, fetch the complete text first — the transcript's assistant message
 * for a finished run, retained history otherwise — and fall back to whatever is
 * on screen only if that fetch yields nothing.
 */
async function completeCopyText() {
  const id = G.selected;
  const visible = View.copyableOutputText({
    selectedId: id,
    output: G.output,
    outputText: G.output?.lane_id === id ? G.output?.text : "",
    lane: G.lane,
    latestResponse: G.latestResponse?.lane_id === id ? G.latestResponse : null,
  });
  const plan = View.copySourcePlan(G.output, { lane: G.lane });
  if (!id || !plan.needsFetch) return visible;
  for (const mode of [plan.mode, plan.fallback].filter(Boolean)) {
    try {
      const r = await gwFetch(`/api/lanes/${encodeURIComponent(id)}/output?mode=${encodeURIComponent(mode)}`);
      const j = await r.json();
      if (!View.outputBelongsToLane(j, id, G.lane)) continue;
      const full = View.copyableOutputText({ selectedId: id, output: j, outputText: j?.text, lane: G.lane,
        latestResponse: G.latestResponse?.lane_id === id ? G.latestResponse : null });
      if (full && (!visible || full.length >= visible.length)) return full;
    } catch { /* fall through to the visible snapshot */ }
  }
  return visible;
}

async function copyActiveOutput() {
  const text = await completeCopyText();
  if (!text) return;
  try {
    await writeClipboardText(text);
    G.copyFeedback = "copied";
  } catch {
    G.copyFeedback = "failed";
  }
  paint();
  if (G.copyTimer) clearTimeout(G.copyTimer);
  G.copyTimer = setTimeout(() => {
    G.copyFeedback = null;
    paint();
  }, View.COPY_FEEDBACK_MS);
}

async function registerPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("push_unsupported");
  }
  if (!window.isSecureContext) throw new Error("insecure_context");
  const cfgR = await gwFetch("/api/gateway/push/config");
  const cfg = await cfgR.json();
  if (!cfgR.ok || !cfg?.vapid_public_key) throw new Error("vapid_unavailable");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  const key = urlBase64ToUint8Array(cfg.vapid_public_key);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  }
  const json = sub.toJSON();
  if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) {
    throw new Error("invalid_browser_subscription");
  }
  const saved = await gwFetch("/api/gateway/push/subscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      origin: location.origin,
    }),
  });
  const body = await saved.json().catch(() => ({}));
  if (!saved.ok || body?.ok === false) throw new Error(body?.error || "subscribe_failed");
  G.notify.subscribed = true;
  G.notifyEndpoint = json.endpoint;
}

async function enableGatewayNotifications() {
  G.notify.error = null;
  refreshNotifyFlags();
  if (!G.notify.secureContext || G.notify.originKind === "http_insecure") {
    G.notify.error = "This page is HTTP. Open the Tailscale HTTPS address, then tap Enable.";
    paint();
    return;
  }
  if (G.notify.originKind === "http_loopback") {
    G.notify.error = "Notifications need to be re-enabled on this device. Open the current HTTPS Vacilando address, then tap Enable notifications.";
    paint();
    return;
  }
  if (G.notify.isIOS && !G.notify.standalone) {
    G.notify.error = "Add Vacilando to Home Screen, open it from the icon, then tap Enable.";
    paint();
    return;
  }
  if (typeof Notification === "undefined") {
    G.notify.error = "Notifications are not available in this browser.";
    paint();
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    refreshNotifyFlags();
    paint();
    return;
  }
  try { storage()?.setItem(View.NOTIFY_ENABLED_KEY, "1"); } catch { /* */ }
  try {
    await registerPushSubscription();
    G.notify.error = null;
    await fetchPushHealth();
  } catch (e) {
    G.notify.subscribed = false;
    G.notifyEndpoint = null;
    const why = String(e?.message || e);
    G.notify.error = why === "insecure_context"
      ? "Background push needs HTTPS via Tailscale Serve."
      : `Background push did not subscribe (${why}). Alerts only work while this page is open.`;
  }
  refreshNotifyFlags();
  paint();
}

async function inspectDevicePush() {
  refreshNotifyFlags();
  G.notifyEndpoint = null;
  G.notify.subscribed = false;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) {
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager?.getSubscription();
    G.notify.swControlling = Boolean(navigator.serviceWorker.controller);
    if (sub?.endpoint) {
      G.notify.subscribed = true;
      G.notifyEndpoint = sub.endpoint;
      try { storage()?.setItem(View.NOTIFY_ENABLED_KEY, "1"); } catch { /* */ }
    }
  } catch { /* */ }
}

async function fetchPushHealth() {
  try {
    const r = await gwFetch("/api/gateway/push/health");
    const j = await r.json();
    if (r.ok && j?.ok) {
      G.notify.vapidAvailable = j.vapid_available !== false;
      G.notify.lastTestAt = j.last_test?.at || G.notify.lastTestAt;
      if (j.last_test) G.notify.lastTestOk = !j.last_test.error && Number(j.last_test.sent || 0) > 0;
      if (G.notify.originKind === "https" && j.stale_http_origin_subscriptions > 0 && !G.notify.subscribed) {
        G.notify.originKind = "origin_mismatch";
      }
    }
  } catch { /* */ }
}

async function sendTestNotification() {
  G.notify.error = null;
  await inspectDevicePush();
  if (!G.notifyEndpoint) {
    G.notify.error = "This device is not subscribed to the current Vacilando address.";
    refreshNotifyFlags();
    paint();
    return;
  }
  try {
    const r = await gwFetch("/api/gateway/push/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpoint: G.notifyEndpoint,
        lane_id: G.selected || null,
      }),
    });
    const j = await r.json().catch(() => ({}));
    G.notify.lastTestAt = new Date().toISOString();
    G.notify.lastTestOk = Boolean(r.ok && j?.ok && Number(j.sent || 0) > 0);
    if (!G.notify.lastTestOk) {
      G.notify.error = j?.error === "vapid_unavailable"
        ? "Push is not configured on the Gateway."
        : "Test notification did not deliver.";
    }
  } catch {
    G.notify.lastTestAt = new Date().toISOString();
    G.notify.lastTestOk = false;
    G.notify.error = "Test notification did not deliver.";
  }
  refreshNotifyFlags();
  paint();
}

async function restoreGatewayNotifications() {
  await inspectDevicePush();
  if (!window.isSecureContext) {
    refreshNotifyFlags();
    paint();
    return;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    await fetchPushHealth();
    refreshNotifyFlags();
    paint();
    return;
  }
  if (notifyEnabled() || G.notify.subscribed) {
    try {
      await registerPushSubscription();
      G.notify.error = null;
    } catch {
      G.notify.subscribed = Boolean(G.notifyEndpoint);
    }
  }
  await fetchPushHealth();
  refreshNotifyFlags();
  paint();
}

async function gwFetch(url, opts = {}) {
  const r = await fetch(url, { cache: "no-store", credentials: "same-origin", ...opts });
  if (r.status === 401) {
    showLogin();
    const err = new Error("unauthorized");
    err.status = 401;
    throw err;
  }
  return r;
}

function showLogin() {
  const el = document.getElementById("gw-login");
  if (el) el.hidden = false;
  const input = document.getElementById("gw-token");
  const btn = document.querySelector("[data-gw-login-submit]");
  if (btn) btn.disabled = false;
  if (input) {
    input.disabled = false;
    queueMicrotask(() => input.focus());
  }
}

function hideLogin() {
  const el = document.getElementById("gw-login");
  if (el) el.hidden = true;
}

async function submitGatewayLogin(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  }
  const form = document.querySelector("[data-gw-login]");
  const input = document.getElementById("gw-token");
  const err = document.querySelector("[data-gw-login-err]");
  const btn = document.querySelector("[data-gw-login-submit]");
  const token = input ? String(input.value || "").trim() : "";
  if (err) { err.hidden = true; err.textContent = ""; }
  if (!token) {
    if (err) { err.hidden = false; err.textContent = "Paste the Gateway token, then Continue."; }
    if (input) input.focus();
    return;
  }
  if (btn) btn.disabled = true;
  try {
    const r = await fetch("/api/gateway/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      if (btn) btn.disabled = false;
      if (input) {
        input.focus();
        input.select();
      }
      if (err) {
        err.hidden = false;
        err.textContent = j.error === "unauthorized"
          ? "That token was refused. Check the token file and try again."
          : "Could not sign in. The token was not accepted.";
      }
      return;
    }
    if (input) input.value = "";
    if (btn) btn.disabled = false;
    hideLogin();
    try {
      await show(View.parseGatewayHash(location.hash));
    } catch { /* show() already paints */ }
    const overlay = document.getElementById("gw-login");
    if (overlay && !overlay.hidden) {
      if (err) {
        err.hidden = false;
        err.textContent = "Signed in, but the browser did not keep the session cookie. Reload and try again.";
      }
    }
  } catch {
    if (btn) btn.disabled = false;
    if (input) input.focus();
    if (err) { err.hidden = false; err.textContent = "Could not reach the Gateway."; }
  }
}

/**
 * The V2 surface fetchers.
 *
 * Each is single-flight and each fails SOFT: a Home that cannot reach its
 * projection keeps the payload it already has and the data-maturity layer
 * renders unavailable states for anything it never had. A dashboard that
 * blanks itself on one slow probe is worse than one that is briefly stale.
 */
async function fetchHome() {
  if (G.homeInflight) return G.home;
  G.homeInflight = true;
  try {
    const r = await gwFetch("/api/v2/views/home");
    const j = await r.json();
    if (j?.ok) G.home = j;
    return G.home;
  } catch {
    return G.home;
  } finally {
    G.homeInflight = false;
  }
}

async function fetchActivity() {
  if (G.activityInflight) return G.activity;
  G.activityInflight = true;
  try {
    const r = await gwFetch("/api/v2/views/activity?limit=200");
    const j = await r.json();
    if (j?.ok) G.activity = j;
    return G.activity;
  } catch {
    return G.activity;
  } finally {
    G.activityInflight = false;
  }
}

async function fetchSystem() {
  if (G.systemInflight) return G.system;
  G.systemInflight = true;
  try {
    const r = await gwFetch("/api/v2/views/system");
    const j = await r.json();
    if (j?.ok) G.system = j;
    return G.system;
  } catch {
    return G.system;
  } finally {
    G.systemInflight = false;
  }
}

/** Home's health card wants disk, which the projection reports separately. */
function homeResources() {
  const res = G.home?.resources || resources();
  if (!res) return null;
  return G.home?.disk ? { ...res, disk: G.home.disk } : res;
}

function buildHomeVm(nowMs) {
  return View.buildHomeViewModel({
    lanes: G.lanes || [],
    approvals: G.home?.approvals || [],
    resources: homeResources(),
    capacity: G.home?.capacity || G.executionCapacity || null,
    usage: G.home?.usage || null,
    effectiveness: G.home?.effectiveness || null,
    activity: (G.home?.activity || []).map(mapActivityRow),
    laneState: (l) => View.canonicalLaneWorkState(l, { nowMs }),
    placeholders: G.placeholders,
    nowMs,
  });
}

function mapActivityRow(e) {
  return { ...e, at_ms: e.at ? Date.parse(e.at) : null };
}

function buildActivityVm(nowMs) {
  return View.buildActivityViewModel({
    events: (G.activity?.events || []).map(mapActivityRow),
    lanes: G.lanes || [],
    filters: G.activityFilters,
    nowMs,
  });
}

function buildSystemVm() {
  const res = G.system?.resources || resources();
  return View.buildSystemViewModel({
    resources: G.system?.disk && res ? { ...res, disk: G.system.disk } : res,
    capacity: G.system?.capacity || G.executionCapacity || null,
    diagnostics: G.system?.diagnostics || null,
    providers: G.providers || null,
    usage: G.system?.usage || null,
    history: G.system?.history || [],
    placeholders: G.placeholders,
  });
}

async function fetchLanes() {
  const r = await gwFetch("/api/lanes");
  const j = await r.json();
  G.lanes = Array.isArray(j.lanes) ? j.lanes : [];
  if (Array.isArray(j.folders)) G.folders = j.folders;
  if (Array.isArray(j.repositories)) G.repositories = j.repositories;
  if (typeof j.unseen_count === "number") applyUnseen(j.unseen_count, j.unseen_by_lane, j.notification_counts);
  if (j.development_resources) G.developmentResources = j.development_resources;
  if (j.execution_capacity) G.executionCapacity = j.execution_capacity;
  else G.executionCapacity = View.summarizeExecutionCapacity(G.lanes);
  return G.lanes;
}

async function fetchLane(id) {
  const r = await gwFetch(`/api/lanes/${encodeURIComponent(id)}`);
  const j = await r.json();
  const next = j.ok && j.lane && View.laneMatchesId(j.lane, id) ? j.lane : null;
  if (next && next.lane_id !== id && G.selected === id) {
    G.selected = next.lane_id;
    try { history.replaceState(null, "", View.laneDetailHash(next.lane_id)); } catch { /* */ }
  }
  G.lane = View.applyFetchedLane(G.selected, next?.lane_id || id, G.lane, next);
  if (G.lane) G.lanes = View.upsertLaneInList(G.lanes, G.lane);
  return G.lane;
}

async function fetchOutput(id, { mode = "recent" } = {}) {
  const requested = mode === "extended" || mode === "latest_response" ? mode : "recent";
  const q = requested === "recent" ? "" : `?mode=${encodeURIComponent(requested)}`;
  const r = await gwFetch(`/api/lanes/${encodeURIComponent(id)}/output${q}`);
  const j = await r.json();
  if (requested === "recent") {
    G.recentOutput = View.applyFetchedOutput(G.selected, id, G.recentOutput, j);
    if (G.recentOutput?.last_instruction && G.lane && View.laneMatchesId(G.lane, id)) {
      G.lane = { ...G.lane, last_instruction: G.recentOutput.last_instruction };
    }
    if (G.outputMode === "recent") {
      G.output = G.recentOutput;
    }
    return G.recentOutput;
  }
  G.output = View.applyFetchedOutput(G.selected, id, G.output, j);
  G.outputMode = requested;
  return G.output;
}

/**
 * A lane that has not adopted `vac run-report` still wrote a real answer — it
 * is in the session transcript. Fetch it so the conversation shows the summary
 * instead of the bounded status one-liner. Skipped entirely once a structured
 * report exists, because the report is authoritative.
 */
function laneHasStructuredReport(lane) {
  return Boolean(lane?.execution_run?.agent_report?.message || lane?.previous_run?.agent_report?.message);
}

async function fetchLatestResponse(id) {
  if (!id) return null;
  try {
    const r = await gwFetch(`/api/lanes/${encodeURIComponent(id)}/output?mode=latest_response`);
    const j = await r.json();
    if (!View.outputBelongsToLane(j, id, G.lane)) return G.latestResponse;
    G.latestResponse = j;
    return j;
  } catch {
    return G.latestResponse;
  }
}

async function fetchTelemetry(id) {
  const r = await gwFetch(`/api/lanes/${encodeURIComponent(id)}/telemetry`);
  const j = await r.json();
  const next = View.applyFetchedLane(G.selected, id, G.telemetry, j);
  G.telemetry = next;
  if (next && id) G.telemetryByLane[id] = next;
  return next;
}

function resources() {
  return window.__vacilandoResources || null;
}

/**
 * Paint the primary navigation into both the desktop rail and the mobile bar.
 *
 * ONE declaration (View.PRIMARY_NAV) feeds both, so the two form factors cannot
 * drift into offering different destinations — which is precisely how "the
 * mobile app" and "the desktop app" stop being the same product.
 */
function paintNav() {
  // ONE COUNT, FROM THE SET THAT IS ACTUALLY RENDERED.
  //
  // This read `G.attentionCount` — the notification store's own actionable
  // number — while the Needs You control, its panel heading and the rows in it
  // all came from buildNeedsYou(). Two answers to "how much needs you", from
  // two stores, free to disagree: a resolved request that had left the governed
  // list could still be carried in the notification count, and the badge would
  // insist something needed the operator while the panel it opens said nothing
  // did. The badge now counts exactly what the panel will show.
  const needs = needsYouVm().count;
  const primary = document.getElementById("primary-nav");
  if (primary) primary.innerHTML = View.renderPrimaryNav(G.page, { needsYou: needs });
  const tabs = document.getElementById("mobile-nav");
  if (tabs) tabs.innerHTML = View.renderMobileNav(G.page, { needsYou: needs });
  // The lane rail is a LANES-section affordance. On Home, Activity or System it
  // is not navigation to anywhere you are, so it does not compete for the eye.
  const railLanes = document.getElementById("rail-lanes");
  if (railLanes) railLanes.hidden = G.page !== "lanes";
  const crumb = document.getElementById("crumb");
  if (crumb) {
    crumb.textContent = { home: "Home", lanes: "Development Lanes", activity: "Activity", system: "System" }[G.page] || "Vacilando";
  }
  document.body.dataset.vPage = G.page;
}

function paintRail() {
  const el = document.getElementById("lane-rail");
  const map = attentionMap();
  if (el) {
    el.innerHTML = View.railHtml(G.lanes, G.selected, map, G.telemetryByLane, {
      repositories: G.repositories,
      folders: G.folders,
      collapsedFolders: collapsedFolders(),
    });
  }
  const label = document.querySelector(".nav-missions-label");
  if (label) label.textContent = "Development Lanes";
}

function preserveComposer() {
  const ta = document.getElementById("gw-instruction");
  if (!ta) return null;
  return {
    focused: document.activeElement === ta,
    value: ta.value,
    start: ta.selectionStart,
    end: ta.selectionEnd,
    provider: document.getElementById("gw-composer-provider")?.value || null,
    outputScroll: document.querySelector("[data-gw-output]")?.scrollTop ?? null,
    thread: threadScrollState(),
  };
}

/**
 * The thread is the scroller now that the assistant bubble has a real height,
 * and it was never scrolled — so a repaint left the newest reply below the fold
 * with the composer sitting on top of it. Pin to the bottom unless the operator
 * has deliberately scrolled up to read back.
 */
const THREAD_BOTTOM_SLACK_PX = 48;

function threadScrollState() {
  const el = document.querySelector("[data-gw-thread]");
  if (!el) return null;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return { top: el.scrollTop, atBottom: distance <= THREAD_BOTTOM_SLACK_PX };
}

/**
 * Identity of what the conversation is currently showing. Used to tell a
 * genuinely new message from the same message re-rendered by a poll.
 */
function threadMessageKey() {
  const rep = document.querySelector("[data-gw-report]");
  if (!rep) return null;
  return [
    G.selected,
    rep.getAttribute("data-report-type"),
    rep.getAttribute("data-report-id") || "",
    rep.getAttribute("data-report-revision") || "",
    String(document.querySelector("[data-gw-report-body]")?.textContent?.length || 0),
  ].join("|");
}

/**
 * Where a lane opens.
 *
 * At the START of the latest exchange — the top of the operator's own last
 * message — so the answer is read from its beginning. Pinning to the bottom
 * dropped the reader into the middle of a long completion; pinning to the top
 * of the whole thread showed old turns.
 */
/**
 * Where a lane opens.
 *
 * On the LATEST EXCHANGE — the top of the most recent authored message — so the
 * operator reads the start of what was said rather than its last line. System
 * events are skipped: landing on "development server restarted" is not why
 * anyone opened a lane.
 *
 * TWO BUGS THIS FIXES, both introduced when the thread gained real authorship:
 *
 *   · It queried `.gw-msg-user` / `.gw-msg-assistant`. The user class no longer
 *     exists, so the intended "position at the instruction" path was dead code.
 *   · It used querySelector, which returns the FIRST match. With more than one
 *     message in the thread that positions at the OLDEST — the exact behaviour
 *     the correction was supposed to remove.
 */
function positionThreadForEntry() {
  const el = document.querySelector("[data-gw-thread]");
  if (!el) return;
  const authored = el.querySelectorAll('.vmsg-user, .vmsg-provider, .gw-msg-user, .gw-msg-assistant');
  const latest = authored[authored.length - 1];
  if (!latest) { el.scrollTop = el.scrollHeight; return; }
  const target = Math.max(0, latest.offsetTop - el.offsetTop);
  // Never scroll PAST the latest message to reach it.
  el.scrollTop = Math.min(target, Math.max(0, el.scrollHeight - el.clientHeight));
}

/**
 * A poll must not move the page under someone who is reading. Follow only when
 * they are already at the bottom; otherwise hold position and, if the message
 * actually changed, offer a quiet way down.
 */
function restoreThreadScroll(saved) {
  const el = document.querySelector("[data-gw-thread]");
  if (!el) return;
  const key = threadMessageKey();

  if (!G.threadEntered || G.threadLaneId !== G.selected) {
    G.threadEntered = true;
    G.threadLaneId = G.selected;
    G.threadKey = key;
    G.threadNewUpdate = false;
    G.threadUserScrolled = false;
    positionThreadForEntry();
    bindThreadScrollWatch();
    return;
  }

  const changed = key !== G.threadKey;
  G.threadKey = key;

  if (saved && saved.atBottom === false) {
    el.scrollTop = saved.top;
    // Only when the operator actually scrolled. Entry positions the thread at
    // the start of the latest exchange, which is "not at bottom" by
    // construction — flagging that as a missed update is a false positive on
    // the very first paint.
    if (changed && G.threadUserScrolled) setNewUpdateAffordance(true);
    return;
  }
  el.scrollTop = el.scrollHeight;
  setNewUpdateAffordance(false);
}

/** A scroll the operator performed, as opposed to one we performed for them. */
function bindThreadScrollWatch() {
  const el = document.querySelector("[data-gw-thread]");
  if (!el || el.dataset.gwScrollWatch === "1") return;
  el.dataset.gwScrollWatch = "1";
  el.addEventListener("scroll", () => {
    G.threadUserScrolled = true;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= THREAD_BOTTOM_SLACK_PX) setNewUpdateAffordance(false);
  }, { passive: true });
}

/** A subtle affordance, never a jump. */
function setNewUpdateAffordance(on) {
  if (G.threadNewUpdate === on) return;
  G.threadNewUpdate = on;
  const el = document.querySelector("[data-gw-new-update]");
  if (el) el.hidden = !on;
}

function scrollThreadToLatest() {
  const el = document.querySelector("[data-gw-thread]");
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  setNewUpdateAffordance(false);
}

function restoreComposer(saved) {
  const ta = document.getElementById("gw-instruction");
  if (!ta || !saved) return;
  ta.value = saved.value;
  setDraft(G.selected, saved.value);
  if (saved.focused) {
    ta.focus();
    try { ta.setSelectionRange(saved.start, saved.end); } catch { /* */ }
  }
  if (saved.provider) {
    const sel = document.getElementById("gw-composer-provider");
    if (sel) sel.value = saved.provider;
    document.querySelectorAll("[data-gw-provider-opt]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-gw-provider-opt") === saved.provider ? "true" : "false");
    });
  }
  const pre = document.querySelector("[data-gw-output]");
  if (pre && saved.outputScroll != null && saved.focused) pre.scrollTop = saved.outputScroll;
  else if (pre) pre.scrollTop = pre.scrollHeight;
  restoreThreadScroll(saved.thread);
}

function syncGatewayViewport() {
  const vv = window.visualViewport;
  const h = vv ? Math.round(vv.height) : window.innerHeight;
  // Capture BEFORE the shrink: once the container is smaller, "at bottom" is no
  // longer computable from the new geometry.
  const before = threadScrollState();
  document.documentElement.style.setProperty("--gw-vvh", `${h}px`);
  document.documentElement.style.setProperty("--gw-vvo", `${vv ? Math.round(vv.offsetTop) : 0}px`);
  // The iOS keyboard shrinks the visual viewport without repainting. The thread
  // keeps its old scrollTop, so opening the keyboard pushed the newest reply out
  // of view and left the operator looking at the tail of their own message.
  // The on-screen keyboard leaves ~60px of thread once the topbar, header,
  // status line and composer have taken their share — the conversation becomes
  // unreadable exactly while the operator is writing about it. Mark the state so
  // non-essential chrome can stand down.
  const keyboardOpen = Boolean(vv) && h < window.innerHeight * 0.75;
  const wasKeyboardOpen = document.documentElement.hasAttribute("data-gw-keyboard");
  document.documentElement.toggleAttribute("data-gw-keyboard", keyboardOpen);
  // The writing area is measured from the visual viewport, so a keyboard
  // appearing, growing (autocorrect bar) or leaving all resize the field.
  syncComposeMode();
  // Opening the keyboard is a writing gesture: show the newest content, which
  // is what a reply is about to respond to.
  const pin = keyboardOpen && !wasKeyboardOpen ? { atBottom: true } : before;
  // Layout has not settled inside this frame, so scrollHeight is stale and the
  // browser clamps the assignment. Pin again once it has.
  requestAnimationFrame(() => {
    restoreThreadScroll(pin);
    requestAnimationFrame(() => restoreThreadScroll(pin));
  });
  setTimeout(() => restoreThreadScroll(pin), 120);
}

function bindGatewayViewport() {
  if (bindGatewayViewport.done) return;
  bindGatewayViewport.done = true;
  const sync = () => syncGatewayViewport();
  sync();
  window.addEventListener("resize", sync);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", sync);
    window.visualViewport.addEventListener("scroll", sync);
  }
}

/**
 * The composer grows with what is in it.
 *
 * THE FLOOR USED TO BE UNCONDITIONAL: 48px on a phone whether or not anything
 * had been typed, inside a box that then reserved ~139px of a 844px screen for
 * an empty field. An idle composer should ask for one line; a composer being
 * used should take what it needs.
 */
function autosizeInstruction(ta) {
  const el = ta || document.getElementById("gw-instruction");
  if (!el) return;
  el.style.height = "auto";
  const isMobile = window.innerWidth <= 860;
  const vvh = window.visualViewport?.height || window.innerHeight;
  let floor;
  let cap;
  if (document.documentElement.hasAttribute("data-gw-compose")) {
    // COMPOSE MODE SIZES TO THE WRITING AREA, NOT TO THE LINE COUNT.
    //
    // Everywhere else the field asks for one line and grows only as it is
    // filled, because an idle composer should not reserve a screen. While the
    // operator is actually writing that logic is backwards: the field is the
    // task, and starting it at 44px means every real instruction is typed
    // through a slot. It opens at ~35% of the ABOVE-KEYBOARD area — the visual
    // viewport, which is what the keyboard leaves behind — grows to ~45%, and
    // then scrolls itself rather than eating the conversation it is replying to.
    floor = Math.round(vvh * 0.35);
    cap = Math.round(vvh * 0.45);
  } else {
    cap = Math.min(isMobile ? 112 : 220, Math.round(vvh * (isMobile ? 0.18 : 0.28)));
    // Idle means empty AND unfocused. Either one is a reason to hold the room.
    const idle = !String(el.value || "").trim() && document.activeElement !== el;
    floor = isMobile ? (idle ? 38 : 48) : 72;
  }
  el.style.height = `${Math.max(floor, Math.min(el.scrollHeight, cap))}px`;
  const form = document.querySelector("[data-gw-composer]");
  const stage = document.querySelector("[data-gw-stage]");
  // A PROPORTION IS AN INTENTION; THE STAGE IS THE CONSTRAINT.
  //
  // 45% of the writing area is the right SHAPE, and on a 320x300 viewport it is
  // still too much: the head, the thread's floor and the composer's own controls
  // do not shrink with it, so the interaction zone ran 27px past the bottom of
  // the screen and took Send with it. Measured after layout rather than
  // predicted, because the chrome around the field is what actually varies.
  if (document.documentElement.hasAttribute("data-gw-compose") && stage) {
    const zone = document.querySelector(".vlane-interaction");
    const head = document.querySelector(".vlane-head");
    const MIN_THREAD_PX = 40;
    if (zone) {
      // Two constraints, and the tighter one governs: the zone must end on the
      // screen (the visual viewport, which is what the keyboard shrinks), and
      // it must leave the thread its floor. Bounding only by the stage left the
      // zone 8px past the bottom of a 300px screen, because the stage's own
      // padding and safe-area inset sit outside its client box.
      const screenBottom = Math.round(window.visualViewport?.height || window.innerHeight);
      const offScreen = Math.round(zone.getBoundingClientRect().bottom) - screenBottom;
      const room = stage.clientHeight - (head?.offsetHeight || 0) - MIN_THREAD_PX;
      const over = Math.max(offScreen, zone.offsetHeight - room);
      if (over > 0) {
        el.style.height = `${Math.max(72, el.offsetHeight - over)}px`;
      }
    }
  }
  if (form && stage) stage.style.setProperty("--gw-composer-h", `${form.offsetHeight}px`);
}

/**
 * COMPOSE MODE — WRITING IS A MODE, NOT A SMALLER LANE.
 *
 * The previous behaviour kept the whole lane composition and shrank the
 * composer into it: tabs, header, metadata and bottom navigation all held their
 * ground while the field the operator was typing into collapsed to a 44px slot
 * with a 76px ceiling. That is a lane with a keyboard in front of it, not a
 * writing surface.
 *
 * When the operator focuses the instruction field on a phone, composing becomes
 * the primary task and the lane says so: orientation chrome stands down, enough
 * recent thread stays to know what is being replied to, and the field takes the
 * room. It is a distinct responsive state with its own composition, which is
 * why it is an explicit attribute rather than a pile of `:focus-within` rules.
 */
function composeModeActive() {
  if (window.innerWidth > 860) return false;
  if (!document.querySelector(".gw.is-detail")) return false;
  const ta = document.getElementById("gw-instruction");
  if (!ta) return false;
  // Focus is the gesture. The keyboard flag is the corroborating signal for
  // devices that focus a field without a matching activeElement update.
  return document.activeElement === ta
    || document.documentElement.hasAttribute("data-gw-keyboard");
}

function syncComposeMode() {
  const on = composeModeActive();
  const was = document.documentElement.hasAttribute("data-gw-compose");
  document.documentElement.toggleAttribute("data-gw-compose", on);
  if (on === was) return;
  // The field's floor and ceiling both change with the mode, so it must be
  // re-measured rather than left at the other mode's height.
  autosizeInstruction();
  // Entering or leaving compose is a writing gesture: what the operator is
  // replying to is the newest message, not wherever the thread happened to sit.
  requestAnimationFrame(() => restoreThreadScroll({ atBottom: true }));
}

// Focus and blur change what "idle" means and whether composing is the task, so
// they re-measure. Without this the composer only ever resized on input and
// stayed at its typing height after the operator moved on.
document.addEventListener("focusin", (e) => {
  if (e.target instanceof HTMLElement && e.target.id === "gw-instruction") {
    syncComposeMode();
    autosizeInstruction(e.target);
  }
});
document.addEventListener("focusout", (e) => {
  if (e.target instanceof HTMLElement && e.target.id === "gw-instruction") {
    syncComposeMode();
    autosizeInstruction(e.target);
  }
});

function statusOpenNow() {
  if (G.statusOpen != null) return G.statusOpen;
  G.statusOpen = View.readStatusOpen(storage(), window.innerWidth);
  return G.statusOpen;
}

/**
 * Open state of the single lane details panel.
 *
 * Desktop keeps it beside the conversation — there it is a column, not an
 * overlay, so a persisted preference is right. Mobile ALWAYS opens a lane on
 * the chat: the panel is an overlay, and restoring it across navigation put
 * diagnostics in front of the conversation the operator asked for. Only an
 * explicit tap opens it, and only for the current visit.
 */
function isMobileWidth() {
  return window.innerWidth <= View.MOBILE_MAX_PX;
}

function asideOpenNow() {
  if (isMobileWidth()) return G.asideOpen === true;
  if (G.asideOpen != null) return G.asideOpen;
  G.asideOpen = View.readLaneFoldOpen(storage(), window.innerWidth);
  return G.asideOpen;
}

function setAsideOpen(open, { restoreFocus = false, fromHistory = false } = {}) {
  const next = Boolean(open);
  const wasOpen = asideOpenNow();
  G.asideOpen = next;
  if (!fromHistory) {
    if (next && !wasOpen) pushDetailsHistoryEntry();
    else if (!next && wasOpen) dropDetailsHistoryEntry();
  }
  // The persisted preference is a DESKTOP preference. Writing it on mobile is
  // what made Details reappear on the next lane.
  if (!isMobileWidth()) View.writeLaneFoldOpen(next, storage());
  paint();
  if (!next && wasOpen && restoreFocus) {
    const btn = document.querySelector("[data-gw-aside-toggle]");
    if (btn) btn.focus();
  }
}

function collapsedFolders() {
  if (!G.collapsedFolders) G.collapsedFolders = View.readCollapsedFolders(storage());
  return G.collapsedFolders;
}

function toggleFolderCollapsed(folderId) {
  const set = collapsedFolders();
  if (set.has(folderId)) set.delete(folderId);
  else set.add(folderId);
  View.writeCollapsedFolders(set, storage());
  paint();
}

async function refreshFolders() {
  try {
    const r = await gwFetch("/api/lane-folders");
    const j = await r.json();
    if (Array.isArray(j.folders)) G.folders = j.folders;
  } catch { /* the list poll will carry them on the next tick */ }
}

/**
 * The unseen count is SERVER truth, applied in one place.
 *
 * Every path that can change it — a poll, an acknowledgement, a reconnect —
 * funnels through here, so the lane indicators and the app tile can never
 * disagree with each other or drift out of sync with the store.
 */
function applyUnseen(count, byLane, counts) {
  G.unseenCount = Number(count) || 0;
  // The attention count is the canonical projection's actionable count, not a
  // length computed in the browser.
  if (counts && typeof counts === "object") {
    G.notificationCounts = counts;
    G.attentionCount = Number(counts.actionable) || 0;
  }
  if (byLane && typeof byLane === "object") G.unseenByLane = byLane;
  for (const lane of G.lanes || []) lane.unseen_notifications = G.unseenByLane[lane.lane_id] || 0;
  View.applyAppBadge(G.unseenCount);
  paintAttentionBadge();
}

/**
 * Opening a lane IS the acknowledgement — the operator is reading the answer.
 * Acknowledge against the canonical owner and repaint from ITS reply, never
 * from an optimistic local guess.
 */
async function acknowledgeLane(laneId) {
  if (!laneId) return;
  if (!(G.unseenByLane?.[laneId] > 0)) return;
  try {
    const r = await gwFetch("/api/notifications/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lane_id: laneId }),
    });
    const j = await r.json();
    if (j.ok) { applyUnseen(j.unseen_count, j.unseen_by_lane, j.notification_counts); paint(); }
  } catch { /* the next list poll reconciles */ }
}

/** Entering a lane is always chat-first. */
function resetAsideForLaneEntry() {
  if (isMobileWidth()) G.asideOpen = false;
}

function paint() {
  const view = document.getElementById("view");
  if (!view || !G.visible) return;
  bindGatewayViewport();
  refreshNotifyFlags();
  const saved = preserveComposer();
  const composer = {
    disabled: G.sending || G.releasing,
    notice: G.notice,
    draft: saved?.value ?? getDraft(G.selected),
  };
  const map = attentionMap();
  // NO CLIENT-SIDE NOTIFIER. maybeNotify() used to fire browser notifications
  // from the poll loop, deduped only by an in-memory map — so every refresh,
  // reconnect or tab reopen re-announced work the operator had already seen,
  // and it raced the server's own push for the same event. The Gateway's
  // durable notification record is now the single producer.
  const outputForSelected = View.outputBelongsToLane(G.output, G.selected, outputLane(G.selected)) ? G.output : null;
  view.innerHTML = View.renderGatewayShell({
    lanes: G.lanes,
    selectedId: G.selected,
    lane: G.lane,
    output: outputForSelected,
    outputText: outputForSelected?.text || "",
    outputPending: Boolean(G.selected && G.lane && !outputForSelected),
    latestResponse: G.latestResponse?.lane_id === G.selected ? G.latestResponse : null,
    newUpdate: G.threadNewUpdate,
    composer,
    resources: resources(),
    lastInstruction: lastInstructionFor(G.selected),
    statusOpen: statusOpenNow(),
    asideOpen: asideOpenNow(),
    // Only the mobile drawer is ever actually hidden; the desktop pane is a
    // permanent column, so it must never be inert.
    asideInert: isMobileWidth() && !asideOpenNow(),
    userMessageExpanded: G.userMessageExpanded,
    attentionByLane: map,
    telemetry: G.telemetry?.lane_id === G.selected ? G.telemetry : null,
    telemetryByLane: G.telemetryByLane,
    copyFeedback: G.copyFeedback,
    notify: G.notify,
    developmentResources: G.developmentResources,
    executionCapacity: G.executionCapacity,
    listReady: G.listReady,
    loading: G.loading,
    connect: G.connect,
    folders: G.folders,
    collapsedFolders: collapsedFolders(),
    repositories: G.repositories,
    repositorySheet: G.repositorySheet,
    laneWizard: G.laneWizard,
    cancelPending: G.cancelPending,
    blockingScreen: G.blockingScreen,
    screenPending: G.screenPending,
    attachments: G.attachments,
    attachmentsUploading: G.attachmentsUploading,
    attachmentError: G.attachmentError,
    lightbox: G.lightbox,
    providers: G.providers,
    settings: View.parseGatewayHash(location.hash).name === "settings",
    page: G.page,
    tab: G.laneTab,
    placeholders: G.placeholders,
    returnTo: readLaneOrigin(),
    homeVm: G.page === "home" ? buildHomeVm(Date.now()) : null,
    activityVm: G.page === "activity" ? buildActivityVm(Date.now()) : null,
    systemVm: G.page === "system" ? buildSystemVm() : null,
  });
  // Re-open what the operator had open. Done before scroll restoration, so the
  // heights are settled by the time the thread is positioned.
  for (const id of G.expandedMessages) {
    const li = view.querySelector(`.vmsg[data-v-msg-id="${CSS.escape(id)}"]`);
    if (!li) continue;
    li.classList.add("is-expanded");
    const btn = li.querySelector("[data-v-msg-more]");
    if (btn) btn.setAttribute("aria-expanded", "true");
  }
  paintNav();
  paintNeedsYou();
  paintRail();
  restoreComposer(saved);
  if (!saved) restoreThreadScroll(null);
  bindThreadScrollWatch();
  const count = view.querySelector("[data-gw-count]");
  const ta = document.getElementById("gw-instruction");
  if (count && ta) count.textContent = `${ta.value.length.toLocaleString()} characters`;
  // A repaint can replace the composer, and with it the focus that put the lane
  // into compose mode. Re-derive the mode from what is actually on screen.
  syncComposeMode();
  autosizeInstruction(ta);
  if (G.selected && G.lane?.lane_id === G.selected) {
    markViewed(G.selected);
    acknowledgeLane(G.selected);
  }
}

function stopOutputPoll() {
  if (G.pollOut) { clearTimeout(G.pollOut); G.pollOut = null; }
}
function stopListPoll() {
  if (G.pollList) { clearInterval(G.pollList); G.pollList = null; }
}
function stopTelemetryPoll() {
  if (G.pollTel) { clearInterval(G.pollTel); G.pollTel = null; }
}

function startTelemetryPoll(laneId) {
  stopTelemetryPoll();
  G.pollTel = setInterval(async () => {
    if (G.telInflight) return;
    if (document.hidden) return;
    if (routeName() !== "lanes" || G.selected !== laneId) return;
    G.telInflight = true;
    try {
      await fetchTelemetry(laneId);
      paint();
    } catch { /* keep last */ }
    finally { G.telInflight = false; }
  }, View.TELEMETRY_POLL_MS);
}

function applyContextRefreshWatch() {
  const refresh = View.contextRefreshStatus(G.lane);
  if (refresh?.kind === "progress" && G.watchRefresh) {
    G.sawRefreshProgress = true;
  }
  if (!G.watchRefresh) return false;
  if (refresh?.kind === "ok" || (G.sawRefreshProgress && !refresh && View.claudeRunStatus(G.lane).running)) {
    G.watchRefresh = false;
    G.sawRefreshProgress = false;
    G.notice = { kind: "ok", text: "Claude context refreshed." };
    return true;
  }
  if (refresh?.kind === "err") {
    G.watchRefresh = false;
    G.sawRefreshProgress = false;
    G.notice = { kind: "err", text: refresh.label || "Claude context refresh failed." };
    return true;
  }
  return false;
}

async function promoteCompletedOutput(laneId) {
  if (G.finalizedOutput) return;
  const prev = G.output;
  await fetchOutput(laneId, { mode: "latest_response" }).catch(() => {});
  if (!laneHasStructuredReport(G.lane)) await fetchLatestResponse(laneId).catch(() => {});
  if (!G.output?.available || !String(G.output?.text || "").trim()) {
    G.outputMode = "recent";
    G.output = G.recentOutput || prev;
  }
  G.finalizedOutput = true;
}

function startOutputPoll(laneId) {
  stopOutputPoll();
  const tick = async () => {
    G.pollOut = null;
    if (!View.shouldPollOutput({ hidden: document.hidden, routeName: routeName(), laneId: G.selected })) {
      G.pollOut = setTimeout(tick, View.outputPollIntervalMs({
        burstUntil: G.burstUntil,
        liveWork: View.laneAgentIsWorking(G.lane),
      }));
      return;
    }
    if (G.selected !== laneId) return;
    if (!G.outInflight) {
      G.outInflight = true;
      try {
        await fetchOutput(laneId, { mode: "recent" });
        const watching = G.watchRefresh || View.contextRefreshStatus(G.lane)?.kind === "progress";
        const runState = G.lane?.execution_run?.state;
        const liveWork = View.laneAgentIsWorking(G.lane);
        const observed = G.lane?.provider_activity?.activity;
        // An EXECUTING run with an idle pane is not live work. Trust Runtime
        // sat on a 19-hour run after Claude had already cooked; bursting that
        // as "still working" is what froze the thread on vac run-status.
        const liveRun = liveWork
          || ["VALIDATING", "WAITING_RESOURCE", "NEEDS_INPUT", "RECOVERING"].includes(runState)
          || (runState === "EXECUTING" && observed !== "ready")
          || (G.burstUntil && Date.now() < G.burstUntil);
        if (watching || liveRun) {
          await fetchLane(laneId).catch(() => {});
          applyContextRefreshWatch();
        }
        // The conversation needs the agent's own message. If the lane has not
        // adopted `vac run-report`, that message lives in the session
        // transcript, so fetch it alongside the pane.
        if (!laneHasStructuredReport(G.lane)) {
          await fetchLatestResponse(laneId);
        } else if (G.latestResponse) {
          G.latestResponse = null;
        }
        const paneOut = paneOutputForLane(laneId);
        const pre = document.querySelector("[data-gw-output]");
        if (liveRun) {
          G.outputMode = "recent";
          G.output = G.recentOutput;
          G.finalizedOutput = false;
        } else if (runState === "COMPLETE" || observed === "ready" || (!runState && G.lane?.previous_run?.state === "COMPLETE")) {
          await promoteCompletedOutput(laneId);
        }
        if (!watching && pre && document.activeElement && document.activeElement.id === "gw-instruction") {
          if (G.outputMode === "recent" || liveRun) {
            const keep = pre.scrollTop;
            pre.textContent = G.output?.text || "";
            pre.scrollTop = keep;
          }
          const presence = document.querySelector("[data-gw-presence]");
          if (presence && G.lane) {
            presence.textContent = View.deriveLaneExecutionPosture(G.lane).headline
              || View.deriveLaneStatus({
                lane: G.lane,
                output: paneOut,
                lastInstruction: lastInstructionFor(laneId),
                viewing: true,
              }).headline;
          }
        } else {
          paint();
        }
      } catch { /* keep last */ }
      finally { G.outInflight = false; }
    }
    if (G.selected === laneId) {
      G.pollOut = setTimeout(tick, View.outputPollIntervalMs({
        burstUntil: G.burstUntil,
        liveWork: View.laneAgentIsWorking(G.lane),
      }));
    }
  };
  G.pollOut = setTimeout(tick, View.outputPollIntervalMs({
    burstUntil: G.burstUntil,
    liveWork: View.laneAgentIsWorking(G.lane),
  }));
}

/**
 * Repaint the global pending-approvals bar.
 *
 * Kept independent of the lane projection on purpose: an approval must be
 * reachable even when no lane is selected, which is exactly the state the
 * operator was in when they could not find one.
 */
async function refreshApprovals() {
  try {
    const r = await gwFetch("/api/v2/governed-actions/pending");
    const out = await r.json().catch(() => ({}));
    G.approvals = Array.isArray(out.approvals) ? out.approvals : [];
  } catch { G.approvals = G.approvals || []; }
  // THE BADGE NEEDS AN OWNER THAT ALWAYS RUNS.
  //
  // The canonical counts arrived on the lane-list poll, which only runs on the
  // lanes route — so an operator sitting anywhere else watched a stale number.
  // Reading them here gives the attention count the same refresh cadence as the
  // approvals it describes, and it is still the SERVER's projection: this
  // fetches the count, it does not compute one.
  await refreshAttentionCounts();
  paintApprovals();
}

async function refreshAttentionCounts() {
  try {
    const r = await gwFetch("/api/notifications?limit=1");
    const j = await r.json().catch(() => ({}));
    if (j && typeof j.unseen_count === "number") {
      // `counts` is what this route has always called the canonical breakdown.
      applyUnseen(j.unseen_count, j.unseen_by_lane, j.counts);
    }
  } catch { /* the next poll carries it */ }
}

/**
 * NEEDS YOU IS THE SHELL'S JOB NOW.
 *
 * The permanent approvals bar is gone. It rendered the same pending requests as
 * a 241px-per-request block at the top of the content column on EVERY route —
 * above Home's own Needs You card, above the lane catalogue, above the lane —
 * so one decision could occupy three surfaces at once and none of them was
 * where the operator was looking. The governed payload it carried is not lost:
 * Review opens it on the lane that raised it, which is the only place it can be
 * acted on with its own context.
 */
function needsYouVm(nowMs = Date.now()) {
  const approvals = (G.approvals && G.approvals.length) ? G.approvals : (G.home?.approvals || []);
  return View.buildNeedsYou({
    lanes: G.lanes || [],
    approvals,
    laneState: (l) => View.canonicalLaneWorkState(l, { nowMs }),
    nowMs,
  });
}

function paintNeedsYou() {
  const vm = needsYouVm();
  G.needsYou = vm;
  // Every mounted host, not just the top bar's: the lane header carries one too
  // on a phone. One model, so they cannot report different counts.
  const markup = View.needsYouControl(vm.count);
  document.querySelectorAll(".vneeds-global").forEach((host) => { host.innerHTML = markup; });
  const panel = document.getElementById("needs-panel");
  // Only repaint the panel while it is open: rewriting it underneath a closed
  // dialog is work nobody can see, and rewriting it while the operator reads it
  // is how a list moves out from under a tap.
  if (panel && !panel.hidden) panel.innerHTML = View.needsYouPanel(vm);
  if (panel) {
    document.querySelectorAll("[data-v-needs-open]")
      .forEach((b) => b.setAttribute("aria-expanded", panel.hidden ? "false" : "true"));
  }
}

function setNeedsYouOpen(open) {
  const panel = document.getElementById("needs-panel");
  const scrim = document.getElementById("needs-scrim");
  if (!panel) return;
  if (open) panel.innerHTML = View.needsYouPanel(needsYouVm());
  panel.hidden = !open;
  if (scrim) scrim.hidden = !open;
  // A DIFFERENT NAME FROM THE CONTROL'S OWN HOOK, DELIBERATELY.
  //
  // This root flag was called `data-v-needs-open` — the same attribute the
  // button carries. `closest("[data-v-needs-open]")` then matched <html> for
  // EVERY click in the document while the sheet was open, so the click handler
  // treated every click as a press of the Needs You control: it preventDefault'd
  // the event and toggled the panel. Review could not navigate, and nothing else
  // on the page worked either while the sheet was up. A state flag and an action
  // hook must never share a selector.
  document.documentElement.toggleAttribute("data-v-needs-panel-open", open);
  const buttons = [...document.querySelectorAll("[data-v-needs-open]")];
  buttons.forEach((b) => b.setAttribute("aria-expanded", open ? "true" : "false"));
  if (open) panel.querySelector(".vneeds-panel-close")?.focus();
  else buttons.find((b) => b.offsetParent !== null)?.focus();
}

function paintApprovals() {
  // The element remains in the shell so nothing downstream has to guard for a
  // missing node, but it never renders content again.
  const el = document.getElementById("approvals-bar");
  if (el) {
    el.innerHTML = "";
    el.hidden = true;
  }
  paintNeedsYou();
  paintAttentionBadge();
}

/**
 * ONE ATTENTION COUNT, FROM THE CANONICAL PROJECTION.
 *
 * The badge used to read `G.approvals.length` — a number this file computed
 * from a list it had just fetched, alongside the notification store's own
 * count. Two answers to "how much needs you", and they disagreed whenever a
 * governed request produced more than one lifecycle event, or a delegated
 * action executed without ever needing an approval.
 *
 * The approvals bar still RENDERS the approval records, because that is what
 * the operator acts on. What it no longer does is count them.
 */
function paintAttentionBadge() {
  const badge = document.getElementById("nb-needs");
  if (!badge) return;
  const n = Number(G.attentionCount) || 0;
  badge.textContent = String(n);
  badge.hidden = n === 0;
  badge.setAttribute("aria-hidden", n === 0 ? "true" : "false");
}

function startListPoll() {
  stopListPoll();
  G.pollList = setInterval(async () => {
    if (G.listInflight) return;
    if (!View.shouldPollList({ hidden: document.hidden, routeName: routeName() })) return;
    G.listInflight = true;
    try {
      await fetchLanes();
      await refreshApprovals();
      paintRail();
      if (G.selected) {
        const listed = View.knownLane(G.lanes, G.selected);
        if (listed) G.lane = View.mergeListedLane(G.lane, listed);
        if (G.lane) G.lanes = View.upsertLaneInList(G.lanes, G.lane);
        applyContextRefreshWatch();
        paint();
      } else {
        paint();
      }
    } catch { /* keep last */ }
    finally { G.listInflight = false; }
  }, View.LIST_POLL_MS);
}

async function submitConnect() {
  const cand = G.connect.candidate;
  if (!cand?.candidate_id || G.connect.submitting) return;
  const input = document.getElementById("gw-lane-name");
  const name = input ? input.value : G.connect.name;
  G.connect.name = name;
  G.connect.submitting = true;
  G.connect.error = null;
  paint();
  try {
    const r = await gwFetch("/api/lanes/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidate_id: cand.candidate_id, name }),
    });
    const j = await r.json();
    if (j.error === "already_connected" && (j.lane_id || j.lane?.lane_id)) {
      location.hash = View.laneDetailHash(j.lane_id || j.lane.lane_id);
      return;
    }
    if (!j.ok) {
      G.connect.error = j.error === "path_refused"
        ? "Arbitrary filesystem paths are not accepted."
        : (j.error === "runtime_adoption_blocked"
          ? "Runtime is not available for adoption yet."
          : (j.error || "Connect failed"));
      G.connect.submitting = false;
      paint();
      return;
    }
    const id = j.lane?.lane_id;
    G.connect.submitting = false;
    try { await fetchLanes(); } catch { /* */ }
    if (id) location.hash = View.laneDetailHash(id);
  } catch {
    G.connect.submitting = false;
    G.connect.error = "Could not reach the Gateway.";
    paint();
  }
}

async function submitCreate() {
  if (G.connect.submitting) return;
  const instEl = document.getElementById("gw-create-instruction");
  const provEl = document.getElementById("gw-create-provider");
  const instruction = instEl ? instEl.value : G.connect.instruction;
  const provider = provEl?.value === "cursor" ? "cursor" : (G.connect.provider === "cursor" ? "cursor" : "claude");
  // The lane names itself from the first message; there is no name to collect.
  const name = "";
  if (!String(instruction).trim()) {
    G.connect.error = "name_or_instruction_required";
    paint();
    const box = document.getElementById("gw-create-instruction");
    if (box) box.focus();
    return;
  }
  G.connect.instruction = instruction;
  G.connect.provider = provider;
  G.connect.submitting = true;
  G.connect.error = null;
  paint();
  try {
    const r = await gwFetch("/api/lanes/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, provider, instruction }),
    });
    const j = await r.json();
    if (!j.ok) {
      G.connect.error = j.error || "create_failed";
      G.connect.submitting = false;
      paint();
      return;
    }
    const id = j.lane?.lane_id;
    G.connect.submitting = false;
    G.connect.instruction = "";
    G.connect.name = "";
    G.connect.error = null;
    try { await fetchLanes(); } catch { /* */ }
    if (id) location.hash = View.laneDetailHash(id);
  } catch {
    G.connect.submitting = false;
    G.connect.error = "Could not reach the Gateway.";
    paint();
  }
}

async function fetchCandidates() {
  G.connect.loading = true;
  try {
    const r = await gwFetch("/api/lanes/candidates");
    const j = await r.json();
    G.connect.candidates = Array.isArray(j.candidates) ? j.candidates : [];
  } catch {
    G.connect.candidates = G.connect.candidates || [];
    G.connect.error = "Could not discover existing work.";
  } finally {
    G.connect.loading = false;
  }
  return G.connect.candidates;
}

/* ===========================================================================
 * RETURN CONTEXT
 *
 * The lane used to hard-code "Back = Lanes", so Home -> lane -> Back stranded
 * the operator on a surface they had never been on, having lost their place on
 * the one they had. The origin is captured HERE — in navigation, the only layer
 * that knows a journey happened — and every back affordance renders from it.
 *
 * Captured on the click, not on the hashchange: by the time the hash has
 * changed the page we are leaving has already been replaced, and its scroll
 * position with it.
 * ======================================================================== */
const LANE_ORIGIN_KEY = "vacilando.laneOrigin";

function pageScroller() {
  return document.querySelector(".main") || document.scrollingElement || document.documentElement;
}

function readLaneOrigin() {
  if (G.laneOrigin) return G.laneOrigin;
  try {
    const raw = storage()?.getItem(LANE_ORIGIN_KEY);
    G.laneOrigin = raw ? JSON.parse(raw) : null;
  } catch { G.laneOrigin = null; }
  return G.laneOrigin;
}

function writeLaneOrigin(origin) {
  G.laneOrigin = origin;
  try {
    if (origin) storage()?.setItem(LANE_ORIGIN_KEY, JSON.stringify(origin));
    else storage()?.removeItem(LANE_ORIGIN_KEY);
  } catch { /* a private window still navigates correctly, it just forgets */ }
}

// LANE -> LANE KEEPS THE ORIGIN. Opening a second lane from the rail continues
// the same journey; it does not start one from the lane you were reading.
document.addEventListener("click", (e) => {
  // Every way into a lane, not just the ones with an href: the rail navigates
  // from `data-route` in JavaScript, so matching links alone recorded no origin
  // for the single most common way an operator opens a lane.
  const a = e.target instanceof Element
    ? e.target.closest('a[href^="#/lanes/"], [data-route^="lanes/"], [data-gw-lane]')
    : null;
  if (!a) return;
  if (!["home", "lanes", "activity"].includes(G.page)) return;
  if (G.selected) return;
  writeLaneOrigin({ page: G.page, scrollY: Math.round(pageScroller()?.scrollTop || 0) });
}, true);

async function show(r) {
  const gen = ++G.showGen;
  G.visible = true;
  const parsed = View.parseGatewayHash(location.hash);
  const route = parsed.name ? parsed : (r && typeof r === "object"
    ? { name: r.name || "lanes", sub: View.decodeLaneId(r.sub) }
    : parsed);
  G.page = View.primaryNavKey(route.name) === "lanes" ? "lanes" : View.primaryNavKey(route.name);
  G.laneTab = route.tab || "overview";
  G.placeholders = View.readPlaceholderMode(storage(), location.search || location.hash);

  // ARRIVING BACK where the lane was opened from — Home, Lanes or Activity —
  // puts the operator where they were, not at the top of a page they had
  // already scrolled through. The origin is spent on arrival: it describes one
  // journey, and the next one records its own.
  if (!route.sub) {
    const origin = readLaneOrigin();
    if (origin && origin.page === G.page) {
      const to = Number(origin.scrollY) || 0;
      writeLaneOrigin(null);
      requestAnimationFrame(() => {
        const sc = pageScroller();
        if (sc) sc.scrollTop = to;
      });
    }
  }

  // HOME / ACTIVITY / SYSTEM.
  //
  // Each paints from whatever it already holds FIRST and refetches after, so a
  // navigation is instant even on a cold projection. The lane list is still
  // fetched because Home and Activity both label events by lane, and a feed of
  // opaque lane ids is not a product.
  if (["home", "activity", "system"].includes(G.page)) {
    G.selected = null;
    G.lane = null;
    G.loading = false;
    stopOutputPoll();
    stopTelemetryPoll();
    paint();
    startListPoll();
    const jobs = [];
    if (!G.listReady) jobs.push(fetchLanes().then(() => { G.listReady = true; }).catch(() => { G.lanes = G.lanes || []; }));
    if (G.page === "home") jobs.push(fetchHome().catch(() => {}));
    if (G.page === "activity") jobs.push(fetchActivity().catch(() => {}));
    if (G.page === "system") {
      jobs.push(fetchSystem().catch(() => {}));
      if (!G.providers && !G.providersInflight) jobs.push(fetchProviders().catch(() => {}));
    }
    await Promise.allSettled(jobs);
    if (gen !== G.showGen) return;
    paint();
    refreshApprovals().catch(() => {});
    return;
  }

  if (route.name === "settings") {
    G.selected = null;
    G.lane = null;
    G.loading = false;
    paint();
    stopOutputPoll();
    stopTelemetryPoll();
    startListPoll();
    fetchProviders().then(() => { if (gen === G.showGen) paint(); }).catch(() => {});
    if (!G.listReady) {
      try { await fetchLanes(); } catch { G.lanes = G.lanes || []; }
      if (gen !== G.showGen) return;
      G.listReady = true;
      paint();
    }
    return;
  }
  if (!G.providers && !G.providersInflight) fetchProviders().then(() => paint()).catch(() => {});
  const nextId = route.name === "lanes" ? (route.sub || null) : null;
  const connecting = nextId === "connect" || nextId === "create";
  if (G.selected !== nextId) {
    G.notice = null;
    G.copyFeedback = null;
    if (!connecting && !View.outputBelongsToLane(G.output, nextId, outputLane(nextId))) {
      G.output = null;
      G.recentOutput = null;
      G.outputMode = "recent";
      G.finalizedOutput = false;
    }
    if (!connecting && G.telemetry?.lane_id !== nextId) G.telemetry = null;
  }
  G.selected = nextId;
  if (!G.selected || connecting) {
    G.lane = null;
    G.output = null;
    G.recentOutput = null;
    G.outputMode = "recent";
    G.finalizedOutput = false;
    G.telemetry = null;
  }
  if (connecting) {
    if (nextId === "create") {
      G.connect.step = "create";
      G.connect.loading = false;
      G.loading = false;
      paint();
      stopOutputPoll();
      stopTelemetryPoll();
      startListPoll();
      return;
    }
    if (route.candidateId) {
      G.connect.step = "preview";
      G.connect.loading = true;
    } else if (G.connect.step === "preview") {
      G.connect.step = "chooser";
      G.connect.candidate = null;
    }
    G.loading = false;
    paint();
    stopOutputPoll();
    stopTelemetryPoll();
    const needList = !G.listReady;
    if (needList) {
      try { await fetchLanes(); } catch { G.lanes = G.lanes || []; }
      if (gen !== G.showGen) return;
      G.listReady = true;
    }
    await fetchCandidates();
    if (gen !== G.showGen) return;
    if (route.candidateId) {
      G.connect.candidate = (G.connect.candidates || []).find((c) => c.candidate_id === route.candidateId) || null;
      G.connect.name = G.connect.candidate?.suggested_name || G.connect.name || "";
      G.connect.step = G.connect.candidate ? "preview" : "pick";
    }
    G.connect.loading = false;
    startListPoll();
    paint();
    return;
  }
  const instant = Boolean(G.selected && commitKnownLane(G.selected));
  G.loading = Boolean(G.selected) && !instant && !G.lane;
  if (G.selected && G.lane && G.lane.lane_id !== G.selected && !instant) G.lane = null;
  paint();

  const needList = !G.listReady || !(G.lanes && G.lanes.length);
  if (needList) {
    try { await fetchLanes(); } catch { G.lanes = G.lanes || []; }
    if (gen !== G.showGen) return;
    G.listReady = true;
    if (G.selected) commitKnownLane(G.selected);
    G.loading = Boolean(G.selected) && !G.lane;
    paint();
  } else {
    fetchLanes().then(() => {
      if (gen !== G.showGen) return;
      G.listReady = true;
      if (G.selected && !G.lane) commitKnownLane(G.selected);
      paintRail();
    }).catch(() => {});
  }

  if (G.selected) {
    if (G.threadLaneId !== G.selected) {
      G.threadEntered = false;
      G.threadNewUpdate = false;
      G.asideHistory = false;
      // Draft attachments belong to ONE lane. Carrying them across would attach
      // a screenshot to the wrong prompt, and the server would refuse it anyway.
      G.attachments = [];
      G.attachmentError = null;
      G.lightbox = null;
      resetAsideForLaneEntry();
    }
    // A refresh mid-draft must not lose images the operator already picked:
    // they are durable server-side, so re-read them rather than assuming none.
    hydrateAttachments(G.selected);
    refreshBlockingScreen(G.selected);
    startOutputPoll(G.selected);
    startTelemetryPoll(G.selected);
    const hydrateId = G.selected;
    fetchTelemetry(hydrateId).then(() => {
      if (gen === G.showGen && G.selected === hydrateId) paint();
    }).catch(() => {});
    await Promise.all([
      fetchOutput(hydrateId, { mode: "recent" }).catch(() => { if (gen === G.showGen && G.selected === hydrateId) G.output = G.output; }),
      fetchLane(hydrateId).catch(() => { if (gen === G.showGen && G.selected === hydrateId && !G.lane) G.lane = null; }),
    ]);
    if (gen !== G.showGen) return;
    // Opening a lane must show its message immediately, not one poll later. A
    // lane still on `vac run-status` keeps its real answer in the transcript.
    if (G.selected === hydrateId && !laneHasStructuredReport(G.lane)) {
      await fetchLatestResponse(hydrateId).catch(() => {});
      if (gen !== G.showGen) return;
    }
    if (G.selected === hydrateId && !G.lane && (G.lanes || []).some((l) => View.laneMatchesId(l, hydrateId))) {
      commitKnownLane(hydrateId);
    }
    G.loading = false;
  } else {
    G.lane = null;
    G.output = null;
    G.recentOutput = null;
    G.outputMode = "recent";
    G.finalizedOutput = false;
    G.telemetry = null;
    stopOutputPoll();
    stopTelemetryPoll();
  }
  if (gen !== G.showGen) return;
  startListPoll();
  paint();
  // Paint pending approvals on first show, not only on the next poll tick —
  // an approval the operator cannot see for 20 seconds is one they will not
  // find at all.
  refreshApprovals().catch(() => {});
  if (!G.notifyRestored) {
    G.notifyRestored = true;
    restoreGatewayNotifications().catch(() => {});
  }
}

/**
 * Suspend or resume the provider on a lane. Neither deletes durable work; the
 * canonical lifecycle owner enforces that, this just asks.
 */
async function providerLifecycle(laneId, action) {
  const id = laneId || G.selected;
  if (!id || G.releasing) return;
  G.releasing = true;
  G.notice = { kind: "idle", text: action === "suspend" ? "Suspending the agent…" : "Resuming the agent…" };
  paint();
  try {
    const r = await gwFetch(`/api/lanes/${encodeURIComponent(id)}/provider/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action === "suspend" ? { confirm: true } : {}),
    });
    const result = await r.json();
    G.notice = result?.ok
      ? {
        kind: "ok",
        text: action === "suspend"
          ? "Agent suspended. The lane, branch, worktree and conversation are kept — replying resumes it."
          : "Agent resuming in the same worktree and session.",
      }
      : { kind: "err", text: View.providerLifecycleErrorText(result?.error, action) };
    try { await fetchLane(id); } catch { /* */ }
    try { await fetchLanes(); } catch { /* */ }
  } catch {
    G.notice = { kind: "err", text: `Could not ${action} the agent.` };
  }
  G.releasing = false;
  paint();
}

async function releaseRuntime() {
  const id = G.selected;
  if (!id || G.releasing) return;
  G.releasing = true;
  G.notice = { kind: "idle", text: "Releasing execution capacity…" };
  paint();
  try {
    const r = await gwFetch(`/api/lanes/${encodeURIComponent(id)}/runtime/release`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const result = await r.json();
    G.notice = result?.ok
      ? { kind: "ok", text: "Runtime released. The durable lane remains." }
      : { kind: "err", text: View.releaseErrorText(result?.error) };
    try { await fetchLane(id); } catch { /* */ }
    try { await fetchLanes(); } catch { /* */ }
  } catch {
    G.notice = { kind: "err", text: "Could not release execution capacity." };
  }
  G.releasing = false;
  paint();
}

function hide() {
  G.visible = false;
  G.showGen += 1;
  stopOutputPoll();
  stopListPoll();
  stopTelemetryPoll();
}

async function sendCurrent() {
  const id = G.selected;
  const ta = document.getElementById("gw-instruction");
  const instruction = ta ? ta.value : getDraft(id);
  if (!id) return;
  if (G.sending) {
    G.notice = { kind: "err", text: View.deliveryErrorText("send_in_progress") };
    paint();
    return;
  }
  // A half-uploaded image must never be silently dropped from the prompt.
  if (G.attachmentsUploading > 0) {
    G.notice = { kind: "err", text: "Wait for the images to finish uploading." };
    paint();
    return;
  }
  G.sending = true;
  G.notice = { kind: "idle", text: "Sending…" };
  paint();
  let result;
  try {
    const r = await gwFetch(`/api/lanes/${encodeURIComponent(id)}/instruction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(View.buildSendBody(instruction, {
        provider: document.getElementById("gw-composer-provider")?.value,
        attachmentIds: (G.attachments || []).map((a) => a.attachment_id),
      })),
    });
    result = await r.json();
  } catch {
    G.sending = false;
    G.notice = { kind: "err", text: "Network error. Instruction was not retried. Check output before sending again." };
    paint();
    return;
  }
  G.sending = false;
  G.notice = View.deliveryNotice(result);
  if (result?.ok && (result.status === "delivered" || result.status === "queued")) {
    setDraft(id, "");
    const box = document.getElementById("gw-instruction");
    if (box) box.value = "";
    // The images are now the run's, not the draft's.
    G.attachments = [];
    G.attachmentError = null;
    const rec = result.last_instruction || {
      instruction,
      delivered_at: result.delivered_at,
      status: "delivered",
      instruction_size: result.instruction_size,
      output_fingerprint_at_send: null,
    };
    const run = result.execution_run || null;
    if (G.lane?.lane_id === id) G.lane = { ...G.lane, last_instruction: rec, execution_run: run || G.lane.execution_run };
    G.lanes = (G.lanes || []).map((l) => (l.lane_id === id ? { ...l, last_instruction: rec, execution_run: run || l.execution_run } : l));
    G.burstUntil = Date.now() + View.OUTPUT_BURST_WINDOW_MS;
    startOutputPoll(id);
    try { await fetchOutput(id); } catch { /* */ }
  }
  paint();
}

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t && t.id === "gw-token") {
    const btn = document.querySelector("[data-gw-login-submit]");
    if (btn) btn.disabled = false;
    return;
  }
  if (t && t.id === "gw-instruction" && G.selected) {
    setDraft(G.selected, t.value);
    const count = document.querySelector("[data-gw-count]");
    if (count) count.textContent = `${t.value.length.toLocaleString()} characters`;
    autosizeInstruction(t);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
  const t = e.target;
  if (!t || t.id !== "gw-instruction" || t.disabled) return;
  e.preventDefault();
  sendCurrent();
});

document.addEventListener("paste", (e) => {
  const t = e.target;
  if (!t || t.id !== "gw-token") return;
  const btn = document.querySelector("[data-gw-login-submit]");
  if (btn) btn.disabled = false;
});

document.addEventListener("submit", (e) => {
  const login = e.target?.closest?.("[data-gw-login]");
  if (login) {
    submitGatewayLogin(e);
    return;
  }
  const form = e.target?.closest?.("[data-gw-composer]");
  if (form) {
    e.preventDefault();
    sendCurrent();
    return;
  }
  const connectForm = e.target?.closest?.("[data-gw-connect]");
  if (connectForm) {
    e.preventDefault();
    submitConnect();
    return;
  }
  const createForm = e.target?.closest?.("[data-gw-create]");
  if (createForm) {
    e.preventDefault();
    submitCreate();
  }
}, true);

/**
 * Back closes Details before it leaves the lane.
 *
 * An open Details panel covers the header, so the Back control sits behind it —
 * correct for a modal overlay, but it means a Back gesture would otherwise leave
 * the lane with the panel still open. Opening Details pushes one history entry
 * against the SAME hash; Back pops it, we close the panel, and the router sees
 * no route change. No event interception, no URL rewriting.
 */
function pushDetailsHistoryEntry() {
  if (G.asideHistory) return;
  try {
    history.pushState({ gwDetails: true }, "", window.location.hash || "");
    G.asideHistory = true;
  } catch { G.asideHistory = false; }
}

function dropDetailsHistoryEntry() {
  if (!G.asideHistory) return;
  G.asideHistory = false;
  try { history.back(); } catch { /* the panel is closed either way */ }
}

window.addEventListener("popstate", () => {
  if (!G.asideHistory) return;
  G.asideHistory = false;
  if (asideOpenNow()) setAsideOpen(false, { restoreFocus: true, fromHistory: true });
});

// Escape closes Details first — it should not drop the operator out of the lane
// while a panel is covering it.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!G.visible || routeName() !== "lanes" || !G.selected) return;
  if (!asideOpenNow()) return;
  e.preventDefault();
  e.stopPropagation();
  setAsideOpen(false, { restoreFocus: true });
}, true);

document.addEventListener("toggle", (e) => {
  const details = e.target;
  if (!details || !details.closest?.("[data-gw-status]") || details.tagName !== "DETAILS") return;
  G.statusOpen = details.open;
  View.writeStatusOpen(details.open, storage());
}, true);

// Browser-session recovery. The button STARTS a sign-in; a person completes it.
// Nothing typed into that browser comes back through here — the response carries
// a state name and never credential material.
async function runBrowserAuthAction(btn, action) {
  const laneId = btn.getAttribute("data-lane-id") || "";
  if (!laneId) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = action === "sign-in" ? "Waiting for you to sign in…" : "Checking…";
  try {
    const r = await gwFetch(`/api/v2/browser-auth/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lane_id: laneId, slot: btn.getAttribute("data-slot") || undefined }),
    });
    const body = await r.json().catch(() => ({}));
    const host = btn.closest("[data-gw-browser-auth]");
    const copy = host?.querySelector(".gw-work-stale-copy");
    if (copy && body?.headline) copy.textContent = body.headline;
    if (copy && body?.detail) copy.title = body.detail;
  } catch (err) {
    if (err?.status !== 401) {
      const host = btn.closest("[data-gw-browser-auth]");
      const copy = host?.querySelector(".gw-work-stale-copy");
      // Say what happened. A silent failure here is what sent the Director to a
      // terminal in the first place.
      if (copy) copy.textContent = "Sign-in could not be started on this machine.";
    }
  } finally {
    btn.disabled = false;
    btn.textContent = original;
    // The lane poll repaints the card from the server's own state; updating the
    // headline here only keeps the button honest while the request is in flight.
  }
}

document.addEventListener("click", async (e) => {
  if (e.target?.closest?.("#gw-login")) {
    e.stopPropagation();
    return;
  }
  const dismissBlock = e.target?.closest?.("[data-gw-dismiss-block]");
  if (dismissBlock) {
    e.preventDefault();
    e.stopPropagation();
    if (!dismissBlock.disabled) {
      dismissBlock.disabled = true;
      const label = dismissBlock.textContent;
      dismissBlock.textContent = "Closing\u2026";
      try {
        await gwFetch("/api/v2/lanes/prompt-block/dismiss", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lane_id: dismissBlock.getAttribute("data-lane-id") || "" }),
        });
      } catch { /* the lane poll reports the real state */ }
      dismissBlock.disabled = false;
      dismissBlock.textContent = label;
    }
    return;
  }
  const signIn = e.target?.closest?.("[data-gw-browser-auth-signin]");
  if (signIn) {
    e.preventDefault();
    e.stopPropagation();
    if (!signIn.disabled) await runBrowserAuthAction(signIn, "sign-in");
    return;
  }
  const recheck = e.target?.closest?.("[data-gw-browser-auth-recheck]");
  if (recheck) {
    e.preventDefault();
    e.stopPropagation();
    if (!recheck.disabled) await runBrowserAuthAction(recheck, "verify");
    return;
  }
  const enable = e.target?.closest?.("[data-gw-notify-enable]");
  if (enable) {
    e.preventDefault();
    e.stopPropagation();
    if (enable.disabled) return;
    await enableGatewayNotifications();
    return;
  }
  const testPush = e.target?.closest?.("[data-gw-notify-test]");
  if (testPush) {
    e.preventDefault();
    e.stopPropagation();
    if (testPush.disabled) return;
    await sendTestNotification();
    return;
  }
  const notify = e.target?.closest?.("[data-gw-notify]");
  if (!notify) {
    document.querySelectorAll("details[data-gw-notify][open]").forEach((el) => { el.open = false; });
  }
  const asideToggle = e.target?.closest?.("[data-gw-aside-toggle]");
  if (asideToggle) {
    e.preventDefault();
    e.stopPropagation();
    setAsideOpen(!asideOpenNow());
    return;
  }
  const asideClose = e.target?.closest?.("[data-gw-aside-close]");
  if (asideClose) {
    e.preventDefault();
    e.stopPropagation();
    setAsideOpen(false, { restoreFocus: true });
    return;
  }
  const newUpdate = e.target?.closest?.("[data-gw-new-update]");
  if (newUpdate) {
    e.preventDefault();
    e.stopPropagation();
    scrollThreadToLatest();
    return;
  }
  const createProvider = e.target?.closest?.("[data-gw-create-provider]");
  if (createProvider) {
    e.preventDefault();
    e.stopPropagation();
    const next = createProvider.getAttribute("data-gw-create-provider");
    if (next !== "claude" && next !== "cursor") return;
    G.connect.provider = next;
    const hidden = document.getElementById("gw-create-provider");
    if (hidden) hidden.value = next;
    document.querySelectorAll("[data-gw-create-provider]").forEach((b) => {
      b.setAttribute("aria-pressed", b.getAttribute("data-gw-create-provider") === next ? "true" : "false");
    });
    return;
  }
  const msgMore = e.target?.closest?.("[data-gw-msg-more]");
  if (msgMore) {
    e.preventDefault();
    e.stopPropagation();
    G.userMessageExpanded = !G.userMessageExpanded;
    paint();
    return;
  }
  const copy = e.target?.closest?.("[data-gw-copy]");
  if (copy) {
    e.preventDefault();
    e.stopPropagation();
    if (copy.disabled) return;
    await copyActiveOutput();
    return;
  }
  const providerOpt = e.target?.closest?.("[data-gw-provider-opt]");
  if (providerOpt) {
    e.preventDefault();
    e.stopPropagation();
    const next = providerOpt.getAttribute("data-gw-provider-opt");
    if (next !== "claude" && next !== "cursor") return;
    if (providerOpt.disabled || providerOpt.getAttribute("aria-disabled") === "true") return;
    const hidden = document.getElementById("gw-composer-provider");
    if (hidden) hidden.value = next;
    document.querySelectorAll("[data-gw-provider-opt]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-gw-provider-opt") === next ? "true" : "false");
    });
    if (G.lane && View.laneMatchesId(G.lane, G.selected)) {
      G.lane = { ...G.lane, preferred_provider: next };
    }
    if (G.selected) {
      gwFetch(`/api/lanes/${encodeURIComponent(G.selected)}/preferred-provider`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: next }),
      }).catch(() => {});
    }
    return;
  }
  const startWork = e.target?.closest?.("[data-gw-start-work]");
  if (startWork) {
    e.preventDefault();
    e.stopPropagation();
    const ta = document.getElementById("gw-instruction");
    if (ta && !ta.disabled) {
      ta.focus();
      autosizeInstruction(ta);
    }
    return;
  }
  const keepRuntime = e.target?.closest?.("[data-gw-runtime-keep]");
  if (keepRuntime) {
    e.preventDefault();
    e.stopPropagation();
    G.notice = { kind: "ok", text: "Lane stays running for follow-up work." };
    paint();
    return;
  }
  const providerBtn = e.target?.closest?.("[data-gw-provider-suspend],[data-gw-provider-resume]");
  if (providerBtn) {
    e.preventDefault();
    e.stopPropagation();
    const suspend = providerBtn.hasAttribute("data-gw-provider-suspend");
    // Interrupting live work is the operator's call to make explicitly. A
    // parked lane needs no confirmation — nothing is interrupted.
    if (suspend && providerBtn.getAttribute("data-gw-confirm") === "1"
        && !window.confirm("This lane is working. Suspend its agent anyway?\n\nThe lane, branch, worktree and conversation are all kept.")) {
      return;
    }
    providerLifecycle(providerBtn.getAttribute("data-lane-id"), suspend ? "suspend" : "resume");
    return;
  }
  const releaseRuntimeBtn = e.target?.closest?.("[data-gw-runtime-release]");
  if (releaseRuntimeBtn) {
    e.preventDefault();
    e.stopPropagation();
    if (releaseRuntimeBtn.disabled || G.releasing) return;
    await releaseRuntime();
    return;
  }
  const latest = e.target?.closest?.("[data-gw-output-latest]");
  if (latest) {
    e.preventDefault();
    e.stopPropagation();
    if (!G.selected) return;
    await fetchOutput(G.selected, { mode: "latest_response" });
    paint();
    return;
  }
  const more = e.target?.closest?.("[data-gw-output-more]");
  if (more) {
    e.preventDefault();
    e.stopPropagation();
    if (!G.selected) return;
    await fetchOutput(G.selected, { mode: "extended" });
    paint();
    return;
  }
  const recent = e.target?.closest?.("[data-gw-output-recent]");
  if (recent) {
    e.preventDefault();
    e.stopPropagation();
    G.outputMode = "recent";
    if (View.outputBelongsToLane(G.recentOutput, G.selected, outputLane(G.selected))) G.output = G.recentOutput;
    else if (G.selected) await fetchOutput(G.selected, { mode: "recent" });
    paint();
    return;
  }
  const addExisting = e.target?.closest?.("[data-gw-connect-existing]");
  if (addExisting) {
    e.preventDefault();
    e.stopPropagation();
    G.connect.step = "pick";
    G.connect.error = null;
    paint();
    await fetchCandidates();
    paint();
    return;
  }
  const governedApprove = e.target?.closest?.("[data-gw-governed-approve]");
  const governedDeny = e.target?.closest?.("[data-gw-governed-deny]");
  if (governedApprove || governedDeny) {
    e.preventDefault();
    e.stopPropagation();
    const btn = governedApprove || governedDeny;
    if (btn.disabled) return;
    const ga = G.lane?.governed_action
      || G.lane?.execution_run?.governed_action
      || G.lane?.previous_run?.governed_action;
    const requestId = btn.getAttribute("data-request-id") || ga?.request_id;
    const row = (G.approvals || []).find((a) => a && a.request_id === requestId) || null;
    if (!requestId) return;
    btn.disabled = true;
    try {
      const path = governedApprove ? "/api/v2/governed-actions/approve" : "/api/v2/governed-actions/deny";
      const r = await gwFetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          // What the operator actually read. The server refuses the decision if
          // the request has moved on since this card was drawn.
          content_fingerprint: btn.getAttribute("data-content-fingerprint") || null,
        }),
      });
      const out = await r.json().catch(() => ({}));
      G.notice = View.governedDecisionNotice({
        approve: Boolean(governedApprove),
        already: out.already === true,
        error: out.ok ? null : (out.error || "approve_failed"),
        actionKey: row?.action_key || ga?.action_key,
        // The row the operator actually pressed — G.lane can be a different
        // lane entirely when the decision came from the global bar.
        title: row ? View.governedActionLabel(row) : (ga ? View.governedActionLabel(ga) : null),
        approveLabel: row?.approve_label || ga?.approve_label,
      });
      const laneId = G.selected || G.lane?.lane_id;
      await refreshApprovals();
      await fetchLanes();
      if (laneId) await fetchLane(laneId);
      paint();
    } catch {
      btn.disabled = false;
      G.notice = View.governedDecisionNotice({
        approve: Boolean(governedApprove),
        error: "unreachable",
        actionKey: ga?.action_key,
      });
      paint();
    }
    return;
  }
  const recoverRun = e.target?.closest?.("[data-gw-run-recover]");
  if (recoverRun) {
    e.preventDefault();
    e.stopPropagation();
    if (recoverRun.disabled) return;
    const laneId = G.selected || G.lane?.lane_id;
    const runId = recoverRun.getAttribute("data-run-id") || G.lane?.previous_run?.run_id;
    if (!laneId) return;
    recoverRun.disabled = true;
    try {
      const r = await gwFetch(`/api/lanes/${encodeURIComponent(laneId)}/run/recover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(runId ? { run_id: runId } : {}),
      });
      const out = await r.json().catch(() => ({}));
      if (out.ok) {
        G.notice = {
          kind: "ok",
          text: out.already_recovering
            ? "That run is already recovering."
            : "Run recovered. Its history is preserved and it can continue to completion.",
        };
        await fetchLanes();
        if (laneId) await fetchLane(laneId);
      } else {
        const why = {
          lane_has_active_run: "Newer work is already running on this lane, so the old run was not reopened.",
          run_irreversible: "That run is COMPLETE or FAILED and cannot be reopened.",
          binding_mismatch: "The lane is no longer bound to that run's worktree.",
          lane_missing: "The Development Lane no longer exists.",
          recovery_budget_exhausted: "That run has been recovered too many times.",
        }[out.error];
        G.notice = { kind: "err", text: why || out.error || "Could not recover that run." };
        recoverRun.disabled = false;
      }
      paint();
    } catch {
      recoverRun.disabled = false;
      G.notice = { kind: "err", text: "Could not recover that run." };
      paint();
    }
    return;
  }
  const closeStale = e.target?.closest?.("[data-gw-close-stale]");
  if (closeStale) {
    e.preventDefault();
    e.stopPropagation();
    if (closeStale.disabled) return;
    const laneId = G.selected || G.lane?.lane_id;
    const runId = closeStale.getAttribute("data-run-id") || G.lane?.execution_run?.run_id;
    if (!laneId) return;
    closeStale.disabled = true;
    try {
      const r = await gwFetch(`/api/lanes/${encodeURIComponent(laneId)}/run/close-stale`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(runId ? { run_id: runId } : {}),
      });
      const out = await r.json().catch(() => ({}));
      if (out.ok) {
        G.notice = { kind: "ok", text: "Previous run was stale and was closed. Ready for new work." };
        await fetchLanes();
        if (laneId) await fetchLane(laneId);
      } else {
        G.notice = {
          kind: "err",
          text: out.error === "run_still_active"
            ? "That run still looks active. It was not closed."
            : (out.error || "Could not close the previous run."),
        };
      }
      paint();
    } catch {
      closeStale.disabled = false;
      G.notice = { kind: "err", text: "Could not close the previous run." };
      paint();
    }
    return;
  }
  const reviewRun = e.target?.closest?.("[data-gw-review-run]");
  if (reviewRun) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelector("[data-gw-work]")?.scrollIntoView?.({ block: "nearest" });
    G.notice = { kind: "idle", text: "Review the current run before sending new work." };
    paint();
    return;
  }
  const screenAnswer = e.target?.closest?.("[data-gw-screen-answer]");
  if (screenAnswer) {
    e.preventDefault();
    e.stopPropagation();
    if (screenAnswer.disabled || G.screenPending != null) return;
    const choice = Number(screenAnswer.getAttribute("data-gw-screen-answer"));
    // Send the question the operator was LOOKING at, so the server can refuse
    // if the dialog changed under them between render and tap.
    const question = document.querySelector("[data-gw-screen]")?.getAttribute("data-gw-screen-question") || null;
    G.screenPending = choice;
    paint();
    try {
      const r = await gwFetch(`/api/lanes/${encodeURIComponent(G.selected)}/screen/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choice, question }),
      });
      const j = await r.json();
      if (j.ok) {
        G.notice = { kind: "ok", text: `Answered "${j.answered.label}". You can send again.` };
        G.blockingScreen = null;
      } else {
        G.notice = { kind: "err", text: View.screenAnswerErrorText(j.error) };
        await refreshBlockingScreen(G.selected);
      }
    } catch {
      G.notice = { kind: "err", text: "Could not reach the Gateway. Nothing was answered." };
    } finally {
      G.screenPending = null;
      paint();
    }
    return;
  }
  const cancelRun = e.target?.closest?.("[data-gw-cancel-run]");
  if (cancelRun) {
    e.preventDefault();
    e.stopPropagation();
    if (cancelRun.disabled || G.cancelPending) return;
    const run = G.lane?.execution_run;
    // Interrupting real work needs an explicit yes; taking back something the
    // agent never received does not.
    const delivered = cancelRun.getAttribute("data-gw-cancel-delivered") === "1";
    const idle = G.lane?.provider_activity?.activity === "ready";
    if (delivered && !idle && !window.confirm(View.cancelConfirmCopy(run))) return;
    G.cancelPending = true;
    paint();
    try {
      const r = await gwFetch(`/api/lanes/${encodeURIComponent(G.selected)}/run/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: run?.run_id || null, confirm: true }),
      });
      const j = await r.json();
      G.notice = j.ok
        ? { kind: "ok", text: j.interrupted
            ? "Prompt stopped. Your lane, branch, worktree and conversation are kept."
            : "Prompt cancelled. The agent was not interrupted — check the pane if it is still working." }
        : { kind: "err", text: View.cancelErrorText(j.error) };
      if (j.ok) { try { await fetchLane(G.selected); } catch { /* poll catches up */ } }
    } catch {
      G.notice = { kind: "err", text: "Could not reach the Gateway. The prompt was not cancelled." };
    } finally {
      G.cancelPending = false;
      paint();
    }
    return;
  }
  const repoToggle = e.target?.closest?.("[data-gw-repo-toggle]");
  if (repoToggle) {
    e.preventDefault();
    e.stopPropagation();
    // Repository collapse shares the folder preference store, keyed apart so a
    // folder and a repository can never collide on one id.
    toggleFolderCollapsed(`repo:${repoToggle.getAttribute("data-gw-repo-toggle")}`);
    return;
  }
  const addLane = e.target?.closest?.("[data-gw-add]");
  if (addLane) {
    e.preventDefault();
    e.stopPropagation();
    openLaneWizard();
    return;
  }
  const repoNew = e.target?.closest?.("[data-gw-repo-new]");
  if (repoNew) {
    e.preventDefault();
    e.stopPropagation();
    await addRepositoryFlow();
    return;
  }
  const folderToggle = e.target?.closest?.("[data-gw-folder-toggle]");
  if (folderToggle) {
    e.preventDefault();
    e.stopPropagation();
    toggleFolderCollapsed(folderToggle.getAttribute("data-gw-folder-toggle"));
    return;
  }
  const folderNew = e.target?.closest?.("[data-gw-folder-new]");
  if (folderNew) {
    e.preventDefault();
    e.stopPropagation();
    const name = window.prompt("New folder name", "");
    if (name == null || !name.trim()) return;
    try {
      const r = await gwFetch("/api/lane-folders/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (!j.ok) {
        G.notice = { kind: "error", text: folderErrorText(j.error) };
      } else {
        await refreshFolders();
      }
      paint();
    } catch { /* */ }
    return;
  }
  const folderRename = e.target?.closest?.("[data-gw-folder-rename]");
  if (folderRename) {
    e.preventDefault();
    e.stopPropagation();
    const id = folderRename.getAttribute("data-gw-folder-rename");
    const current = (G.folders || []).find((f) => f.folder_id === id)?.name || "";
    const name = window.prompt("Rename folder", current);
    if (name == null || !name.trim()) return;
    try {
      const r = await gwFetch(`/api/lane-folders/${encodeURIComponent(id)}/rename`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (!j.ok) G.notice = { kind: "error", text: folderErrorText(j.error) };
      else await refreshFolders();
      paint();
    } catch { /* */ }
    return;
  }
  const folderDelete = e.target?.closest?.("[data-gw-folder-delete]");
  if (folderDelete) {
    e.preventDefault();
    e.stopPropagation();
    const id = folderDelete.getAttribute("data-gw-folder-delete");
    const folder = (G.folders || []).find((f) => f.folder_id === id) || null;
    const count = Number(folder?.lane_count) || 0;
    // Say plainly what survives: an operator must never have to guess whether
    // deleting a folder deletes the lanes in it.
    const msg = count
      ? `Delete the folder "${folder?.name || id}"? The ${count} lane${count === 1 ? "" : "s"} inside stay exactly as they are and become unfiled.`
      : `Delete the folder "${folder?.name || id}"?`;
    if (!window.confirm(msg)) return;
    try {
      const r = await gwFetch(`/api/lane-folders/${encodeURIComponent(id)}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!j.ok) G.notice = { kind: "error", text: folderErrorText(j.error) };
      else {
        const set = collapsedFolders();
        set.delete(id);
        View.writeCollapsedFolders(set, storage());
        G.lanes = (G.lanes || []).map((l) => (l.folder_id === id ? { ...l, folder_id: null } : l));
        if (G.lane?.folder_id === id) G.lane = { ...G.lane, folder_id: null };
        await refreshFolders();
      }
      paint();
    } catch { /* */ }
    return;
  }
  const renameBtn = e.target?.closest?.("[data-gw-rename]");
  if (renameBtn) {
    e.preventDefault();
    e.stopPropagation();
    const laneId = renameBtn.getAttribute("data-lane-id") || G.selected;
    const current = G.lane?.label || G.lane?.name || "";
    const next = window.prompt("Rename Lane", current);
    if (next == null) return;
    try {
      const r = await gwFetch(`/api/lanes/${encodeURIComponent(laneId)}/rename`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      const j = await r.json();
      if (j.ok && j.lane) {
        const name = j.lane.name;
        if (G.lane?.lane_id === laneId) G.lane = { ...G.lane, label: name, name };
        G.lanes = (G.lanes || []).map((l) => (l.lane_id === laneId ? { ...l, label: name, name } : l));
        paint();
      }
    } catch { /* */ }
    return;
  }
  const exclusiveRelease = e.target?.closest?.("[data-gw-exclusive-release]");
  if (exclusiveRelease) {
    e.preventDefault();
    e.stopPropagation();
    if (exclusiveRelease.disabled) return;
    exclusiveRelease.disabled = true;
    try {
      const r = await gwFetch("/api/development-resources/exclusive/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      await r.json().catch(() => ({}));
      await fetchLanes();
      paint();
    } catch {
      exclusiveRelease.disabled = false;
    }
    return;
  }
  const sessionStart = e.target?.closest?.("[data-gw-session-start]");
  if (sessionStart) {
    e.preventDefault();
    e.stopPropagation();
    if (sessionStart.disabled) return;
    const laneId = sessionStart.getAttribute("data-lane-id") || G.selected;
    if (!laneId) return;
    sessionStart.disabled = true;
    try {
      const r = await gwFetch(`/api/lanes/${encodeURIComponent(laneId)}/agent-session/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: document.getElementById("gw-composer-provider")?.value || undefined,
        }),
      });
      const out = await r.json().catch(() => ({}));
      G.notice = out.ok
        ? { kind: "ok", text: out.queued
          ? "Queued for execution capacity."
          : (out.adopted
            ? (out.provider === "cursor" ? "Cursor session attached." : "Existing Claude session adopted.")
            : (out.provider === "cursor" ? "Cursor session started." : "Starting Claude…")) }
        : { kind: "err", text: out.error === "agent_already_running"
          ? (out.provider === "cursor" ? "A Cursor session is already attached to this lane." : "A Claude session is already running on this lane.")
          : (out.error === "binding_missing"
            ? "This lane has no worktree binding yet."
            : (out.error === "runtime_pane_missing"
              ? "No runtime pane is available to start a session."
              : (out.error === "provider_capacity"
                ? (Array.isArray(out.occupying_names) && out.occupying_names.length
                  ? `Claude is at ${out.active_providers}/${out.max_providers}. Running: ${out.occupying_names.join(", ")}. Release one to start this session.`
                  : "Claude is at capacity. Release a running lane to start this session.")
                : (out.error || "Could not start session.")))) };
      await fetchLanes();
      if (G.selected) await fetchLane(G.selected);
      paint();
    } catch {
      sessionStart.disabled = false;
      G.notice = { kind: "err", text: "Could not start session." };
      paint();
    }
    return;
  }
  const sessionRefresh = e.target?.closest?.("[data-gw-session-refresh]");
  if (sessionRefresh) {
    e.preventDefault();
    e.stopPropagation();
    if (sessionRefresh.disabled) return;
    const laneId = sessionRefresh.getAttribute("data-lane-id") || G.selected;
    if (!laneId) return;
    const ok = window.confirm(View.renderSessionRefreshConfirmCopy());
    if (!ok) return;
    sessionRefresh.disabled = true;
    G.notice = { kind: "idle", text: "Refreshing Claude context…" };
    G.watchRefresh = true;
    G.sawRefreshProgress = false;
    G.burstUntil = Date.now() + View.OUTPUT_BURST_WINDOW_MS;
    paint();
    try {
      const r = await gwFetch(`/api/lanes/${encodeURIComponent(laneId)}/agent-session/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const out = await r.json().catch(() => ({}));
      if (out.ok) {
        G.notice = {
          kind: "ok",
          text: out.queued
            ? "Queued for execution capacity."
            : (out.adopted
              ? "Existing Claude session adopted."
              : "Claude context refresh started. This lane will show when the new session is ready."),
        };
      } else {
        G.watchRefresh = false;
        G.sawRefreshProgress = false;
        G.notice = { kind: "err", text: View.sessionRefreshErrorText(out) };
      }
      await fetchLanes();
      if (G.selected) await fetchLane(G.selected);
      applyContextRefreshWatch();
      paint();
    } catch {
      G.watchRefresh = false;
      G.sawRefreshProgress = false;
      G.notice = { kind: "err", text: "Claude context refresh failed." };
      paint();
    }
  }
}, true);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "vacilando-open-lane") return;
    const raw = String(event.data.path || "");
    const hash = raw.includes("#") ? `#${raw.split("#").slice(1).join("#")}` : raw;
    if (!hash) return;
    const next = hash.startsWith("#") ? hash : `#${hash}`;
    if (location.hash !== next) location.hash = next;
  });
}

window.VacilandoGateway = {
  show,
  hide,
  paint,
  sendCurrent,
  copyActiveOutput,
  enableGatewayNotifications,
  sendTestNotification,
  buildSendBody: View.buildSendBody,
  sendPayload: View.sendPayload,
  view: View,
  _state: G,
};

window.VacilandoGatewayView = View;
if (typeof window.__vacilandoStart === "function") window.__vacilandoStart();

fetch("/api/gateway/session", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(4000) })
  .then((r) => r.json())
  .then((j) => { if (j.authRequired && !j.authenticated) showLogin(); })
  .catch(() => { showLogin(); });

/** Folder failures in operator language, not store error codes. */
function folderErrorText(error) {
  if (error === "folder_name_taken") return "A folder with that name already exists.";
  if (error === "folder_name_empty") return "A folder needs a name.";
  if (error === "folder_name_too_large") return "That folder name is too long.";
  if (error === "folder_name_invalid") return "That folder name contains characters that cannot be shown.";
  if (error === "folder_limit_reached") return "You have reached the folder limit.";
  if (error === "folder_not_found") return "That folder no longer exists.";
  if (error === "lane_not_found") return "That lane no longer exists.";
  return "Could not update folders.";
}

document.addEventListener("change", async (e) => {
  const pick = e.target?.closest?.("[data-gw-folder-select]");
  if (!pick) return;
  const laneId = pick.getAttribute("data-lane-id");
  const folderId = pick.value || null;
  try {
    const r = await gwFetch(`/api/lanes/${encodeURIComponent(laneId)}/folder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folder_id: folderId }),
    });
    const j = await r.json();
    if (!j.ok) {
      G.notice = { kind: "error", text: folderErrorText(j.error) };
    } else {
      // Repaint from the answer the store gave, not from what was clicked.
      G.lanes = (G.lanes || []).map((l) => (l.lane_id === laneId ? { ...l, folder_id: j.folder_id ?? null } : l));
      if (G.lane?.lane_id === laneId) G.lane = { ...G.lane, folder_id: j.folder_id ?? null };
      await refreshFolders();
    }
    paint();
  } catch { /* */ }
});

// ---------------------------------------------------------------------------
// Image attachments on the operator prompt.
//
// Three entry points, one upload path: the file picker, a clipboard paste, and
// a drop onto the composer. Everything funnels through uploadAttachments so the
// draft-preservation and error rules can only be written once.
// ---------------------------------------------------------------------------
const ATTACHMENT_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/html",
]);

async function uploadAttachments(files) {
  const laneId = G.selected;
  if (!laneId) return;
  const list = Array.from(files || []).filter((f) => {
    if (!f) return false;
    if (ATTACHMENT_TYPES.has(f.type) || !f.type) return true;
    // Browsers report .htm/.html inconsistently; the server sniffs the bytes,
    // so an extension match is enough to let it make the real decision.
    return /\.(html?|pdf)$/i.test(f.name || "");
  });
  if (!list.length) {
    if ((files || []).length) {
      G.attachmentError = View.attachmentErrorText("unsupported_media_type");
      paint();
    }
    return;
  }
  G.attachmentsUploading += list.length;
  G.attachmentError = null;
  paint();
  for (const file of list) {
    try {
      const bytes = await file.arrayBuffer();
      const r = await gwFetch(`/api/lanes/${encodeURIComponent(laneId)}/attachments`, {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          // A LABEL, not a path. The server sanitizes it and never touches the
          // filesystem with it. Header values must be latin-1, so a non-ASCII
          // filename is encoded rather than throwing and losing the upload.
          "x-attachment-filename": encodeURIComponent(file.name || "image"),
        },
        body: bytes,
      });
      const j = await r.json();
      if (j.ok && j.attachment) {
        G.attachments = [...G.attachments, j.attachment];
      } else {
        // One bad file must not discard the draft or the images that worked.
        G.attachmentError = View.attachmentErrorText(j.error, j);
      }
    } catch {
      G.attachmentError = "That file could not be uploaded. Your draft is still here.";
    } finally {
      G.attachmentsUploading = Math.max(0, G.attachmentsUploading - 1);
      paint();
    }
  }
}

async function hydrateAttachments(laneId) {
  if (!laneId) return;
  try {
    const r = await gwFetch(`/api/lanes/${encodeURIComponent(laneId)}/attachments`);
    const j = await r.json();
    if (j.ok && Array.isArray(j.attachments) && G.selected === laneId) {
      G.attachments = j.attachments;
      paint();
    }
  } catch { /* an empty strip is the safe default */ }
}

async function removeAttachment(attachmentId) {
  const laneId = G.selected;
  if (!laneId || !attachmentId) return;
  const before = G.attachments;
  G.attachments = G.attachments.filter((a) => a.attachment_id !== attachmentId);
  G.attachmentError = null;
  paint();
  try {
    const r = await gwFetch(
      `/api/lanes/${encodeURIComponent(laneId)}/attachments/${encodeURIComponent(attachmentId)}/remove`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) },
    );
    const j = await r.json();
    if (!j.ok) {
      // Put it back rather than showing a prompt that no longer matches what
      // the server will actually send.
      G.attachments = before;
      G.attachmentError = View.attachmentErrorText(j.error, j);
      paint();
    }
  } catch {
    G.attachments = before;
    G.attachmentError = "Could not remove that file.";
    paint();
  }
}

document.addEventListener("change", (e) => {
  const input = e.target?.closest?.("[data-gw-attach-input]");
  if (!input) return;
  const files = input.files;
  // Clear the input so picking the same file twice in a row still fires.
  uploadAttachments(files).finally(() => { try { input.value = ""; } catch { /* */ } });
});

document.addEventListener("click", (e) => {
  const rm = e.target?.closest?.("[data-gw-att-remove]");
  if (rm) {
    e.preventDefault();
    e.stopPropagation();
    removeAttachment(rm.getAttribute("data-gw-att-remove"));
    return;
  }
  const open = e.target?.closest?.("[data-gw-att-open]");
  if (open) {
    e.preventDefault();
    e.stopPropagation();
    const id = open.getAttribute("data-gw-att-open");
    const run = G.lane?.execution_run || G.lane?.previous_run;
    const found = (run?.attachments || []).find((a) => a.attachment_id === id);
    if (found) { G.lightbox = found; paint(); }
    return;
  }
  if (e.target?.closest?.("[data-gw-lightbox-close]") || e.target?.closest?.("[data-gw-lightbox]")) {
    if (G.lightbox) { e.preventDefault(); G.lightbox = null; paint(); }
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && G.lightbox) { G.lightbox = null; paint(); }
});

// Clipboard paste: a screenshot on the clipboard is the fastest way in, and it
// must not also paste a filename into the textarea.
document.addEventListener("paste", (e) => {
  if (!G.selected) return;
  const items = Array.from(e.clipboardData?.items || []);
  const files = items.filter((i) => i.kind === "file" && ATTACHMENT_TYPES.has(i.type))
    .map((i) => i.getAsFile()).filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  uploadAttachments(files);
});

// Drag and drop onto the composer.
document.addEventListener("dragover", (e) => {
  const box = e.target?.closest?.("[data-gw-composer]");
  if (!box || !G.selected) return;
  e.preventDefault();
  box.classList.add("is-dropping");
});
document.addEventListener("dragleave", (e) => {
  const box = e.target?.closest?.("[data-gw-composer]");
  if (box) box.classList.remove("is-dropping");
});
document.addEventListener("drop", (e) => {
  const box = e.target?.closest?.("[data-gw-composer]");
  if (!box || !G.selected) return;
  e.preventDefault();
  box.classList.remove("is-dropping");
  uploadAttachments(e.dataTransfer?.files);
});

// ---------------------------------------------------------------------------
// Add repository — Connect local only in this slice.
//
// The flow INSPECTS before it registers, so the operator confirms what the path
// actually is (a repository or a worktree of one, its branch, whether it has a
// remote) rather than finding out afterwards. Clone is not implemented and says
// so instead of offering a button that fails.
// ---------------------------------------------------------------------------
function addRepositoryFlow() {
  // Opens the sheet. Nothing is validated and nothing is registered until the
  // operator asks for it.
  G.repositorySheet = { method: "connect", path: "", name: null, validation: null, error: null };
  paint();
}

async function validateRepositoryPath() {
  const st = G.repositorySheet;
  if (!st || st.validating) return;
  const path = String(st.path || "").trim();
  if (!path) return;
  st.validating = true; st.error = null; st.validation = null;
  paint();
  try {
    const r = await gwFetch(`/api/repositories/inspect?path=${encodeURIComponent(path)}`);
    const j = await r.json();
    if (!j.ok) { st.error = j.error; st.errorDetail = j; }
    else {
      // Read-only: this endpoint persists nothing.
      st.validation = j;
      st.name = st.name ?? View.suggestRepositoryName(j.root);
    }
  } catch {
    st.error = "network";
    st.errorDetail = {};
  } finally {
    st.validating = false;
    paint();
  }
}

async function confirmRepositoryRegistration() {
  const st = G.repositorySheet;
  if (!st?.validation || st.submitting) return;   // double-submit guard
  st.submitting = true; st.error = null;
  paint();
  try {
    const r = await gwFetch("/api/repositories/connect-local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: st.validation.path, name: st.name || null }),
    });
    const j = await r.json();
    if (!j.ok) { st.error = j.error; st.errorDetail = j; st.submitting = false; paint(); return; }
    G.repositorySheet = null;
    G.notice = { kind: "ok", text: `Registered ${j.repository.name}.` };
    try { await fetchLanes(); } catch { /* the poll catches up */ }
    paint();
  } catch {
    st.error = "network"; st.errorDetail = {}; st.submitting = false; paint();
  }
}

// ---------------------------------------------------------------------------
// Sheet + wizard interaction.
//
// Nothing here writes anything durable until the final confirm. Values live in
// G.repositorySheet / G.laneWizard.draft, so Back preserves what was typed and
// Cancel throws the whole thing away without leaving a record behind.
// ---------------------------------------------------------------------------
function openLaneWizard() {
  const viewing = (G.lanes || []).find((l) => l.lane_id === G.selected);
  G.laneWizard = {
    step: "repository",
    // Default to the repository the operator is already looking at.
    draft: { repository_id: viewing?.repository_id || G.repositories?.[0]?.repository_id || null, provider: "claude" },
    error: null,
  };
  paint();
}

function closeSheets() {
  G.repositorySheet = null;
  G.laneWizard = null;
  paint();
}

async function wizardValidateWorktree() {
  const w = G.laneWizard;
  if (!w?.draft?.worktree_path) return;
  w.connectCheck = null;
  paint();
  try {
    const r = await gwFetch(`/api/repositories/inspect?path=${encodeURIComponent(w.draft.worktree_path)}`);
    const j = await r.json();
    const repo = (G.repositories || []).find((x) => x.repository_id === w.draft.repository_id);
    if (!j.ok) {
      w.connectCheck = { ok: false, text: View.repositoryErrorText(j.error, j) };
    } else if (repo && j.git_common_dir !== repo.git_common_dir) {
      // The cross-repository refusal, surfaced before anything is created.
      w.connectCheck = { ok: false, text: `That worktree belongs to a different repository (${j.git_common_dir}).` };
    } else {
      w.connectCheck = { ok: true, branch: j.branch, git_common_dir: j.git_common_dir };
    }
  } catch {
    w.connectCheck = { ok: false, text: "Could not reach the Gateway." };
  }
  paint();
}

async function wizardCreate() {
  const w = G.laneWizard;
  if (!w || w.submitting) return;            // double-submit guard
  const d = w.draft || {};
  w.submitting = true; w.error = null;
  paint();
  try {
    // A folder named in the wizard is created first, so the lane can be filed
    // into it in the same confirmed action.
    let folderId = d.folder_id || null;
    if (d.new_folder && String(d.new_folder).trim()) {
      const fr = await gwFetch("/api/lane-folders/create", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: d.new_folder, repository_id: d.repository_id }),
      });
      const fj = await fr.json();
      if (fj.ok) folderId = fj.folder.folder_id;
    }
    const body = {
      name: d.name,
      provider: d.provider || "claude",
      repository_id: d.repository_id,
      workspace_mode: d.workspace_mode,
    };
    // Send the branch the review screen SHOWED, prefix and all. Sending the
    // bare suffix asked for a branch called `vui` under a review that promised
    // `agent/vui`, because the server treats `branch` as the whole name.
    if (d.workspace_mode === "new_worktree") {
      const repo = (G.repositories || []).find((x) => x.repository_id === d.repository_id);
      const branch = View.previewBranch(repo, d.name, d.branch_suffix);
      if (branch) body.branch = branch;
    }
    if (d.workspace_mode === "connect_existing") body.worktree_path = d.worktree_path;
    const r = await gwFetch("/api/lanes/create", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) {
      w.error = j.error;
      w.errorText = View.laneCreateErrorText(j.error, j);
      w.submitting = false;
      paint();
      return;
    }
    // A lane whose workspace did not materialise is not a created lane. Landing
    // in its chat would hand the operator a lane that cannot run and no reason
    // why — the Financials failure, one screen earlier.
    const ws = j.workspace || null;
    if (ws && ws.mode !== "planning" && ws.provisioned === false) {
      w.error = ws.error || "workspace_not_provisioned";
      w.errorText = View.workspaceFailureText(ws);
      w.createdLaneId = j.lane?.lane_id || null;
      w.submitting = false;
      paint();
      return;
    }
    if (folderId && j.lane?.lane_id) {
      await gwFetch(`/api/lanes/${encodeURIComponent(j.lane.lane_id)}/folder`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      }).catch(() => {});
    }
    G.laneWizard = null;
    try { await fetchLanes(); } catch { /* */ }
    // Land in the new lane's chat, which is where the operator wants to be.
    if (j.lane?.lane_id) location.hash = View.laneDetailHash(j.lane.lane_id);
    else paint();
  } catch {
    w.error = "network";
    w.errorText = "Could not reach the Gateway. Nothing was created.";
    w.submitting = false;
    paint();
  }
}

document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.matches?.("[data-gw-repo-path]") && G.repositorySheet) { G.repositorySheet.path = t.value; return; }
  if (t.matches?.("[data-gw-repo-name]") && G.repositorySheet) { G.repositorySheet.name = t.value; return; }
  if (!G.laneWizard) return;
  const d = G.laneWizard.draft;
  if (t.matches?.("[data-gw-wiz-name]")) d.name = t.value;
  else if (t.matches?.("[data-gw-wiz-newfolder]")) { d.new_folder = t.value; if (t.value) d.folder_id = null; }
  else if (t.matches?.("[data-gw-wiz-suffix]")) d.branch_suffix = t.value;
  else if (t.matches?.("[data-gw-wiz-worktree]")) { d.worktree_path = t.value; G.laneWizard.connectCheck = null; }
});

document.addEventListener("click", async (e) => {
  const t = e.target;
  const hit = (sel) => t?.closest?.(sel);

  if (hit("[data-gw-sheet-cancel]")) { e.preventDefault(); closeSheets(); return; }
  if (hit("[data-gw-repo-validate]")) { e.preventDefault(); await validateRepositoryPath(); return; }
  if (hit("[data-gw-repo-confirm]")) { e.preventDefault(); await confirmRepositoryRegistration(); return; }
  const method = hit("[data-gw-repo-method]");
  if (method && G.repositorySheet) {
    e.preventDefault();
    G.repositorySheet.method = method.getAttribute("data-gw-repo-method");
    paint();
    return;
  }

  if (!G.laneWizard) return;
  const w = G.laneWizard;
  const d = w.draft;
  const repo = hit("[data-gw-wiz-repo]");
  if (repo) {
    e.preventDefault();
    const next = repo.getAttribute("data-gw-wiz-repo");
    // Changing repository invalidates every choice that was scoped to the old
    // one; keeping them would offer another repository's folder.
    if (next !== d.repository_id) { d.repository_id = next; d.folder_id = null; d.new_folder = ""; d.worktree_path = ""; w.connectCheck = null; }
    paint();
    return;
  }
  if (hit("[data-gw-wiz-add-repo]")) { e.preventDefault(); addRepositoryFlow(); return; }
  const folder = hit("[data-gw-wiz-folder]");
  if (folder) { e.preventDefault(); d.folder_id = folder.getAttribute("data-gw-wiz-folder") || null; d.new_folder = ""; paint(); return; }
  const mode = hit("[data-gw-wiz-mode]");
  if (mode) {
    e.preventDefault();
    d.workspace_mode = mode.getAttribute("data-gw-wiz-mode");
    if (d.workspace_mode === "planning") { d.provider = null; d.worktree_path = ""; w.connectCheck = null; }
    if (d.workspace_mode === "new_worktree") { d.worktree_path = ""; w.connectCheck = null; }
    paint();
    return;
  }
  const prov = hit("[data-gw-wiz-provider]");
  if (prov && !prov.disabled) { e.preventDefault(); d.provider = prov.getAttribute("data-gw-wiz-provider") || null; paint(); return; }
  if (hit("[data-gw-wiz-validate-wt]")) { e.preventDefault(); await wizardValidateWorktree(); return; }
  if (hit("[data-gw-wiz-back]")) { e.preventDefault(); w.step = View.prevLaneStep(w.step); w.error = null; paint(); return; }
  if (hit("[data-gw-wiz-next]")) {
    e.preventDefault();
    if (w.step === "identity" && !String(d.name || "").trim()) {
      w.nameError = "Give this lane a name.";
      paint();
      return;
    }
    w.nameError = null;
    w.step = View.nextLaneStep(w.step, d);
    paint();
    return;
  }
  if (hit("[data-gw-wiz-create]")) { e.preventDefault(); await wizardCreate(); return; }
});

/* ===========================================================================
 * UI V2 interactions.
 *
 * Kept in one listener so the V2 surfaces have a single, readable place where
 * their behaviour lives, rather than growing branches inside the three existing
 * lane listeners.
 * =========================================================================== */

/** Clipboard fallback for non-secure contexts, where navigator.clipboard is absent. */
function legacyCopyText(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

document.addEventListener("click", async (e) => {
  const hit = (sel) => (e.target instanceof Element ? e.target.closest(sel) : null);

  // MESSAGE EXPANSION IS OWNED BY THE DOM, NOT BY APP STATE.
  //
  // Expansion toggles a class on the one message and nothing else. It is
  // deliberately not held in G: a live provider message repaints on every poll,
  // and a repaint that re-derived expansion from state would slam the message
  // shut while the operator was reading it. paint() re-applies the open set
  // from the ids it recorded, so scroll position and the reader's choice both
  // survive an update.
  const more = hit("[data-v-msg-more]");
  if (more) {
    e.preventDefault();
    const li = more.closest(".vmsg");
    if (!li) return;
    const id = li.getAttribute("data-v-msg-id");
    const open = li.classList.toggle("is-expanded");
    more.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) G.expandedMessages.add(id); else G.expandedMessages.delete(id);
    return;
  }

  // COPY IS DOM-OWNED, LIKE EXPANSION, AND FOR THE SAME REASON.
  //
  // "Copied" is transient feedback on one button. Routing it through state and
  // paint() would repaint a live thread — moving scroll, and re-collapsing
  // nothing but costing the reader their place — to acknowledge a clipboard
  // write. It writes the text, swaps the label, and puts the label back.
  const copyMsg = hit("[data-v-msg-copy]");
  if (copyMsg) {
    e.preventDefault();
    e.stopPropagation();
    const text = copyMsg.getAttribute("data-v-copy-text") || "";
    const label = copyMsg.querySelector(".vmsg-copy-label");
    const mark = copyMsg.querySelector(".vmsg-copy-mark");
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Clipboard access is refused outside a secure context and in some
      // embedded webviews. A textarea + execCommand still works there, and
      // failing silently would look like the button did nothing.
      ok = legacyCopyText(text);
    }
    if (copyMsg.dataset.copyTimer) clearTimeout(Number(copyMsg.dataset.copyTimer));
    copyMsg.classList.toggle("is-copied", ok);
    copyMsg.classList.toggle("is-failed", !ok);
    if (label) label.textContent = ok ? "Copied" : "Copy failed";
    if (mark) mark.textContent = ok ? "\u2713" : "\u29c9";
    const t = setTimeout(() => {
      copyMsg.classList.remove("is-copied", "is-failed");
      if (label) label.textContent = "Copy";
      if (mark) mark.textContent = "\u29c9";
      delete copyMsg.dataset.copyTimer;
    }, 1800);
    copyMsg.dataset.copyTimer = String(t);
    return;
  }

  // THE GLOBAL INTERRUPTION CENTRE.
  //
  // Opening it is not navigation — the operator stays exactly where they were,
  // which is the entire point of putting interruptions in the shell instead of
  // in the content. Review IS navigation, and it closes the panel on the way.
  if (hit("[data-v-needs-open]")) {
    e.preventDefault();
    const panel = document.getElementById("needs-panel");
    setNeedsYouOpen(Boolean(panel?.hidden));
    return;
  }
  if (hit("[data-v-needs-close]") || hit("#needs-scrim")) {
    e.preventDefault();
    setNeedsYouOpen(false);
    return;
  }
  if (hit("[data-v-needs-review-link]")) {
    // The href does the navigating; the panel must not still be over the lane
    // the operator just asked to see.
    setNeedsYouOpen(false);
    return;
  }

  // Placeholder mode is turned OFF from the banner it paints. There is
  // deliberately no way to turn it on by accident.
  if (hit("[data-v-placeholders-off]")) {
    e.preventDefault();
    G.placeholders = View.writePlaceholderMode(false, storage());
    paint();
    return;
  }

  const win = hit("[data-v-usage-window]");
  if (win) {
    e.preventDefault();
    G.usageWindow = win.getAttribute("data-v-usage-window") || "today";
    // The runtime aggregates today only. Rather than silently show today's
    // numbers under a "30 days" heading, the view model marks the window
    // unsupported and the card says so.
    if (G.home?.usage) G.home = { ...G.home, usage: { ...G.home.usage, window: G.usageWindow } };
    paint();
    return;
  }

  // The lane tray's Review opens the lane's details, where the governed action
  // and its evidence live. Authorize routes to the same decision surface the
  // approvals bar already owns — the tray never approves anything by itself.
  // REVIEW OPENS THE DECISION, IT DOES NOT MAKE IT.
  //
  // The tray is one line and states only what is waiting. Review brings the
  // operator to the canonical governed surface — the decision bar the
  // governed-action owner renders, with its proposal and its approve/deny — and
  // focuses it. It never approves anything itself.
  const review = hit("[data-v-needs-review]");
  if (review) {
    e.preventDefault();
    const bar = document.querySelector("[data-gw-decision-bar]");
    if (bar instanceof HTMLElement) {
      bar.scrollIntoView({ block: "center", behavior: "smooth" });
      const approve = bar.querySelector("[data-gw-governed-approve]");
      if (approve instanceof HTMLElement) approve.focus({ preventScroll: true });
      return;
    }
    setAsideOpen(true, { restoreFocus: false });
    return;
  }
  const authorize = hit("[data-v-needs-authorize]");
  if (authorize) {
    e.preventDefault();
    // The tray never approves anything itself. It focuses the canonical
    // approve control — the one the governed-action owner renders — wherever it
    // is on the page. Scroll-and-focus rather than click: authorizing is the
    // operator's act, and a tray button must not perform it for them.
    const approve = document.querySelector("[data-gw-governed-approve]");
    if (approve instanceof HTMLElement) {
      approve.scrollIntoView({ block: "center", behavior: "smooth" });
      approve.focus({ preventScroll: true });
      return;
    }
    setAsideOpen(true, { restoreFocus: false });
    return;
  }
});

document.addEventListener("change", (e) => {
  const sel = e.target instanceof Element ? e.target.closest("[data-v-filter]") : null;
  if (!sel) return;
  const key = sel.getAttribute("data-v-filter");
  const value = sel.value || null;
  G.activityFilters = {
    ...G.activityFilters,
    [key]: key === "lane" || key === "provider" ? (value || null) : (value || "all"),
  };
  paint();
});

/**
 * Poll for a blocking dialog on the open lane.
 *
 * Read-only: it captures the pane and reports what is on it. Nothing is
 * answered without the operator tapping a choice.
 */
async function refreshBlockingScreen(laneId) {
  if (!laneId) { G.blockingScreen = null; return; }
  try {
    const r = await gwFetch(`/api/lanes/${encodeURIComponent(laneId)}/screen`);
    const j = await r.json();
    if (G.selected !== laneId) return;
    G.blockingScreen = j?.ok ? j : null;
  } catch {
    // A failed read must not erase a dialog the operator is looking at.
  }
}

// A dialog that cannot be dismissed from the keyboard is a trap on desktop.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const panel = document.getElementById("needs-panel");
  if (panel && !panel.hidden) setNeedsYouOpen(false);
});
