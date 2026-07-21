/*
 * Vacilando Runtime — Command Center controller.
 *
 * This file contains NO business logic. It binds UI to the runtime snapshot:
 * connect to /api/events (SSE), render each region from the projection, and
 * fall back to /api/state if the stream is unavailable. Every value shown is a
 * field the runtime already computed. The dashboard owns presentation; the
 * runtime owns orchestration.
 */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const glyph = (g) => `<svg class="i"><use href="#g-${g || "compass"}"></use></svg>`;
const STATUS_ACC = { running: "var(--run)", review: "var(--review)", blocked: "var(--blocked)", complete: "var(--green-ink)", planning: "var(--plan)", paused: "var(--paused)", idle: "var(--idle)" };

function ago(ms) {
  if (!ms) return "—";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return `${s | 0}s ago`;
  if (s < 3600) return `${(s / 60) | 0}m ago`;
  if (s < 86400) return `${(s / 3600) | 0}h ago`;
  return `${(s / 86400) | 0}d ago`;
}

function render(s) {
  if (!s || !s.headline) return;
  // header
  $("project-name").textContent = "Vacilando Runtime";
  $("project-sub").textContent = `— ${s.project?.name || "Alloy"} · Engineering Runtime`;
  $("project-switch").textContent = s.project?.name || "Alloy";
  $("generated-at").textContent = s.generated_at ? `snapshot ${new Date(s.generated_at).toLocaleTimeString()}` : "";
  $("nav-sprints").textContent = s.sprints.length;
  $("nav-workers").textContent = s.workers.length;
  $("nav-approvals").textContent = s.approvals.total;

  renderTiles(s.headline);
  renderSprints(s.sprints);
  renderWorkers(s.workers);
  renderActivity(s.activity);
  renderAttention(s.approvals);
  renderGaps(s.gaps);
}

function tile(label, big, sub, opts = {}) {
  const cls = "tile" + (opts.flag ? " flag" : "");
  const subCls = "sub" + (opts.warn ? " warn" : opts.ok ? " ok" : "");
  return `<div class="${cls}"><div class="tl">${esc(label)}</div><div class="big ${opts.small ? "small" : ""}">${big}</div>` +
    (sub ? `<div class="${subCls}">${sub}</div>` : "") + `</div>`;
}
function renderTiles(h) {
  const t = [];
  t.push(tile("Active Sprints", h.active_sprints, "on the board"));
  t.push(tile("Workers Running", `${h.workers_running.running}<span class="of"> / ${h.workers_running.total}</span>`, "providers active"));
  t.push(tile("Questions Pending", h.questions_pending, h.questions_pending ? "needs you" : "all clear", { flag: h.questions_pending > 0, warn: h.questions_pending > 0, ok: h.questions_pending === 0 }));
  t.push(tile("Merge-Ready", h.prs_ready, "gates open"));
  t.push(tile("Tests Passing", `<span class="gapmark">n/a</span>`, `<span class="gapmark">not tracked</span>`, { small: true }));
  t.push(tile("Staging Sync", h.staging_sync === "up_to_date" ? "Up to date" : h.staging_sync, "vs origin/staging", { small: true, ok: h.staging_sync === "up_to_date" }));
  $("tiles").innerHTML = t.join("");
}

function renderSprints(sprints) {
  $("sprints-rt").textContent = `${sprints.length} sprints · projected from the six live slots`;
  const box = $("sprints");
  box.innerHTML = "";
  for (const sp of sprints) {
    const acc = STATUS_ACC[sp.status] || "var(--green)";
    const row = el("div", "srow");
    row.style.setProperty("--acc", acc);
    const prog = sp.progress.value === null
      ? `<div class="prog"><div class="bar"></div></div><div class="pct gap" title="${esc(sp.progress.note || "no progress source")}">—</div>`
      : `<div class="prog"><div class="bar"><i style="width:${sp.progress.value}%"></i></div></div><div class="pct">${sp.progress.value}%</div>`;
    row.innerHTML =
      `<div class="sp-main"><div class="sp-ic">${glyph(sp.glyph)}</div><div class="sp-tt">` +
        `<div class="t"><span class="name">${esc(sp.title)}</span><span class="chip ${sp.status}">${esc(sp.status)}</span></div>` +
        `<div class="m">slot ${sp.slot} · ${esc(sp.phase.label)}${sp.initiative_key ? " · " + esc(sp.initiative_key) : ""} · updated ${ago(sp.updated_at_ms)}</div>` +
      `</div></div>` +
      prog +
      `<div class="wk"><div class="w">${esc(sp.provider)}</div><div class="s">${sp.question_count ? "⚠ " + sp.question_count + " question(s)" : "evidence: " + sp.evidence_count}</div></div>` +
      `<div class="meta-c"><b>${esc(sp.branch ? sp.branch.replace(/^agent\/[^/]+\//, "") : sp.worktree)}</b>` +
        `<span class="u">git ${sp.git.state} · ↑${sp.git.ahead} ↓${sp.git.behind}</span></div>` +
      `<div class="kebab">⋯</div>`;
    box.appendChild(row);
  }
}

function renderWorkers(workers) {
  const box = $("workers");
  box.innerHTML = "";
  for (const w of workers) {
    box.appendChild(el("div", "r",
      `<span class="ic">${glyph(w.glyph)}</span>` +
      `<span><div class="nm">${esc(w.id)}</div><div class="role">${esc(w.role || w.current_sprint)}</div></span>` +
      `<span class="hpill ${w.health}">${esc(w.health)}</span>` +
      `<span class="role">${ago(w.last_activity_ms)}</span>`));
  }
}

function renderActivity(activity) {
  const box = $("activity");
  box.innerHTML = "";
  if (!activity.length) { box.appendChild(el("div", "empty", "No recent activity")); return; }
  for (const a of activity) {
    box.appendChild(el("div", "r",
      `<span class="k">${esc(a.kind)}</span>` +
      `<span class="tx"><span class="who">${esc(a.actor || "—")}</span> ${esc(a.summary)}</span>`));
  }
}

function renderAttention(approvals) {
  $("attention-count").textContent = approvals.total;
  const box = $("attention");
  box.innerHTML = "";
  const items = [
    ...approvals.questions.map((x) => ({ ...x, k: "q", ti: "Question" })),
    ...approvals.reviews.map((x) => ({ ...x, k: "review", ti: "Review required" })),
    ...approvals.merges.map((x) => ({ ...x, k: "merge", ti: "Merge approval" })),
    ...approvals.promotions.map((x) => ({ ...x, k: "promotion", ti: "Promotion approval" })),
  ];
  if (!items.length) { box.appendChild(el("div", "empty", "Nothing needs you right now.")); return; }
  for (const it of items) {
    box.appendChild(el("div", "att",
      `<div class="top"><span class="sd ${it.k}"></span><span class="ti">${esc(it.ti)}</span></div>` +
      `<div class="ctx">${esc(it.title || it.initiative_key)}</div>` +
      (it.summary ? `<div class="body">${esc(it.summary)}</div>` : "") +
      `<div class="src">${esc(it.source || "")}</div>`));
  }
}

function renderGaps(gaps) {
  const box = $("gaps");
  box.innerHTML = "";
  for (const g of gaps) box.appendChild(el("li", null, `<b>${esc(g.field)}</b> — ${esc(g.reason)}`));
  $("gaps-wrap").style.display = gaps.length ? "" : "none";
}

// ---- connection: SSE for liveness, polling as the reliable backbone ----
let sseOk = false;
function setLive(state) {
  const pill = $("livepill"), label = $("live-label");
  if (state === "live") { pill.classList.remove("stale"); label.textContent = "Live"; }
  else if (state === "polling") { pill.classList.add("stale"); label.textContent = "Polling"; }
  else { pill.classList.add("stale"); label.textContent = "Offline"; }
}
async function poll() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    render(await r.json()); // render() ignores frames with no headline, keeping last-good
    setLive(sseOk ? "live" : "polling");
  } catch { setLive("offline"); }
}
function connect() {
  try {
    const es = new EventSource("/api/events");
    es.addEventListener("snapshot", (ev) => { try { render(JSON.parse(ev.data)); } catch {} sseOk = true; setLive("live"); });
    es.addEventListener("hello", () => { sseOk = true; setLive("live"); });
    es.onerror = () => { sseOk = false; };
  } catch { sseOk = false; }
}
connect();
poll();
setInterval(poll, 4000); // always-on: guarantees refresh even if SSE is silent
