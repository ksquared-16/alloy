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

const state = { snap: null, res: null, sel: null, tab: "overview", outputs: {}, director: {} };

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
  V.innerHTML = ({ command: viewCommand, history: viewHistory, policies: viewPolicies, settings: viewSettings }[r.name] || viewCommand)();
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

      <div class="dsec"><div class="dsh">Provider usage</div>${(d.providers?.providers || []).length ? (d.providers.providers).map((p) => `
        <div class="prov"><div class="prov-h"><b>${esc(p.provider)}</b> <span class="hpill ${p.auth_state === "authenticated" ? "healthy" : p.auth_state === "needs_auth" ? "attention" : "finished"}">${esc(p.auth_state)}</span></div>
          <div class="prov-m">${p.calls} calls · ${p.calls_today} today · ${p.input_tokens}→${p.output_tokens} tok · ${p.avg_duration_ms != null ? (p.avg_duration_ms / 1000).toFixed(1) + "s avg" : "—"} · ${p.failures} fail</div>
          <div class="prov-c">cost: ${p.cost.kind === "authoritative" ? `$${p.cost.value_usd} (authoritative)` : p.cost.kind === "estimate" ? `~$${p.cost.value_usd} (estimate)` : "unavailable"}</div></div>`).join("") : `<div class="muted">No provider round-trips yet. Use a worker's Director tab.</div>`}
        <div class="muted src">${esc(d.providers?.cost_note || "")}</div></div>
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

function tabDirector(sp) {
  const log = state.director[sp.slot];
  if (log === undefined) { fetchDirector(sp.slot); }
  const items = log || [];
  const msg = (m) => {
    if (m.delivery === "provider-round-trip") {
      return `<div class="dmsg ask"><div class="dm-h"><span class="who">You → ${esc(m.provider || "")} · slot ${m.slot}</span><span class="dt">${m.occurred_at ? new Date(m.occurred_at).toLocaleString() : ""}</span></div>
        <div class="dm-b">${esc(m.message)}</div>
        <div class="dm-resp ${m.response_ok ? "ok" : "err"}"><b>${esc(m.provider || "provider")}:</b> ${esc(m.response || m.response_error || "(no response)")}</div>
        <div class="dm-f">round-trip${m.usage ? ` · ${m.usage.input_tokens ?? "?"}→${m.usage.output_tokens ?? "?"} tok${m.usage.cost_usd != null ? ` · $${m.usage.cost_usd}` : ""}` : ""}${m.duration_ms ? ` · ${(m.duration_ms / 1000).toFixed(1)}s` : ""}</div></div>`;
    }
    return `<div class="dmsg"><div class="dm-h"><span class="who">Director → slot ${m.slot}</span><span class="dt">${m.occurred_at ? new Date(m.occurred_at).toLocaleString() : ""}</span></div><div class="dm-b">${esc(m.message)}</div><div class="dm-f">${esc(m.delivery)}${m.clipboard_ok ? " · copied ✓" : ""}</div></div>`;
  };
  return `<div class="director">
    <div class="dintro"><b>Ask</b> sends a real governed round-trip to <b>${esc(sp.provider)}</b> (headless, worktree context) and shows the reply. <b>Route</b> records the instruction and copies it to your clipboard to paste into the live editor. Injecting into the running editor buffer is not available.</div>
    <div class="dlog">${items.length ? items.map(msg).join("") : `<div class="empty">No interactions yet.</div>`}</div>
    <div class="dcompose"><textarea id="d-msg" placeholder="e.g. Summarize your latest change and list any blockers. Do not modify files."></textarea>
      <div class="drow"><span class="muted" style="font-size:11px">preview → confirm → ${sp.provider} responds (may incur cost)</span>
        <div style="display:flex;gap:7px"><button class="btn" data-director="${sp.slot}">Route (clipboard)</button><button class="btn go" data-ask="${sp.slot}">Ask ${esc(sp.provider)} →</button></div></div></div>
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
function viewSettings() {
  if (!state._cmds) { fetchCommands(); return `<div class="muted" style="padding:14px">Loading…</div>`; }
  const sup = state._cmds.filter((c) => c.supported), un = state._cmds.filter((c) => !c.supported);
  return `<div class="cols2">
    <div class="sec"><h5>Governed capabilities (wired)</h5>${sup.map((c) => `<div class="capline"><span class="mono">${esc(c.key)}</span><span class="chip ${c.risk === "consequential" ? "review" : "complete"}">${esc(c.risk)}</span></div>`).join("")}</div>
    <div class="sec"><h5>Not available (honest gaps)</h5>${un.map((c) => `<div class="capline unsup"><span class="mono">${esc(c.key)}</span></div><div class="why">${esc(c.reason)}</div>`).join("")}
      <div class="why" style="margin-top:8px"><b>Message injection:</b> no governed way to send text into a live Claude/Cursor session — Director routes via clipboard + manual paste.</div>
      <div class="why"><b>Provider cost/tokens:</b> no usage source on staging (needs headless <span class="mono">claude -p</span> usage JSON).</div>
    </div>
    <div class="sec span2"><h5>Identity &amp; scope</h5><div class="muted">Loopback-only control plane · read-only projections + governed commands · warm Vacilando identity. No remote, mobile, notifications, autonomous answers, promotion, or merge.</div></div>
  </div>`;
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
