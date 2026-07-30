/**
 * Vacilando Mission Control UI — GATED OFF by default (P0 2026-07-30).
 *
 * Root cause of freeze (commit 5fa156fd2): a MutationObserver on #view re-entered
 * paintV2() whenever loading HTML lacked `.mc-wrap`, creating an infinite
 * main-thread DOM rewrite loop (page painted, clicks dead).
 *
 * Enable only for recovery validation after the loop is fixed:
 *   localStorage.setItem('vacilando_mission_control', '1'); location.reload();
 * Disable:
 *   localStorage.removeItem('vacilando_mission_control'); location.reload();
 *
 * Or: http://127.0.0.1:3021/?mc=1#/missions
 *
 * V2 runtime APIs (/api/v2/*) remain available regardless of this gate.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const enabled = params.get("mc") === "1"
    || (typeof localStorage !== "undefined" && localStorage.getItem("vacilando_mission_control") === "1");

  window.VacilandoV2 = window.VacilandoV2 || {
    enabled: false,
    gated: true,
    reason: "Mission Control UI gated off after P0 interactivity regression (MutationObserver paint loop).",
  };

  if (!enabled) {
    // Do not rewrite nav, do not observe DOM, do not force #/missions.
    return;
  }

  window.VacilandoV2.enabled = true;
  window.VacilandoV2.gated = false;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const get = async (p) => { const r = await fetch(p); return r.json(); };
  const api = async (p, b) => {
    const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) });
    return { status: r.status, data: await r.json() };
  };

  const V2 = window.VacilandoV2;
  V2.state = V2.state || {};
  let paintScheduled = false;
  let observerPaused = false;

  function schedulePaint() {
    if (paintScheduled) return;
    paintScheduled = true;
    queueMicrotask(() => {
      paintScheduled = false;
      if (typeof window.render === "function") window.render(true);
    });
  }

  V2.fetchMissions = async () => {
    try {
      V2.state.missions = await get("/api/v2/missions");
      schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchMission = async (id) => {
    try {
      V2.state.detail = await get("/api/v2/mission?id=" + encodeURIComponent(id));
      schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchWorkers = async () => {
    try {
      V2.state.workers = await get("/api/v2/workers");
      schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchDecisions = async () => {
    try {
      V2.state.decisions = await get("/api/v2/decisions?status=open");
      schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchEvidence = async (missionId) => {
    try {
      const q = missionId ? "?mission_id=" + encodeURIComponent(missionId) : "";
      V2.state.evidence = await get("/api/v2/evidence" + q);
      schedulePaint();
    } catch { /* keep */ }
  };

  // Minimal views — only used when gated ON and app.js routes to V2 names.
  V2.viewMissions = function () {
    if (!V2.state.missions) {
      V2.fetchMissions();
      return `<div class="mc-wrap"><div class="empty"><div class="big"><span class="spin"></span> Loading missions…</div></div></div>`;
    }
    const rows = V2.state.missions.missions || [];
    const cards = rows.map((m) =>
      `<div class="mc-card" data-nav="missions/${esc(m.mission_id)}"><b>${esc(m.title)}</b> · ${esc(m.status_label || m.status)}</div>`
    ).join("") || `<div class="rempty">No missions</div>`;
    return `<div class="mc-wrap"><div class="mc-hero"><h2>Missions</h2>
      <button class="btn sm" data-nav="command">Back to Command Center</button></div>
      <div class="mc-list">${cards}</div></div>`;
  };
  V2.viewMissionDetail = function (id) {
    if (!V2.state.detail || V2.state.detail.mission_id !== id) {
      V2.fetchMission(id);
      return `<div class="mc-wrap"><div class="empty"><div class="big"><span class="spin"></span> Opening…</div></div></div>`;
    }
    const d = V2.state.detail;
    return `<div class="mc-wrap"><button class="btn sm" data-nav="missions">← Missions</button>
      <h2>${esc(d.brief?.title || id)}</h2>
      <pre class="mono" style="white-space:pre-wrap;font-size:12px">${esc(JSON.stringify(d.summary?.answers || d.summary || {}, null, 2))}</pre></div>`;
  };
  V2.viewTimeline = function () {
    return `<div class="mc-wrap"><h2>Timeline</h2><p class="muted">Opt-in Mission Control (gated).</p><button class="btn sm" data-nav="command">Command Center</button></div>`;
  };
  V2.viewWorkers = function () {
    if (!V2.state.workers) { V2.fetchWorkers(); return `<div class="mc-wrap"><div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    const rows = (V2.state.workers.workers || []).map((w) =>
      `<div class="mc-card"><b>${esc(w.workerId)}</b> · ${esc(w.status)}</div>`).join("") || `<div class="rempty">No workers</div>`;
    return `<div class="mc-wrap"><h2>Workers</h2>${rows}</div>`;
  };
  V2.viewDecisions = function () {
    if (!V2.state.decisions) { V2.fetchDecisions(); return `<div class="mc-wrap"><div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    const rows = (V2.state.decisions.decisions || []).map((d) =>
      `<div class="mc-card"><b>${esc(d.title)}</b></div>`).join("") || `<div class="rempty">No open decisions</div>`;
    return `<div class="mc-wrap"><h2>Decisions</h2>${rows}</div>`;
  };
  V2.viewEvidence = function () {
    if (!V2.state.evidence) { V2.fetchEvidence(); return `<div class="mc-wrap"><div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    return `<div class="mc-wrap"><h2>Evidence</h2><pre class="mono" style="font-size:11px">${esc(JSON.stringify(V2.state.evidence, null, 2).slice(0, 4000))}</pre></div>`;
  };

  // Optional: append Mission Control link without replacing legacy nav.
  function ensureNavLink() {
    const nav = document.getElementById("nav");
    if (!nav || nav.querySelector("[data-route=missions]")) return;
    const a = document.createElement("a");
    a.dataset.route = "missions";
    a.innerHTML = `<svg class="ico"><use href="#i-sprints"/></svg>Missions <span class="muted">(opt-in)</span>`;
    nav.insertBefore(a, nav.firstChild);
  }

  // NO MutationObserver — that was the freeze. App.js render owns #view.
  document.addEventListener("DOMContentLoaded", ensureNavLink);
  if (document.readyState !== "loading") ensureNavLink();
})();
