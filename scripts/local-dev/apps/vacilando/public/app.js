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
function ago(ms) { if (!ms) return "—"; const s = Math.max(0, (Date.now() - ms) / 1000); if (s < 60) return `${s | 0}s`; if (s < 3600) return `${(s / 60) | 0}m`; if (s < 86400) return `${(s / 3600) | 0}h`; return `${(s / 86400) | 0}d`; }
const shortBranch = (b, wt) => (b ? b.replace(/^agent\/[^/]+\//, "") : wt || "—");

const state = { snap: null, res: null, sel: null, tab: "overview", outputs: {}, director: {}, drafts: {} };

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
});

// -------- routing (Command Center / Work History / Settings) --------
function parseRoute() { const p = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean); return { name: p[0] || "command", sub: p[1], param: p[2] }; }
function route() { return parseRoute().name; }
function go(r) { location.hash = "#/" + r; }
const CRUMBS = { command: "Command Center", history: "Work History", policies: "Policies", settings: "Settings" };
function setActiveNav(name) {
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
  $("#crumb").textContent = CRUMBS[name] || "Command Center";
}

let lastKey = null;
function render(force) {
  if (document.querySelector(".ov")) return;
  const r = parseRoute();
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
  lastKey = key;
  setActiveNav(r.name);
  const V = $("#view");
  if (!state.snap || !state.snap.headline) { V.innerHTML = `<div class="empty"><div class="big">Connecting to the runtime…</div></div>`; return; }
  // Preserve caret/scroll of a focused text field across the innerHTML rebuild
  // so a background refresh can never disturb an in-progress draft.
  const ae = document.activeElement;
  const savedFocus = ae && (ae.tagName === "TEXTAREA" || ae.tagName === "INPUT") && ae.id
    ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd, top: ae.scrollTop } : null;
  V.innerHTML = ({ command: viewCommand, history: viewHistory, policies: viewPolicies, settings: viewSettings }[r.name] || viewCommand)();
  if (savedFocus) {
    const n = document.getElementById(savedFocus.id);
    if (n) { try { n.focus({ preventScroll: true }); if (savedFocus.s != null) n.setSelectionRange(savedFocus.s, savedFocus.e); n.scrollTop = savedFocus.top; } catch { /* field gone */ } }
  }
  $("#nb-needs").textContent = state.snap ? needsYou().length : 0;
}

// -------- Command Center: board | operating surface | rail --------
function viewCommand() {
  const center = state.sel != null ? operatingSurface() : dashboardCenter();
  return `<div class="room">
    <section class="board">
      <div class="board-h"><span>Worker Dock</span><button class="btn primary sm" data-start>+ Start Work</button></div>
      ${state.snap.sprints.map(workerCard).join("")}
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

function workerCard(sp) {
  const r = resFor(sp.slot);
  const proc = r?.server_process;
  const pend = sp.question_count || 0;
  return `<div class="wcard ${sp.slot === state.sel ? "sel" : ""}" data-sel="${sp.slot}" style="--acc:${STATUS_ACC[sp.status] || "var(--green)"}">
    <div class="wc-top"><span class="gl">${glyph(sp.glyph)}</span>
      <div class="wc-id"><b>slot ${sp.slot}</b> · ${esc(sp.provider)}</div>
      <span class="chip ${sp.status}">${esc(sp.status)}</span>${pend ? `<span class="pend">${pend}</span>` : ""}</div>
    <div class="wc-obj trunc">${esc(sp.title)}</div>
    <div class="wc-meta trunc mono">${esc(shortBranch(sp.branch, sp.worktree))} · ↑${sp.git.ahead}↓${sp.git.behind}${sp.git.state === "dirty" ? "·dirty" : ""}</div>
    <div class="wc-res">${proc
      ? `<span title="cpu">◔ ${proc.cpu_pct}%</span><span title="mem">▤ ${proc.rss_mb}MB</span><span title="elapsed">◷ ${proc.elapsed}</span>${r.port ? `<span title="port">:${r.port}</span>` : ""}`
      : `<span class="muted">no active process</span>`}<span class="wc-act">upd ${ago(sp.updated_at_ms)}</span></div>
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

// -------- Team Dashboard (default center) --------
function dashboardCenter() {
  const d = state._dash;
  if (!d) { fetchDashboard(); return `<div class="empty" style="margin:20px"><div class="big">Team Dashboard</div>Loading team, machine, providers, and scheduler…</div>`; }
  const m = d.machine || {}, sc = d.scheduler || {}, tp = d.throughput || {}, ol = d.operator_load || {};
  const stat = (l, v, sub) => `<div class="dstat"><div class="dl">${l}</div><div class="dv">${v}</div>${sub ? `<div class="ds">${sub}</div>` : ""}</div>`;
  const c = sc.counts || {};
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
  const tabs = ["work", "director", "outputs", "resources", "repository", "history"];
  const tabContent = state.tab === "director" ? tabDirector(sp)
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
      ${kv("Position", `↑${sp.git.ahead} ↓${sp.git.behind} · <span class="${sp.git.state === "dirty" ? "dirty" : "clean"}">${sp.git.state}</span>`)}
      ${kv("Base", esc(state.snap.repository.base_ref) + " @ " + esc(state.snap.repository.base_sha || "—"))}
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
  const dirty = sp.git.state === "dirty";
  return `<div class="obj-lead">
      <div class="obj">${esc(sp.objective || sp.title)}</div>
      <div class="muted note">Full live instructions live in the worker's session and its worktree package. Vacilando composes and routes new instructions from the Director tab — it does not read the live editor buffer.</div></div>
    <div class="dstats sm work-stats">
      ${stat("Provider", esc(sp.provider))}
      ${stat("Stage", esc(sp.phase?.label || "—"))}
      ${stat("Health", w ? `<span class="hpill ${w.health}">${w.health}</span>` : "—")}
      ${stat("Position", `<span class="${dirty ? "dirty" : "clean"}">↑${sp.git.ahead} ↓${sp.git.behind}</span>`, dirty ? "uncommitted changes" : "clean")}
      ${stat("Server", sp.server === "running" && sp.port ? `<span class="clean">:${sp.port}</span>` : esc(sp.server))}
      ${stat("Initiative", sp.initiative_key ? esc(sp.initiative_key) : "managed sprint")}</div>
    <div class="cols2">
      <div class="sec"><h5>Worktree &amp; Git</h5><dl class="kv">
        ${kv("Worktree", esc(sp.worktree), 1)}${kv("Branch", esc(sp.branch || "—"), 1)}
        ${kv("Base", esc(state.snap.repository.base_ref) + " @ " + esc(state.snap.repository.base_sha || "—"), 1)}</dl></div>
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
function tabDirector(sp) {
  const log = state.director[sp.slot];
  if (log === undefined) { fetchDirector(sp.slot); }
  if (!state._providers) fetchProviders(); // authoritative provider status (Provider Runtime)
  const items = log || [];
  const ps = providerStatus(sp.provider, sp.slot);
  const draft = draftFor(sp.slot);
  const conv = (m) => {
    const st = directorStatus(m);
    const when = m.occurred_at ? new Date(m.occurred_at).toLocaleString() : "";
    const head = `<div class="dc-head"><span class="dc-role op">Operator → Director</span><span class="dc-badge ${st.k}">${esc(st.label)}</span><span class="dc-time">${when}</span></div>
      <div class="dc-msg">${esc(m.message)}</div>`;
    if (m.delivery === "provider-round-trip") {
      const u = m.usage || {};
      const meta = `${esc(m.provider || "provider")} · ${u.input_tokens ?? "?"}→${u.output_tokens ?? "?"} tok · ${m.duration_ms ? (m.duration_ms / 1000).toFixed(1) + "s" : "—"} · ${u.cost_usd != null ? "$" + u.cost_usd : "cost unavailable"}`;
      return `<div class="dconv">${head}
        <div class="dc-resp ${st.k}"><span class="dc-role worker">Worker response</span><div class="dc-rtext">${esc(m.response || m.response_error || "(no response)")}</div></div>
        <div class="dc-meta">${meta}</div></div>`;
    }
    return `<div class="dconv">${head}
      <div class="dc-note">Delivered to worker by clipboard / manual paste — Vacilando cannot inject into a running session.</div></div>`;
  };
  return `<div class="director">
    <div class="dhead">
      <div class="dtitle">Director</div>
      <div class="dctx">
        <span>Selected worker: <b>Slot ${sp.slot}</b></span>
        <span>Assigned provider: <b>${esc(capProvider(sp.provider))}</b></span>
        <span>Provider status: <span class="hpill ${ps.k}">${esc(ps.label)}</span></span>
      </div>
      <div class="muted dmode">You talk to Director; Director routes work to the selected worker, whose runtime uses the assigned provider. <b>Send to Worker</b> = headless provider turn with worktree context. <b>Copy Instruction</b> = clipboard / manual paste. Injecting into a live editor session is not available.</div>
    </div>
    <div class="dlog">${items.length ? items.map(conv).join("") : `<div class="empty">No interactions yet.</div>`}</div>
    <div class="dcompose">
      <textarea id="d-msg" data-slot="${sp.slot}" maxlength="${DIRECTOR_MAX}" placeholder="Instruction for the worker — e.g. Summarize your latest change and list any blockers. Do not modify files.">${esc(draft)}</textarea>
      <div class="dc-count"><span id="d-count">${fmtCount(draft.length)}</span><span class="muted"> / ${DIRECTOR_MAX.toLocaleString()} max</span></div>
      <div class="drow"><span class="muted dhelp">Preview → confirm → worker request → response</span>
        <div class="dbtns"><button class="btn" data-director="${sp.slot}">Copy Instruction</button><button class="btn go" data-ask="${sp.slot}">Send to Worker</button></div></div>
      <div class="muted dsend-note">This sends a live request to the assigned worker. Usage will be shown after completion when reported by the provider.</div>
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
  const { data } = await api("/api/commands", body);
  if (data.stage === "execute") {
    const d = data.result?.data;
    const okc = data.result ? (data.result.exit === undefined || data.result.exit === 0) && (d?.ok !== false) : data.ok;
    let msg = data.result?.kind === "cli" ? (data.result.stdout || data.result.stderr || "") : "done";
    if (command === "director.ask") msg = d?.response_ok ? `${d.provider}: ${d.response}` : `${d?.provider || "provider"}: ${d?.error || "no response"}`;
    else if (command === "director.route") msg = "recorded + copied to clipboard";
    else if (command === "review.resolve") msg = `review ${d?.disposition}`;
    toast(okc ? "ok" : "err", `${command.replace(/\./g, " ")} ${okc ? "done" : "failed"}`, String(msg).split("\n").slice(0, 4).join("\n"));
    // Clear the draft ONLY on a genuinely completed send: a real worker response
    // (director.ask) or a successful copy (director.route). Never on failure,
    // authentication error, validation error, or a cancelled confirmation.
    if (command === "director.ask" && d?.response_ok === true && input.slot != null) clearDraft(input.slot);
    else if (command === "director.route" && okc && input.slot != null) clearDraft(input.slot);
    if (data.snapshot) { state.snap = data.snapshot; }
    if ((command === "director.route" || command === "director.ask") && input.slot) fetchDirector(input.slot);
    const sp = state.snap?.sprints.find((x) => x.slot === input.slot);
    if (sp) { fetchOutputs(sp.worktree); fetchPr(sp); }
    fetchResources(); loadAuditIfOpen();
    render(true);
  } else { toast("err", `${command.replace(/\./g, " ")} not run`, data.reason || (data.errors || []).join("; ") || data.code); }
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
document.addEventListener("click", (e) => {
  const t = (a) => e.target.closest(a);
  let n;
  // Specific actions win over container selection: a worker-dock card is a
  // [data-sel] container that WRAPS its own action buttons, so [data-sel] must
  // be the LAST fallback — otherwise every button click just selects the card.
  if ((n = t("[data-tab]"))) { state.tab = n.dataset.tab; render(true); return; }
  if ((n = t("[data-cmd]"))) { e.stopPropagation(); startCommand(n.dataset.cmd, n.dataset.slot ? { slot: Number(n.dataset.slot) } : {}); return; }
  if ((n = t("[data-end]"))) { e.stopPropagation(); showEndWork(Number(n.dataset.end)); return; }
  if (t("[data-start]")) { showStartWork(); return; }
  if ((n = t("[data-startserver]"))) { e.stopPropagation(); showStartServer(Number(n.dataset.startserver)); return; }
  if ((n = t("[data-director]"))) { const msg = document.getElementById("d-msg")?.value?.trim(); if (!msg) { toast("err", "Empty instruction"); return; } startCommand("director.route", { slot: Number(n.dataset.director), message: msg }); return; }
  if ((n = t("[data-ask]"))) { const msg = document.getElementById("d-msg")?.value?.trim(); if (!msg) { toast("err", "Empty message"); return; } startCommand("director.ask", { slot: Number(n.dataset.ask), message: msg }); return; }
  if ((n = t("[data-review]"))) { showReview(n.dataset.review); return; }
  if ((n = t("[data-prcmd]"))) { e.stopPropagation(); showOpenPr(Number(n.dataset.slot)); return; }
  if ((n = t("[data-delcmd]"))) { e.stopPropagation(); showDelete(Number(n.dataset.delcmd)); return; }
  if ((n = t("[data-prov-verify]"))) { e.stopPropagation(); verifyProviderUI(n.dataset.provVerify); return; }
  if ((n = t("[data-prov-reconnect]"))) { e.stopPropagation(); showProviderAction(n.dataset.provReconnect, "reconnect"); return; }
  if ((n = t("[data-prov-disconnect]"))) { e.stopPropagation(); showProviderAction(n.dataset.provDisconnect, "disconnect"); return; }
  if ((n = t("[data-prov-diag]"))) { e.stopPropagation(); showProviderDiagnostics(n.dataset.provDiag); return; }
  if ((n = t("[data-nav]"))) { go(n.dataset.nav); return; }
  if ((n = t("[data-route]"))) { e.preventDefault(); go(n.dataset.route); return; }
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
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn go ok">Preview →</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  ov.querySelector(".ok").onclick = () => { const ct = ov.querySelector(".f-ct").value.trim(); ov.remove(); startCommandTyped("worktree.delete", { slot, confirm_text: ct }, ct); };
  document.body.appendChild(ov);
}
$("#refresh-btn").addEventListener("click", async (ev) => { ev.target.disabled = true; const x = ev.target.textContent; ev.target.textContent = "↻ …"; await execute("runtime.refresh", {}, false); fetchResources(); ev.target.disabled = false; ev.target.textContent = x; });
window.addEventListener("hashchange", () => render(true));

// -------- data loop --------
function chrome() { $("#gen").textContent = state.snap?.generated_at ? new Date(state.snap.generated_at).toLocaleTimeString() : ""; }
let sseOk = false;
function setLive(s) { const p = $("#livepill"), l = $("#live-label"); if (s === "live") { p.classList.remove("stale"); l.textContent = "Live"; } else if (s === "polling") { p.classList.add("stale"); l.textContent = "Polling"; } else { p.classList.add("stale"); l.textContent = "Offline"; } }
function onSnap(s) { if (!s || !s.headline) return; state.snap = s; chrome(); render(); }
async function poll() { try { const r = await fetch("/api/state", { cache: "no-store" }); onSnap(await r.json()); setLive(sseOk ? "live" : "polling"); } catch { setLive("offline"); } }
function connect() { try { const es = new EventSource("/api/events"); es.addEventListener("snapshot", (ev) => { try { onSnap(JSON.parse(ev.data)); } catch {} sseOk = true; setLive("live"); }); es.addEventListener("hello", () => { sseOk = true; setLive("live"); }); es.onerror = () => { sseOk = false; }; } catch { sseOk = false; } }
if (!location.hash) location.hash = "#/command";
connect(); poll(); fetchResources();
setInterval(poll, 4000);
setInterval(fetchResources, 9000);
// Refresh the dashboard while it's the active center; pause when the tab is hidden (efficiency).
setInterval(() => { if (document.hidden) return; if (route() === "command" && state.sel == null) fetchDashboard(); }, 10000);
