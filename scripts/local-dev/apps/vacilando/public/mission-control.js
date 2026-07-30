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
 * No MutationObserver — app.js render owns #view.
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
    return;
  }

  window.VacilandoV2.enabled = true;
  window.VacilandoV2.gated = false;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const get = async (p) => { const r = await fetch(p); return r.json(); };

  const V2 = window.VacilandoV2;
  V2.state = V2.state || {};
  let paintScheduled = false;

  function schedulePaint() {
    if (paintScheduled) return;
    paintScheduled = true;
    queueMicrotask(() => {
      paintScheduled = false;
      if (typeof window.render === "function") window.render(true);
    });
  }

  V2.fetchMissions = async () => {
    try { V2.state.missions = await get("/api/v2/missions"); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchMission = async (id) => {
    try { V2.state.detail = await get("/api/v2/mission?id=" + encodeURIComponent(id)); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchWorkers = async () => {
    try { V2.state.workers = await get("/api/v2/workers"); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchDecisions = async () => {
    try { V2.state.decisions = await get("/api/v2/decisions?status=open"); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchAllDecisions = async () => {
    try { V2.state.allDecisions = await get("/api/v2/decisions"); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchEvidence = async (missionId) => {
    try {
      const q = missionId ? "?mission_id=" + encodeURIComponent(missionId) : "";
      V2.state.evidence = await get("/api/v2/evidence" + q);
      schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchKickoff = async (id) => {
    try { V2.state.kickoff = await get("/api/v2/mission/kickoff?id=" + encodeURIComponent(id)); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchTimeline = async (id) => {
    try { V2.state.timeline = await get("/api/v2/mission/timeline?id=" + encodeURIComponent(id)); schedulePaint(); } catch { /* keep */ }
  };

  V2.viewMissions = function () {
    if (!V2.state.missions) {
      V2.fetchMissions();
      return `<div class="mc-wrap"><div class="empty"><div class="big"><span class="spin"></span> Loading missions…</div></div></div>`;
    }
    const rows = V2.state.missions.missions || V2.state.missions.items || [];
    const cards = rows.map((m) => {
      const id = m.mission_id || m.missionId;
      return `<div class="mc-card" data-nav="missions/${esc(id)}"><b>${esc(m.title)}</b> · ${esc(m.status_label || m.status || m.kickoff_status || "")}</div>`;
    }).join("") || `<div class="rempty">No missions</div>`;
    return `<div class="mc-wrap"><div class="mc-hero"><h2>Missions</h2>
      <div class="row gap"><button class="btn sm" data-nav="command">Command Center</button>
      <button class="btn sm" data-nav="timeline">Timeline</button>
      <button class="btn sm" data-nav="workers">Workers</button>
      <button class="btn sm" data-nav="decisions">Decisions</button>
      <button class="btn sm" data-nav="evidence">Evidence</button></div></div>
      <div class="mc-list">${cards}</div></div>`;
  };

  V2.viewMissionDetail = function (id) {
    if (!V2.state.detail || (V2.state.detail.mission_id !== id && V2.state.detail.missionId !== id)) {
      V2.fetchMission(id);
      return `<div class="mc-wrap"><div class="empty"><div class="big"><span class="spin"></span> Opening…</div></div></div>`;
    }
    const d = V2.state.detail;
    const title = d.brief?.title || d.title || id;
    return `<div class="mc-wrap"><button class="btn sm" data-nav="missions">← Missions</button>
      <h2>${esc(title)}</h2>
      <p class="muted">Mission detail · ${esc(id)}</p>
      <div class="row gap">
        <button class="btn sm" data-nav="kickoff/${esc(id)}">Kickoff / readiness</button>
        <button class="btn sm" data-nav="timeline/${esc(id)}">Timeline</button>
        <button class="btn sm" data-nav="evidence/${esc(id)}">Evidence</button>
      </div>
      <pre class="mono" style="white-space:pre-wrap;font-size:12px">${esc(JSON.stringify(d.summary || d.brief || d, null, 2).slice(0, 6000))}</pre></div>`;
  };

  V2.viewTimeline = function (missionId) {
    if (missionId && (!V2.state.timeline || V2.state.timeline.mission_id !== missionId)) {
      V2.fetchTimeline(missionId);
      return `<div class="mc-wrap"><div class="empty"><span class="spin"></span> Loading timeline…</div></div>`;
    }
    const events = V2.state.timeline?.events || V2.state.timeline?.items || [];
    const rows = events.map((e) => `<div class="mc-card"><b>${esc(e.type || e.kind)}</b> · ${esc(e.summary || "")}<div class="muted">${esc(e.at || e.created_at || "")}</div></div>`).join("")
      || `<div class="rempty">No timeline events${missionId ? "" : " — open a mission"}</div>`;
    return `<div class="mc-wrap"><h2>Timeline</h2>${rows}</div>`;
  };

  V2.viewWorkers = function () {
    if (!V2.state.workers) { V2.fetchWorkers(); return `<div class="mc-wrap"><div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    const rows = (V2.state.workers.workers || []).map((w) =>
      `<div class="mc-card" data-nav="workers/${esc(w.workerId)}"><b>${esc(w.workerId)}</b> · ${esc(w.status)}
        <div class="muted">slot ${esc(w.slot || "—")} · ${esc(w.assignmentId || "no assignment")}</div></div>`).join("")
      || `<div class="rempty">No workers</div>`;
    return `<div class="mc-wrap"><h2>Workers</h2>${rows}</div>`;
  };

  V2.viewWorkerDetail = function (workerId) {
    if (!V2.state.workers) { V2.fetchWorkers(); return `<div class="mc-wrap"><div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    const w = (V2.state.workers.workers || []).find((x) => x.workerId === workerId) || { workerId, status: "unknown" };
    return `<div class="mc-wrap"><button class="btn sm" data-nav="workers">← Workers</button>
      <h2>Worker ${esc(workerId)}</h2>
      <pre class="mono" style="font-size:12px;white-space:pre-wrap">${esc(JSON.stringify(w, null, 2))}</pre></div>`;
  };

  V2.viewDecisions = function () {
    if (!V2.state.decisions) { V2.fetchDecisions(); return `<div class="mc-wrap"><div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    const rows = (V2.state.decisions.decisions || []).map((d) =>
      `<div class="mc-card" data-nav="decisions/${esc(d.decisionId)}"><b>${esc(d.title)}</b>
        <div class="muted">${esc(d.status)} · ${esc((d.situation || "").slice(0, 120))}</div></div>`).join("")
      || `<div class="rempty">No open decisions</div>`;
    return `<div class="mc-wrap"><h2>Decisions</h2>${rows}</div>`;
  };

  V2.viewDecisionDetail = function (decisionId) {
    if (!V2.state.decisions && !V2.state.allDecisions) {
      V2.fetchDecisions(); V2.fetchAllDecisions();
      return `<div class="mc-wrap"><div class="empty"><span class="spin"></span> Loading…</div></div>`;
    }
    const pool = [
      ...(V2.state.decisions?.decisions || []),
      ...(V2.state.allDecisions?.decisions || []),
    ];
    const d = pool.find((x) => x.decisionId === decisionId);
    if (!d) return `<div class="mc-wrap"><h2>Decision</h2><div class="rempty">Not found: ${esc(decisionId)}</div></div>`;
    const opts = (d.options || []).map((o) =>
      `<div class="mc-card"><b>${esc(o.label)}</b><div class="muted">${esc(o.description || "")}</div></div>`).join("");
    return `<div class="mc-wrap decision-card" data-decision-id="${esc(decisionId)}">
      <button class="btn sm" data-nav="decisions">← Decisions</button>
      <h2>${esc(d.title)}</h2>
      <p>${esc(d.situation)}</p>
      <p class="muted">${esc(d.whyThisMatters)}</p>
      <h3>Options</h3>${opts}
      <p><b>Recommendation:</b> ${esc(d.recommendation)}</p>
    </div>`;
  };

  V2.viewEvidence = function (missionId) {
    if (!V2.state.evidence) { V2.fetchEvidence(missionId); return `<div class="mc-wrap"><div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    const arts = V2.state.evidence.artifacts || V2.state.evidence.evidence || [];
    const cards = arts.map((a) =>
      `<div class="mc-card"><b>${esc(a.title || a.type)}</b> · ${esc(a.type)}
        <div class="muted">${esc(a.fileUri || a.path || "")}</div></div>`).join("")
      || `<div class="rempty">No evidence artifacts</div>`;
    return `<div class="mc-wrap"><h2>Evidence gallery</h2><div class="mc-list">${cards}</div></div>`;
  };

  V2.viewKickoff = function (missionId) {
    if (!missionId) return `<div class="mc-wrap"><h2>Kickoff</h2><div class="rempty">Select a mission</div></div>`;
    if (!V2.state.kickoff || (V2.state.kickoff.mission_id !== missionId && V2.state.kickoff.missionId !== missionId)) {
      V2.fetchKickoff(missionId);
      return `<div class="mc-wrap"><div class="empty"><span class="spin"></span> Loading kickoff…</div></div>`;
    }
    const k = V2.state.kickoff;
    const findings = (k.readiness?.findings || k.findings || []).map((f) =>
      `<div class="mc-card">${esc(f.message || f.code || JSON.stringify(f))}</div>`).join("") || `<div class="rempty">No findings</div>`;
    return `<div class="mc-wrap kickoff-card"><h2>Mission Brief kickoff / readiness</h2>
      <p class="muted">${esc(missionId)} · ${esc(k.kickoff_status || k.status || "")}</p>
      <h3>Readiness findings</h3>${findings}
      <pre class="mono" style="font-size:11px;white-space:pre-wrap">${esc(JSON.stringify(k.kickoff_card || k, null, 2).slice(0, 5000))}</pre></div>`;
  };

  function ensureNavLink() {
    const nav = document.getElementById("nav");
    if (!nav || nav.querySelector("[data-route=missions]")) return;
    for (const [route, label] of [["missions", "Missions"], ["workers", "Workers"], ["decisions", "Decisions"], ["evidence", "Evidence"]]) {
      if (nav.querySelector(`[data-route=${route}]`)) continue;
      const a = document.createElement("a");
      a.dataset.route = route;
      a.textContent = label + " (opt-in)";
      nav.insertBefore(a, nav.firstChild);
    }
  }

  document.addEventListener("DOMContentLoaded", ensureNavLink);
  if (document.readyState !== "loading") ensureNavLink();
})();
