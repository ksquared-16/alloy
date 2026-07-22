/*
 * Vacilando Runtime — Command Center controller (routed control plane).
 *
 * NO orchestration logic lives here. This file:
 *   - routes between surfaces (hash router; back/forward works)
 *   - renders each surface from the runtime snapshot (vacilando.snapshot.v1)
 *   - runs commands ONLY through the runtime: preview → confirm → execute →
 *     audit → refresh, via /api/commands(/preview)
 * The runtime owns truth and commands; the UI owns presentation and navigation.
 */
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const glyph = (g) => `<svg class="i"><use href="#g-${g || "compass"}"></use></svg>`;
const STATUS_ACC = { running: "var(--run)", review: "var(--review)", blocked: "var(--blocked)", complete: "var(--green-ink)", planning: "var(--plan)", paused: "var(--paused)", idle: "var(--idle)" };
function ago(ms) {
  if (!ms) return "—";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return `${s | 0}s`;
  if (s < 3600) return `${(s / 60) | 0}m`;
  if (s < 86400) return `${(s / 3600) | 0}h`;
  return `${(s / 86400) | 0}d`;
}
const shortBranch = (b, wt) => (b ? b.replace(/^agent\/[^/]+\//, "") : wt || "—");
const state = { snap: null };

// -------- routing --------
function route() { const h = location.hash.replace(/^#\/?/, "") || "command"; const [name, param] = h.split("/"); return { name, param }; }
function go(path) { location.hash = "#/" + path; }
const CRUMBS = { command: "Command Center", sprints: "Sprints", workers: "Workers", repository: "Repository", approvals: "Approvals", activity: "Activity" };
function setActiveNav(name) {
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
  $("#crumb").textContent = CRUMBS[name] || "Command Center";
}

let lastKey = null;
function renderRoute(force) {
  if (document.querySelector(".ov")) return; // never rebuild under an open dialog
  const r = route();
  const key = (state.snap?.generated_at || "") + "|" + location.hash;
  if (!force && key === lastKey) return;
  lastKey = key;
  setActiveNav(r.name);
  const s = state.snap;
  const V = $("#view");
  if (!s || !s.headline) { V.innerHTML = `<div class="empty"><div class="big">Connecting to the runtime…</div>Composing the first projection from authoritative sources.</div>`; return; }
  const view = { command: viewCommand, sprints: viewSprints, workers: viewWorkers, repository: viewRepository, approvals: viewApprovals, activity: viewActivity }[r.name] || viewCommand;
  V.innerHTML = view(s, r.param);
  if (r.name === "activity") wireActivityFilters(s);
}

// -------- shared bits --------
function metaLine(sp) {
  const bits = [];
  if (sp.stage) bits.push(`<span class="mt">${esc(sp.phase?.label || sp.stage)}</span>`);
  bits.push(`<span class="mt">upd ${ago(sp.updated_at_ms)} ago</span>`);
  bits.push(`<span class="mt mono">↑${sp.git.ahead} ↓${sp.git.behind}${sp.git.state === "dirty" ? " ·dirty" : ""}</span>`);
  if (sp.evidence_count) bits.push(`<span class="mt">ev ${sp.evidence_count}</span>`);
  if (sp.question_count) bits.push(`<span class="mt warn">${sp.question_count} question${sp.question_count > 1 ? "s" : ""}</span>`);
  return bits.join(`<span class="sep">·</span>`);
}
// One state-derived primary action per sprint (Slice 8).
function primaryAction(sp, s) {
  const degraded = Object.values(s.sources || {}).some((v) => v && v.ok === false);
  if (sp.status === "paused") return { label: "Resume", cmd: "worker.resume", input: { slot: sp.slot } };
  if (sp.question_count > 0) return { label: "Needs You", nav: "approvals" };
  if (sp.status === "review") return { label: "Review", nav: "sprints/" + sp.slot };
  if (degraded) return { label: "Inspect", nav: "sprints/" + sp.slot };
  return { label: "Open", nav: "sprints/" + sp.slot };
}
function actionBtn(a) {
  if (a.cmd) return `<button class="btn ${a.label === "Resume" ? "warn" : ""}" data-cmd="${a.cmd}" data-slot="${a.input.slot}">${esc(a.label)}</button>`;
  return `<button class="btn primary" data-nav="${a.nav}">${esc(a.label)}</button>`;
}

// ======== Command Center ========
function viewCommand(s) {
  return `<div class="viewgrid"><div>
    ${kpiStrip(s.headline)}
    <section class="card"><div class="card-h"><span class="lbl">Active Sprints</span><span class="rt">${s.sprints.length} · one action each</span></div>
      <div class="cc-sprints">${s.sprints.map((sp) => ccRow(sp, s)).join("")}</div></section>
  </div>
  <aside class="dock">
    ${attentionDock(s)}
    <section class="card"><div class="mini-h">Worker Pool</div><div class="wp">${s.workers.map(workerMini).join("")}</div></section>
    <section class="card"><div class="mini-h">Activity <span class="rt" style="text-transform:none;letter-spacing:0;font-weight:500">projected · git + audit</span></div>
      <div class="feed">${s.activity.slice(0, 6).map(feedRow).join("") || `<div class="empty">No recent activity</div>`}</div>
      <div style="padding:2px 14px 10px"><button class="btn sm" data-nav="activity">View all activity →</button></div></section>
    ${quickActions(s)}
    ${gapsBlock(s.gaps)}
  </aside></div>`;
}
function kpiStrip(h) {
  const K = (l, v, sub, cls = "") => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v ${cls.includes("flag") ? "" : ""}">${v}</div><div class="s ${sub.cls || ""}">${sub.t}</div></div>`;
  return `<div class="kpis">
    ${K("Active Sprints", h.active_sprints, { t: "on the board" })}
    ${K("Workers", `${h.workers_running.running}<small> / ${h.workers_running.total}</small>`, { t: "providers active" })}
    ${K("Questions", h.questions_pending, h.questions_pending ? { t: "needs you", cls: "warn" } : { t: "all clear", cls: "ok" }, h.questions_pending ? "flag" : "")}
    ${K("Merge-Ready", h.prs_ready, { t: "gates open" })}
    ${`<div class="kpi"><div class="l">Tests</div><div class="v sm dim">n/a</div><div class="s dim">not tracked</div></div>`}
    ${`<div class="kpi"><div class="l">Staging</div><div class="v sm ${h.staging_sync === "up_to_date" ? "ok" : ""}">${h.staging_sync === "up_to_date" ? "Up to date" : esc(h.staging_sync)}</div><div class="s">vs origin/staging</div></div>`}
  </div>`;
}
function ccRow(sp, s) {
  const a = primaryAction(sp, s);
  return `<div class="ccrow" data-detail="${sp.slot}" style="--acc:${STATUS_ACC[sp.status] || "var(--green)"}">
    <span class="gl">${glyph(sp.glyph)}</span>
    <div class="mid"><div class="t1"><span class="nm trunc">${esc(sp.title)}</span><span class="chip ${sp.status}">${esc(sp.status)}</span></div>
      <div class="t2 trunc">${metaLine(sp)}<span class="sep">·</span><span class="mt mono trunc" title="${esc(sp.branch || sp.worktree)}">${esc(shortBranch(sp.branch, sp.worktree))}</span></div></div>
    <div class="act">${actionBtn(a)}</div></div>`;
}
function workerMini(w) {
  return `<div class="r" data-detail="${w.slot}"><span class="gl">${glyph(w.glyph)}</span>
    <span><div class="nm">${esc(w.id)}</div><div class="rl trunc">${esc(w.role || w.current_sprint)}</div></span>
    <span class="hpill ${w.health}">${esc(w.health)}</span><span class="rl">${ago(w.last_activity_ms)}</span></div>`;
}
function feedRow(a) {
  return `<div class="r"><span class="k">${esc(a.kind)}</span><span class="tx"><span class="who">${esc(a.actor || "—")}</span> ${esc(a.summary)}</span></div>`;
}
function attentionDock(s) {
  const items = attentionItems(s);
  return `<div class="dock-h"><span>Needs Your Attention</span><span class="b">${s.approvals.total}</span></div>` +
    (items.length ? items.map(attCard).join("") : `<div class="empty">Nothing needs you right now.</div>`);
}
function attentionItems(s) {
  const a = s.approvals;
  return [
    ...a.questions.map((x) => ({ k: "q", ti: "Question", ctx: x.title || x.initiative_key, body: x.summary, nav: "approvals" })),
    ...a.reviews.map((x) => ({ k: "review", ti: "Review required", ctx: x.title || x.initiative_key, body: x.summary, nav: "approvals" })),
    ...a.merges.map((x) => ({ k: "merge", ti: "Merge-ready", ctx: x.title, body: x.summary, nav: "repository" })),
    ...a.promotions.map((x) => ({ k: "promotion", ti: "Promotion", ctx: x.title, body: x.summary, nav: "approvals" })),
  ];
}
function attCard(it) {
  return `<div class="att" data-nav="${it.nav}"><div class="top"><span class="sd ${it.k}"></span><span class="ti">${esc(it.ti)}</span><svg class="arw i"><use href="#i-arrow"/></svg></div>
    <div class="ctx">${esc(it.ctx || "")}</div>${it.body ? `<div class="body trunc">${esc(it.body)}</div>` : ""}</div>`;
}
function quickActions(s) {
  const rows = [
    { ic: "↻", tt: "Refresh state", ds: "Recompute from sources", cmd: "runtime.refresh" },
    { ic: "✓", tt: "Review & approve", ds: `${s.approvals.total} in queue`, nav: "approvals", cnt: s.approvals.total },
    { ic: "◧", tt: "All sprints", ds: `${s.sprints.length} active`, nav: "sprints" },
    { ic: "⎇", tt: "Repository", ds: `${s.repository.counts.dirty} dirty · ${s.repository.counts.behind} behind`, nav: "repository" },
  ];
  return `<section class="card"><div class="mini-h">Quick Actions</div><div class="qa">${rows.map((r) =>
    `<div class="r ${r.cnt ? "hot" : ""}" ${r.cmd ? `data-cmd="${r.cmd}"` : `data-nav="${r.nav}"`}><span class="ic">${r.ic}</span>
      <div><div class="tt">${esc(r.tt)}</div><div class="ds">${esc(r.ds)}</div></div>${r.cnt ? `<span class="cnt">${r.cnt}</span>` : ""}</div>`).join("")}</div></section>`;
}
function gapsBlock(gaps) {
  if (!gaps?.length) return "";
  return `<details class="gaps"><summary>Known gaps (${gaps.length})</summary><ul>${gaps.map((g) => `<li><b>${esc(g.field)}</b> — ${esc(g.reason)}</li>`).join("")}</ul></details>`;
}

// ======== Sprints ========
function viewSprints(s, param) {
  const sel = param ? Number(param) : null;
  const sp = sel ? s.sprints.find((x) => x.slot === sel) : null;
  const table = `<section class="card"><table class="tbl">
    <thead><tr><th>Sprint</th><th>Status</th><th>Provider</th><th>Stage</th><th>Updated</th><th>Ahead/Behind</th><th>Ev</th><th>Q/R</th><th></th></tr></thead>
    <tbody>${s.sprints.map((x) => `<tr class="rowclick ${x.slot === sel ? "sel" : ""}" data-detail="${x.slot}">
      <td><span class="gl">${glyph(x.glyph)}</span><b>${esc(x.title)}</b></td>
      <td><span class="chip ${x.status}">${esc(x.status)}</span></td>
      <td>${esc(x.provider)}</td>
      <td class="muted">${esc(x.phase?.label || "—")}</td>
      <td class="muted">${ago(x.updated_at_ms)} ago</td>
      <td class="abpill"><span class="up">↑${x.git.ahead}</span> <span class="dn">↓${x.git.behind}</span> ${x.git.state === "dirty" ? '<span class="dirty">•</span>' : ""}</td>
      <td class="n">${x.evidence_count}</td>
      <td class="n">${x.question_count || 0}</td>
      <td class="right">${actionBtn(primaryAction(x, s))}</td></tr>`).join("")}</tbody></table></section>`;
  return `<div class="split ${sp ? "open" : ""}"><div>${table}</div>${sp ? sprintDetail(sp, s) : ""}</div>`;
}
function sprintDetail(sp, s) {
  const worker = s.workers.find((w) => w.slot === sp.slot);
  const repo = s.repository.worktrees.find((w) => w.slot === sp.slot);
  const commits = (sp.git_recent_note ? [] : []); // commits are in activity; show per-sprint below
  const acts = s.activity.filter((a) => a.sprint === sp.key).slice(0, 5);
  const A = [
    { label: "Diagnose", cmd: "worker.doctor", slot: sp.slot },
    sp.status === "paused" ? { label: "Resume", cmd: "worker.resume", slot: sp.slot, warn: 1 } : { label: "Pause", cmd: "worker.pause", slot: sp.slot, warn: 1 },
    { label: "Refresh", cmd: "runtime.refresh" },
  ];
  const kv = (dt, dd, mono) => `<dt>${dt}</dt><dd class="${mono ? "mono" : ""}">${dd}</dd>`;
  return `<aside class="detail">
    <div class="detail-h"><span class="gl">${glyph(sp.glyph)}</span>
      <div><div class="ti">${esc(sp.title)}</div><div class="su">slot ${sp.slot} · <span class="chip ${sp.status}">${esc(sp.status)}</span></div></div>
      <button class="x" data-nav="sprints">×</button></div>
    <div class="sec"><h5>Context</h5><dl class="kv">
      ${kv("Objective", esc(sp.objective || sp.title))}
      ${kv("Provider", esc(sp.provider))}
      ${kv("Stage", esc(sp.phase?.label || "—"))}
      ${kv("Initiative", sp.initiative_key ? esc(sp.initiative_key) : '<span class="muted">— (managed sprint, no initiative)</span>')}
      ${kv("Updated", ago(sp.updated_at_ms) + " ago")}
    </dl></div>
    <div class="sec"><h5>Worktree &amp; Git</h5><dl class="kv">
      ${kv("Worktree", esc(sp.worktree), 1)}
      ${kv("Branch", esc(sp.branch || "—"), 1)}
      ${kv("Position", `<span class="abpill"><span class="up">↑${sp.git.ahead}</span> <span class="dn">↓${sp.git.behind}</span></span> · <span class="${sp.git.state === "dirty" ? "dirty" : "clean"}">${sp.git.state}</span>`)}
      ${kv("Server", esc(sp.server) + (sp.port ? ` · :${sp.port}` : ""))}
      ${repo ? kv("Merge", esc(repo.merge_readiness)) : ""}
    </dl></div>
    <div class="sec"><h5>Worker</h5><dl class="kv">
      ${worker ? kv("Identity", esc(worker.id)) : kv("Identity", "—")}
      ${worker ? kv("Health", `<span class="hpill ${worker.health}">${worker.health}</span>`) : ""}
      ${worker?.ownership?.session_id ? kv("Session", esc(worker.ownership.session_id), 1) : ""}
      ${worker?.last_commit ? kv("Last commit", `<span class="mono">${esc(worker.last_commit.short)}</span> ${esc(worker.last_commit.subject)}`) : ""}
    </dl></div>
    ${acts.length ? `<div class="sec"><h5>Recent Activity</h5>${acts.map((a) => `<div class="commit"><span class="sh">${esc(a.detail?.short || a.kind)}</span><span class="trunc">${esc(a.summary)}</span></div>`).join("")}</div>` : ""}
    ${sp.questions?.length ? `<div class="sec"><h5>Open Decisions</h5>${sp.questions.map((q) => `<div class="commit"><span class="trunc">${esc(q.question)}</span></div>`).join("")}</div>` : ""}
    <div class="sec"><h5>Actions</h5><div class="detail-actions">${A.map((a) => `<button class="btn ${a.warn ? "warn" : ""}" data-cmd="${a.cmd}" ${a.slot ? `data-slot="${a.slot}"` : ""}>${esc(a.label)}</button>`).join("")}</div>
      <div class="muted" style="font-size:11px;padding:0 0 4px">Start · Finish · Promote · Merge are not exposed — no governed toolkit command exists (see Repository / Approvals).</div></div>
  </aside>`;
}

// ======== Workers ========
function viewWorkers(s) {
  return `<section class="card"><table class="tbl">
    <thead><tr><th>Slot</th><th>Provider</th><th>Role</th><th>Sprint</th><th>Health</th><th>Last activity</th><th>Session</th><th>Actions</th></tr></thead>
    <tbody>${s.workers.map((w) => {
      const sp = s.sprints.find((x) => x.slot === w.slot);
      const paused = sp && sp.status === "paused";
      return `<tr><td class="n">${w.slot}</td><td><span class="gl">${glyph(w.glyph)}</span>${esc(w.provider)}</td>
        <td class="muted trunc" style="max-width:150px">${esc(w.role || "—")}</td>
        <td class="trunc" style="max-width:180px"><a data-detail="${w.slot}" style="color:var(--terra);cursor:pointer">${esc(w.current_sprint)}</a></td>
        <td><span class="hpill ${w.health}">${esc(w.health)}</span></td>
        <td class="muted">${ago(w.last_activity_ms)} ago</td>
        <td class="mono muted trunc" style="max-width:130px" title="${esc(w.ownership?.session_id || "")}">${esc(w.ownership?.session_id ? w.ownership.session_id.slice(0, 8) + "…" : "—")}</td>
        <td><div style="display:flex;gap:6px">
          <button class="btn sm" data-cmd="worker.doctor" data-slot="${w.slot}">Diagnose</button>
          ${paused ? `<button class="btn sm warn" data-cmd="worker.resume" data-slot="${w.slot}">Resume</button>` : `<button class="btn sm warn" data-cmd="worker.pause" data-slot="${w.slot}">Pause</button>`}
          <button class="btn sm" data-detail="${w.slot}">Inspect</button></div></td></tr>`;
    }).join("")}</tbody></table></section>
    <div class="muted" style="font-size:11.5px;margin-top:10px">Diagnose is read-only. Pause/Resume run through preview → confirmation → audit. One command path — the same runtime as the Command Center.</div>`;
}

// ======== Repository ========
function viewRepository(s) {
  const r = s.repository;
  const READ = { ready: "clean", merged: "clean", changes_required: "dirty", behind_staging: "dirty", in_progress: "", unreviewed: "", clean: "clean" };
  return `<div style="display:flex;gap:10px;align-items:baseline;margin-bottom:12px">
      <div class="section-title" style="margin:0">Staging baseline</div>
      <div class="mono" style="font-size:13px">${esc(r.base_ref)} @ ${esc(r.base_sha || "—")}</div>
      <div class="muted" style="font-size:12px">· ${r.counts.dirty} dirty · ${r.counts.behind} behind · ${r.counts.drift} branch-drift</div></div>
    <section class="card"><table class="tbl">
    <thead><tr><th>Slot</th><th>Owner</th><th>Branch</th><th>State</th><th>Ahead/Behind</th><th>Merge readiness</th></tr></thead>
    <tbody>${r.worktrees.map((w) => {
      const owner = s.sprints.find((x) => x.slot === w.slot);
      return `<tr><td class="n">${w.slot}</td>
        <td class="trunc" style="max-width:190px">${esc(owner?.title || w.worktree)}</td>
        <td class="mono trunc" style="max-width:230px" title="${esc(w.branch || "")}">${esc(shortBranch(w.branch, w.worktree))}</td>
        <td class="${w.dirty ? "dirty" : "clean"}">${w.dirty ? "dirty" : "clean"}${w.branch_drift ? ' · <span class="dirty">drift</span>' : ""}</td>
        <td class="abpill"><span class="up">↑${w.ahead}</span> <span class="dn">↓${w.behind}</span></td>
        <td class="muted">${esc(w.merge_readiness)}${w.pr ? "" : ' · <span class="muted">no PR tracked</span>'}</td></tr>`;
    }).join("")}</tbody></table></section>
    <div class="unsupbox" style="margin-top:14px"><div class="section-title">Not available (observational surface)</div>
      <div class="u"><span class="k">promote / push / merge</span><span class="why">The toolkit PRINTS push/PR commands but never executes them — there is no governed, previewable promotion command. Landing happens through human PR review into staging. Release is never auto-approved.</span></div>
      <div class="u"><span class="k">worktree.delete</span><span class="why">Destructive git is out of Phase 1 policy; requires explicit human action.</span></div>
    </div>${gapsBlock((s.gaps || []).filter((g) => g.field.startsWith("repository")))}`;
}

// ======== Approvals ========
function viewApprovals(s) {
  const a = s.approvals;
  const section = (title, count, body) => `<div class="appr-sec"><div class="h"><span class="t">${title}</span><span class="c">${count}</span></div>${body}</div>`;
  const questions = a.questions.length ? a.questions.map(qCard).join("") : emptyState("No open questions", "When a sprint raises a decision, it appears here to answer.");
  const reviews = a.reviews.length ? a.reviews.map((r) => `<div class="qcard"><div class="q">${esc(r.summary)}</div><div class="why">Awaiting review. Resolve through the toolkit review pipeline — Vacilando does not yet expose a governed review-resolve command.</div><div class="src">${esc(r.source || "")}</div></div>`).join("") : emptyState("No reviews pending", "");
  const confirms = `<div class="qcard"><div class="q">Consequential commands require confirmation</div><div class="why">Pause / Resume / Answer preview the exact effect and authoritative target, then require an explicit Confirm before executing. Release, promotion, and merge are never auto-approved.</div></div>`;
  const unsup = `<div class="unsupbox">
      <div class="u"><span class="k">promotion / merge / push</span><span class="why">Not executable — the toolkit prints but never runs them; human PR review only.</span></div>
      <div class="u"><span class="k">worktree.delete</span><span class="why">Destructive; out of Phase 1 policy.</span></div></div>`;
  return section("Open Questions", a.counts.questions, questions) +
    section("Reviews Required", a.counts.reviews, reviews) +
    section("Consequential Confirmations", "policy", confirms) +
    section("Unsupported (promotion / merge)", a.counts.merges + a.counts.promotions, unsup);
}
function qCard(q) {
  return `<div class="qcard"><div class="q">${esc(q.summary)}</div>${q.why_it_matters ? `<div class="why">${esc(q.why_it_matters)}</div>` : ""}
    <div class="src">${esc(q.initiative_key || "")}${q.id ? " · " + esc(q.id) : ""}</div>
    <div class="opts"><button class="btn go" data-answer="${esc(q.initiative_key)}/${esc(q.id)}">Answer…</button>
      ${(q.options || []).map((o) => `<span class="chip idle">${esc(o)}</span>`).join("")}</div></div>`;
}
function emptyState(big, sub) { return `<div class="empty"><div class="big">${esc(big)}</div>${esc(sub)}</div>`; }

// ======== Activity ========
const actFilter = { sprint: "", worker: "", kind: "" };
function viewActivity(s) {
  const sprints = [...new Set(s.activity.map((a) => a.sprint).filter(Boolean))];
  const kinds = [...new Set(s.activity.map((a) => a.kind))];
  const workers = [...new Set(s.workers.map((w) => w.provider))];
  const opt = (v, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(v || "all")}</option>`;
  const rows = s.activity.filter((a) =>
    (!actFilter.sprint || a.sprint === actFilter.sprint) &&
    (!actFilter.kind || a.kind === actFilter.kind) &&
    (!actFilter.worker || a.actor === actFilter.worker));
  return `<div class="filters">
      <select id="f-sprint"><option value="">all sprints</option>${sprints.map((v) => opt(v, actFilter.sprint)).join("")}</select>
      <select id="f-worker"><option value="">all workers</option>${workers.map((v) => opt(v, actFilter.worker)).join("")}</select>
      <select id="f-kind"><option value="">all kinds</option>${kinds.map((v) => opt(v, actFilter.kind)).join("")}</select></div>
    <section class="card"><div class="feed" style="padding:6px 10px 12px">${rows.length ? rows.map((a) =>
      `<div class="r"><span class="k">${esc(a.kind)}</span><span class="tx"><span class="who">${esc(a.actor || "—")}</span> ${esc(a.summary)}
        <span class="muted" style="font-size:10.5px"> · ${esc(a.sprint || "")} · <span class="mono">${esc(a.source)}</span></span></span></div>`).join("")
      : emptyState("No matching activity", "")}</div></section>
    <div class="muted" style="font-size:11.5px;margin-top:10px">Provenance is honest: commits come from read-only <span class="mono">git log</span>, timestamps from <span class="mono">worker-detail</span>, and command records from the execution audit. This is a projected feed, not a durable event ledger.</div>`;
}
function wireActivityFilters(s) {
  const bind = (id, key) => { const e = $("#" + id); if (e) e.onchange = () => { actFilter[key] = e.value; renderRoute(true); }; };
  bind("f-sprint", "sprint"); bind("f-worker", "worker"); bind("f-kind", "kind");
}

// -------- command runtime: preview → confirm → execute → audit → refresh --------
async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
async function startCommand(command, input) {
  const { data: pv } = await api("/api/commands/preview", { command, input });
  if (!pv.ok) { toast("err", `Can't ${command}`, pv.reason || (pv.errors || []).join("; ") || pv.code); return; }
  if (!pv.requires_confirmation) return execute(command, input, false);
  showConfirm(pv, () => execute(command, input, true));
}
async function execute(command, input, confirm) {
  const { data } = await api("/api/commands", { command, input, confirm, actor: "operator" });
  if (data.stage === "execute") {
    const okc = data.result ? (data.result.exit === undefined || data.result.exit === 0) : data.ok;
    const msg = data.result?.kind === "cli" ? (data.result.stdout || data.result.stderr || "") : "done";
    toast(okc ? "ok" : "err", `${command} ${okc ? "done" : "failed"}`, String(msg).split("\n").slice(0, 3).join("\n"));
    if (data.snapshot) { state.snap = data.snapshot; renderRoute(true); }
  } else {
    toast("err", `${command} not run`, data.reason || (data.errors || []).join("; ") || data.code);
  }
}
function showConfirm(pv, onConfirm) {
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>${esc(pv.title || pv.command)}</h3><span class="risk ${pv.risk || "low"}">${esc(pv.risk || "low")}</span>
    <div class="b">${esc(pv.preview?.summary || "")}${pv.target ? `<div class="tgt">▸ ${esc(pv.target.label || "")}</div>` : ""}
      ${pv.preview?.effects?.length ? `<ul>${pv.preview.effects.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
      ${pv.will_run?.bin ? `<div class="willrun">runs: ${esc(pv.will_run.bin)} ${esc((pv.will_run.args || []).join(" "))}</div>` : ""}</div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn ${pv.risk === "consequential" ? "go" : "primary"} ok">Confirm</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); renderRoute(true); };
  ov.querySelector(".ok").onclick = () => { ov.remove(); onConfirm(); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); renderRoute(true); } });
  document.body.appendChild(ov);
}
// Answer form for a real open question (choice + rationale) → preview → confirm → execute.
function showAnswerForm(initiative_key, decision_id) {
  const q = (state.snap?.approvals?.questions || []).find((x) => x.initiative_key === initiative_key && x.id === decision_id);
  if (!q) { toast("err", "No open question", "It may have been resolved."); renderRoute(true); return; }
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>Answer: ${esc(q.summary)}</h3><span class="risk consequential">consequential</span>
    <div class="b">${esc(q.why_it_matters || "")}
      <label>Choice</label><select class="f-choice">${(q.options || []).map((o) => `<option>${esc(o)}</option>`).join("") || '<option value="">(free text)</option>'}</select>
      <label>Decided by</label><input class="f-by" value="Kelly">
      <label>Reason</label><input class="f-reason" placeholder="rationale">
    </div><div class="foot"><button class="btn cancel">Cancel</button><button class="btn go ok">Preview →</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); renderRoute(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); renderRoute(true); } });
  ov.querySelector(".ok").onclick = async () => {
    const input = { initiative_key, decision_id, choice: ov.querySelector(".f-choice").value, decided_by: ov.querySelector(".f-by").value, reason: ov.querySelector(".f-reason").value };
    ov.remove();
    await startCommand("question.answer", input);
  };
  document.body.appendChild(ov);
}
let toastTimer = null;
function toast(kind, title, msg) {
  document.querySelector(".toast")?.remove();
  const t = el("div", `toast ${kind}`, `${esc(title)}${msg ? `<div class="m">${esc(String(msg))}</div>` : ""}`);
  document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 6000);
}

// -------- global click delegation (robust to re-renders) --------
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]"); if (nav) { go(nav.dataset.nav); return; }
  const det = e.target.closest("[data-detail]"); if (det) { go("sprints/" + det.dataset.detail); return; }
  const cmd = e.target.closest("[data-cmd]"); if (cmd) { e.stopPropagation(); startCommand(cmd.dataset.cmd, cmd.dataset.slot ? { slot: Number(cmd.dataset.slot) } : {}); return; }
  const ans = e.target.closest("[data-answer]"); if (ans) { const [k, id] = ans.dataset.answer.split("/"); showAnswerForm(k, id); return; }
  const rt = e.target.closest("[data-route]"); if (rt) { e.preventDefault(); go(rt.dataset.route); return; }
});
$("#refresh-btn").addEventListener("click", async (ev) => {
  ev.target.disabled = true; const t = ev.target.textContent; ev.target.textContent = "↻ …";
  await execute("runtime.refresh", {}, false);
  ev.target.disabled = false; ev.target.textContent = t;
});
window.addEventListener("hashchange", () => renderRoute(true));

// -------- data: SSE liveness + polling backbone --------
function updateChrome(s) {
  $("#nb-sprints").textContent = s.sprints.length;
  $("#nb-workers").textContent = s.workers.length;
  $("#nb-approvals").textContent = s.approvals.total;
  $("#gen").textContent = s.generated_at ? new Date(s.generated_at).toLocaleTimeString() : "";
}
let sseOk = false;
function setLive(st) { const p = $("#livepill"), l = $("#live-label"); if (st === "live") { p.classList.remove("stale"); l.textContent = "Live"; } else if (st === "polling") { p.classList.add("stale"); l.textContent = "Polling"; } else { p.classList.add("stale"); l.textContent = "Offline"; } }
function onSnap(s) { if (!s || !s.headline) return; state.snap = s; updateChrome(s); renderRoute(); }
async function poll() { try { const r = await fetch("/api/state", { cache: "no-store" }); onSnap(await r.json()); setLive(sseOk ? "live" : "polling"); } catch { setLive("offline"); } }
function connect() {
  try { const es = new EventSource("/api/events");
    es.addEventListener("snapshot", (ev) => { try { onSnap(JSON.parse(ev.data)); } catch {} sseOk = true; setLive("live"); });
    es.addEventListener("hello", () => { sseOk = true; setLive("live"); });
    es.onerror = () => { sseOk = false; };
  } catch { sseOk = false; }
}
if (!location.hash) location.hash = "#/command";
connect();
poll();
setInterval(poll, 4000);
