/**
 * Vacilando Mission Control — primary shell (always on).
 *
 * Freeze root cause (fixed): commit 5fa156fd2 used a MutationObserver on #view that
 * re-entered paint whenever loading HTML lacked `.mc-wrap`, creating an infinite
 * main-thread DOM rewrite loop. This module never installs a MutationObserver.
 *
 * Ownership: app.js `render()` is the sole #view writer. This module owns V2 section
 * data + view functions. Board/SSE polling must not block MC first paint.
 *
 * Compatibility: legacy Command Center only via ?legacy=1#/command (or Settings link).
 * Stale localStorage.vacilando_mission_control is cleared so it cannot demote MC.
 */
(function () {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("vacilando_mission_control");
    }
  } catch { /* ignore */ }

  const legacyForced = new URLSearchParams(location.search).get("legacy") === "1";

  window.VacilandoV2 = {
    enabled: true,
    gated: false,
    primary: !legacyForced,
    freeze_fix: "no_mutation_observer",
    state: { _rev: 0, selectedMissionId: null },
  };

  const V2 = window.VacilandoV2;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const get = async (p) => {
    const r = await fetch(p, { cache: "no-store" });
    if (!r.ok) throw new Error(`http_${r.status}`);
    return r.json();
  };

  let paintScheduled = false;
  function bump() { V2.state._rev = (V2.state._rev || 0) + 1; }
  function schedulePaint() {
    if (paintScheduled) return;
    paintScheduled = true;
    requestAnimationFrame(() => {
      paintScheduled = false;
      if (typeof window.render === "function") window.render(true);
    });
  }

  V2.isPrimaryRoute = function (name) {
    return ["missions", "timeline", "workers", "decisions", "evidence", "kickoff", "settings"].includes(name);
  };

  V2.fetchMissions = async () => {
    try { V2.state.missions = await get("/api/v2/missions"); bump(); schedulePaint(); } catch (e) { V2.state.missionsError = String(e.message || e); bump(); schedulePaint(); }
  };
  V2.fetchMission = async (id) => {
    try {
      V2.state.detail = await get("/api/v2/mission?id=" + encodeURIComponent(id));
      V2.state.selectedMissionId = id;
      bump(); schedulePaint();
    } catch (e) { V2.state.detailError = String(e.message || e); bump(); schedulePaint(); }
  };
  V2.fetchWorkers = async () => {
    try { V2.state.workers = await get("/api/v2/workers"); bump(); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchDecisions = async () => {
    try { V2.state.decisions = await get("/api/v2/decisions?status=open"); bump(); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchAllDecisions = async () => {
    try { V2.state.allDecisions = await get("/api/v2/decisions"); bump(); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchEvidence = async (missionId) => {
    try {
      const q = missionId ? "?mission_id=" + encodeURIComponent(missionId) : "";
      V2.state.evidence = await get("/api/v2/evidence" + q);
      bump(); schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchKickoff = async (id) => {
    try { V2.state.kickoff = await get("/api/v2/mission/kickoff?id=" + encodeURIComponent(id)); bump(); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchTimeline = async (id) => {
    try {
      V2.state.timeline = await get("/api/v2/mission/timeline?id=" + encodeURIComponent(id));
      V2.state.timelineMissionId = id;
      bump(); schedulePaint();
    } catch { /* keep */ }
  };

  function shellChrome(title, extra = "") {
    return `<div class="mc-wrap" data-mc-shell="1"><div class="mc-hero"><h2>${esc(title)}</h2>${extra}</div>`;
  }

  V2.viewMissions = function () {
    if (!V2.state.missions && !V2.state.missionsError) {
      V2.fetchMissions();
      return shellChrome("Missions") + `<div class="empty"><div class="big"><span class="spin"></span> Loading missions…</div></div></div>`;
    }
    if (V2.state.missionsError && !V2.state.missions) {
      return shellChrome("Missions") + `<div class="rempty">Could not load missions: ${esc(V2.state.missionsError)}</div></div>`;
    }
    const rows = V2.state.missions.missions || V2.state.missions.items || [];
    const cards = rows.map((m) => {
      const id = m.mission_id || m.missionId;
      return `<div class="mc-card" data-nav="missions/${esc(id)}"><b>${esc(m.title)}</b> · ${esc(m.status_label || m.status || m.kickoff_status || "")}</div>`;
    }).join("") || `<div class="rempty">No missions yet</div>`;
    return shellChrome("Missions") + `<div class="mc-list">${cards}</div></div>`;
  };

  V2.viewMissionDetail = function (id) {
    V2.state.selectedMissionId = id;
    if (!V2.state.detail || (V2.state.detail.mission_id !== id && V2.state.detail.missionId !== id)) {
      V2.fetchMission(id);
      return shellChrome("Mission") + `<div class="empty"><div class="big"><span class="spin"></span> Opening…</div></div></div>`;
    }
    const d = V2.state.detail;
    const title = d.brief?.title || d.title || id;
    return `<div class="mc-wrap" data-mc-shell="1"><button class="btn sm" data-nav="missions">← Missions</button>
      <h2>${esc(title)}</h2>
      <p class="muted">Mission detail · ${esc(id)}</p>
      <div class="row gap">
        <button class="btn sm" data-nav="kickoff/${esc(id)}">Kickoff / readiness</button>
        <button class="btn sm" data-nav="timeline/${esc(id)}">Timeline</button>
        <button class="btn sm" data-nav="evidence/${esc(id)}">Evidence</button>
        <button class="btn sm" data-nav="workers">Workers</button>
        <button class="btn sm" data-nav="decisions">Decisions</button>
      </div>
      <pre class="mono" style="white-space:pre-wrap;font-size:12px">${esc(JSON.stringify(d.summary || d.brief || d, null, 2).slice(0, 6000))}</pre></div>`;
  };

  V2.viewTimeline = function (missionId) {
    const mid = missionId || V2.state.selectedMissionId;
    if (!mid) {
      return shellChrome("Timeline") + `<div class="rempty">Open a mission first to view its timeline.</div>
        <button class="btn sm" data-nav="missions">Missions</button></div>`;
    }
    if (!V2.state.timeline || V2.state.timelineMissionId !== mid) {
      V2.fetchTimeline(mid);
      return shellChrome("Timeline") + `<div class="empty"><span class="spin"></span> Loading timeline…</div></div>`;
    }
    const events = V2.state.timeline?.events || V2.state.timeline?.items || [];
    const rows = events.map((e) => `<div class="mc-card"><b>${esc(e.type || e.kind)}</b> · ${esc(e.summary || "")}<div class="muted">${esc(e.at || e.created_at || "")}</div></div>`).join("")
      || `<div class="rempty">No timeline events</div>`;
    return shellChrome("Timeline", `<p class="muted">${esc(mid)}</p>`) + rows + `</div>`;
  };

  V2.viewWorkers = function () {
    if (!V2.state.workers) { V2.fetchWorkers(); return shellChrome("Workers") + `<div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    const rows = (V2.state.workers.workers || []).map((w) =>
      `<div class="mc-card" data-nav="workers/${esc(w.workerId)}"><b>${esc(w.workerId)}</b> · ${esc(w.status)}
        <div class="muted">slot ${esc(w.slot || "—")} · ${esc(w.assignmentId || "no assignment")}</div></div>`).join("")
      || `<div class="rempty">No workers</div>`;
    return shellChrome("Workers") + rows + `</div>`;
  };

  V2.viewWorkerDetail = function (workerId) {
    if (!V2.state.workers) { V2.fetchWorkers(); return shellChrome("Worker") + `<div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    const w = (V2.state.workers.workers || []).find((x) => x.workerId === workerId) || { workerId, status: "unknown" };
    return `<div class="mc-wrap" data-mc-shell="1"><button class="btn sm" data-nav="workers">← Workers</button>
      <h2>Worker ${esc(workerId)}</h2>
      <pre class="mono" style="font-size:12px;white-space:pre-wrap">${esc(JSON.stringify(w, null, 2))}</pre></div>`;
  };

  V2.viewDecisions = function () {
    if (!V2.state.decisions) { V2.fetchDecisions(); return shellChrome("Decisions") + `<div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    const rows = (V2.state.decisions.decisions || []).map((d) =>
      `<div class="mc-card" data-nav="decisions/${esc(d.decisionId)}"><b>${esc(d.title)}</b>
        <div class="muted">${esc(d.status)} · ${esc((d.situation || "").slice(0, 120))}</div></div>`).join("")
      || `<div class="rempty">No open decisions</div>`;
    return shellChrome("Decisions") + rows + `</div>`;
  };

  V2.viewDecisionDetail = function (decisionId) {
    if (!V2.state.decisions && !V2.state.allDecisions) {
      V2.fetchDecisions(); V2.fetchAllDecisions();
      return shellChrome("Decision") + `<div class="empty"><span class="spin"></span> Loading…</div></div>`;
    }
    const pool = [
      ...(V2.state.decisions?.decisions || []),
      ...(V2.state.allDecisions?.decisions || []),
    ];
    const d = pool.find((x) => x.decisionId === decisionId);
    if (!d) {
      V2.fetchAllDecisions();
      return shellChrome("Decision") + `<div class="rempty">Not found: ${esc(decisionId)}</div></div>`;
    }
    const opts = (d.options || []).map((o) =>
      `<div class="mc-card"><b>${esc(o.label)}</b><div class="muted">${esc(o.description || "")}</div></div>`).join("");
    return `<div class="mc-wrap decision-card" data-mc-shell="1" data-decision-id="${esc(decisionId)}">
      <button class="btn sm" data-nav="decisions">← Decisions</button>
      <h2>${esc(d.title)}</h2>
      <p>${esc(d.situation)}</p>
      <p class="muted">${esc(d.whyThisMatters)}</p>
      <h3>Options</h3>${opts}
      <p><b>Recommendation:</b> ${esc(d.recommendation)}</p>
    </div>`;
  };

  V2.viewEvidence = function (missionId) {
    const mid = missionId || V2.state.selectedMissionId;
    if (!V2.state.evidence) { V2.fetchEvidence(mid); return shellChrome("Evidence") + `<div class="empty"><span class="spin"></span> Loading…</div></div>`; }
    const arts = V2.state.evidence.artifacts || V2.state.evidence.evidence || [];
    const cards = arts.map((a) =>
      `<div class="mc-card"><b>${esc(a.title || a.type)}</b> · ${esc(a.type)}
        <div class="muted">${esc(a.fileUri || a.path || "")}</div></div>`).join("")
      || `<div class="rempty">No evidence artifacts</div>`;
    return shellChrome("Evidence gallery") + `<div class="mc-list">${cards}</div></div>`;
  };

  V2.viewKickoff = function (missionId) {
    if (!missionId) return shellChrome("Kickoff") + `<div class="rempty">Select a mission</div></div>`;
    if (!V2.state.kickoff || (V2.state.kickoff.mission_id !== missionId && V2.state.kickoff.missionId !== missionId)) {
      V2.fetchKickoff(missionId);
      return shellChrome("Kickoff") + `<div class="empty"><span class="spin"></span> Loading kickoff…</div></div>`;
    }
    const k = V2.state.kickoff;
    const findings = (k.readiness?.findings || k.findings || []).map((f) =>
      `<div class="mc-card">${esc(f.message || f.code || JSON.stringify(f))}</div>`).join("") || `<div class="rempty">No findings</div>`;
    return `<div class="mc-wrap kickoff-card" data-mc-shell="1"><h2>Mission Brief kickoff / readiness</h2>
      <p class="muted">${esc(missionId)} · ${esc(k.kickoff_status || k.status || "")}</p>
      <h3>Readiness findings</h3>${findings}
      <pre class="mono" style="font-size:11px;white-space:pre-wrap">${esc(JSON.stringify(k.kickoff_card || k, null, 2).slice(0, 5000))}</pre></div>`;
  };

  // Prefetch missions list lightly after idle — does not block first paint.
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => { if (!V2.state.missions) V2.fetchMissions(); }, { timeout: 2000 });
  } else {
    setTimeout(() => { if (!V2.state.missions) V2.fetchMissions(); }, 50);
  }
})();
