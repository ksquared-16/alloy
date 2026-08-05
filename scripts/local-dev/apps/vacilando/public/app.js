/*
 * Vacilando Runtime — Control Room controller.
 *
 * The primary object is the active worker session. NO orchestration logic here:
 * this file renders the worker board + selected-worker operating surface from
 * the runtime snapshot / resources / outputs / director endpoints, and runs
 * commands ONLY through the runtime (preview → confirm → execute → audit →
 * refresh). The runtime owns truth and commands; the UI owns presentation.
 */
const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const glyph = (g) => `<svg class="i"><use href="#g-${g || "compass"}"></use></svg>`;
const STATUS_ACC = { running: "var(--run)", review: "var(--review)", blocked: "var(--blocked)", complete: "var(--green-ink)", planning: "var(--plan)", paused: "var(--paused)", idle: "var(--idle)" };
// Per-worker activity — is claude/cursor working, idle, done, or paused? Server
// derives it from local git-recency + metadata (see sprint.mjs deriveActivity),
// so it stays meaningful even when the projection is degraded under load.
const ACTIVITY = { working: { label: "Working", k: "run" }, idle: { label: "Idle", k: "idle" }, done: { label: "Done", k: "ok" }, paused: { label: "Paused", k: "paused" } };
function activityPill(sp) {
  const a = ACTIVITY[sp.activity];
  if (!a) return ""; // unknown / not yet enriched — show nothing rather than guess
  const when = sp.activity === "working" && sp.last_activity_ms ? ` · ${ago(sp.last_activity_ms)}` : "";
  return `<span class="apill ${a.k}" title="${esc(sp.provider || "worker")} — ${a.label.toLowerCase()}${when ? ` (last activity ${ago(sp.last_activity_ms)} ago)` : ""}"><span class="adot"></span>${a.label}${when}</span>`;
}
function ago(ms) { if (!ms) return "—"; const s = Math.max(0, (Date.now() - ms) / 1000); if (s < 60) return `${s | 0}s`; if (s < 3600) return `${(s / 60) | 0}m`; if (s < 86400) return `${(s / 3600) | 0}h`; return `${(s / 86400) | 0}d`; }
const shortBranch = (b, wt) => (b ? b.replace(/^agent\/[^/]+\//, "") : wt || "—");

const state = { snap: null, res: null, sel: null, tab: "overview", outputs: {}, director: {}, drafts: {}, requests: {}, missions: {}, mission: {}, missionSel: {}, missionIntent: {} };

// -------- Director durable requests (server-owned; the browser is never the source of truth) --------
const REQ_STATUS = {
  queued: { label: "Queued", k: "idle" }, starting: { label: "Starting", k: "idle" },
  "worker-running": { label: "Worker running", k: "run" }, "waiting-for-provider": { label: "Waiting for provider", k: "run" },
  "worker-responded": { label: "Worker responded", k: "ok" }, "authentication-required": { label: "Authentication required", k: "auth" },
  "timed-out": { label: "Timed out", k: "err" }, failed: { label: "Failed", k: "err" }, cancelled: { label: "Cancelled", k: "muted" },
};
const REQ_TERMINAL = new Set(["worker-responded", "authentication-required", "timed-out", "failed", "cancelled"]);
async function fetchRequests(slot) { try { const r = await fetch(`/api/director/requests?slot=${slot}`); state.requests[slot] = (await r.json()).requests || []; render(true); } catch { /* keep last */ } }
async function fetchCloseout(slot) { try { const r = await fetch(`/api/closeout?slot=${slot}`); (state._closeout = state._closeout || {})[slot] = await r.json(); render(true); } catch { /* keep last */ } }
async function sendDirector(slot, request_type, instruction, retry_of = null) {
  if (!instruction || !instruction.trim()) { toast("err", "Empty instruction"); return; }
  const { data } = await api("/api/director/send", { slot, instruction, request_type, retry_of });
  if (!data.ok) { toast("err", "Send not accepted", data.detail || data.error || ""); return; } // draft preserved on failure to create
  clearDraft(slot); // submitted send is now durable + server-owned
  (state.requests[slot] = state.requests[slot] || []);
  state.requests[slot].unshift({ request_id: data.request_id, worker_slot: slot, instruction, request_type: data.request_type, status: "queued", created_at: data.created_at });
  render(true);
  fetchRequests(slot);
}

// -------- Mission pipeline (Capability → Knowledge → Compiler → Worker → Acceptance) --------
const MISSION_STATUS = {
  draft: { label: "Draft", k: "muted" }, ready: { label: "Ready", k: "ok" },
  starting: { label: "Starting", k: "idle" }, running: { label: "Running", k: "run" },
  waiting_for_operator: { label: "Waiting for operator", k: "auth" },
  waiting_for_acceptance: { label: "Waiting for acceptance", k: "auth" },
  blocked: { label: "Blocked", k: "err" }, stopping: { label: "Stopping", k: "idle" },
  stopped: { label: "Stopped", k: "muted" }, completed: { label: "Completed", k: "ok" },
  failed: { label: "Failed", k: "err" }, interrupted: { label: "Interrupted", k: "err" },
};
const MISSION_LIVE = new Set(["starting", "running", "stopping"]);
const READY_K = { ready: "ok", draft: "muted", blocked: "err", awaiting_operator: "auth", superseded: "muted" };
// Director Review — six-state verdict badge colouring (operator language).
const VERDICT_K = { "Ready": "ok", "Needs Product Decisions": "auth", "Needs Clarification": "auth", "Needs References": "warn", "Needs Acceptance Criteria": "warn", "Needs Review": "warn" };
const verdictBadgeClass = (v) => VERDICT_K[v] || "muted";
// The Director no longer pins a slot — it dispatches each mission to a worker
// (operator's run-target, or "auto"). See prepareDirectorMission + resolveRunSlot.

async function fetchMissions(slot) { try { const r = await fetch(`/api/missions?slot=${slot}`); state.missions[slot] = (await r.json()).missions || []; render(true); } catch { /* keep last */ } }
// Loading is explicit: while a mission's detail is in flight we render a loading
// state — never another record's data (the "what am I looking at?" defect).
async function fetchMissionDetail(id) {
  state.missionLoading = state.missionLoading || {};
  state.missionLoading[id] = true; render(true);
  try { const r = await fetch(`/api/mission?id=${encodeURIComponent(id)}`); state.mission[id] = await r.json(); }
  catch { /* keep last */ }
  finally { state.missionLoading[id] = false; render(true); }
}
async function fetchIdentity(slot) { try { const r = await fetch(`/api/identity?slot=${slot}`); (state.identity = state.identity || {})[slot] = await r.json(); render(true); } catch {} }

async function compileMission(slot) {
  const intent = (state.missionIntent[slot] || "").trim();
  if (!intent) { toast("err", "Enter a mission intent"); return; }
  toast("idle", "Compiling…", intent);
  const { status, data } = await api("/api/missions/compile", { slot, intent });
  if (!data.ok) {
    if (data.reason === "no_capability") toast("err", "No capability", `Director found no capability for “${intent}”. Known: ${(data.known || []).map((c) => c.name).join(", ") || "none"}. Register it first.`);
    else toast("err", "Compile failed", data.error || status);
    return;
  }
  state.missionSel[slot] = data.mission.mission_id;
  state.mission[data.mission.mission_id] = { mission: data.mission, package: data.package, outputs: [], acceptance: [] };
  state.missionIntent[slot] = "";
  await fetchMissions(slot);
  toast("ok", "Package prepared", `${data.package.title} · ${data.verdict?.verdict || data.package.readiness_status}`);
}

/**
 * Every consequential mission action runs the SAME governed lifecycle as the
 * command registry: preview → confirm → queued → running → terminal → audit.
 * The server refuses an unconfirmed consequential action (428), so the operator
 * always sees what will happen before it happens.
 */
const MISSION_CONSEQUENTIAL = new Set(["start", "stop", "steer", "accept", "close"]);

async function missionAct(action, id, extra = {}, okMsg) {
  if (MISSION_CONSEQUENTIAL.has(action) && extra.confirm !== true) {
    const { data: pv } = await api("/api/missions/preview", { mission_id: id, action });
    return showMissionConfirm(action, id, pv, extra, okMsg);
  }
  toast("idle", `${action}…`, "sent"); // immediate acknowledgement, always
  const { data } = await api(`/api/missions/${action}`, { mission_id: id, ...extra });
  if (!data.ok && data.error) {
    const blockers = (data.blockers || []).map((b) => b.message).join("; ");
    toast("err", `Cannot ${action}`, blockers || data.conflict?.detail || data.detail || data.error);
  } else if (okMsg) toast("ok", okMsg, "");
  fetchMissionDetail(id);
  if (state.sel) fetchMissions(state.sel);
  return data;
}

/** Preview dialog for a consequential mission action (effects + blockers). */
function showMissionConfirm(action, id, pv, extra, okMsg) {
  const ov = document.createElement("div"); ov.className = "ov";
  const blockers = (pv?.blockers || []).map((b) => `<li class="bad">${esc(b.message)}</li>`).join("");
  const effects = (pv?.effects || []).map((e) => `<li>${esc(e)}</li>`).join("");
  const wt = pv?.identity?.worktree_name;
  ov.innerHTML = `<div class="dlg"><h3>${esc(action[0].toUpperCase() + action.slice(1))} mission</h3>
    <span class="risk consequential">consequential</span>
    <div class="mconf-sum">${esc(pv?.summary || "")}</div>
    ${wt ? `<div class="mconf-wt">Worktree <b>${esc(wt)}</b> <span class="mono">${esc(pv.identity.worktree_path || "")}</span></div>` : ""}
    ${blockers ? `<div class="m-blockers"><b>Blocked:</b><ul>${blockers}</ul></div>` : ""}
    ${effects ? `<div class="mconf-eff"><b>This will:</b><ul>${effects}</ul></div>` : ""}
    <div class="dbtns"><button class="btn" data-close>Cancel</button>
      <button class="btn go" data-go ${pv?.ok === false ? "disabled" : ""}>${esc(action === "accept" ? "Accept" : action[0].toUpperCase() + action.slice(1))}</button></div></div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); render(true); };
  ov.querySelector("[data-close]").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  const go = ov.querySelector("[data-go]");
  if (go) go.onclick = () => { ov.remove(); missionAct(action, id, { ...extra, confirm: true }, okMsg); };
}

// Poll a non-terminal selected mission while the Mission tab is open.
setInterval(() => {
  if (state.tab !== "mission" || !state.sel) return;
  const id = state.missionSel[state.sel];
  if (!id) return;
  const d = state.mission[id];
  const st = d?.mission?.status;
  if (!st || !["completed", "failed", "stopped"].includes(st)) fetchMissionDetail(id);
}, 3000);

// Poll the open Director conversation while its work is actively executing, so the
// operator sees engineering progress live without touching the provider window.
setInterval(() => {
  const r = parseRoute();
  if (r.name !== "director" || r.sub !== "mission" || !r.param) return;
  const st = state._convo?.[r.param]?.mission?.status;
  if (["starting", "running", "stopping", "waiting_for_acceptance"].includes(st)) fetchConversation(r.param);
}, 3000);

// -------- Director draft state (per worker slot) --------
// The draft is owned by application state (state.drafts[slot]), NOT the DOM, so
// a background re-render never loses it. It is mirrored to sessionStorage for
// reload recovery only (never localStorage, never the server) and cleared only
// on a successfully completed send or an explicit clear.
const DIRECTOR_MAX = 24000; // mirrors registry DIRECTOR_MESSAGE_MAX
const DRAFT_KEY = (slot) => `vac.draft.${slot}`;
function draftFor(slot) {
  if (state.drafts[slot] == null) { try { state.drafts[slot] = sessionStorage.getItem(DRAFT_KEY(slot)) || ""; } catch { state.drafts[slot] = ""; } }
  return state.drafts[slot];
}
function setDraft(slot, val) {
  state.drafts[slot] = val;
  try { if (val) sessionStorage.setItem(DRAFT_KEY(slot), val); else sessionStorage.removeItem(DRAFT_KEY(slot)); } catch { /* private mode */ }
}
function clearDraft(slot) {
  setDraft(slot, "");
  const t = document.getElementById("d-msg");
  if (t && Number(t.dataset.slot) === slot) { t.value = ""; updateDraftCount(slot); }
}
function fmtCount(n) { return n.toLocaleString() + (n === 1 ? " character" : " characters"); }
function updateDraftCount(slot) {
  const c = document.getElementById("d-count");
  if (!c) return;
  const n = (state.drafts[slot] || "").length;
  c.textContent = fmtCount(n);
  c.classList.toggle("warn", n > DIRECTOR_MAX * 0.9);
  c.classList.toggle("over", n > DIRECTOR_MAX);
}
// Live draft sync: keep application state current on every keystroke, and update
// the count in place WITHOUT a re-render (so typing is never interrupted).
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t && t.id === "d-msg" && t.dataset.slot != null) {
    const slot = Number(t.dataset.slot);
    // Invariant: the compose field always belongs to the selected worker. Ignore
    // input from a stale/detached textarea so it can never cross-write a draft.
    if (state.sel != null && slot !== state.sel) return;
    setDraft(slot, t.value);
    updateDraftCount(slot);
  }
  if (t && t.id === "m-intent" && t.dataset.slot != null) {
    state.missionIntent[Number(t.dataset.slot)] = t.value; // persist so a poll re-render never wipes typing
  }
  // Director conversation: keep the intent box + reply composer intact across polls.
  if (t && t.id === "d-intent") state._dirIntent = t.value;
  if (t && t.id === "d-runtarget") state._runTarget = t.value; // which worker runs the next mission
  if (t && t.id === "cv-reply") state._cvReply = t.value;
});

// -------- routing (Mission Control primary; legacy board is compatibility-only) --------
const MC_ROUTES = new Set(["workspaces", "workspace", "missions", "needs-you", "timeline", "workers", "decisions", "evidence", "kickoff", "improvements", "settings"]);
const LEGACY_ROUTES = new Set(["command", "director", "history", "policies", "trust"]);

function legacyMode() {
  return new URLSearchParams(location.search).get("legacy") === "1";
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const p = (pathPart || "").split("/").filter(Boolean);
  const qs = new URLSearchParams(queryPart || "");
  return { name: p[0] || "missions", sub: p[1], param: p[2], query: qs };
}
function route() { return parseRoute().name; }
function go(r) { location.hash = "#/" + r; }
const CRUMBS = {
  workspaces: "Workspaces", workspace: "Workspaces",
  missions: "Missions", "needs-you": "Needs You", timeline: "Timeline", workers: "Workers",
  decisions: "Decisions", evidence: "Evidence", kickoff: "Mission Brief", improvements: "Improvements",
  settings: "Settings",
  director: "Legacy Director", command: "Legacy Board", history: "Work History",
  policies: "Policies", trust: "Runtime Trust",
};
function setActiveNav(name) {
  const active = (name === "kickoff" || name === "timeline" || name === "decisions" || name === "evidence")
    ? (name === "kickoff" ? "missions" : name === "decisions" ? "needs-you" : name)
    : name;
  const navActive = ["workspaces", "workspace", "missions", "needs-you", "workers", "improvements", "settings"].includes(name)
    ? (name === "workspace" ? "workspaces" : name)
    : (name === "kickoff" ? "missions" : name === "decisions" ? "needs-you" : name === "timeline" || name === "evidence" ? "missions" : name);
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === navActive));
  $("#crumb").textContent = CRUMBS[name] || "Missions";
}

/**
 * Cutover: empty hash and legacy home routes land in Mission Control Missions
 * unless the operator explicitly requested ?legacy=1.
 * Desktop historically opened #/director — that must not remain the landing page.
 */
const LEGACY_HOME_ROUTES = new Set(["director", "command", "history", "policies", "trust"]);
function enforceMissionControlHome() {
  const hash = location.hash || "";
  const empty = !hash || hash === "#" || hash === "#/";
  if (empty) {
    location.hash = "#/missions";
    return;
  }
  if (legacyMode()) return;
  const r = parseRoute();
  // Top-level legacy shells only (keep #/command/worker/N reachable via Settings → Legacy).
  if (LEGACY_HOME_ROUTES.has(r.name) && !r.sub) {
    location.hash = "#/missions";
  }
}
window.addEventListener("hashchange", () => {
  if (legacyMode()) return;
  const r = parseRoute();
  if (LEGACY_HOME_ROUTES.has(r.name) && !r.sub) location.hash = "#/missions";
});

let lastKey = null;
function renderMcView(r, V2) {
  setActiveNav(r.name);
  const V = $("#view");
  let html = "";
  const missionQ = r.query?.get("mission") || null;
  if (r.name === "settings") html = V2.viewSettings ? V2.viewSettings() : `<div class="mc-wrap"><h2>Settings</h2></div>`;
  else if (r.name === "workspaces" || r.name === "workspace") {
    html = V2.viewWorkspace
      ? V2.viewWorkspace(r.sub || r.query?.get("id") || "ws_identity")
      : `<div class="mc-wrap empty">Workspace Runtime unavailable</div>`;
  }
  else if (r.name === "needs-you") html = V2.viewNeedsYou();
  else if (r.name === "missions" && r.sub) html = V2.viewMissionDetail(r.sub);
  else if (r.name === "missions") html = V2.viewMissions();
  else if (r.name === "timeline") html = V2.viewTimeline(r.sub || missionQ);
  else if (r.name === "workers") html = r.sub ? V2.viewWorkerDetail(r.sub) : V2.viewWorkers();
  else if (r.name === "decisions") html = r.sub ? V2.viewDecisionDetail(r.sub) : V2.viewDecisions(missionQ);
  else if (r.name === "evidence") html = V2.viewEvidence(r.sub || missionQ);
  else if (r.name === "kickoff") html = V2.viewKickoff(r.sub);
  else if (r.name === "improvements") html = r.sub ? V2.viewImprovementDetail(r.sub) : V2.viewImprovements();
  V.innerHTML = html || `<div class="mc-wrap empty">Unknown Mission Control route</div>`;
  if ((r.name === "workspaces" || r.name === "workspace") && typeof V2.afterWorkspacePaint === "function") {
    requestAnimationFrame(() => V2.afterWorkspacePaint());
  }
  try {
    // Mission Control badge is V2 Needs You only — never fall back to legacy board counts.
    const items = window.VacilandoV2?.state?.needsYou?.items;
    if (Array.isArray(items)) $("#nb-needs").textContent = String(items.length);
    else if (typeof window.VacilandoV2?.fetchNeedsYou === "function") {
      window.VacilandoV2.fetchNeedsYou();
    } else {
      $("#nb-needs").textContent = "0";
    }
  } catch { /* */ }
}

function render(force) {
  // Operator dialogs (Improve Vacilando, deliverable review, confirms) own the
  // screen. Background freshness must not remove them or rebuild #view under them
  // — that caused a full-UI flash every ~2s while heartbeats bumped revision.
  // Hash navigation dismisses leftover overlays in mission-control.js.
  if (document.querySelector(".ov")) return;
  const r = parseRoute();
  const V2 = window.VacilandoV2;

  // Mission Control is the authoritative shell — never wait on board compose.
  if (V2?.enabled && MC_ROUTES.has(r.name)) {
    const mcKey = location.hash + "|mc|" + (V2.state?._rev || 0);
    if (!force && mcKey === lastKey) return;
    lastKey = mcKey;
    renderMcView(r, V2);
    return;
  }

  // URL drives the center: #/command → Team Dashboard; #/command/worker/N → that worker.
  if (r.name === "command" && r.sub === "worker" && r.param) {
    const n = Number(r.param);
    if (n !== state.sel) { state.sel = n; if (!state.tab || state.tab === "overview") state.tab = "work"; const sp = state.snap?.sprints.find((x) => x.slot === n); if (sp) { fetchOutputs(sp.worktree); fetchDirector(n); fetchPr(sp); } }
  } else if (r.name === "command") {
    state.sel = null; // Team Dashboard is the default center — never a worker
    if (!state._dash) fetchDashboard();
  }
  const key = location.hash + "|" + (state.snap?.generated_at || "") + "|" + state.sel + "|" + state.tab + "|" + Object.keys(state.outputs).length + "|" + Object.keys(state.director).length + "|" + Object.keys(state._pr || {}).length + "|" + (state._dash?.generated_at || "");
  if (!force && key === lastKey) return;
  setActiveNav(r.name);
  const V = $("#view");
  // Only a genuinely empty runtime blanks the LEGACY board. Mission Control never hits this path.
  if (!state.snap || (!state.snap.headline && !(state.snap.sprints || []).length)) {
    // NOTE: lastKey is deliberately NOT set here. Marking this key as rendered
    // would make the next identical key short-circuit, leaving the operator
    // looking at a stale view — the "first click does nothing" defect.
    V.innerHTML = `<div class="empty"><div class="big"><span class="spin"></span> ${esc(state.snap?.pending_note || "Connecting to the runtime…")}</div></div>`; return;
  }
  lastKey = key; // only a completed render counts as rendered
  // Preserve caret/scroll of a focused text field across the innerHTML rebuild
  // so a background refresh can never disturb an in-progress draft.
  const ae = document.activeElement;
  const savedFocus = ae && (ae.tagName === "TEXTAREA" || ae.tagName === "INPUT") && ae.id
    ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd, top: ae.scrollTop } : null;
  V.innerHTML = ({ director: viewDirector, command: viewCommand, history: viewHistory, policies: viewPolicies, settings: viewSettings, trust: viewTrust }[r.name] || viewCommand)();
  if (savedFocus) {
    const n = document.getElementById(savedFocus.id);
    if (n) { try { n.focus({ preventScroll: true }); if (savedFocus.s != null) n.setSelectionRange(savedFocus.s, savedFocus.e); n.scrollTop = savedFocus.top; } catch { /* field gone */ } }
  }
  $("#nb-needs").textContent = state.snap ? needsYou().length : 0;
}
window.render = render;

// -------- Runtime Trust: every trust property, measurable --------
async function fetchTrust() { try { const r = await fetch("/api/trust"); state._trust = await r.json(); render(true); } catch { /* keep last */ } }
function viewTrust() {
  const t = state._trust;
  if (!t) { fetchTrust(); return `<div class="empty"><div class="big"><span class="spin"></span> Measuring runtime trust…</div></div>`; }
  const o = t.overall || { passed: 0, total: 0, percent: 0 };
  const scoreK = o.percent >= 90 ? "ok" : o.percent >= 70 ? "auth" : "err";
  const cats = (t.categories || []).map((c) => `<div class="tcat">
      <div class="tcat-h"><span class="tcat-name">${esc(c.category)}</span>
        <span><span class="proofchip ${c.browser_certified ? "browser" : "api"}">${c.browser_certified ? "browser-certified" : "api-only"}</span>
        <span class="mbadge ${c.passed === c.total ? "ok" : "err"}">${c.passed}/${c.total}</span></span></div>
      <div class="tchecks">${(c.checks || []).map((k) => `<div class="tchk ${k.ok ? "ok" : "bad"}"><span class="tmark">${k.ok ? "✓" : "✗"}</span>
        <div><div class="tprop">${esc(k.name)}</div><div class="tdet">${esc(k.evidence)}</div></div></div>`).join("")}</div>
      ${c.unresolved?.length ? `<div class="m-blockers">Unresolved: ${c.unresolved.map(esc).join("; ")}</div>` : ""}
    </div>`).join("");
  const slots = (t.slots || []).map((s) => `<tr><td>slot ${s.slot}</td><td class="mono">${esc(s.worktree_name || "—")}</td>
      <td class="mono">${esc(s.branch || "—")}</td>
      <td>${s.ok ? '<span class="mbadge ok">verified</span>' : `<span class="mbadge err">${esc(s.conflict?.kind || "conflict")}</span>`}</td></tr>`).join("");
  const h = t.host || {};
  return `<div class="trustview">
    <div class="sec">
      <div class="m-head"><h5>Runtime trust</h5><span class="mbadge ${scoreK}">${o.passed}/${o.total} · ${o.percent}%</span></div>
      <div class="muted note">Measured from live runtime state in ${t.computed_in_ms}ms. Browser coverage: <b>${t.browser_coverage?.categories_browser_certified ?? 0}/${t.browser_coverage?.categories_total ?? 0}</b> categories.${t.note ? " " + esc(t.note) : ""}</div>
      ${cats}
    </div>
    <div class="sec">
      <h5>Runtime host — ${esc(h.ownership_type || "?")}</h5>
      <dl class="kv">
        <dt>Purpose</dt><dd>${esc(h.purpose || "—")}</dd>
        <dt>Project</dt><dd>${esc(h.project_id || "—")} · repo ${esc(h.repository || "—")}</dd>
        <dt>Worktree</dt><dd class="mono">${esc(h.worktree_name || "—")}</dd>
        <dt>Path</dt><dd class="mono">${esc(h.worktree_path || "—")}</dd>
        <dt>Branch</dt><dd class="mono">${esc(h.branch || "—")}</dd>
        <dt>Executes missions</dt><dd>${h.executes_missions ? '<b class="warnink">yes — must not</b>' : "no — worker execution never falls back here"}</dd>
        <dt>Status</dt><dd>${h.conflicts_with_slot ? `<b class="warnink">${esc(h.status)}</b>` : esc(h.status || "—")}</dd>
      </dl>
    </div>
    <div class="sec">
      <h5>Slot identity — one slot, one verified worktree</h5>
      <table class="ttable"><thead><tr><th>Slot</th><th>Worktree</th><th>Branch (verified via git)</th><th>Identity</th></tr></thead><tbody>${slots}</tbody></table>
    </div>
  </div>`;
}

/**
 * Board state banner — the operator always knows whether the dock is live,
 * refreshing, or showing registered workers because the projection is degraded.
 * A degraded projection never removes a worker card.
 */
function boardBanner() {
  const s = state.snap || {};
  if (!s.board_state || s.board_state === "live") return "";
  const k = s.board_state === "projection_unavailable" ? "warn" : "idle";
  const label = { loading: "Loading worker detail…", partial: "Refreshing worker detail…", projection_unavailable: "Live detail unavailable — showing registered workers", no_workers: "No workers configured" }[s.board_state] || s.board_state;
  return `<div class="boardbanner ${k}">${s.board_state === "projection_unavailable" ? "" : '<span class="spin"></span>'}${esc(label)}</div>`;
}

// -------- Command Center: board | operating surface | rail --------
function viewCommand() {
  const center = state.sel != null ? operatingSurface() : dashboardCenter();
  return `<div class="room">
    <section class="board">
      <div class="board-h"><span>Worker Dock</span><button class="btn primary sm" data-start>+ Start Work</button></div>
      ${championCard()}
      ${boardBanner()}
      ${state.snap.sprints.length ? state.snap.sprints.map(workerCard).join("") : `<div class="empty sm">No workers are configured.</div>`}
      ${resourcesCard()}
    </section>
    <section class="surface">${center}</section>
    <aside class="needs">${needsYouHtml()}</aside>
  </div>`;
}
function needsYouHtml() {
  const items = needsYou();
  return `<div class="rail-hh">Needs You <span class="b">${items.length}</span></div>` +
    (items.length ? items.map((it) => `<div class="rcard" ${it.sel ? `data-sel="${it.sel}"` : ""} ${it.route ? `data-nav="${it.route}"` : ""} ${it.review ? `data-review="${esc(it.review)}"` : ""}><span class="sd ${it.k}"></span><div><div class="rt">${esc(it.t)}</div><div class="rs trunc">${esc(it.s)}</div></div></div>`).join("") : `<div class="rempty">All clear.</div>`);
}

function resFor(slot) { return (state.res?.workers || []).find((w) => w.slot === slot) || null; }

// Vacilando itself — the CHAMPION — sits above the worker slots as the app that
// stands them up. It is infrastructure, not a worker: no work is dispatched to it.
function championCard() {
  const c = state.snap?.champion;
  if (!c) return "";
  return `<div class="champ">
    <div class="champ-top"><span class="gl">${glyph(c.glyph)}</span>
      <div class="champ-id"><b>Vacilando</b> · app<div class="champ-sub trunc mono">${esc(c.branch || c.worktree || "")}</div></div>
      <span class="apill dir" title="The control plane you're using — stands up the workers, not a worker itself"><span class="adot"></span>Champion</span></div>
  </div>`;
}

function workerCard(sp) {
  // A slot whose worktree was deleted: tell the truth and offer to free it,
  // instead of showing a phantom worker with actions that would fail.
  if (sp.status === "worktree-missing") {
    return `<div class="wcard missing" data-sel="${sp.slot}" style="--acc:var(--blocked)">
      <div class="wc-top"><span class="gl">${glyph(sp.glyph)}</span>
        <div class="wc-id"><b>slot ${sp.slot}</b> · ${esc(sp.provider)}</div>
        <span class="chip err">worktree deleted</span></div>
      <div class="wc-obj trunc">${esc(sp.title)}</div>
      <div class="wc-meta trunc mono">${esc(sp.worktree || "")} — checkout removed</div>
      <div class="wc-res"><span class="muted">worktree no longer on disk — free the slot to reuse it</span></div>
      <div class="wc-ctl"><button class="btn sm warn" data-end="${sp.slot}">Free slot</button></div></div>`;
  }
  const r = resFor(sp.slot);
  const proc = r?.server_process;
  const pend = sp.question_count || 0;
  return `<div class="wcard ${sp.slot === state.sel ? "sel" : ""}" data-sel="${sp.slot}" style="--acc:${STATUS_ACC[sp.status] || "var(--green)"}">
    <div class="wc-top"><span class="gl">${glyph(sp.glyph)}</span>
      <div class="wc-id"><b>slot ${sp.slot}</b> · ${esc(sp.provider)}${activityPill(sp)}</div>
      <span class="chip ${sp.enriched === false ? "idle" : sp.status}">${esc(sp.enriched === false ? "detail refreshing" : sp.status)}</span>${pend ? `<span class="pend">${pend}</span>` : ""}</div>
    <div class="wc-obj trunc">${esc(sp.title)}</div>
    <div class="wc-meta trunc mono">${esc(shortBranch(sp.branch, sp.worktree))}${sp.git ? ` · ↑${sp.git.ahead}↓${sp.git.behind}${sp.git.state === "dirty" ? "·dirty" : ""}` : ` · <span class="muted">git detail pending</span>`}</div>
    <div class="wc-res">${proc
      ? `<span title="cpu">◔ ${proc.cpu_pct}%</span><span title="mem">▤ ${proc.rss_mb}MB</span><span title="elapsed">◷ ${proc.elapsed}</span>${r.port ? `<span title="port">:${r.port}</span>` : ""}`
      : `<span class="muted">no active process</span>`}<span class="wc-act">${sp.updated_at_ms ? `upd ${ago(sp.updated_at_ms)}` : ""}</span></div>
    <div class="wc-ctl">
      ${sp.status === "paused" ? `<button class="btn sm warn" data-cmd="worker.resume" data-slot="${sp.slot}">Resume</button>` : `<button class="btn sm" data-cmd="worker.pause" data-slot="${sp.slot}">Pause</button>`}
      <button class="btn sm" data-cmd="worker.doctor" data-slot="${sp.slot}">Diagnose</button>
      ${sp.server === "running" && sp.port
        ? `<a class="btn sm" href="http://127.0.0.1:${sp.port}" target="_blank" title="Open the worker's local app on :${sp.port}" onclick="event.stopPropagation()">Open App</a>`
        : `<button class="btn sm" data-startserver="${sp.slot}" title="App is stopped — start its dev server">App: stopped</button>`}
      <button class="btn sm" data-end="${sp.slot}">End</button>
    </div></div>`;
}

function resourcesCard() {
  const o = state.res?.overall;
  if (!o || !o.slots) return `<div class="rescard"><div class="rh">Machine</div><div class="muted">reading…</div></div>`;
  const pc = o.slots.pressure;
  return `<div class="rescard ${pc}"><div class="rh">Machine · <span class="pr ${pc}">${pc}</span></div>
    <div class="rgrid">
      <div><span class="rl">CPU load</span><span class="rv">${o.cpu_load_pct}% <small>${o.load_5m}/${o.cpu_count}</small></span></div>
      <div><span class="rl">Memory used</span><span class="rv">${o.mem_used_pct}% <small>${(o.mem_available_mb / 1024).toFixed(1)}G avail</small></span></div>
      <div><span class="rl">Swap</span><span class="rv">${o.swap?.used_mb != null ? (o.swap.used_mb / 1024).toFixed(1) + "G" : "—"}</span></div>
      <div><span class="rl">Capacity</span><span class="rv">${o.slots.occupied}/6 · ${o.slots.recommended_available} rec.</span></div>
    </div>${o.warning ? `<div class="rwarn">${esc(o.warning)}</div>` : ""}</div>`;
}

// Memory management — Vacilando actively reclaims idle worker dev servers.
function memoryBlock(mem) {
  const servers = mem.servers || [];
  const p = mem.pressure || {};
  const auto = mem.policy?.auto_reclaim;
  const totalG = mem.total_server_mb != null ? (mem.total_server_mb / 1024).toFixed(1) : "0.0";
  const rows = servers.length
    ? servers.map((s) => `<div class="memrow"><span class="memk"><b>slot ${s.slot}</b> · ${esc(s.title)}</span>
        <span class="memv ${s.reclaimable ? "clean" : ""}">${s.rss_mb}MB · ${s.reclaimable ? "idle" : esc(s.status)}</span>
        <button class="btn sm ${s.reclaimable ? "" : "warn"}" data-cmd="server.stop" data-slot="${s.slot}" title="${s.reclaimable ? "Idle — safe to reclaim" : "Active slot — reclaim only if you're not using it"}">Reclaim</button></div>`).join("")
    : `<div class="muted">No worker dev servers running.</div>`;
  const acted = (mem.auto_actions || []).filter((a) => a.ok);
  return `<div class="dsec"><div class="dsh">Memory · managed by Vacilando
      <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">· auto-reclaim ${auto ? "on" : "off"} · pressure ${esc(p.level_label || "—")}${p.thrashing ? " · thrashing" : ""}</span></div>
    <div class="memhead"><span>${servers.length} worker dev server${servers.length === 1 ? "" : "s"} · ${totalG}G held</span>
      <span>${mem.reclaimable_mb ? `<span class="clean">${mem.reclaimable_mb}MB idle → auto-reclaimed under pressure</span>` : `<span class="muted">none idle right now</span>`}</span></div>
    ${rows}
    ${acted.length ? `<div class="muted src">Vacilando auto-reclaimed: ${acted.slice(0, 4).map((a) => `slot ${a.slot} (~${a.freed_mb}MB)`).join(", ")}.</div>` : ""}
    <div class="muted src">Vacilando reclaims <b>idle</b> dev servers automatically when the host thrashes (never active work). External apps (Chrome, VMs, editors) are outside its control — the biggest hogs there are yours to close.</div></div>`;
}

// Disk hygiene — Vacilando reclaims build bloat from merged+clean worktrees so
// the operator manages WORK, not disk. Mirror of memoryBlock, one resource over.
function diskBlock(disk) {
  const sig = disk.signal || {};
  const pol = disk.policy || {};
  const auto = !!pol.auto_gc;
  const free = sig.free_gb;
  const low = typeof free === "number" && free < (pol.low_water_gb || 8);
  const kr = sig.kept_reasons || {};
  const keptParts = Object.entries(kr).map(([k, n]) => `${n} ${k.replace(/_/g, "-")}`).join(", ");
  const rMb = sig.reclaimable_mb;
  const la = (disk.auto_actions || [])[0];
  return `<div class="dsec"><div class="dsh">Disk hygiene · managed by Vacilando
      <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">· auto-reclaim ${auto ? "on" : "off"}${low ? " · LOW DISK" : ""}</span></div>
    <div class="memhead"><span><b class="${low ? "warn" : "clean"}">${free != null ? free + " GB free" : "—"}</b> · ${sig.worktrees ?? "—"} worktrees</span>
      <span>${rMb ? `<span class="clean">${(rMb / 1024).toFixed(1)}G reclaimable now</span>` : `<span class="muted">nothing reclaimable</span>`}</span></div>
    <div class="memrow"><span class="memk">${sig.reclaimable ?? 0} merged+clean → reclaimable · ${sig.kept ?? 0} kept${keptParts ? ` (${keptParts})` : ""}</span>
      <button class="btn sm" data-disk-reclaim="1" title="Reclaim node_modules/.next from merged+clean worktrees only — safe">Reclaim now</button></div>
    <div class="memrow"><span class="memk">Reactive auto-reclaim when free disk < ${pol.low_water_gb || 8} GB</span>
      <button class="btn sm ${auto ? "warn" : ""}" data-disk-auto="${auto ? "0" : "1"}">${auto ? "Turn off" : "Turn on"}</button></div>
    ${la ? `<div class="muted src">Last reclaim: ${la.ok ? `freed ${la.reclaim_mb != null ? (la.reclaim_mb / 1024).toFixed(1) + "G" : "—"} across ${la.reclaimed ?? 0} worktree(s)${la.trigger ? ` · ${esc(la.trigger)}` : ""}` : `failed — ${esc(la.error || "")}`}</div>` : ""}
    <div class="muted src">Reclaims only <b>regenerable</b> artifacts (node_modules/.next) from worktrees that are <b>merged + clean</b>. Never touches source, history, uncommitted work, the canonical repo, the current checkout, or a live server — restored by npm install on revisit.</div></div>`;
}

// -------- Team Dashboard (default center) --------
function dashboardCenter() {
  const d = state._dash;
  if (!d) { fetchDashboard(); return `<div class="empty" style="margin:20px"><div class="big">Team Dashboard</div>Loading team, machine, providers, and scheduler…</div>`; }
  const m = d.machine || {}, sc = d.scheduler || {}, tp = d.throughput || {}, ol = d.operator_load || {};
  const stat = (l, v, sub) => `<div class="dstat"><div class="dl">${l}</div><div class="dv">${v}</div>${sub ? `<div class="ds">${sub}</div>` : ""}</div>`;
  const c = sc.counts || {};
  const memHtml = memoryBlock(d.memory || {});
  const diskHtml = diskBlock(d.disk || {});
  return `<div class="dash">
    <div class="dash-h"><div class="dt">${esc(d.team?.project || "Alloy")} · Team Dashboard</div><div class="muted mono">${d.team?.base_sha || ""}</div></div>

    <div class="dsec"><div class="dsh">Team status</div><div class="dstats">
      ${stat("Slots", `${c.available != null ? 6 - c.available : "—"}/6`, "occupied")}${stat("Active", c.active ?? "—")}${stat("Waiting", c.waiting ?? "—")}${stat("Paused", c.paused ?? "—")}${stat("Blocked", c.blocked ?? "—")}${stat("Idle", c.idle ?? "—")}${stat("Queued", c.queued ?? 0)}${stat("Available", c.available ?? "—", "capacity")}</div></div>

    <div class="dgrid2">
      <div class="dsec"><div class="dsh">Machine health <span class="pr ${m.slots?.pressure || ""}">${m.slots?.pressure || "—"}</span></div><div class="dstats sm">
        ${stat("CPU load", `${m.cpu_load_pct ?? "—"}%`, `${m.load_5m ?? ""}/${m.cpu_count ?? ""} (5m)`)}
        ${stat("Memory used", `${m.mem_used_pct ?? "—"}%`, `${m.mem_available_mb != null ? (m.mem_available_mb / 1024).toFixed(1) + "G avail" : ""}`)}
        ${stat("Compressed", m.mem_compressed_mb != null ? `${(m.mem_compressed_mb / 1024).toFixed(1)}G` : "—", "reclaimable")}
        ${stat("Wired", m.mem_wired_mb != null ? `${(m.mem_wired_mb / 1024).toFixed(1)}G` : "—")}
        ${stat("Swap", m.swap?.used_mb != null ? `${(m.swap.used_mb / 1024).toFixed(1)}G` : "—", m.swap?.total_mb ? `of ${(m.swap.total_mb / 1024).toFixed(1)}G` : "")}
        ${stat("Servers", m.running_servers ?? "—", "running")}</div>
        <div class="muted src">${esc(m.mem_source || "")}</div></div>

      <div class="dsec"><div class="dsh">Providers <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">· authentication owned by Provider Runtime</span></div>
        ${(d.provider_runtime?.providers || []).map((p) => `
        <div class="prov"><div class="prov-h"><b>${esc(p.label)}</b>
            <span class="hpill ${p.auth.state === "authenticated" ? "healthy" : p.auth.state === "needs_auth" ? "attention" : "finished"}">${esc(p.auth.label)}</span>
            ${p.auth.state === "authenticated" ? `<span class="hpill healthy">${esc(p.health.label)}</span>` : ""}</div>
          ${p.auth.state === "authenticated"
            ? `<div class="prov-m">${p.active_workers} worker${p.active_workers === 1 ? "" : "s"} · ${p.usage.calls_today} today · ${(p.usage.input_tokens || 0)}→${(p.usage.output_tokens || 0)} tok · ${p.usage.last_success ? "last " + ago(Date.parse(p.usage.last_success)) + " ago" : "no requests yet"}</div>
               <div class="prov-c">cost: ${p.usage.cost.kind === "authoritative" ? `$${p.usage.cost.value_usd}` : p.usage.cost.kind === "estimate" ? `~$${p.usage.cost.value_usd}` : "unavailable"} · last error: ${esc(p.last_error || "None")}</div>`
            : p.auth.state === "not_configured"
              ? `<div class="prov-m muted">${esc(p.auth.detail || "not configured")}</div>`
              : `<div class="prov-auth"><span class="muted">${esc(p.auth.detail || "reconnect required")}</span> <button class="btn sm warn" data-prov-reconnect="${p.id}">Reconnect</button></div>`}
        </div>`).join("")}
        <div class="muted src">One reconnect fixes every worker — providers are shared infrastructure, not per-worker logins. Manage in Settings → Providers.</div></div>
    </div>

    ${memHtml}
    ${diskHtml}

    <div class="dgrid2">
      <div class="dsec"><div class="dsh">Scheduler <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">· deterministic · auto-scheduling ${sc.auto_scheduling ? "on" : "off"}</span></div>
        <div class="muted" style="margin-bottom:6px">${sc.may_start ? `✅ Safe to start${sc.recommended_slot ? ` on slot ${sc.recommended_slot}` : ""}` : "⛔ Do not start a new worker now"}</div>
        ${(sc.recommendations || []).map((r) => `<div class="srec ${r.kind}">${esc(r.text)}</div>`).join("")}</div>

      <div class="dsec"><div class="dsh">Throughput & operator load (today)</div><div class="dstats sm">
        ${stat("Commands", tp.commands_today ?? 0, `${tp.succeeded_today ?? 0} ok · ${tp.failed_today ?? 0} fail`)}
        ${stat("Round-trips", tp.provider_round_trips_today ?? 0, "provider")}
        ${stat("Reviews", tp.reviews_resolved_today ?? 0, "resolved")}
        ${stat("Interventions", ol.interventions_today ?? 0, "human")}
        ${stat("Escalated", ol.decisions_escalated ?? 0, "need you")}
        ${stat("Kelly-minutes", ol.human_minutes?.value ?? "n/a", ol.human_minutes?.kind || "")}</div>
        <div class="muted src">${esc(ol.human_minutes?.note || "")}</div></div>
    </div>

    <div class="dsec"><div class="dsh">Recent outputs</div>${(d.recent_outputs || []).length ? (d.recent_outputs).map((a) => `<div class="commit"><span class="sh">${esc(a.kind)}</span><span class="trunc">${esc(a.actor || "")} · ${esc(a.summary)}</span></div>`).join("") : `<div class="muted">none</div>`}</div>
    <div class="muted" style="font-size:11px;margin-top:6px">Select a worker in the dock to open its operating surface. This dashboard is the default center.</div>
  </div>`;
}

// -------- selected worker operating surface --------
function operatingSurface() {
  const sp = state.snap.sprints.find((x) => x.slot === state.sel);
  if (!sp) return `<div class="empty">Select a worker.</div>`;
  const w = state.snap.workers.find((x) => x.slot === sp.slot);
  const r = resFor(sp.slot);
  const tabs = ["work", "mission", "director", "closeout", "outputs", "resources", "repository", "history"];
  const tabContent = state.tab === "mission" ? tabMission(sp)
    : state.tab === "director" ? tabDirector(sp)
    : state.tab === "closeout" ? tabCloseout(sp)
    : state.tab === "outputs" ? tabOutputs(sp)
    : state.tab === "resources" ? tabResources(sp, w, r)
    : state.tab === "repository" ? tabRepository(sp)
    : state.tab === "history" ? tabHistory(sp)
    : tabOverview(sp, w, r);
  const w2 = w;
  return `<div class="surf-h">
      <button class="btn sm backdash" data-nav="command" title="Back to Team Dashboard">← Dashboard</button>
      <span class="gl big">${glyph(sp.glyph)}</span>
      <div class="surf-t"><div class="tt">${esc(sp.title)}</div>
        <div class="su">slot ${sp.slot} · ${esc(sp.provider)} · <span class="chip ${sp.status}">${esc(sp.status)}</span> · ${w2 ? `<span class="hpill ${w2.health}">${w2.health}</span>` : ""} · upd ${ago(sp.updated_at_ms)} ago${sp.server === "running" && sp.port ? ` · <a href="http://127.0.0.1:${sp.port}" target="_blank">Open App ↗</a>` : ""}</div></div>
      <div class="surf-actions">
        ${sp.server === "running" && sp.port
          ? `<a class="btn sm" href="http://127.0.0.1:${sp.port}" target="_blank" title="Open the worker's local app on :${sp.port}">Open App</a>`
          : `<button class="btn sm" data-startserver="${sp.slot}" title="App is stopped — start its dev server">Start server</button>`}
        <button class="btn sm" data-cmd="worker.doctor" data-slot="${sp.slot}">Diagnose</button>
        ${sp.status === "paused" ? `<button class="btn sm warn" data-cmd="worker.resume" data-slot="${sp.slot}">Resume</button>` : `<button class="btn sm warn" data-cmd="worker.pause" data-slot="${sp.slot}">Pause</button>`}
        <button class="btn sm warn" data-end="${sp.slot}">End work</button>
      </div></div>
    <div class="tabs">${tabs.map((t) => `<button class="tab ${state.tab === t ? "on" : ""}" data-tab="${t}">${t}</button>`).join("")}</div>
    <div class="tabc">${tabContent}</div>`;
}
function tabResources(sp, w, r) {
  const p = r?.server_process, o = state.res?.overall;
  const kv = (a, b) => `<dt>${a}</dt><dd>${b}</dd>`;
  return `<div class="cols2">
    <div class="sec"><h5>This worker</h5><dl class="kv">
      ${p ? kv("Server PID", `<span class="mono">${p.pid}</span>`) + kv("CPU", p.cpu_pct + "%") + kv("Memory", p.rss_mb + " MB (" + p.mem_pct + "%)") + kv("Elapsed", p.elapsed) + kv("State", p.state) : kv("Process", '<span class="muted">no active process confidently identified</span>')}
      ${r ? kv("Port", r.port ? `:${r.port}` : "—") + kv("Disk", r.disk_mb != null ? `${(r.disk_mb / 1024).toFixed(1)} GB` : "—") : ""}
      ${kv("Provider app", '<span class="muted">PID not tracked by toolkit</span>')}
      ${kv("Provider usage", '<span class="muted">available per Director round-trip (see Director tab)</span>')}</dl></div>
    <div class="sec"><h5>Machine</h5>${o ? `<dl class="kv">
      ${kv("CPU load", `${o.cpu_load_pct}% (${o.load_1m}/${o.cpu_count})`)}${kv("Memory", `${o.mem_used_pct}% used · ${(o.mem_free_mb / 1024).toFixed(1)}G free`)}
      ${kv("Servers", o.running_servers + " running")}${kv("Capacity", `${o.slots.occupied}/6 occupied · ${o.slots.recommended_available} recommended`)}${kv("Pressure", `<span class="pr ${o.slots.pressure}">${o.slots.pressure}</span>`)}</dl>
      ${o.warning ? `<div class="rwarn">${esc(o.warning)}</div>` : ""}` : '<span class="muted">reading…</span>'}</div></div>`;
}
const CLASS_LABEL_UI = { source: "source", test: "test", config: "configuration", "planning-doc": "planning document", documentation: "documentation", "qa-evidence": "QA evidence", screenshot: "screenshot", report: "report", verification: "verification", generated: "generated artifact", unknown: "unknown" };
const CLOSEOUT_K = { safe: "ok", "stop-runtime": "run", "preserve-evidence": "run", "review-planning": "auth", "commit-remaining": "auth", "requests-pending": "run", "requests-pending": "run" };
function tabCloseout(sp) {
  const co = (state._closeout || {})[sp.slot];
  if (!co) { fetchCloseout(sp.slot); return `<div class="muted" style="padding:14px">Assessing closeout readiness…</div>`; }
  if (co.error) return `<div class="sec"><h5>Closeout</h5><div class="muted">${esc(co.error)}</div></div>`;
  const k = CLOSEOUT_K[co.result] || (co.result === "safe" ? "ok" : "auth");
  const repo = co.repository || {}, rt = co.runtime || {}, ch = co.changes || {}, ev = co.evidence || {};
  const kv = (a, b) => `<div class="co-row"><span class="co-k">${a}</span><span class="co-v">${b}</span></div>`;
  const classChips = Object.entries(ch.by_class || {}).map(([c, n]) => `<span class="cap ${["source", "test", "config", "planning-doc"].includes(c) ? "on" : "off"}">${n} ${esc(CLASS_LABEL_UI[c] || c)}</span>`).join(" ");
  const fileList = (ch.files || []).map((f) => `<div class="co-file"><span class="cap ${["source", "test", "config", "planning-doc"].includes(f.class) ? "on" : "off"}">${esc(f.class_label || f.class)}</span> <span class="mono">${esc(f.path)}</span></div>`).join("");
  const running = rt.dev_server_running;
  const canDelete = co.can_delete_worktree;
  return `<div class="director">
    <div class="dhead"><div class="dtitle">Closeout readiness</div>
      <div class="co-result ${k}"><b>${esc(co.result_label)}</b> — next: ${esc(co.next_action)}</div>
      ${(co.reasons || []).length ? `<div class="muted dmode">${co.reasons.map((r) => `• ${esc(r)}`).join("<br>")}</div>` : `<div class="muted dmode">Nothing blocks closing this worker.</div>`}</div>
    <div class="cols2">
      <div class="sec"><h5>Repository</h5><dl class="kv">
        ${kv("PR", repo.pr_merged ? "merged into staging" : "not fully merged")}
        ${kv("Branch", `${repo.ahead} ahead · ${repo.behind} behind`)}
        ${kv("", `<span class="muted">${esc(repo.note || "")}</span>`)}</dl></div>
      <div class="sec"><h5>Runtime</h5><dl class="kv">
        ${kv("Dev server", running ? `<span class="attn">running${rt.port ? " :" + rt.port : ""}</span>` : "stopped")}
        ${kv("Provider", rt.provider_running ? "active" : "idle")}
        ${kv("Pending requests", String(co.unsaved_requests || 0))}</dl></div>
      <div class="sec"><h5>Changes · ${ch.total || 0} uncommitted</h5>
        <div class="pm-caps">${classChips || '<span class="muted">clean</span>'}</div>
        <div class="co-files">${fileList}</div>
        <div class="muted src">${ch.tracked || 0} tracked · ${ch.untracked || 0} untracked${ch.has_source ? " · includes source (never auto-discarded)" : " · no source at risk"}</div></div>
      <div class="sec"><h5>Evidence & outputs</h5><dl class="kv">
        ${kv("In worktree", `${ev.worktree_mb || 0} MB`)}
        ${kv("Durable store", `${ev.store_mb || 0} MB`)}
        ${kv("Preserved", ev.preserved ? "yes ✓" : `<span class="attn">no — ${ev.unique_unpreserved} unique item(s)</span>`)}</dl>
        ${(co.would_lose || []).length ? `<div class="muted src">Deleting now would lose: ${co.would_lose.map((w) => w.kind === "evidence" ? esc(w.note) : esc(w.path || w.kind)).slice(0, 4).join("; ")}</div>` : ""}</div>
    </div>
    <div class="sec"><h5>Actions</h5><div class="detail-actions">
      <button class="btn" data-nav-tab="repository">Review changes</button>
      <button class="btn" data-cmd="closeout.preserve_evidence" data-slot="${sp.slot}">Preserve outputs</button>
      <button class="btn warn" data-discardcmd="${sp.slot}">Discard generated…</button>
      ${running ? `<button class="btn warn" data-cmd="server.stop" data-slot="${sp.slot}">Stop runtime</button>` : ""}
      <button class="btn" data-end="${sp.slot}">End work</button>
      ${canDelete ? `<button class="btn warn" data-delcmd="${sp.slot}">Delete worktree…</button>` : `<button class="btn" disabled title="Blocked until closeout is safe">Delete worktree (blocked)</button>`}
    </div>
      <div class="muted" style="font-size:11px;margin-top:7px"><b>End work</b> frees the slot but preserves the worktree + branch on disk. <b>Delete worktree</b> permanently removes the checkout — enabled only when nothing unique would be lost. Source is never auto-discarded; dirty worktrees are never deleted.</div></div>
  </div>`;
}
function showDiscard(slot) {
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>Discard generated artifacts · slot ${slot}</h3><span class="risk consequential">destructive</span>
    <div class="b">Removes ONLY untracked generated/evidence artifacts. Source, tests, config, and planning documents are never touched, and it refuses unless outputs were preserved first.
      <div class="willrun">Type <b>discard ${slot}</b> to confirm</div>
      <input class="f-ct" placeholder="discard ${slot}" style="width:100%;margin-top:8px;padding:7px 9px;border:1px solid var(--line-strong);border-radius:8px"></div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn go ok">Discard</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  ov.querySelector(".ok").onclick = () => { const ct = ov.querySelector(".f-ct").value.trim(); ov.remove(); execute("closeout.discard_generated", { slot }, true, ct); };
  document.body.appendChild(ov);
}
function tabRepository(sp) {
  const pr = state._pr?.[sp.slot];
  let prHtml;
  if (!pr) prHtml = `<span class="muted">reading PR state…</span>`;
  else if (pr.available === false) prHtml = `<span class="muted">PR state unavailable: ${esc(pr.reason || "")}</span>`;
  else if (!pr.pr) prHtml = `<span class="chip idle">no PR</span> <span class="muted">— push, then open a draft PR</span>`;
  else prHtml = `<span class="chip ${pr.pr.state === "MERGED" ? "complete" : pr.pr.draft ? "planning" : "running"}">${pr.pr.draft ? "draft" : esc((pr.pr.state || "").toLowerCase())}</span>
      <a href="${esc(pr.pr.url)}" target="_blank" class="mono" style="margin-left:8px">#${pr.pr.number}</a>
      · ${esc(pr.pr.base)} ← ${esc(pr.pr.head)} · checks ${pr.pr.checks.passed}/${pr.pr.checks.total} · ${esc(String(pr.pr.mergeable || "?").toLowerCase())}${pr.pr.review_decision ? " · " + esc(pr.pr.review_decision.toLowerCase()) : ""}`;
  const kv = (a, b) => `<dt>${a}</dt><dd>${b}</dd>`;
  return `<div class="sec"><h5>Repository</h5><dl class="kv">
      ${kv("Worktree", `<span class="mono">${esc(sp.worktree)}</span>`)}${kv("Branch", `<span class="mono">${esc(sp.branch || "—")}</span>`)}
      ${kv("Position", sp.git ? `↑${sp.git.ahead} ↓${sp.git.behind} · <span class="${sp.git.state === "dirty" ? "dirty" : "clean"}">${sp.git.state}</span>` : `<span class="muted">git detail pending (host busy)</span>`)}
      ${kv("Base", esc(state.snap.repository?.base_ref || "—") + " @ " + esc(state.snap.repository?.base_sha || "—"))}
      ${kv("Pull request", prHtml)}</dl></div>
    <div class="sec"><h5>Governed actions (preview → confirm)</h5><div class="detail-actions">
      <button class="btn" data-cmd="repository.push" data-slot="${sp.slot}">Push branch</button>
      <button class="btn" data-prcmd="promotion.open_pr" data-slot="${sp.slot}">Open draft PR…</button>
      <button class="btn" data-cmd="merge.execute" data-slot="${sp.slot}">Merge PR</button>
      <button class="btn warn" data-delcmd="${sp.slot}">Delete worktree…</button></div>
      <div class="muted" style="font-size:11px;margin-top:6px">Each previews the exact command; release/merge is never auto-approved; deletion needs a typed phrase and is blocked when dirty.</div></div>`;
}
function tabHistory(sp) {
  const log = state.director[sp.slot] || [];
  const commits = (state.outputs[sp.worktree]?.items || []).filter((i) => i.type === "commit").slice(0, 8);
  return `<div class="sec"><h5>Director interactions</h5>${log.length ? log.slice(0, 8).map((m) => `<div class="commit"><span class="sh">${esc(m.delivery === "provider-round-trip" ? "ask" : "route")}</span><span class="trunc">${esc(m.message)}</span></div>`).join("") : '<span class="muted">none yet</span>'}</div>
    <div class="sec"><h5>Recent commits</h5>${commits.length ? commits.map((c) => `<div class="commit"><span class="sh">${esc(c.short || "")}</span><span class="trunc">${esc(c.title)}</span></div>`).join("") : '<span class="muted">none</span>'}</div>`;
}

function tabOverview(sp, w, r) {
  const kv = (a, b, mono) => `<dt>${a}</dt><dd class="${mono ? "mono" : ""}">${b}</dd>`;
  const stat = (l, v, sub) => `<div class="dstat"><div class="dl">${l}</div><div class="dv sm">${v}</div>${sub ? `<div class="ds">${sub}</div>` : ""}</div>`;
  const proc = r?.server_process;
  const dirty = sp.git?.state === "dirty";
  return `<div class="obj-lead">
      <div class="obj">${esc(sp.objective || sp.title)}</div>
      <div class="muted note">Full live instructions live in the worker's session and its worktree package. Vacilando composes and routes new instructions from the Director tab — it does not read the live editor buffer.</div></div>
    <div class="dstats sm work-stats">
      ${stat("Provider", esc(sp.provider))}
      ${stat("Stage", esc(sp.phase?.label || "—"))}
      ${stat("Health", w ? `<span class="hpill ${w.health}">${w.health}</span>` : "—")}
      ${stat("Position", sp.git ? `<span class="${dirty ? "dirty" : "clean"}">↑${sp.git.ahead} ↓${sp.git.behind}</span>` : `<span class="muted">pending</span>`, sp.git ? (dirty ? "uncommitted changes" : "clean") : "host busy")}
      ${stat("Server", sp.server === "running" && sp.port ? `<span class="clean">:${sp.port}</span>` : esc(sp.server))}
      ${stat("Initiative", sp.initiative_key ? esc(sp.initiative_key) : "managed sprint")}</div>
    <div class="cols2">
      <div class="sec"><h5>Worktree &amp; Git</h5><dl class="kv">
        ${kv("Worktree", esc(sp.worktree), 1)}${kv("Branch", esc(sp.branch || "—"), 1)}
        ${kv("Base", esc(state.snap.repository?.base_ref || "—") + " @ " + esc(state.snap.repository?.base_sha || "—"), 1)}</dl></div>
      <div class="sec"><h5>This worker</h5><dl class="kv">
        ${proc ? kv("Process", `pid ${proc.pid} · ${proc.cpu_pct}% cpu · ${proc.rss_mb}MB · ${proc.elapsed}`) : kv("Process", '<span class="muted">no active process</span>')}
        ${r?.disk_mb != null ? kv("Disk", `${(r.disk_mb / 1024).toFixed(1)} GB`) : ""}
        ${kv("Provider app", '<span class="muted">PID not tracked</span>')}</dl>
        <div class="muted src">Provider usage is recorded per Director round-trip — see the Director tab.</div></div>
    </div>
    ${sp.questions?.length ? `<div class="sec"><h5>Open Questions / Blockers</h5>${sp.questions.map((q) => `<div class="blocker">${esc(q.question)}</div>`).join("")}</div>` : ""}`;
}

function tabOutputs(sp) {
  const o = state.outputs[sp.worktree];
  if (!o) { fetchOutputs(sp.worktree); return `<div class="muted" style="padding:14px">Loading outputs…</div>`; }
  if (!o.items.length) return `<div class="empty">No outputs yet for this worker.</div>`;
  const commits = o.items.filter((i) => i.type === "commit").length;
  const shots = o.items.filter((i) => i.is_image).length;
  const changed = o.items.find((i) => i.type === "changed-files");
  return `<div class="worksum"><div class="ws-h">Current work summary <span class="muted">· grounded in real outputs</span></div>
      <div class="ws-grid"><span>Latest: <b>${esc((o.items.find((i) => i.type === "commit")?.title || "—")).slice(0, 60)}</b></span>
      <span>${commits} commits</span><span>${changed ? changed.title : "clean tree"}</span><span>${shots} screenshot${shots === 1 ? "" : "s"}</span>
      <span>${sp.question_count ? `<span class="dirty">${sp.question_count} open question(s)</span>` : "no blockers"}</span></div></div>
    <div class="outputs">${o.items.map((it) => outputCard(it, sp.worktree)).join("")}</div>`;
}
function outputCard(it, worktree) {
  const when = it.created_ms ? ago(it.created_ms) + " ago" : "";
  if (it.is_image) {
    const src = `/api/evidence?worktree=${encodeURIComponent(worktree)}&file=${encodeURIComponent(it.evidence_file)}`;
    return `<div class="ocard img"><div class="oh"><span class="otype screenshot">screenshot</span><span class="ot trunc">${esc(it.title)}</span><span class="ow">${when}</span></div>
      <a href="${src}" target="_blank"><img src="${src}" loading="lazy" alt="${esc(it.title)}"></a></div>`;
  }
  return `<div class="ocard"><div class="oh"><span class="otype ${it.type}">${esc(it.type)}</span><span class="ot trunc">${esc(it.title)}</span><span class="ow">${when}${it.short ? ` · <span class="mono">${esc(it.short)}</span>` : ""}</span></div>
    ${it.preview ? `<pre class="opre">${esc(it.preview)}</pre>` : ""}
    <div class="oactions"><span class="muted" style="font-size:10.5px">source: ${esc(it.source)}</span>
      ${it.evidence_file ? `<a class="btn sm" href="/api/evidence?worktree=${encodeURIComponent(worktree)}&file=${encodeURIComponent(it.evidence_file)}" target="_blank">Open</a>` : ""}</div></div>`;
}

const capProvider = (p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : "—");
// Provider auth state is real metadata — derived, never hidden. Source order:
// (1) aggregated usage across workers (/api/dashboard → usage.mjs), then
// (2) the most recent real round-trip observed for THIS worker, then
// (3) an honest "not yet checked" when we have no observation.
function providerStatus(provider, slot) {
  // Authoritative: the Provider Runtime owns auth (real probe), not the worker.
  const rt = providerRt(provider);
  if (rt) return { label: rt.auth.label, k: rt.auth.state === "authenticated" ? "healthy" : rt.auth.state === "needs_auth" ? "attention" : rt.auth.state === "unavailable" ? "attention" : "idle" };
  const lastAsk = (state.director[slot] || []).find((m) => m.delivery === "provider-round-trip");
  if (lastAsk && lastAsk.response_ok) return { label: "Authenticated", k: "healthy" };
  if (lastAsk && /auth|oauth|expired|login|credential/i.test(lastAsk.response_error || "")) return { label: "Authentication required", k: "attention" };
  return { label: "Checking…", k: "idle" };
}
// Precise per-record delivery status (Slice 4).
function directorStatus(m) {
  if (m.delivery === "provider-round-trip") {
    if (m.response_ok) return { label: "Worker responded", k: "ok" };
    if (/auth|oauth|login|expired|credential/i.test(m.response_error || "")) return { label: "Authentication required", k: "auth" };
    return { label: "Failed", k: "err" };
  }
  if (m.delivery === "clipboard+manual-paste") return { label: m.clipboard_ok ? "Copied for manual paste" : "Copy failed", k: "copied" };
  return { label: m.delivery || "recorded", k: "muted" };
}
function reqCard(r) {
  const st = REQ_STATUS[r.status] || { label: r.status, k: "muted" };
  const pending = !REQ_TERMINAL.has(r.status);
  const when = r.created_at ? new Date(r.created_at).toLocaleString() : "";
  const elapsed = pending && r.started_at ? ` · ${Math.max(0, Math.round((Date.now() - Date.parse(r.started_at)) / 1000))}s`
    : (REQ_TERMINAL.has(r.status) && r.duration_ms ? ` · ${(r.duration_ms / 1000).toFixed(1)}s` : "");
  const u = r.usage || {};
  const meta = `${esc(r.request_type === "quick-ask" ? "Quick Ask" : "Worker Instruction")}${r.provider ? " · " + esc(r.provider) : ""} · ${esc(r.request_id)}`;
  let body = "";
  if (r.status === "worker-responded") {
    body = `<div class="dc-resp ok"><span class="dc-role worker">Worker response</span><div class="dc-rtext">${esc(r.response || "(empty)")}</div></div>
      <div class="dc-meta">${esc(r.provider || "provider")} · ${u.input_tokens ?? "?"}→${u.output_tokens ?? "?"} tok · ${r.duration_ms ? (r.duration_ms / 1000).toFixed(1) + "s" : "—"} · ${u.cost_usd != null ? "$" + u.cost_usd : "cost unavailable"}</div>`;
  } else if (r.status === "failed" || r.status === "timed-out" || r.status === "authentication-required") {
    body = `<div class="dc-resp err"><span class="dc-role worker">${esc(st.label)}</span><div class="dc-rtext">${esc(r.error_message || "")}</div></div>
      <div class="dc-actions">${r.status === "authentication-required" && r.provider ? `<button class="btn sm warn" data-prov-reconnect="${esc(r.provider)}">Reconnect</button>` : ""}<button class="btn sm" data-retry="${esc(r.request_id)}">Retry</button></div>`;
  } else if (pending) {
    body = `<div class="dc-note">${st.label}… the worker is running independently — safe to refresh or navigate away.</div>`;
  }
  return `<div class="dconv" data-req="${esc(r.request_id)}">
    <div class="dc-head"><span class="dc-role op">Operator → Director</span><span class="dc-badge ${st.k}${pending ? " live" : ""}">${esc(st.label)}${elapsed}</span><span class="dc-time">${when}</span></div>
    <div class="dc-msg">${esc(r.instruction)}</div>${body}
    <div class="dc-meta muted">${meta}</div></div>`;
}
function tabMission(sp) {
  const slot = sp.slot;
  if (state.missions[slot] === undefined) fetchMissions(slot);
  const missions = state.missions[slot] || [];
  const selId = state.missionSel[slot] || missions[0]?.mission_id || null;
  if (selId && state.mission[selId] === undefined) fetchMissionDetail(selId);
  const d = selId ? state.mission[selId] : null;
  const m = d?.mission, pkg = d?.package;
  const intent = state.missionIntent[slot] || "";

  const compileBox = `<div class="sec">
    <h5>Mission intent</h5>
    <div class="muted note">Kelly enters one line. Director retrieves the capability, retrieves scoped knowledge, and the Mission Compiler assembles a Mission Package — no manual authoring.</div>
    <input id="m-intent" data-slot="${slot}" class="m-intent" placeholder="e.g. Build Access & Roles V2" value="${esc(intent)}" />
    <div class="dbtns"><button class="btn go" data-compile="${slot}">Compile Mission</button></div>
    ${missions.length ? `<div class="m-list">${missions.slice(0, 8).map((x) => `<button class="chip ${x.mission_id === selId ? "on" : ""}" data-msel="${x.mission_id}">${esc(x.title)} · ${(MISSION_STATUS[x.status] || {}).label || x.status}</button>`).join("")}</div>` : ""}
  </div>`;

  // LOADING is explicit and never shows another record's data.
  if (selId && (state.missionLoading?.[selId] || !d)) {
    return `<div class="mission">${compileBox}<div class="m-loading"><span class="spin"></span> Loading mission <span class="mono">${esc(selId)}</span>…</div></div>`;
  }
  if (!m || !pkg) return `<div class="mission">${compileBox}<div class="empty">No compiled mission yet — enter an intent and Compile.</div></div>`;

  const rk = READY_K[pkg.readiness_status] || "muted";
  const findings = (pkg.readiness_findings || []).filter((f) => f.severity === "block");
  const st = MISSION_STATUS[m.status] || { label: m.status, k: "muted" };
  const ready = pkg.readiness_status === "ready";
  const live = MISSION_LIVE.has(m.status);
  const elapsed = m.started_at && live ? ` · ${Math.round((Date.now() - new Date(m.started_at)) / 1000)}s` : "";
  // Controls reflect reality: a completed/running mission is not startable, an
  // interrupted mission with a captured session is resumable.
  const canStart = ready && m.status === "ready";
  const canResume = m.status === "interrupted" && !!m.provider_session_id;
  const canSteer = !live && ["waiting_for_operator", "waiting_for_acceptance", "blocked", "interrupted"].includes(m.status);
  const canAccept = m.status === "waiting_for_acceptance";
  const nOut = (d.outputs || []).length, nEv = (d.acceptance || []).length;

  // Director Review — the operator reviews the prepared package + why it is (not) ready.
  const V = pkg.readiness_verdict || null;
  const vk = V ? (VERDICT_K[V.verdict] || "muted") : "muted";
  const conf = pkg.gap_report ? `${Math.round((pkg.gap_report.confidence || 0) * 100)}%` : "—";
  const diff = pkg.diff_from_previous;
  const reviewPanel = V ? `<div class="sec">
    <div class="m-head"><h5>Director Review</h5><span class="mbadge ${vk}">${esc(V.verdict)}</span></div>
    ${V.verdict !== "Ready" && V.reasons?.length ? `<div class="m-blockers">${V.reasons.map((r) => "• " + esc(r)).join("<br>")}<br><span class="muted">Send back to: <b>${esc(V.send_back_to || "—")}</b></span></div>` : ""}
    ${V.verdict === "Ready" ? `<div class="m-ok">Ready for the worker — the operator approves this package; it was not authored by hand.</div>` : ""}
    <dl class="kv">
      <dt>Confidence</dt><dd>${conf} <span class="muted">(gap coverage)</span></dd>
      <dt>Questions</dt><dd>${(pkg.questions || []).map((q) => esc(q.question) + (q.blocking ? " <b>(blocking)</b>" : "")).join("<br>") || "—"}</dd>
      <dt>Risks</dt><dd>${(pkg.risks || []).map((r) => esc(r.risk)).join("<br>") || "—"}</dd>
      <dt>Advisory</dt><dd>${(V.advisory || []).slice(0, 6).map(esc).join("<br>") || "—"}</dd>
      <dt>Suggested criteria</dt><dd>${(pkg.suggested_acceptance_criteria || []).length}</dd>
      <dt>Version</dt><dd>v${pkg.version}${diff ? ` · Δ ${(diff.added || []).length} added, ${(diff.resolved || []).length} resolved${diff.verdict_change ? ` · ${esc(diff.verdict_change)}` : ""}` : ""}</dd>
      <dt>Gap report</dt><dd class="mono">${esc(pkg.gap_report?.gap_report_id || "—")}</dd>
    </dl>
  </div>` : "";

  const pkgPanel = `<div class="sec">
    <div class="m-head"><h5>Mission Package</h5><span class="mbadge ${rk}">${pkg.readiness_status}</span></div>
    ${findings.length ? `<div class="m-blockers">${findings.map((f) => "⛔ " + esc(f.message)).join("<br>")}</div>` : ""}
    <dl class="kv">
      <dt>Objective</dt><dd>${esc(pkg.objective)}</dd>
      <dt>In scope</dt><dd>${(pkg.scope_included || []).map(esc).join("<br>") || "—"}</dd>
      <dt>Excluded</dt><dd>${(pkg.scope_excluded || []).map(esc).join("<br>") || "—"}</dd>
      <dt>Criteria</dt><dd>${(pkg.acceptance_criteria || []).length}</dd>
      <dt>Unresolved Qs</dt><dd>${(pkg.unresolved_questions || []).length}</dd>
      <dt>Operator gates</dt><dd>${(pkg.operator_decision_gates || []).length}</dd>
      <dt>QA plan</dt><dd>${(pkg.QA_plan || []).length} steps</dd>
      <dt>Expected outputs</dt><dd>${(pkg.expected_deliverables || []).map((x) => esc(x.description)).join("<br>") || "—"}</dd>
      <dt>Capability</dt><dd>${esc(pkg.capability_id || "—")} · knowledge <span class="mono">${esc(pkg.knowledge_snapshot?.snapshot_id || "—")}</span></dd>
    </dl>
    <div class="dbtns">
      <button class="btn" data-mreview="${m.mission_id}">Review Package</button>
      <button class="btn go" data-mstart="${m.mission_id}" ${canStart ? "" : "disabled"} title="${canStart ? "Start execution" : ready ? `Not startable while ${st.label}` : "Package is not ready"}">Start Mission</button>
      ${canResume ? `<button class="btn go" data-mresume="${m.mission_id}" title="Resume the captured provider session">Resume Mission</button>` : ""}
      <button class="btn warn" data-mstop="${m.mission_id}" ${live ? "" : "disabled"}>Stop Mission</button>
      <button class="btn" data-msteer="${m.mission_id}" ${canSteer ? "" : "disabled"} title="${canSteer ? "" : live ? "Mission is mid-turn" : "Not awaiting input"}">Send Steering Instruction</button>
      <button class="btn" data-mout="${m.mission_id}" ${nOut ? "" : "disabled"} title="${nOut ? nOut + " output(s)" : "No outputs yet"}">View Outputs${nOut ? ` (${nOut})` : ""}</button>
      <button class="btn" data-mevidence="${m.mission_id}" ${nEv ? "" : "disabled"} title="${nEv ? "" : "Run Evaluate Acceptance first"}">View Evidence</button>
    </div>
  </div>`;

  const gate = d.acceptance && d.acceptance[0];
  const statusPanel = `<div class="sec">
    <div class="m-head"><h5>Execution</h5><span class="dc-badge ${st.k}${live ? " live" : ""}">${st.label}${elapsed}</span></div>
    <dl class="kv">
      <dt>Mission ID</dt><dd class="mono">${esc(m.mission_id)}</dd>
      <dt>Worktree</dt><dd>${esc(m.worktree || "—")}${m.executed_in ? ` · ran in <span class="mono">${esc(m.executed_in)}</span>` : ""}</dd>
      <dt>Provider</dt><dd>${esc(m.provider || "—")}${m.provider_session_id ? ` · session <span class="mono">${esc(String(m.provider_session_id).slice(0, 12))}…</span>` : ""}</dd>
      <dt>Phase</dt><dd>${esc(m.current_phase || "—")}</dd>
      <dt>Last activity</dt><dd>${m.last_activity_at ? ago(new Date(m.last_activity_at).getTime()) + " ago" : "—"}</dd>
      <dt>Turns</dt><dd>${m.turn_count || 0}</dd>
      ${m.latest_summary ? `<dt>Latest</dt><dd>${esc(m.latest_summary)}</dd>` : ""}
      ${m.pending_question ? `<dt>Needs you</dt><dd class="m-q">${esc(m.pending_question)}</dd>` : ""}
      ${m.error_message ? `<dt>Note</dt><dd class="m-err">${esc(m.error_message)}</dd>` : ""}
    </dl>
    ${canAccept || gate ? `<div class="m-accept">
      <button class="btn" data-mevaluate="${m.mission_id}">Evaluate Acceptance</button>
      <button class="btn go" data-maccept="${m.mission_id}" ${canAccept ? "" : "disabled"} title="${canAccept ? "Operator final QA" : "Mission is not awaiting acceptance"}">Accept (final QA)</button>
      ${gate ? `<div class="m-gate ${gate.gate === "pass" ? "ok" : gate.gate === "fail" ? "err" : "auth"}">Gate: <b>${gate.gate}</b> — ${gate.criteria.map((c) => `${c.criterion_id}:${c.status}`).join(" · ")}</div>` : ""}
    </div>` : ""}
  </div>`;

  return `<div class="mission">${compileBox}${reviewPanel}${pkgPanel}${progressPanel(m, pkg)}${statusPanel}</div>`;
}

// Completion tracking — the mission's tasks (deliverables + acceptance criteria)
// with LIVE status pulled from the durable per-turn report, plus current blocks.
// This is how the operator watches a worker's work close out, criterion by
// criterion, without reading raw output.
const TK_MARK = { produced: "✓", met: "✓", partial: "◐", unmet: "✗", not_evidenced: "○", pending: "○" };
const TK_K = { produced: "ok", met: "ok", partial: "warn", unmet: "err", not_evidenced: "muted", pending: "muted" };
function progressPanel(m, pkg) {
  const exp = pkg.expected_deliverables || [];
  const crit = pkg.acceptance_criteria || [];
  if (!exp.length && !crit.length && m.status === "ready") return "";
  const rep = m.completion_report || {};
  const repDel = rep.deliverables || [];
  const gateCrit = m.acceptance_gate?.criteria || rep.criterion_evidence || [];
  const row = (mark, k, text, tail) => `<li class="tk ${k}"><span class="tkm">${mark}</span><span class="tkt">${esc(text)}</span>${tail || ""}</li>`;
  const delRows = exp.map((d) => {
    const r = repDel.find((x) => x.id === d.id);
    const st = r ? (r.produced ? "produced" : "pending") : "pending";
    const path = r?.path || d.path;
    return row(TK_MARK[st], TK_K[st], d.description || d.id, path ? `<span class="tkp mono">${esc(path)}</span>` : "");
  }).join("");
  const critRows = crit.map((c) => {
    const r = gateCrit.find((x) => (x.criterion_id || x.id) === c.id);
    const st = r?.status || "not_evidenced";
    return row(TK_MARK[st] || "○", TK_K[st] || "muted", c.statement || c.id, `<span class="tks ${TK_K[st] || "muted"}">${esc(st.replace(/_/g, " "))}</span>`);
  }).join("");
  const blocks = [];
  if (m.status === "blocked" && m.error_message) blocks.push(m.error_message);
  (rep.unresolved_items || []).forEach((u) => blocks.push(typeof u === "string" ? u : u.item || u.description || JSON.stringify(u)));
  const t = rep.tests;
  const doneDel = exp.filter((d) => repDel.find((x) => x.id === d.id)?.produced).length;
  const doneCrit = crit.filter((c) => gateCrit.find((x) => (x.criterion_id || x.id) === c.id)?.status === "met").length;
  return `<div class="sec">
    <div class="m-head"><h5>Progress</h5><span class="mbadge muted">${doneDel}/${exp.length} deliverables · ${doneCrit}/${crit.length} criteria met</span></div>
    ${exp.length ? `<div class="tkg-h">Deliverables</div><ul class="tkg">${delRows}</ul>` : ""}
    ${crit.length ? `<div class="tkg-h">Acceptance criteria</div><ul class="tkg">${critRows}</ul>` : ""}
    ${t && (t.ran || t.results) ? `<div class="tkg-h">Tests</div><div class="tkn">${t.ran ? "ran" : "not run"}${t.results ? ` — ${esc(String(t.results).slice(0, 200))}` : ""}</div>` : ""}
    ${blocks.length ? `<div class="tkg-h err">Blocks</div><ul class="tkg">${blocks.map((b) => row("⛔", "err", b)).join("")}</ul>` : ""}
  </div>`;
}

// Read-only mission overlay (package review / outputs / evidence).
function showMissionDoc(title, text) {
  const ov = document.createElement("div"); ov.className = "ov";
  ov.innerHTML = `<div class="dlg wide"><h3>${esc(title)}</h3><pre class="m-doc">${esc(text || "(empty)")}</pre><div class="dbtns"><button class="btn" data-close>Close</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector("[data-close]").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
}
function showSteer(id) {
  const ov = document.createElement("div"); ov.className = "ov";
  ov.innerHTML = `<div class="dlg"><h3>Steering instruction</h3><div class="muted">Resumes the same provider session as a continuation turn.</div><textarea id="m-steer" placeholder="e.g. Also cover the audit-trail roadmap item in the proposal."></textarea><div class="dbtns"><button class="btn" data-close>Cancel</button><button class="btn go" data-send>Send</button></div></div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); render(true); };
  ov.querySelector("[data-close]").onclick = close;
  // The composer IS the confirmation for steering: the operator typed the exact
  // instruction and pressed Send, so we pass confirm through rather than
  // stacking a second dialog on the same decision.
  ov.querySelector("[data-send]").onclick = () => { const v = ov.querySelector("#m-steer").value.trim(); if (!v) { toast("err", "Empty instruction"); return; } ov.remove(); missionAct("steer", id, { instruction: v, confirm: true }, "Steering sent"); };
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
}
async function showMissionOutputs(id) {
  const d = state.mission[id] || (await fetch(`/api/mission?id=${encodeURIComponent(id)}`).then((r) => r.json()));
  const outs = d.outputs || [];
  if (!outs.length) { toast("idle", "No outputs yet", ""); return; }
  const last = outs[outs.length - 1];
  const t = await fetch(`/api/mission/output?id=${encodeURIComponent(id)}&turn=${last.turn}`).then((r) => r.json());
  showMissionDoc(`Mission output — turn ${last.turn}`, t.text);
}
function showMissionEvidence(id) {
  const d = state.mission[id]; const a = d?.acceptance?.[0];
  if (!a) { toast("idle", "No acceptance evaluation yet", "Run Evaluate Acceptance first."); return; }
  const lines = a.criteria.map((c) => `${c.criterion_id} [${c.status}] ${c.statement}\n` + c.evidence.map((e) => `    · ${e.kind}: ${e.status} — ${e.detail}`).join("\n")).join("\n\n");
  showMissionDoc(`Acceptance evidence — gate: ${a.gate}`, lines);
}
function showPackageReview(id) {
  const pkg = state.mission[id]?.package; if (!pkg) return;
  showMissionDoc(`Mission Package — ${pkg.title}`, JSON.stringify(pkg, null, 2));
}

function tabDirector(sp) {
  if (state.requests[sp.slot] === undefined) fetchRequests(sp.slot);
  const log = state.director[sp.slot];
  if (log === undefined) fetchDirector(sp.slot);
  if (!state._providers) fetchProviders();
  const reqs = state.requests[sp.slot] || [];
  const clips = (log || []).filter((m) => m.delivery === "clipboard+manual-paste").map((m) => `<div class="dconv"><div class="dc-head"><span class="dc-role op">Operator → Director</span><span class="dc-badge copied">Copied for manual paste</span><span class="dc-time">${m.occurred_at ? new Date(m.occurred_at).toLocaleString() : ""}</span></div><div class="dc-msg">${esc(m.message)}</div><div class="dc-note">Clipboard / manual paste — Vacilando cannot inject into a running session.</div></div>`);
  const ps = providerStatus(sp.provider, sp.slot);
  const draft = draftFor(sp.slot);
  const convHtml = (reqs.map(reqCard).concat(clips)).join("") || `<div class="empty">No interactions yet.</div>`;
  return `<div class="director">
    <div class="dhead">
      <div class="dtitle">Director</div>
      <div class="dctx">
        <span>Selected worker: <b>Slot ${sp.slot}</b></span>
        <span>Assigned provider: <b>${esc(capProvider(sp.provider))}</b></span>
        <span>Provider status: <span class="hpill ${ps.k}">${esc(ps.label)}</span></span>
      </div>
      <div class="muted dmode">Sends are <b>durable</b> and run <b>asynchronously</b> — you'll see them immediately as Queued and can refresh or navigate away safely. <b>Send to Worker</b> = async worker instruction (may run for minutes). <b>Quick Ask</b> = short bounded advisory. <b>Copy Instruction</b> = clipboard / manual paste.</div>
    </div>
    <div class="dlog">${convHtml}</div>
    <div class="dcompose">
      <textarea id="d-msg" data-slot="${sp.slot}" maxlength="${DIRECTOR_MAX}" placeholder="Instruction for the worker — e.g. Summarize your latest change and list any blockers. Do not modify files.">${esc(draft)}</textarea>
      <div class="dc-count"><span id="d-count">${fmtCount(draft.length)}</span><span class="muted"> / ${DIRECTOR_MAX.toLocaleString()} max</span></div>
      <div class="drow"><span class="muted dhelp">Confirm → Queued immediately → runs async → status updates here</span>
        <div class="dbtns"><button class="btn" data-director="${sp.slot}">Copy Instruction</button><button class="btn" data-quick-ask="${sp.slot}">Quick Ask</button><button class="btn go" data-send-worker="${sp.slot}">Send to Worker</button></div></div>
    </div>
  </div>`;
}

// -------- Needs You rail --------
function needsYou() {
  const out = [];
  for (const sp of state.snap.sprints) {
    if (sp.question_count > 0) out.push({ k: "q", t: `Question · slot ${sp.slot}`, s: sp.title, sel: sp.slot });
  }
  for (const rv of (state.snap.approvals?.reviews || [])) out.push({ k: "review", t: "Review required", s: rv.title || rv.initiative_key, review: rv.initiative_key });
  const o = state.res?.overall;
  if (o?.warning) out.push({ k: "warn", t: "Resource warning", s: o.warning });
  for (const w of (state.snap.workers || [])) if (w.health === "attention") out.push({ k: "warn", t: `Worker attention · slot ${w.slot}`, s: `${w.id} needs a look`, sel: w.slot });
  return out;
}

// -------- Work History + Settings --------
function viewHistory() {
  if (!state._audit) { fetchAudit(); return `<div class="muted" style="padding:14px">Loading history…</div>`; }
  const ev = state._audit;
  return `<div class="section-title">Execution history <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· every command Vacilando has run (audit)</span></div>
    <section class="card"><table class="tbl"><thead><tr><th>Time</th><th>Command</th><th>Target</th><th>Outcome</th></tr></thead>
    <tbody>${ev.length ? ev.map((e) => `<tr><td class="muted">${e.occurred_at ? new Date(e.occurred_at).toLocaleString() : ""}</td>
      <td class="mono">${esc(e.command)}</td><td class="trunc" style="max-width:320px">${esc(e.target?.label || "—")}</td>
      <td><span class="o ${e.outcome}">${esc(e.outcome)}</span></td></tr>`).join("") : `<tr><td colspan="4"><div class="empty">No commands run yet.</div></td></tr>`}</tbody></table></section>`;
}
const CAP_KEYS = ["start", "resume", "ask", "stream", "cost", "usage"];
function providerCard(p) {
  const authClass = p.auth.state === "authenticated" ? "healthy" : p.auth.state === "needs_auth" ? "attention" : "finished";
  const caps = CAP_KEYS.map((k) => `<span class="cap ${p.capabilities[k] ? "on" : "off"}">${k}${p.capabilities[k] ? " ✓" : " —"}</span>`).join("");
  const kv = (a, b) => `<div class="pm-row"><span class="pm-k">${a}</span><span class="pm-v">${b}</span></div>`;
  const authed = p.auth.state === "authenticated";
  return `<section class="card pm-card">
    <div class="pm-h"><div class="pm-title">${esc(p.label)} <span class="pm-ver mono">${p.version ? "v" + esc(p.version) : "—"}</span></div>
      <span class="hpill ${authClass}">${esc(p.auth.label)}</span>${authed ? `<span class="hpill healthy">${esc(p.health.label)}</span>` : ""}</div>
    <div class="pm-grid">
      ${kv("Authentication", `${esc(p.auth.label)}${p.auth.identity ? ` · <span class="mono">${esc(p.auth.identity)}</span>` : ""}`)}
      ${kv("Detail", `<span class="muted">${esc(p.auth.detail || "—")}</span>`)}
      ${kv("Auth location", `<span class="mono">${esc(p.auth.location)}</span>`)}
      ${kv("Expires", p.auth.expires_at ? new Date(p.auth.expires_at).toLocaleString() : (authed ? "auto-refreshed" : "—"))}
      ${kv("Last successful request", p.usage.last_success ? ago(Date.parse(p.usage.last_success)) + " ago" : "—")}
      ${kv("Active workers", String(p.active_workers))}
      ${kv("Executable", `<span class="mono">${esc(p.executable || "—")}</span>`)}
      ${kv("Transport", esc(p.transport))}
    </div>
    <div class="pm-caps"><span class="pm-k">Capabilities</span> ${caps}</div>
    <div class="pm-btns">
      <button class="btn sm" data-prov-verify="${p.id}">Verify</button>
      <button class="btn sm ${authed ? "" : "warn"}" data-prov-reconnect="${p.id}">Reconnect</button>
      <button class="btn sm" data-prov-diag="${p.id}">Diagnostics</button>
      <button class="btn sm" data-prov-disconnect="${p.id}">Disconnect</button>
    </div></section>`;
}
function viewSettings() {
  if (!state._providers) fetchProviders();
  if (!state._cmds) fetchCommands();
  const rt = state._providers;
  const facts = rt?.runtime;
  const provHtml = rt ? rt.providers.map(providerCard).join("") : `<div class="muted" style="padding:14px">Loading providers…</div>`;
  const cmds = state._cmds || [];
  const sup = cmds.filter((c) => c.supported);
  return `<div class="section-title">Provider Runtime <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· authentication is infrastructure owned by Vacilando — workers reference providers, never authenticate them</span></div>
    ${facts ? `<div class="pm-runtime"><span class="pm-k">Runtime</span>
      <span class="mono">node ${esc(facts.node)}</span> · <span class="mono">HOME ${esc(facts.home)}</span> · <span class="mono">pid ${facts.server_pid}</span> · ${facts.inside_claude_host ? '<span class="attn">inside a Claude Code host session</span>' : "standalone shell"}</div>` : ""}
    <div class="pm-cards">${provHtml}</div>
    <div class="section-title" style="margin-top:16px">Governed capabilities</div>
    <div class="sec">${sup.map((c) => `<span class="capline"><span class="mono">${esc(c.key)}</span></span>`).join(" · ") || '<span class="muted">loading…</span>'}
      <div class="muted" style="margin-top:8px;font-size:11px">Loopback-only control plane · read-only projections + governed commands. No remote, mobile, notifications, autonomous answers, promotion, or merge.</div></div>`;
}

// -------- selection + data --------
function select(slot) { go("command/worker/" + slot); } // URL drives selection (preserved on reload/back)
state._pr = {};
async function fetchOutputs(wt) { if (!wt) return; try { const r = await fetch(`/api/outputs?worktree=${encodeURIComponent(wt)}`); state.outputs[wt] = await r.json(); render(true); } catch {} }
async function fetchDirector(slot) { try { const r = await fetch(`/api/director?slot=${slot}`); state.director[slot] = (await r.json()).log || []; render(true); } catch {} }
async function fetchPr(sp) { if (!sp?.worktree) return; try { const r = await fetch(`/api/pr?worktree=${encodeURIComponent(sp.worktree)}&branch=${encodeURIComponent(sp.branch || "")}`); state._pr[sp.slot] = await r.json(); render(true); } catch {} }
async function fetchAudit() { try { const r = await fetch("/api/audit"); state._audit = (await r.json()).events; render(true); } catch {} }
async function fetchCommands() { try { const r = await fetch("/api/commands"); state._cmds = (await r.json()).commands; render(true); } catch {} }
async function fetchPolicies() { try { const r = await fetch("/api/policies"); state._pol = await r.json(); render(true); } catch {} }
async function fetchResources() { try { const r = await fetch("/api/resources"); state.res = await r.json(); render(); } catch {} }
async function fetchDashboard() { try { const r = await fetch("/api/dashboard"); state._dash = await r.json(); render(true); } catch {} }
async function diskReclaim() {
  toast("idle", "Reclaiming disk…", "merged + clean worktrees only — safe");
  try {
    const { data } = await api("/api/disk/reclaim", {});
    const r = (data && data.result) || {};
    toast(data && data.ok ? "ok" : "err", data && data.ok ? "Disk reclaimed" : "Reclaim failed",
      data && data.ok ? `freed ${r.reclaim_mb != null ? (r.reclaim_mb / 1024).toFixed(1) + "G" : "—"} · ${r.reclaimed ?? 0} worktree(s)` : (r.error || ""));
  } catch { toast("err", "Reclaim failed", ""); }
  fetchDashboard();
}
async function diskSetAuto(on) {
  try { await api("/api/disk/policy", { auto_gc: on }); toast("ok", `Auto-reclaim ${on ? "on" : "off"}`, on ? "reclaims when free disk drops below the low-water mark" : ""); }
  catch { toast("err", "Couldn't change policy", ""); }
  fetchDashboard();
}
// Conductor controls: hand the objective to Director (autonomous) or take it back,
// and prepare the next phase (gated).
async function copyBubble(btn) {
  const bub = btn.closest(".cvbub"); if (!bub) return;
  const clone = bub.cloneNode(true); clone.querySelectorAll(".cvcopy").forEach((b) => b.remove());
  const text = (clone.innerText || clone.textContent || "").trim();
  try { await navigator.clipboard.writeText(text); toast("ok", "Copied to clipboard", ""); }
  catch { try { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("ok", "Copied", ""); } catch { toast("err", "Couldn't copy", ""); } }
}
async function objSetMode(cap, mode) {
  try { await api("/api/director/objective/mode", { capability_id: cap, mode }); toast("ok", mode === "autonomous" ? "Handed off to Director" : "Taken back", mode === "autonomous" ? "Director conducts the remaining phases; you're pulled in only for a decision or blocker." : "You approve each phase."); }
  catch { toast("err", "Couldn't change mode", ""); }
  fetchConversations();
  for (const id in (state._objective || {})) { if (state._objective[id] && state._objective[id].capability_id === cap) fetchConversation(id); }
}
async function objPrepareNext(cap) {
  toast("idle", "Preparing next phase…", "");
  try {
    const { data } = await api("/api/director/objective/prepare-next", { capability_id: cap });
    if (data && data.ok) { toast("ok", "Next phase prepared — review & start", (data.phase && data.phase.title) || ""); fetchConversations(); if (data.mission && data.mission.mission_id) state._openConvo = data.mission.mission_id; }
    else toast("err", "Couldn't prepare next", (data && data.error) || "");
  } catch { toast("err", "Couldn't prepare next", ""); }
}
async function fetchProviders() { try { const r = await fetch("/api/providers"); state._providers = await r.json(); render(true); } catch {} }
// A worker's provider status is READ from the Provider Runtime (shared), never owned by the worker.
function providerRt(id) { return (state._providers?.providers || state._dash?.provider_runtime?.providers || []).find((p) => p.id === id) || null; }

function viewPolicies() {
  if (!state._pol) { fetchPolicies(); return `<div class="muted" style="padding:14px">Loading policies…</div>`; }
  return `<div class="section-title">How the toolkit is configured today <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· read-only · authoritative sources</span></div>
    <div class="polcols">${state._pol.groups.map((g) => `<section class="card polgroup"><div class="pg-h">${esc(g.title)}</div>
      ${g.rows.map((r) => `<div class="prow"><div class="pn">${esc(r.name)}</div><div class="pvv">${esc(r.value)}</div>
        <div class="pmeta"><span>src: ${esc(r.source)}</span><span>enforce: ${esc(r.enforcement)}</span><span>${r.configurable === "no" ? "fixed" : "configurable: " + esc(r.configurable)}</span>${r.related && r.related !== "—" ? `<span class="mono">${esc(r.related)}</span>` : ""}</div></div>`).join("")}
    </section>`).join("")}</div>`;
}

// -------- command runtime --------
async function api(p, b) { const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, data: await r.json() }; }
async function startCommand(command, input) {
  const { data: pv } = await api("/api/commands/preview", { command, input });
  if (!pv.ok) { toast("err", `Can't ${command.replace(/\./g, " ")}`, pv.reason || (pv.errors || []).join("; ") || pv.code); return; }
  if (!pv.requires_confirmation) return execute(command, input, false);
  const long = command === "director.ask";
  showConfirm(pv, () => { if (long) toast("ok", `${input.provider || "provider"} is thinking…`, "round-trip in progress"); execute(command, input, true); });
}
async function startCommandTyped(command, input, confirmText) {
  const { data: pv } = await api("/api/commands/preview", { command, input });
  if (!pv.ok) { toast("err", `Can't ${command}`, pv.reason || (pv.errors || []).join("; ") || pv.code); return; }
  showConfirm(pv, () => execute(command, input, true, confirmText));
}
async function execute(command, input, confirm, confirmText) {
  const body = { command, input, confirm, actor: "operator" };
  if (confirmText) body.confirm_text = confirmText;
  const label = command.replace(/\./g, " ");
  // IMMEDIATE feedback — the operator never clicks Confirm and wonders. Shows a
  // running state right away; the POST runs independently.
  toast("ok", `${label}…`, "running — this can take a moment under load");
  let data;
  try { const r = await api("/api/commands", body); data = r.data; }
  catch (e) { toast("err", `${label} failed`, `no response from the runtime (${String(e && e.message || e)})`); return; }
  if (!data) { toast("err", `${label} failed`, "empty response from the runtime"); return; }
  if (data.stage === "execute") {
    const d = data.result?.data;
    const okc = data.result ? (data.result.exit === undefined || data.result.exit === 0) && (d?.ok !== false) : data.ok;
    let msg = data.result?.kind === "cli" ? (data.result.stdout || data.result.stderr || "") : "done";
    if (command === "director.ask") msg = d?.response_ok ? `${d.provider}: ${d.response}` : `${d?.provider || "provider"}: ${d?.error || "no response"}`;
    else if (command === "director.route") msg = "recorded + copied to clipboard";
    else if (command === "review.resolve") msg = `review ${d?.disposition}`;
    // Server START is truthful about COMPILING vs READY: alloy-dev-start spawns
    // Next and returns after a 1s liveness check — the app is NOT yet listening.
    // Never claim "done" (the old "it says it happened but it didn't"); say
    // "starting" and watch the port actually come up before confirming.
    if (command === "server.start") {
      if (okc) {
        const sp0 = state.snap?.sprints.find((x) => x.slot === input.slot);
        toast("ok", `slot ${input.slot} server starting…`, "compiling — it opens when the port is actually listening");
        watchServerReady(input.slot, sp0?.port);
      } else {
        toast("err", "server start failed", String(msg).split("\n").slice(0, 4).join("\n"));
      }
    } else {
      // server.stop is now port-authoritative: exit 0 means the port is genuinely
      // free, so "stopped" is truthful (it refuses success while a listener holds).
      const word = okc ? (command === "server.stop" ? "stopped" : "done") : "failed";
      toast(okc ? "ok" : "err", `${command.replace(/\./g, " ")} ${word}`, String(msg).split("\n").slice(0, 4).join("\n"));
    }
    // Clear the draft ONLY on a genuinely completed send: a real worker response
    // (director.ask) or a successful copy (director.route). Never on failure,
    // authentication error, validation error, or a cancelled confirmation.
    if (command === "director.ask" && d?.response_ok === true && input.slot != null) clearDraft(input.slot);
    else if (command === "director.route" && okc && input.slot != null) clearDraft(input.slot);
    if (data.snapshot) { adoptSnapshot(data.snapshot); }
    if ((command === "director.route" || command === "director.ask") && input.slot) fetchDirector(input.slot);
    const sp = state.snap?.sprints.find((x) => x.slot === input.slot);
    if (sp) { fetchOutputs(sp.worktree); fetchPr(sp); }
    fetchResources(); loadAuditIfOpen();
    if (input.slot != null && state._closeout) { delete state._closeout[input.slot]; if (state.tab === "closeout") fetchCloseout(input.slot); }
    render(true);
  } else { toast("err", `${command.replace(/\./g, " ")} not run`, data.reason || (data.errors || []).join("; ") || data.code); }
}
// After a server.start, the process is spawned but Next is still compiling. Watch
// the LIVE projection (which counts the real port listener) until the slot is
// actually serving, then confirm truthfully — or report it never came up. This is
// what turns "it says it happened but it didn't" into an honest ready signal.
function watchServerReady(slot, port) {
  const deadline = Date.now() + 75000;
  const iv = setInterval(() => {
    const sp = state.snap?.sprints?.find((x) => x.slot === slot);
    if (sp && sp.server === "running") {
      clearInterval(iv);
      toast("ok", `slot ${slot} app is up`, `${port ? `listening on :${port} — ` : ""}click Open App`);
    } else if (Date.now() > deadline) {
      clearInterval(iv);
      toast("err", `slot ${slot} app still not listening`, "still compiling under load, or it failed to start — try Diagnose");
    }
  }, 2000);
}
function loadAuditIfOpen() { if (route() === "history") { state._audit = null; fetchAudit(); } }
function showConfirm(pv, onConfirm) {
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>${esc(pv.title || pv.command)}</h3><span class="risk ${pv.risk || "low"}">${esc(pv.risk || "low")}</span>
    <div class="b">${esc(pv.preview?.summary || "")}${pv.target ? `<div class="tgt">▸ ${esc(pv.target.label || "")}</div>` : ""}
      ${pv.preview?.effects?.length ? `<ul>${pv.preview.effects.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
      ${pv.will_run?.bin ? `<div class="willrun">runs: ${esc(pv.will_run.bin)} ${esc((pv.will_run.args || []).join(" "))}</div>` : ""}</div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn ${pv.risk === "consequential" ? "go" : "primary"} ok">Confirm</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.querySelector(".ok").onclick = () => { ov.remove(); onConfirm(); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  document.body.appendChild(ov);
}
async function verifyProviderUI(id) {
  toast("ok", `Verifying ${id}…`, "re-checking authentication");
  const { data } = await api("/api/commands", { command: "provider.verify", input: { provider: id }, actor: "operator" });
  const r = data?.result?.data;
  if (r?.ok) toast(r.state === "authenticated" ? "ok" : "err", `${id}: ${r.label}`, r.detail || "");
  else toast("err", `Verify ${id} failed`, data?.reason || data?.code || "");
  fetchProviders(); if (state._dash) fetchDashboard();
}
function showProviderAction(id, kind) {
  const p = providerRt(id);
  const cmd = kind === "disconnect" ? (p?.disconnect_cmd) : (p?.reconnect_cmd);
  const title = kind === "disconnect" ? "Disconnect provider" : "Reconnect provider";
  const lead = kind === "disconnect"
    ? `Signing out clears the <b>shared</b> credential for <b>${esc(p?.label || id)}</b> — every worker using it is affected. Vacilando does not run this for you.`
    : `Vacilando cannot perform an interactive OAuth sign-in from a headless command. Run this <b>once</b> in a terminal; the whole Provider Runtime — and every worker — then uses it.`;
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>${title} · ${esc(p?.label || id)}</h3>
    <div class="b">${lead}
      <div class="ss-h">Run in a terminal</div>
      <div class="willrun">${esc(cmd || "—")}</div>
      <div class="muted note">Auth location: <span class="mono">${esc(p?.auth?.location || "—")}</span></div></div>
    <div class="foot"><button class="btn cancel">Close</button>${kind === "reconnect" ? `<button class="btn go copyc">Copy command</button>` : ""}</div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  const cp = ov.querySelector(".copyc"); if (cp) cp.onclick = () => { navigator.clipboard?.writeText(cmd || "").then(() => toast("ok", "Copied", "reconnect command copied")); };
  document.body.appendChild(ov);
}
async function showProviderDiagnostics(id) {
  const { data } = await api("/api/commands", { command: "provider.diagnostics", input: { provider: id }, actor: "operator" });
  const d = data?.result?.data;
  const ov = el("div", "ov");
  const row = (k, v) => `<div class="pm-row"><span class="pm-k">${k}</span><span class="pm-v">${v}</span></div>`;
  const body = d?.ok
    ? `${row("Provider", esc(d.label))}${row("Executable", `<span class="mono">${esc(d.executable || "—")}</span>`)}${row("Version", d.version ? "v" + esc(d.version) : "—")}
       ${row("Auth", `${esc(d.auth.label)}${d.auth.identity ? " · " + esc(d.auth.identity) : ""}`)}${row("Location", `<span class="mono">${esc(d.auth.location)}</span>`)}${row("Reason", esc(d.auth.detail || d.auth.reason || "—"))}
       ${row("Subscription", esc(d.auth.subscription || "—"))}${row("HOME", `<span class="mono">${esc(d.runtime.home)}</span>`)}${row("Node", esc(d.runtime.node))}${row("Inside Claude host", String(d.runtime.inside_claude_host))}
       ${row("Reconnect", `<span class="mono">${esc(d.reconnect_cmd)}</span>`)}`
    : `<div class="muted">Diagnostics unavailable.</div>`;
  ov.innerHTML = `<div class="dlg"><h3>Diagnostics · ${esc(d?.label || id)}</h3><div class="b"><div class="pm-grid">${body}</div>
    <div class="muted note">No secrets or tokens are read — presence, expiry, and identity only.</div></div>
    <div class="foot"><button class="btn cancel">Close</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  document.body.appendChild(ov);
}
function showSendConfirm(slot, type) {
  const ta = document.getElementById("d-msg"); const instruction = ta ? ta.value.trim() : "";
  if (!instruction) { toast("err", "Empty instruction"); return; }
  const sp = state.snap?.sprints.find((s) => s.slot === slot);
  const provider = sp?.provider || "the worker";
  const isQuick = type === "quick-ask";
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>${isQuick ? "Quick Ask" : "Send to Worker"} · slot ${slot}</h3><span class="risk consequential">consequential</span>
    <div class="b">${isQuick ? `A short bounded advisory request to <b>${esc(provider)}</b> (up to 60s).` : `An asynchronous instruction to <b>${esc(provider)}</b> — creates a durable request, returns immediately, and may run for minutes.`}
      <div class="willrun">${esc(instruction.slice(0, 200))}${instruction.length > 200 ? "…" : ""}</div>
      <div class="muted note">${instruction.length.toLocaleString()} chars · appears as Queued immediately · status updates in the conversation · safe to refresh or navigate away.</div></div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn go ok">${isQuick ? "Ask" : "Send"}</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  ov.querySelector(".ok").onclick = () => { ov.remove(); sendDirector(slot, type, instruction); };
  document.body.appendChild(ov);
}
function showStartServer(slot) {
  const sp = state.snap.sprints.find((s) => s.slot === slot);
  if (!sp) return;
  const running = state.snap.sprints.filter((s) => s.server === "running");
  const rows = running.length
    ? running.map((s) => `<div class="ss-row"><span class="ss-w"><b>slot ${s.slot}</b> · ${esc(shortBranch(s.branch, s.worktree))}${s.port ? ` · <span class="clean">:${s.port}</span>` : ""}</span><button class="btn sm warn" data-stop="${s.slot}">Stop</button></div>`).join("")
    : `<div class="muted">No dev servers are running.</div>`;
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>Start dev server</h3><span class="risk consequential">consequential</span>
    <div class="b">Boot the toolkit-owned Next dev server for <b>${esc(sp.title)}</b> (slot ${slot}${sp.port ? `, :${sp.port}` : ""}) so its app becomes openable.
      <div class="ss-h">Running servers (${running.length})</div>${rows}
      <div class="muted note">Server capacity is limited. If Start is blocked because capacity is full, stop one above first, then start.</div></div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn go ok">Start server</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  ov.querySelectorAll("[data-stop]").forEach((b) => { b.onclick = () => { const s = Number(b.dataset.stop); ov.remove(); startCommand("server.stop", { slot: s }); }; });
  ov.querySelector(".ok").onclick = () => { ov.remove(); startCommand("server.start", { slot }); };
  document.body.appendChild(ov);
}
function showStartWork() {
  const free = [1, 2, 3, 4, 5, 6].filter((n) => !state.snap.sprints.some((s) => s.slot === n));
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>Start work</h3><span class="risk consequential">consequential</span>
    <div class="b"><label>Objective / name (kebab-case key)</label><input class="f-name" placeholder="my-new-task">
      <label>Provider</label><select class="f-prov"><option value="claude">Claude</option><option value="cursor">Cursor</option></select>
      <label>Slot</label><select class="f-slot"><option value="">auto</option>${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${free.includes(n) ? "" : "disabled"}>slot ${n}${free.includes(n) ? "" : " (occupied)"}</option>`).join("")}</select>
      <label>Objective (optional)</label><input class="f-obj" placeholder="what the worker should do">
      ${free.length ? "" : `<div class="willrun" style="color:var(--terra);margin-top:8px">All six slots are occupied — end a worker to free capacity. This will refuse.</div>`}</div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn go ok">Preview →</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  ov.querySelector(".ok").onclick = () => {
    const input = { name: ov.querySelector(".f-name").value.trim(), provider: ov.querySelector(".f-prov").value };
    const slot = ov.querySelector(".f-slot").value; if (slot) input.slot = Number(slot);
    const obj = ov.querySelector(".f-obj").value.trim(); if (obj) input.objective = obj;
    ov.remove(); startCommand("sprint.start", input);
  };
  document.body.appendChild(ov);
}
function showEndWork(slot) {
  const sp = state.snap.sprints.find((x) => x.slot === slot);
  const dirty = sp?.git?.state === "dirty";
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>End work · slot ${slot}</h3><span class="risk consequential">consequential</span>
    <div class="b">${esc(sp?.title || "")}
      <ul><li><b>Pause &amp; keep</b> — stop the provider/server, preserve everything (reversible).</li>
      <li><b>Close session &amp; keep worktree</b> — archive metadata, free the slot; never deletes/pushes/merges.</li>
      <li><b>Promotion / push / PR / merge / delete</b> — governed on the <b>Repository</b> tab (preview → confirm; delete needs a typed phrase and is blocked when dirty).</li></ul>
      ${dirty ? `<label style="display:flex;gap:7px;align-items:center;font-size:12px"><input type="checkbox" class="f-ack" style="width:auto"> Worktree is dirty — acknowledge uncommitted changes (required to close)</label>` : ""}</div>
    <div class="foot" style="flex-wrap:wrap"><button class="btn cancel">Cancel</button>
      <button class="btn" data-do="repo">Repository ↗</button>
      <button class="btn warn" data-do="pause">Pause &amp; keep</button>
      <button class="btn go" data-do="finish">Close session</button></div></div>`;
  const close = () => { ov.remove(); render(true); };
  ov.querySelector(".cancel").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector('[data-do="repo"]').onclick = () => { ov.remove(); state.tab = "repository"; go("command/worker/" + slot); };
  ov.querySelector('[data-do="pause"]').onclick = () => { ov.remove(); startCommand("worker.pause", { slot }); };
  ov.querySelector('[data-do="finish"]').onclick = () => { const ack = ov.querySelector(".f-ack")?.checked; ov.remove(); startCommand("sprint.finish", ack ? { slot, acknowledge_uncommitted: true } : { slot }); };
  document.body.appendChild(ov);
}
let toastTimer = null;
function toast(kind, title, msg) {
  document.querySelector(".toast")?.remove();
  const t = el("div", `toast ${kind}`, `${esc(title)}${msg ? `<div class="m">${esc(String(msg))}</div>` : ""}`);
  document.body.appendChild(t); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 6000);
}

// -------- delegation --------
// ================= Director workspace (mission-first experience) =================
// The operator thinks about MISSIONS, never about runtimes. One surface: tell
// Director what you want → watch it prepare → review → approve → send.
async function fetchAllMissions() { try { const r = await fetch("/api/missions"); state._allMissions = (await r.json()).missions || []; render(true); } catch { /* keep last */ } }
const DIR_VERBS = /^\s*(build|extend|fix|refactor|redesign|design|improve|create|update|rebuild|revamp|enhance|add|replace|harden|make)\b/i;
function dirCapName(intent) {
  const n = String(intent || "").replace(DIR_VERBS, "").replace(/\bv\d+\b/i, "").replace(/\s+/g, " ").trim();
  return n.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ") || String(intent || "");
}

const DIR_STAGES = [
  { key: "intent", label: "Intent" }, { key: "capability", label: "Capability" },
  { key: "knowledge", label: "Knowledge" }, { key: "gap", label: "Gap Analysis" },
  { key: "package", label: "Package" }, { key: "approved", label: "Approved" },
  { key: "executing", label: "Executing" }, { key: "accepted", label: "Accepted" },
];
function dirStageState(key, m, pkg) {
  const compiled = !!pkg, ready = (pkg?.readiness_verdict?.verdict === "Ready");
  const live = ["starting", "running", "stopping"].includes(m.status), done = m.status === "completed";
  switch (key) {
    case "intent": return "done";
    case "capability": return pkg?.capability_id ? "done" : "pending";
    case "knowledge": return pkg?.knowledge_snapshot ? "done" : "pending";
    case "gap": return pkg?.gap_report ? "done" : "pending";
    case "package": return !compiled ? "pending" : (ready ? "done" : "review");
    case "approved": return (done || live) ? "done" : (ready ? "current" : "pending");
    case "executing": return done ? "done" : (live ? "current" : "pending");
    case "accepted": return done ? "done" : "pending";
    default: return "pending";
  }
}
const DIR_MARK = { done: "✓", current: "•", review: "!", blocked: "⛔", pending: "○" };

async function fetchConversations() { try { const r = await fetch("/api/director/conversations"); state._convos = (await r.json()).conversations || []; render(true); } catch { /* keep last */ } }
async function fetchCapabilities() { try { const r = await fetch("/api/capabilities"); state._caps = (await r.json()).capabilities || []; render(true); } catch { /* keep last */ } }
async function fetchConversation(id) { try { const r = await fetch("/api/director/conversation?id=" + encodeURIComponent(id)); const j = await r.json(); (state._convo = state._convo || {})[id] = j.conversation; (state._objective = state._objective || {})[id] = j.objective || null; render(true); } catch { /* keep last */ } }
// The conductor strip: shows Director conducting the objective as a phase spine,
// a hand-off toggle (gated ⇄ autonomous), and — after an Accept — a one-click
// "Prepare next phase" so the operator never returns to a blank box.
function objectiveStrip(id) {
  const o = (state._objective || {})[id];
  if (!o || !(o.phases || []).length) return "";
  const done = o.phases.filter((p) => p.status === "done").length;
  const auto = o.mode === "autonomous";
  const spine = o.phases.map((p) => `<span class="ophase ${p.status}" title="${esc(p.title)}">${p.status === "done" ? "✓" : "○"} ${esc(p.title)}</span>`).join('<span class="oarrow">→</span>');
  const pn = o.proposed_next;
  return `<div class="objstrip">
    <div class="objhead"><b>${esc(o.title)}</b> · ${done}/${o.phases.length} phases · <span class="${auto ? "clean" : "muted"}">${auto ? "Director is conducting (autonomous)" : "operator-gated"}</span>
      <button class="btn sm ${auto ? "warn" : ""}" data-obj-mode="${auto ? "gated" : "autonomous"}" data-cap="${esc(o.capability_id)}">${auto ? "Take back" : "Hand off to Director"}</button></div>
    <div class="ospine">${spine}</div>
    ${pn && !auto ? `<div class="objnext">Next: <b>${esc(pn.phase.title)}</b> <button class="btn sm go" data-obj-prepare="${esc(o.capability_id)}">Prepare it</button></div>` : ""}
  </div>`;
}

function viewDirector() {
  const r = parseRoute();
  if (r.sub === "mission" && r.param) return conversationWorkspace(r.param);
  if (!state._convos) { fetchConversations(); return `<div class="empty"><div class="big"><span class="spin"></span> Opening Director…</div></div>`; }
  return conversationInbox();
}

// The home is an inbox of ongoing CONVERSATIONS — not a grid of records.
function conversationInbox() {
  const cs = state._convos || [];
  if (!state._caps) fetchCapabilities();
  const caps = state._caps || [];
  const intent = esc(state._dirIntent || "");
  const def = state._dirDefine;
  const rows = cs.length ? cs.map((c) => `<div class="cvrow" data-dmission="${c.conversation_id}">
      <div class="cvrow-m"><div class="cvrow-t">${esc(c.title)}</div><div class="cvrow-s trunc">${esc(c.intent)}</div></div>
      <div class="cvrow-r"><span class="cvstate ${c.state.tone}">${esc(c.state.label)}</span><span class="cvgo">${esc(c.state.action)} →</span></div>
    </div>`).join("") : `<div class="rempty">Nothing in flight. Pick a capability to begin, or describe a new piece of work above.</div>`;
  // Available capabilities — a click names the work in the box for the operator to
  // start intentionally (Director never launches work on its own).
  const capChips = caps.length ? `<div class="dsec-h">Capabilities you can work <span class="muted">· ${caps.length}</span></div>
    <div class="capgrid">${caps.map((c) => { const d = c.description && !/^defined from/i.test(c.description) ? esc(String(c.description).replace(/\s+/g, " ").slice(0, 68)) : ""; return `<button class="capchip" data-dcap="${esc(c.name)}"><span class="capchip-n">${esc(c.name)}</span>${d ? `<span class="capchip-d">${d}</span>` : ""}</button>`; }).join("")}</div>` : "";
  return `<div class="dwrap">
    <div class="dhero">
      <h2>What are we working on?</h2>
      <p class="dsub">Tell Director about a piece of work — you'll talk it through together.</p>
      <div class="dintent"><input id="d-intent" class="d-intent" placeholder="e.g. Improve Scheduling   ·   Redesign Financials   ·   Access &amp; Roles V2" value="${intent}" />
        <select id="d-runtarget" class="d-runtarget" title="Which worker runs this — Auto picks a free one">
          <option value="auto"${!state._runTarget || state._runTarget === "auto" ? " selected" : ""}>Auto worker</option>
          ${(state.snap?.sprints || []).map((s) => `<option value="${s.slot}"${state._runTarget === String(s.slot) ? " selected" : ""}>slot ${s.slot} · ${esc(shortBranch(s.branch, s.worktree))}${s.activity === "working" ? " (busy)" : ""}</option>`).join("")}
        </select>
        <button class="btn go" data-dprepare>Start</button></div>
      ${def ? `<div class="ddefine"><span>Director hasn't worked on <b>${esc(def.name || def.intent)}</b> before.</span>
        <button class="btn go sm" data-ddefine="${esc(def.intent)}">Start it anyway</button>
        <button class="btn sm" data-ddismiss>Dismiss</button></div>` : ""}
    </div>
    ${cs.length ? "" : capChips}
    <div class="dsec-h">Conversations <span class="muted">· ${cs.length}</span></div>
    <div class="cvlist">${rows}</div>
    ${cs.length ? capChips : ""}
  </div>`;
}

// The visible Shared Understanding — the curated reliance surface. Each claim
// carries its epistemic status × authorship in a small voice tag (You decided /
// Settled / Must / Approach / Open / Needs a decision), so a recommendation can
// never masquerade as a decision, an assumption never as a fact, and an open
// question never disappears behind a green verdict. Curated and load-bearing:
// superseded claims live under "Set aside", never in the active surface.
const CARRY_LABEL = { tradeoff: "Accepted tradeoff", accepted_imperfection: "Accepted gap", risk: "Risk" };
function sharedUnderstanding(c, stage) {
  const u = c.understanding;
  if (!u) return `<div class="cvcol cvinsights"><div class="cvcol-h">Shared understanding</div><span class="muted">—</span></div>`;
  // While Director is still Understanding, the surface must not look fully formed:
  // show what is settled and what is open, but not carried/advised/set-aside yet.
  const understanding = stage === "understanding";
  const tag = (t, cls) => `<span class="su-tag ${cls || ""}">${esc(t)}</span>`;
  const why = (w) => (w ? `<div class="su-why">${esc(w)}</div>` : "");
  const claim = (voiceTag, text, whyText) => `<div class="su-item"><div class="su-line">${voiceTag}<span>${esc(text)}</span></div>${why(whyText)}</div>`;

  const reliedCls = (r) => r.kind === "decision" ? (r.settled_from_prior ? "settled" : "decided") : r.kind === "constraint" ? "must" : "approach";
  const relied = u.relied_upon.length
    ? u.relied_upon.map((r) => claim(tag(r.voice, reliedCls(r)), r.text, r.why)).join("")
    : (u.nothing_settled ? `<span class="muted">Nothing is settled yet — this is still being shaped.</span>` : `<span class="muted">—</span>`);
  const thin = u.is_thin ? `<div class="su-thin">Resting on limited evidence so far.</div>` : "";

  const frontier = u.frontier.length
    ? u.frontier.map((f) => claim(tag(f.blocks_execution ? "Needs a decision" : "Open", f.blocks_execution ? "blocks" : "open"), f.question, f.why)).join("")
    : (understanding ? `<span class="muted">Director is still working out what's open.</span>` : `<span class="muted">Nothing load-bearing is unresolved.</span>`);

  // These sections are premature while still understanding — hidden until preparing.
  const carrying = (!understanding && u.carrying.length)
    ? `<div class="cvins"><div class="dlabel">Knowingly carrying</div>${u.carrying.map((k) => claim(tag(CARRY_LABEL[k.kind] || "Carrying", "carry"), k.text, k.why)).join("")}</div>` : "";
  // Only at the pre-start gate, and clearly OPTIONAL — an informed tradeoff the
  // operator accepts by starting, not a pending decision that blocks the gate.
  const advises = (stage === "preparing" && u.advises)
    ? `<div class="cvins"><div class="dlabel">Director also suggests</div>${claim(tag("Optional", "advise"), u.advises.headline, "Not required to start — you're ready without these. Starting proceeds without them; broaden the objective and prepare again to include them.")}</div>` : "";
  const basis = (!understanding && u.basis)
    ? `<div class="cvins"><div class="dlabel">Continuing from</div><p class="su-basis">${esc(u.basis.continuation)}</p></div>` : "";
  const aside = (!understanding && u.set_aside.length)
    ? `<div class="cvins"><div class="dlabel">Set aside</div>${u.set_aside.map((s) => `<div class="su-aside"><span>${esc(s.text)}</span>${s.revisit_if ? `<div class="su-why">Revisit if ${esc(s.revisit_if)}</div>` : ""}</div>`).join("")}</div>` : "";

  return `<div class="cvcol cvinsights"><div class="cvcol-h">Shared understanding</div>
    <div class="cvins"><div class="dlabel">What we're doing</div><p class="cvgoal">${esc(u.intent || "—")}</p></div>
    <div class="cvins"><div class="dlabel">What we're relying on</div>${relied}${thin}</div>
    <div class="cvins"><div class="dlabel">What's still open</div>${frontier}</div>
    ${carrying}${advises}${basis}${aside}
  </div>`;
}

// Selecting a conversation opens the workspace: left history, center preparation,
// right insights. One window — the operator never bounces between pages.
// ---- Engineering Operations: the work-centric operational band (Phase 3) ----
// The operator manages WORK, never a provider session. This band shows the honest
// engineering state, meaningful progress (what changed, not what Claude said), the
// one interrupting "needs you", the assembled review, and the next action.
const opFileRow = (f) => `<div class="opfile">${esc(f)}</div>`;
function opReview(o) {
  const r = o.review; if (!r) return "";
  const mark = (s) => (s === "met" ? "✓" : s === "operator_review" ? "?" : "✗");
  const cls = (s) => (s === "met" ? "met" : s === "operator_review" ? "review" : "unmet");
  const ev = (r.evidence || []).map((e) => `<div class="opev"><span class="opev-b ${cls(e.status)}">${mark(e.status)}</span><div><span>${esc(e.criterion)}</span>${e.detail ? `<div class="su-why">${esc(e.detail)}</div>` : ""}</div></div>`).join("");
  const changed = (r.what_changed || []).length ? r.what_changed.map(opFileRow).join("") : `<span class="muted">—</span>`;
  const risks = (r.risks || []).length ? `<div class="opsec"><div class="dlabel">Remaining risks</div>${r.risks.map((x) => `<div class="oprisk">• ${esc(x)}</div>`).join("")}</div>` : "";
  // Summary + Director's read now live in the conversation thread (copy-pasteable);
  // here we keep only the structured verification detail.
  return `<div class="opband review"><span class="opstate ${o.state.tone}">${esc(o.state.label)}</span>
    <div class="opsec"><div class="dlabel">What changed</div>${changed}</div>
    <div class="opsec"><div class="dlabel">Evidence vs. acceptance</div>${ev || `<span class="muted">—</span>`}</div>
    ${risks}
  </div>`;
}
function opBand(c) {
  const o = c.operations; if (!o) return "";
  const k = o.state.key;
  const pill = `<span class="opstate ${o.state.tone}">${esc(o.state.label)}</span>`;
  const engine = o.engine_note ? `<div class="opnote">${esc(o.engine_note)}</div>` : "";
  if (k === "review" || k === "accepted") return opReview(o);
  // LAUNCHING — the worker is coming online. Show the honest sequence so the operator
  // watches it attach instead of interpreting dead air. (No separate state key: the
  // presence layer carries the launching/executing distinction.)
  if (c.presence?.phase === "launching") {
    const steps = (c.presence.launch?.steps || []).map((s) =>
      `<div class="oplaunch-step ${s.done ? "done" : s.active ? "active" : "pending"}"><span class="oplaunch-mark">${s.done ? "✓" : s.active ? "•" : "○"}</span>${esc(s.label)}${s.active ? "…" : ""}</div>`).join("");
    return `<div class="opband run"><span class="opstate run">Launching</span><p class="opsum">${esc(c.presence.line)}</p><div class="oplaunch">${steps}</div>${engine}</div>`;
  }
  if (k === "executing" || k === "verifying") {
    const wc = (o.progress.what_changed || []).length ? `<div class="opsec"><div class="dlabel">What changed</div>${o.progress.what_changed.map(opFileRow).join("")}</div>` : "";
    return `<div class="opband run">${pill}${o.progress.phase ? `<span class="opphase">${esc(o.progress.phase)}</span>` : ""}
      ${o.progress.headline ? `<p class="opsum">${esc(o.progress.headline)}</p>` : `<p class="opsum">${esc(c.presence?.line || "Working…")}</p>`}${wc}${engine}</div>`;
  }
  if (k === "needs_operator") return `<div class="opband attn">${pill}<div class="opneed"><div class="dlabel">Needs your input${o.needs_operator?.kind === "authentication" ? " — sign-in" : ""}</div><p>${esc(o.needs_operator?.prompt || "")}</p></div></div>`;
  if (k === "blocked" || k === "at_risk") return `<div class="opband attn">${pill}<p class="opsum">${esc(c.mission?.error_message || c.mission?.pending_question || "This needs a look before it can go on.")}</p></div>`;
  if (k === "closed") return `<div class="opband done">${pill}<p class="muted">Wound down — capacity freed, artifacts preserved.</p></div>`;
  if (k === "ready") {
    const p = c.package || {};
    // The execution contract the operator approves — what will actually run.
    const objective = String(p.objective || "").replace(/\n*\[EXECUTION NOTES\][\s\S]*$/i, "").trim();
    const crit = (p.acceptance_criteria || []).map((x) => `<li>${esc(x.statement)}</li>`).join("");
    const outcome = (p.expected_deliverables || []).map((d) => `<div>${esc(d.description)}${d.path ? ` <span class="muted">→ ${esc(d.path)}</span>` : ""}</div>`).join("") || "—";
    const outScope = (p.scope_excluded || []).slice(0, 6).map((s) => `<li>${esc(s)}</li>`).join("");
    return `<div class="opband ok">${pill}${p.operator_directed ? `<span class="opphase">operator-directed</span>` : ""}
      <div class="opsec"><div class="dlabel">Objective — what will run</div><div class="opobjective">${esc(objective) || "—"}</div></div>
      <div class="opsec"><div class="dlabel">Expected outcome</div>${outcome}</div>
      ${outScope ? `<div class="opsec"><div class="dlabel">Out of scope</div><ul class="dul">${outScope}</ul></div>` : ""}
      <div class="opsec"><div class="dlabel">How we'll know it's done</div><ul class="dul">${crit || "<li>—</li>"}</ul><div class="opsub">You'll confirm the results against these after the run — nothing to decide now.</div></div>
      <div class="opnote">Starting runs exactly this on an engine in an isolated workspace — you don't manage the provider, branch, or server.</div></div>`;
  }
  return `<div class="opband">${pill}</div>`;
}
// The next operator action(s) for this piece of work — start / answer / accept /
// close / stop — never "manage the provider".
function opFooter(c, id) {
  const o = c.operations, m = c.mission, V = c.verdict;
  const acts = o?.actions || [];
  const k = o?.state?.key;
  const stage = o?.stage;
  // UNDERSTANDING: the operator simply answers Director's questions — they do not
  // rewrite the objective. The answer continues the conversation.
  if (stage === "understanding") {
    return `<div class="cvcompose big"><input id="cv-reply" class="cv-reply" placeholder="Message Director…" value="${esc(state._cvReply || "")}" />
      <button class="btn go" data-cvanswer="${id}">Send</button></div>`;
  }
  // Needs-operator during execution: the answer STEERS the running work.
  if (acts.includes("reply")) {
    return `<div class="cvcompose"><input id="cv-reply" class="cv-reply" placeholder="Answer Director to continue this work…" value="${esc(state._cvReply || "")}" />
      <button class="btn go sm" data-cvsteer="${id}">Send</button>${acts.includes("stop") ? `<button class="btn warn sm" data-dstop="${id}">Stop</button>` : ""}</div>`;
  }
  // A "Needs Product Decisions" send-back needs a capability-level DECISION.
  if (k === "preparing" && V?.verdict === "Needs Product Decisions") {
    return `<div class="cvcompose"><input id="cv-reply" class="cv-reply" placeholder="Record a decision that shapes this capability…" />
      <button class="btn go sm" data-cvreply="${id}" data-cap="${esc(c.capability_id || "")}">Record decision</button></div>`;
  }
  // BEFORE it starts (preparing OR ready): the operator's words REDEFINE the mission
  // — the direction becomes the authoritative objective (recompiled), never a side
  // note while a generic objective stays in charge. Available at Ready too.
  if (k === "preparing" || k === "ready") {
    const reframe = `<div class="cvcompose"><input id="cv-reply" class="cv-reply" placeholder="Describe what this mission should do — this becomes the objective, e.g. “inventory the real authority paths, define the security model; do not build V2”…" />
      <button class="btn go sm" data-cvreframe="${id}">Set the objective</button></div>`;
    // Not ready yet: shaping the objective IS the primary move, so keep it prominent.
    if (!acts.includes("start")) return reframe;
    // Ready: Start is the obvious primary; redefining the objective is a secondary
    // "change what it does", tucked behind a disclosure so it stops competing with Start.
    const btns = [`<button class="btn go" data-dstart="${id}">Start this work</button>`,
      `<button class="btn sm" data-drecompile="${id}">Ask Director to prepare again</button>`];
    return `<div class="cvcompose ready">${btns.join("")}</div>
      <details class="cvreframe"><summary>Change what this mission does</summary>${reframe}</details>`;
  }
  // Execution / review / accepted states: the action buttons.
  const btns = [];
  if (acts.includes("accept")) btns.push(`<button class="btn go" data-daccept="${id}">Accept</button>`);
  if (acts.includes("close")) btns.push(`<button class="btn" data-dclose="${id}">Close</button>`);
  if (acts.includes("restart")) btns.push(`<button class="btn" data-dstart="${id}">Try again</button>`);
  if (acts.includes("stop")) btns.push(`<button class="btn warn" data-dstop="${id}">Stop</button>`);
  return btns.length ? `<div class="cvcompose ready">${btns.join("")}</div>` : "";
}

// Conversation STAGES — the operator sees only the stage they are in.
const STAGE_LABEL = { understanding: "Understanding", preparing: "Preparing", launching: "Launching", executing: "Executing", reviewing: "Reviewing", closed: "Closed" };
const STAGE_TONE = { understanding: "run", preparing: "ok", launching: "run", executing: "run", reviewing: "ok", closed: "muted" };

// The Understanding stage: Director's open questions, shown — not buried under
// preparation. Each question says why it matters, whether it blocks, and what it tests.
function understandingPanel(c) {
  const o = c.operations, qs = o.questions || [];
  const n = qs.length;
  // The questions now live IN the conversation thread (left). Here we only say what
  // this stage means, so there's no duplicate list to hunt.
  return `<div class="opband run"><span class="opstate run">Understanding</span>
    <p class="opsum">${n ? `Director has ${n} ${n === 1 ? "question" : "questions"} in the conversation — answer ${n === 1 ? "it" : "them"} and it will prepare the work.` : "Director is still understanding this work."}</p></div>`;
}

function conversationWorkspace(id) {
  const c = state._convo?.[id];
  if (!c) { fetchConversation(id); return `<div class="dwrap"><button class="btn sm" data-dback>← Conversations</button><div class="m-loading"><span class="spin"></span> Opening the conversation…</div></div>`; }
  const m = c.mission, pkg = c.package, o = c.operations;
  const stage = o?.stage || "preparing";
  const list = (arr, f) => (arr && arr.length ? `<ul class="dul">${arr.slice(0, 6).map((x) => `<li>${esc(f(x))}</li>`).join("")}</ul>` : `<span class="muted">—</span>`);

  // LEFT — the conversation, as a dialogue, with the stage-aware next-action footer.
  const bubbles = c.messages.map((msg) => `<div class="cvmsg ${msg.from}"><div class="cvbub sel">${esc(msg.text)}<button class="cvcopy" data-copy title="Copy">Copy</button></div></div>`).join("");
  const qbubbles = (stage === "understanding" ? (o?.questions || []) : []).map((q) => `<div class="cvmsg director q${q.blocks ? " blocks" : ""}"><div class="cvbub"><span class="qbadge">${q.blocks ? "needs an answer" : "worth confirming"}</span>${esc(q.question)}${q.why ? `<div class="qwhy">${esc(q.why)}</div>` : ""}</div></div>`).join("");
  // When work is ready for review, Director's summary + read belong IN the thread as
  // plain, selectable/copy-pasteable text — not boxed in "the work".
  const rev = (stage === "reviewing" ? o?.review : null);
  const reviewBubble = rev && rev.summary ? `<div class="cvmsg director review"><div class="cvbub sel">${esc(rev.summary)}${rev.recommendation ? `<div class="qwhy" style="margin-top:8px"><b>Director's read:</b> ${esc(rev.recommendation)}</div>` : ""}<button class="cvcopy" data-copy title="Copy">Copy</button></div></div>` : "";
  const left = `<div class="cvcol cvhistory"><div class="cvcol-h">Conversation</div><div class="cvthread">${bubbles}${qbubbles}${reviewBubble}</div>${opFooter(c, id)}</div>`;

  // CENTER — gated by stage: while Director is still Understanding, it shows the
  // OPEN QUESTIONS and nothing else; preparation artifacts appear only afterward.
  let center;
  if (stage === "understanding") {
    center = `<div class="cvcol cvprep"><div class="cvcol-h">The work</div>${understandingPanel(c)}
      <div class="opnote">Preparation — the objective, deliverables, and acceptance — appears once Director's questions are answered.</div></div>`;
  } else {
    const timeline = `<div class="dtl vert">${DIR_STAGES.map((s) => {
      const st = dirStageState(s.key, m, pkg);
      return `<div class="dtl-step ${st}"><span class="dtl-dot">${DIR_MARK[st]}</span><span class="dtl-lbl">${s.label}</span></div>`;
    }).join('<span class="dtl-line"></span>')}</div>`;
    center = `<div class="cvcol cvprep"><div class="cvcol-h">The work</div>
      ${opBand(c)}
      ${timeline}
      ${pkg ? `<div class="cvpkg"><div class="cvpkg-h"><b>What Director prepared</b> <span class="muted">v${pkg.version}${pkg.diff_from_previous?.verdict_change ? ` · ${esc(pkg.diff_from_previous.verdict_change)}` : ""}</span></div>
        <div class="dcols">
          <div><div class="dlabel">Deliverables</div>${list(pkg.expected_deliverables, (x) => x.description)}</div>
          <div><div class="dlabel">How we'll know it's done</div>${list(pkg.acceptance_criteria, (x) => x.statement)}</div>
        </div></div>` : `<div class="muted">Director is still pulling this together.</div>`}
    </div>`;
  }

  // RIGHT — Shared Understanding, gated so it doesn't look fully-formed mid-understanding.
  const right = sharedUnderstanding(c, stage);

  // The header follows presence: while the worker is coming online the whole view
  // reads "Launching", not "Executing" — one coherent signal, no split-brain.
  const headStage = c.presence?.phase === "launching" ? "launching" : stage;
  const stageLabel = STAGE_LABEL[headStage] || o?.state?.label || "";
  return `<div class="dwrap wide">
    <div class="dmhead"><button class="btn sm" data-dback>← Conversations</button>
      <div class="dmtitle"><h2>${esc(c.title)}</h2><span class="dmintent">${esc(stageLabel)}</span></div>
      ${o ? `<span class="mbadge ${STAGE_TONE[headStage] || o.state.tone} big">${esc(stageLabel)}</span>` : ""}</div>
    ${objectiveStrip(id)}
    <div class="cvgrid">${left}${center}${right}</div>
  </div>`;
}

// The operator "replies" to Director; a reply that shapes the work is recorded as
// a product decision, and Director updates the package.
async function replyToDirector(id, cap) {
  const el2 = document.getElementById("cv-reply");
  const text = (el2?.value || "").trim();
  if (!text) { toast("err", "Type a reply to Director"); return; }
  if (!cap) { toast("err", "This conversation has no capability yet"); return; }
  const { data } = await api("/api/director/product-decision", { capability_id: cap, statement: text });
  if (!data.ok) { toast("err", "Couldn't record that", data.error); return; }
  const { data: rc } = await api("/api/missions/recompile", { mission_id: id });
  await fetchConversations(); await fetchConversation(id);
  toast("ok", "Director updated the package", rc.diff?.verdict_change || (rc.package ? "v" + rc.package.version : ""));
}

async function prepareDirectorMission() {
  const intent = (state._dirIntent || document.getElementById("d-intent")?.value || "").trim();
  if (!intent) { toast("err", "Tell Director what you want to build"); return; }
  // Director dispatches to a worker: the operator's run-target, or "auto".
  const target = state._runTarget && state._runTarget !== "auto" ? Number(state._runTarget) : "auto";
  const { status, data } = await api("/api/missions/compile", { slot: target, intent });
  if (!data.ok) {
    if (data.reason === "no_capability") { state._dirDefine = { intent, name: dirCapName(intent) }; render(true); return; }
    if (data.error === "all_workers_busy" || data.error === "no_workers") { toast("err", "No free worker", data.detail || "every worker is busy — pick one explicitly or wait"); return; }
    if (data.error === "slot_not_occupied") { toast("err", "No worker there", data.detail); return; }
    toast("err", "Couldn't prepare", data.detail || data.error || status); return;
  }
  state._dirIntent = ""; state._dirDefine = null;
  await fetchConversations();
  go("director/mission/" + data.mission.mission_id);
  const sp = (state.snap?.sprints || []).find((x) => x.slot === data.assigned_slot);
  toast("ok", `Director is on it${data.assigned_slot ? ` — slot ${data.assigned_slot}` : ""}`, sp ? shortBranch(sp.branch, sp.worktree) : (data.verdict?.verdict || ""));
}
async function defineDirectorCapability(intent) {
  const { data } = await api("/api/director/define-capability", { intent });
  if (!data.ok) { toast("err", "Couldn't define capability", data.error); return; }
  toast("ok", "Capability defined", data.capability.name);
  state._dirIntent = intent; state._dirDefine = null;
  return prepareDirectorMission();
}
async function recompileDirector(id) {
  const { data } = await api("/api/missions/recompile", { mission_id: id });
  if (!data.ok) { toast("err", "Couldn't prepare again", data.error); return; }
  await fetchConversations(); await fetchConversation(id);
  toast("ok", "Director updated the package", data.diff?.verdict_change || ("v" + data.package.version + " · " + data.verdict.verdict));
}
// Operational actions on a piece of WORK — start / accept / close / stop — routed
// through the same preview→confirm→audit path as every consequential action, then
// the conversation refreshes so the operator sees the new state (never a provider).
async function convMissionAct(action, id, okMsg) {
  await missionAct(action, id, {}, okMsg);
  await fetchConversations(); await fetchConversation(id);
}
// In the Understanding stage, the operator simply ANSWERS Director's questions.
// The answer is recorded and the conversation continues — no objective rewriting.
async function answerDirector(id) {
  const el2 = document.getElementById("cv-reply");
  const text = ((el2?.value || state._cvReply || "")).trim();
  if (!text) { toast("err", "Type your answer to Director"); return; }
  const { data } = await api("/api/missions/answer", { mission_id: id, answer: text });
  if (!data.ok) { toast("err", "Couldn't send that", data.detail || data.error); return; }
  state._cvReply = ""; // consumed — don't let it pre-fill the next question
  await fetchConversations(); await fetchConversation(id);
  toast("ok", data.verdict?.verdict === "Ready" ? "Director has what it needs — preparing the work" : "Answer sent", "");
}
// Before start, the operator's words REDEFINE the mission — the direction becomes
// the authoritative objective (recompiled), not a side decision.
async function reframeWork(id) {
  const el2 = document.getElementById("cv-reply");
  const text = ((el2?.value || state._cvReply || "")).trim();
  if (!text) { toast("err", "Describe what this mission should do"); return; }
  const { data } = await api("/api/missions/reframe", { mission_id: id, direction: text });
  if (!data.ok) { toast("err", "Couldn't set the objective", data.detail || data.error); return; }
  state._cvReply = ""; // consumed
  await fetchConversations(); await fetchConversation(id);
  toast("ok", "Objective updated", data.diff?.verdict_change || (data.package ? "v" + data.package.version : ""));
}
// Answer during execution STEERS the running work (resumes its engine), rather
// than recording a product decision.
async function steerWork(id) {
  const el2 = document.getElementById("cv-reply");
  const text = ((el2?.value || state._cvReply || "")).trim();
  if (!text) { toast("err", "Type your answer to Director"); return; }
  state._cvReply = ""; // consumed
  await missionAct("steer", id, { instruction: text }, "Sent — Director is continuing the work");
  await fetchConversations(); await fetchConversation(id);
}
function showDecisionDialog(cid, id) {
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>Record a product decision</h3>
    <div class="b"><p class="muted">Director needs a decision that shapes this capability. Record it and Director will prepare again.</p>
      <textarea id="d-dec" placeholder="e.g. Roles are the unit of permission grant; users never receive access directly."></textarea></div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn go ok">Record &amp; prepare again</button></div></div>`;
  const close = () => { ov.remove(); render(true); };
  ov.querySelector(".cancel").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ok").onclick = async () => {
    const statement = ov.querySelector("#d-dec").value.trim();
    if (!statement) { toast("err", "Enter a decision"); return; }
    ov.remove();
    const { data } = await api("/api/director/product-decision", { capability_id: cid, statement });
    if (!data.ok) { toast("err", "Couldn't record decision", data.error); return; }
    await recompileDirector(id);
  };
  document.body.appendChild(ov);
  setTimeout(() => ov.querySelector("#d-dec")?.focus(), 30);
}
function directorSendBack(id, verdict, cid) {
  if (verdict === "Needs Product Decisions") return showDecisionDialog(cid, id);
  // Other blockers: editing Knowledge/Acceptance isn't a workspace surface yet —
  // open the mission's package review and offer to prepare again (honest V1).
  toast("info", "Resolve upstream, then prepare again", verdict);
  return recompileDirector(id);
}

document.addEventListener("click", (e) => {
  const t = (a) => e.target.closest(a);
  let n;
  if ((n = t("[data-dcap]"))) {
    // Name the capability without discarding detail the operator already typed:
    // keep their text as a suffix so "add an audit trail" becomes "Access & Roles — add an audit trail".
    const cap = n.dataset.dcap;
    const box0 = document.getElementById("d-intent");
    const cur = (state._dirIntent || box0?.value || "").trim();
    const detail = cur && !new RegExp(cap.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(cur) ? cur : "";
    state._dirIntent = detail ? `${cap} — ${detail}` : cap;
    render(true);
    const box = document.getElementById("d-intent"); if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    return;
  }
  if ((n = t("[data-dprepare]"))) { prepareDirectorMission(); return; }
  if ((n = t("[data-ddefine]"))) { defineDirectorCapability(n.dataset.ddefine); return; }
  if ((n = t("[data-ddismiss]"))) { state._dirDefine = null; render(true); return; }
  if ((n = t("[data-dmission]"))) { go("director/mission/" + n.dataset.dmission); return; }
  if ((n = t("[data-dback]"))) { go("director"); return; }
  if ((n = t("[data-dsendback]"))) { directorSendBack(n.dataset.dsendback, n.dataset.verdict, n.dataset.cap); return; }
  if ((n = t("[data-cvreply]"))) { replyToDirector(n.dataset.cvreply, n.dataset.cap); return; }
  if ((n = t("[data-cvsteer]"))) { steerWork(n.dataset.cvsteer); return; }
  if ((n = t("[data-cvreframe]"))) { reframeWork(n.dataset.cvreframe); return; }
  if ((n = t("[data-cvanswer]"))) { answerDirector(n.dataset.cvanswer); return; }
  if ((n = t("[data-drecompile]"))) { recompileDirector(n.dataset.drecompile); return; }
  if ((n = t("[data-dstart]"))) { convMissionAct("start", n.dataset.dstart, "Starting the work"); return; }
  if ((n = t("[data-daccept]"))) { convMissionAct("accept", n.dataset.daccept, "Accepted"); return; }
  if ((n = t("[data-dclose]"))) { convMissionAct("close", n.dataset.dclose, "Closed — capacity freed"); return; }
  if ((n = t("[data-dstop]"))) { convMissionAct("stop", n.dataset.dstop, "Stopped"); return; }
  // Specific actions win over container selection: a worker-dock card is a
  // [data-sel] container that WRAPS its own action buttons, so [data-sel] must
  // be the LAST fallback — otherwise every button click just selects the card.
  if ((n = t("[data-tab]"))) { state.tab = n.dataset.tab; render(true); return; }
  if ((n = t("[data-cmd]"))) { e.stopPropagation(); startCommand(n.dataset.cmd, n.dataset.slot ? { slot: Number(n.dataset.slot) } : {}); return; }
  if ((n = t("[data-disk-reclaim]"))) { e.stopPropagation(); diskReclaim(); return; }
  if ((n = t("[data-disk-auto]"))) { e.stopPropagation(); diskSetAuto(n.dataset.diskAuto === "1"); return; }
  if ((n = t("[data-copy]"))) { e.stopPropagation(); copyBubble(n); return; }
  if ((n = t("[data-obj-mode]"))) { e.stopPropagation(); objSetMode(n.dataset.cap, n.dataset.objMode); return; }
  if ((n = t("[data-obj-prepare]"))) { e.stopPropagation(); objPrepareNext(n.dataset.objPrepare); return; }
  if ((n = t("[data-end]"))) { e.stopPropagation(); showEndWork(Number(n.dataset.end)); return; }
  if (t("[data-start]")) { showStartWork(); return; }
  if ((n = t("[data-startserver]"))) { e.stopPropagation(); showStartServer(Number(n.dataset.startserver)); return; }
  if ((n = t("[data-director]"))) { const msg = document.getElementById("d-msg")?.value?.trim(); if (!msg) { toast("err", "Empty instruction"); return; } startCommand("director.route", { slot: Number(n.dataset.director), message: msg }); return; }
  if ((n = t("[data-send-worker]"))) { showSendConfirm(Number(n.dataset.sendWorker), "worker-instruction"); return; }
  if ((n = t("[data-quick-ask]"))) { showSendConfirm(Number(n.dataset.quickAsk), "quick-ask"); return; }
  if ((n = t("[data-compile]"))) { compileMission(Number(n.dataset.compile)); return; }
  if ((n = t("[data-msel]"))) { if (state.sel) state.missionSel[state.sel] = n.dataset.msel; fetchMissionDetail(n.dataset.msel); render(true); return; }
  if ((n = t("[data-mstart]"))) { missionAct("start", n.dataset.mstart, {}, "Mission starting"); return; }
  if ((n = t("[data-mstop]"))) { missionAct("stop", n.dataset.mstop, {}, "Mission stopped"); return; }
  if ((n = t("[data-msteer]"))) { showSteer(n.dataset.msteer); return; }
  if ((n = t("[data-mresume]"))) { missionAct("steer", n.dataset.mresume, { instruction: "Resume this mission from where it was interrupted. Re-read the mission package above and continue." }, "Mission resuming"); return; }
  if ((n = t("[data-mout]"))) { showMissionOutputs(n.dataset.mout); return; }
  if ((n = t("[data-mevidence]"))) { showMissionEvidence(n.dataset.mevidence); return; }
  if ((n = t("[data-mreview]"))) { showPackageReview(n.dataset.mreview); return; }
  if ((n = t("[data-mevaluate]"))) { missionAct("evaluate", n.dataset.mevaluate, {}, "Acceptance evaluated"); return; }
  if ((n = t("[data-maccept]"))) { missionAct("accept", n.dataset.maccept, {}, "Mission accepted"); return; }
  if ((n = t("[data-retry]"))) { const rid = n.dataset.retry; const slot = state.sel; const orig = (state.requests[slot] || []).find((r) => r.request_id === rid); if (orig) sendDirector(slot, orig.request_type || "worker-instruction", orig.instruction, rid); return; }
  if ((n = t("[data-discardcmd]"))) { showDiscard(Number(n.dataset.discardcmd)); return; }
  if ((n = t("[data-nav-tab]"))) { state.tab = n.dataset.navTab; render(true); return; }
  if ((n = t("[data-review]"))) { showReview(n.dataset.review); return; }
  if ((n = t("[data-prcmd]"))) { e.stopPropagation(); showOpenPr(Number(n.dataset.slot)); return; }
  if ((n = t("[data-delcmd]"))) { e.stopPropagation(); showDelete(Number(n.dataset.delcmd)); return; }
  if ((n = t("[data-prov-verify]"))) { e.stopPropagation(); verifyProviderUI(n.dataset.provVerify); return; }
  if ((n = t("[data-prov-reconnect]"))) { e.stopPropagation(); showProviderAction(n.dataset.provReconnect, "reconnect"); return; }
  if ((n = t("[data-prov-disconnect]"))) { e.stopPropagation(); showProviderAction(n.dataset.provDisconnect, "disconnect"); return; }
  if ((n = t("[data-prov-diag]"))) { e.stopPropagation(); showProviderDiagnostics(n.dataset.provDiag); return; }
  if ((n = t("[data-nav]"))) { go(n.dataset.nav); return; }
  if ((n = t("[data-route]"))) {
    e.preventDefault();
    if (n.dataset.legacy === "1") {
      const u = new URL(location.href);
      u.searchParams.set("legacy", "1");
      u.hash = "#/" + n.dataset.route;
      location.href = u.pathname + u.search + u.hash;
      return;
    }
    // Leaving legacy mode when returning to Mission Control primary routes
    if (MC_ROUTES.has(n.dataset.route) && legacyMode()) {
      const u = new URL(location.href);
      u.searchParams.delete("legacy");
      u.hash = "#/" + n.dataset.route;
      location.href = u.pathname + u.search + u.hash;
      return;
    }
    go(n.dataset.route);
    return;
  }
  if ((n = t("[data-sel]"))) { select(Number(n.dataset.sel)); return; }
});
function showReview(initiative_key) {
  const rv = (state.snap.approvals?.reviews || []).find((x) => x.initiative_key === initiative_key);
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>Review · ${esc(initiative_key)}</h3><span class="risk consequential">consequential</span>
    <div class="b">${esc(rv?.summary || "Review required")}
      <ul><li>Recorded as an audited disposition; clears from Needs You.</li><li>Does not force the toolkit's initiative state machine.</li></ul>
      <label>Note (optional)</label><input class="f-note" placeholder="rationale or requested changes"></div>
    <div class="foot" style="flex-wrap:wrap"><button class="btn cancel">Cancel</button>
      <button class="btn warn" data-do="rc">Request changes</button><button class="btn go" data-do="ap">Approve</button></div></div>`;
  const close = () => { ov.remove(); render(true); };
  ov.querySelector(".cancel").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector('[data-do="ap"]').onclick = () => { const note = ov.querySelector(".f-note").value.trim(); ov.remove(); startCommand("review.resolve", { initiative_key, disposition: "approve", ...(note ? { note } : {}) }); };
  ov.querySelector('[data-do="rc"]').onclick = () => { const note = ov.querySelector(".f-note").value.trim(); ov.remove(); startCommand("review.resolve", { initiative_key, disposition: "request_changes", ...(note ? { note } : {}) }); };
  document.body.appendChild(ov);
}
function showOpenPr(slot) {
  const sp = state.snap.sprints.find((x) => x.slot === slot);
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>Open draft PR · slot ${slot}</h3><span class="risk consequential">consequential</span>
    <div class="b">${esc(sp?.branch || "")} → staging (draft)<label>Title</label><input class="f-t" value="${esc(sp?.title || "")}"></div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn go ok">Preview →</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  ov.querySelector(".ok").onclick = () => { const title = ov.querySelector(".f-t").value.trim(); ov.remove(); startCommand("promotion.open_pr", { slot, title }); };
  document.body.appendChild(ov);
}
function showDelete(slot) {
  const sp = state.snap.sprints.find((x) => x.slot === slot);
  const phrase = `delete ${slot}`;
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>Delete worktree · slot ${slot}</h3><span class="risk consequential">destructive</span>
    <div class="b">${esc(sp?.worktree || "")} — DESTRUCTIVE. Blocked when dirty; never uses --force.
      <label>Type <b>${esc(phrase)}</b> to confirm</label><input class="f-ct" placeholder="${esc(phrase)}"></div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn go ok">Delete worktree</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  // Genuine preview → confirm: resolve eligibility + the authoritative target
  // FIRST (fails closed on dirty/conflict/unmerged), show it, then execute only
  // on an explicit second confirm. The typed phrase is carried through both.
  ov.querySelector(".ok").onclick = async () => {
    const ct = ov.querySelector(".f-ct").value.trim();
    if (ct !== `delete ${slot}`) { toast("err", "Phrase mismatch", `Type exactly: delete ${slot}`); return; }
    ov.remove();
    const { data: pv } = await api("/api/commands/preview", { command: "worktree.delete", input: { slot, confirm_text: ct } });
    if (!pv.ok) { toast("err", "Delete blocked", pv.reason || (pv.errors || []).join("; ") || pv.code); return; }
    showConfirm({ ...pv, title: "Delete worktree", risk: "consequential" }, () => execute("worktree.delete", { slot, confirm_text: ct }, true, ct));
  };
  document.body.appendChild(ov);
}
$("#refresh-btn").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  const x = ev.target.textContent;
  ev.target.textContent = "↻ …";
  try {
    await execute("runtime.refresh", {}, false);
    fetchResources();
    // Mission Control caches decision/Needs You clientside — Director may have
    // answered via Trusted Host outside this window. Drop caches and re-render.
    if (typeof window.VacilandoV2?.invalidatePresentationCaches === "function") {
      window.VacilandoV2.invalidatePresentationCaches();
    }
    lastKey = null;
    render(true);
  } finally {
    ev.target.disabled = false;
    ev.target.textContent = x;
  }
});
window.addEventListener("hashchange", () => render(true));

// -------- data loop --------
function chrome() { $("#gen").textContent = state.snap?.generated_at ? new Date(state.snap.generated_at).toLocaleTimeString() : ""; }
let sseOk = false;
function setLive(s) { const p = $("#livepill"), l = $("#live-label"); if (s === "live") { p.classList.remove("stale"); l.textContent = "Live"; } else if (s === "polling") { p.classList.add("stale"); l.textContent = "Polling"; } else { p.classList.add("stale"); l.textContent = "Offline"; } }
/**
 * Adopt a snapshot frame defensively: a frame carrying zero workers must never
 * replace a board that currently has them (that is how the dock "collapsed").
 * A frame with workers but no headline (degraded/pending) is still adopted —
 * dropping it was what hid the registry-backed board.
 */
function adoptSnapshot(s) {
  if (!s) return false;
  const incoming = (s.sprints || []).length, current = (state.snap?.sprints || []).length;
  if (incoming === 0 && current > 0) return false; // never blank a good board
  if (!s.headline && incoming === 0) return false; // nothing useful to show
  state.snap = s; return true;
}
function onSnap(s) {
  if (!adoptSnapshot(s)) return;
  chrome();
  // On Mission Control routes, board SSE must not thrash #view — debounce revision sync.
  const r = parseRoute();
  if (window.VacilandoV2?.enabled && MC_ROUTES.has(r.name)) {
    const now = Date.now();
    const last = window.VacilandoV2.state?._lastSseRevisionSync || 0;
    if (now - last < 8000) return;
    window.VacilandoV2.state._lastSseRevisionSync = now;
    window.VacilandoV2.syncPresentationRevision?.();
    return;
  }
  render();
}
async function poll() { try { const r = await fetch("/api/state", { cache: "no-store" }); onSnap(await r.json()); setLive(sseOk ? "live" : "polling"); } catch { setLive("offline"); } }
function connect() { try { const es = new EventSource("/api/events"); es.addEventListener("snapshot", (ev) => { try { onSnap(JSON.parse(ev.data)); } catch {} sseOk = true; setLive("live"); }); es.addEventListener("hello", () => { sseOk = true; setLive("live"); }); es.onerror = () => { sseOk = false; }; } catch { sseOk = false; } }
function isWorkspaceRoute() {
  try {
    const raw = location.hash.replace(/^#\/?/, "");
    const name = (raw.split("?")[0] || "").split("/").filter(Boolean)[0] || "";
    return name === "workspaces" || name === "workspace";
  } catch {
    return false;
  }
}
enforceMissionControlHome();
if (!location.hash || location.hash === "#" || location.hash === "#/") location.hash = "#/missions";
// First Mission Control / Workspace paint immediately (shell interactive before board hydrate).
render(true);
// Board telemetry contends on the single-threaded control plane — defer on Workspace Runtime.
if (isWorkspaceRoute()) {
  setTimeout(() => { connect(); poll(); fetchResources(); }, 5000);
} else {
  connect();
  poll();
  fetchResources();
}
setInterval(poll, 4000);
setInterval(fetchResources, 9000);

// ---- Operator notifications: Needs You + legacy Director conversations.
// Fires a native desktop notification when something newly needs the operator
// (decision, kickoff, exhausted silent recovery, etc.) and updates the dock badge.
const NOTIFY_ACTIONS = { Answer: "has a question for you", Review: "prepared work to review", Accept: "finished work — ready for your acceptance", Continue: "is blocked and needs you" };
const _notifySeen = new Map(); // conversation_id -> last action (only notify on transitions, never on first load)
const _needsNotifySeen = new Set(); // item keys seen; first poll seeds silently
let _needsNotifyPrimed = false;

function setNativeDockBadge(count) {
  try {
    const n = Math.max(0, Number(count) || 0);
    if (window.vacilandoNative?.setDockBadge) window.vacilandoNative.setDockBadge(n);
  } catch { /* ignore */ }
}

function ensureNotifyPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try { Notification.requestPermission().catch(() => {}); } catch { /* */ }
  }
}

function notifyOperator(convos) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  for (const c of (convos || [])) {
    const action = (c.state && c.state.action) || "";
    const id = c.conversation_id;
    const prev = _notifySeen.has(id) ? _notifySeen.get(id) : null;
    _notifySeen.set(id, action);
    if (prev === null || prev === action) continue;         // first sight or unchanged → no notification
    if (!NOTIFY_ACTIONS[action]) continue;                   // only the states that need a human
    try {
      const n = new Notification(`Vacilando · ${c.title || "Director"}`, { body: `Director ${NOTIFY_ACTIONS[action]}.`, tag: id, requireInteraction: action === "Accept" || action === "Continue" });
      n.onclick = () => { try { window.focus(); location.hash = "#/director"; state._openConvo = id; render(true); } catch {} };
    } catch { /* notifications unavailable */ }
  }
}

function needsYouKey(item) {
  return [item.type, item.missionId || "", item.decisionId || item.id || item.title || ""].join(":");
}

function notifyNeedsYou(items) {
  const list = Array.isArray(items) ? items : [];
  setNativeDockBadge(list.length);
  const keys = new Set(list.map(needsYouKey));
  if (!_needsNotifyPrimed) {
    for (const k of keys) _needsNotifySeen.add(k);
    _needsNotifyPrimed = true;
    return;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    for (const k of keys) _needsNotifySeen.add(k);
    return;
  }
  for (const item of list) {
    const key = needsYouKey(item);
    if (_needsNotifySeen.has(key)) continue;
    _needsNotifySeen.add(key);
    const title = item.title || "Needs you";
    const body = item.urgency || item.recommendation || item.body || "Director needs your attention.";
    try {
      const n = new Notification(`Vacilando · ${title}`, {
        body: String(body).slice(0, 180),
        tag: key,
        requireInteraction: item.type === "decision" || item.type === "completion" || item.type === "worker_silent",
      });
      n.onclick = () => {
        try {
          window.focus();
          const href = item.action?.href || (item.missionId ? `missions/${item.missionId}` : "needs-you");
          location.hash = `#/${href.replace(/^#\/?/, "")}`;
        } catch { /* */ }
      };
    } catch { /* notifications unavailable */ }
  }
  // Drop keys that cleared so a recurrence can notify again
  for (const k of [..._needsNotifySeen]) {
    if (!keys.has(k)) _needsNotifySeen.delete(k);
  }
}

async function notifyPoll() {
  try {
    const r = await fetch("/api/director/conversations");
    notifyOperator((await r.json()).conversations || []);
  } catch { /* keep last */ }
  try {
    const r = await fetch("/api/v2/views/needs-you");
    const j = await r.json();
    notifyNeedsYou(j.items || []);
  } catch { /* keep last */ }
}
ensureNotifyPermission();
if (isWorkspaceRoute()) {
  setTimeout(() => notifyPoll(), 6000);
} else {
  notifyPoll();
}
setInterval(notifyPoll, 15000);
// Also re-check permission when the window gains focus (macOS often prompts then).
window.addEventListener("focus", () => { ensureNotifyPermission(); });
// Poll the selected worker's Director requests while any is still running, so
// status advances live and the elapsed timer ticks. Server store is authoritative.
setInterval(() => { const slot = state.sel; if (slot == null || document.hidden) return; const rs = state.requests[slot]; if (rs && rs.some((r) => !REQ_TERMINAL.has(r.status))) fetchRequests(slot); }, 2500);
// Refresh the dashboard while it's the active center; pause when the tab is hidden (efficiency).
setInterval(() => { if (document.hidden) return; if (route() === "command" && state.sel == null) fetchDashboard(); }, 10000);
