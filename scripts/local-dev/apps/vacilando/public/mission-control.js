/**
 * Vacilando Mission Control — operator product shell.
 *
 * Freeze root cause (fixed): never install a MutationObserver on #view.
 * Ownership: app.js render() is the sole #view writer. This module owns V2 views.
 * Pages bind to /api/v2/views/* operator view models — not raw persistence.
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
    state: { _rev: 0, selectedMissionId: null, kickoffDraft: null, kickoffStep: "empty", kickoffError: null },
  };

  const V2 = window.VacilandoV2;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const get = async (p) => {
    const r = await fetch(p, { cache: "no-store" });
    if (!r.ok) throw new Error(`http_${r.status}`);
    return r.json();
  };
  const post = async (p, body) => {
    const r = await fetch(p, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(j.error || j.detail || `http_${r.status}`);
      err.body = j;
      err.saved = Boolean(j.brief || j.mission || j.ok);
      throw err;
    }
    return j;
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
    return ["missions", "needs-you", "timeline", "workers", "decisions", "evidence", "kickoff", "settings"].includes(name);
  };

  function missionSubnav(missionId, active) {
    if (!missionId) return "";
    const tabs = [
      ["dashboard", `missions/${missionId}`, "Dashboard"],
      ["timeline", `timeline/${missionId}`, "Timeline"],
      ["workers", `workers?mission=${encodeURIComponent(missionId)}`, "Workers"],
      ["decisions", `decisions?mission=${encodeURIComponent(missionId)}`, "Decisions"],
      ["evidence", `evidence/${missionId}`, "Evidence"],
    ];
    return `<nav class="mc-subnav" aria-label="Mission">${tabs.map(([k, href, label]) =>
      `<a class="${active === k ? "on" : ""}" data-nav="${esc(href)}">${esc(label)}</a>`).join("")}</nav>`;
  }

  function shell(title, { missionId = null, active = null, lead = "", actions = "" } = {}) {
    return `<div class="mc-wrap wide" data-mc-shell="1">
      <div class="mc-hero">
        <div class="mc-hero-row">
          <div>
            <h2>${esc(title)}</h2>
            ${lead ? `<p class="mc-lead">${lead}</p>` : ""}
          </div>
          <div class="mc-hero-actions">${actions}</div>
        </div>
        ${missionSubnav(missionId, active)}
      </div>`;
  }

  function actionBtn(action) {
    if (!action) return "";
    return `<button class="btn" data-nav="${esc(action.href)}">${esc(action.label)}</button>`;
  }

  function errPanel(title, err, { saved = false, retry = null } = {}) {
    const tech = err?.body ? JSON.stringify(err.body, null, 2) : String(err?.message || err || "Unknown error");
    return `<div class="mc-error">
      <h3>${esc(title)}</h3>
      <p>${esc(err?.message || err)}</p>
      <p class="muted">${saved ? "Mission data was saved." : "Mission data may not have been saved."}</p>
      ${retry ? `<button class="btn" data-mc-retry="${esc(retry)}">Retry</button>` : ""}
      <details class="mc-diag"><summary>Technical details</summary><pre class="mono">${esc(tech)}</pre></details>
    </div>`;
  }

  // ---- fetches (view models) ----
  V2.fetchMissions = async () => {
    try {
      V2.state.missionsHome = await get("/api/v2/views/missions");
      V2.state.missionsError = null;
      bump(); schedulePaint();
    } catch (e) {
      V2.state.missionsError = String(e.message || e);
      bump(); schedulePaint();
    }
  };
  V2.fetchOverview = async (id) => {
    try {
      V2.state.overview = await get("/api/v2/views/mission/dashboard?id=" + encodeURIComponent(id));
      V2.state.selectedMissionId = id;
      V2.state.overviewError = null;
      bump(); schedulePaint();
    } catch (e) {
      V2.state.overviewError = String(e.message || e);
      bump(); schedulePaint();
    }
  };
  V2.fetchDashboard = V2.fetchOverview;
  V2.fetchNeedsYou = async () => {
    try { V2.state.needsYou = await get("/api/v2/views/needs-you"); bump(); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchWorkers = async () => {
    try { V2.state.workersHome = await get("/api/v2/views/workers"); bump(); schedulePaint(); } catch { /* keep */ }
  };
  V2.fetchWorker = async (id) => {
    try {
      V2.state.workerDetail = await get("/api/v2/views/worker?id=" + encodeURIComponent(id));
      bump(); schedulePaint();
    } catch (e) {
      V2.state.workerDetailError = String(e.message || e);
      bump(); schedulePaint();
    }
  };
  V2.fetchDecisions = async (missionId) => {
    try {
      const q = missionId ? "?mission_id=" + encodeURIComponent(missionId) + "&status=all" : "?status=open";
      V2.state.decisionsVm = await get("/api/v2/views/decisions" + q);
      V2.state.decisionsMissionId = missionId || null;
      bump(); schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchDecision = async (decisionId, missionId) => {
    try {
      let url = "/api/v2/views/decision?id=" + encodeURIComponent(decisionId);
      if (missionId) url += "&mission_id=" + encodeURIComponent(missionId);
      V2.state.decisionDetail = await get(url);
      bump(); schedulePaint();
    } catch (e) {
      V2.state.decisionDetailError = String(e.message || e);
      bump(); schedulePaint();
    }
  };
  V2.fetchTimeline = async (id) => {
    try {
      V2.state.timelineVm = await get("/api/v2/views/mission/timeline?id=" + encodeURIComponent(id));
      V2.state.timelineMissionId = id;
      bump(); schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchEvidence = async (id) => {
    try {
      V2.state.evidenceVm = await get("/api/v2/views/mission/evidence?id=" + encodeURIComponent(id));
      V2.state.evidenceMissionId = id;
      bump(); schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchKickoff = async (id) => {
    try {
      if (!id) {
        V2.state.kickoffVm = { ok: true, mode: "empty", title: "Start a mission" };
      } else {
        V2.state.kickoffVm = await get("/api/v2/views/mission/kickoff?id=" + encodeURIComponent(id));
      }
      V2.state.kickoffMissionId = id || null;
      V2.state.kickoffError = null;
      bump(); schedulePaint();
    } catch (e) {
      V2.state.kickoffError = e;
      bump(); schedulePaint();
    }
  };

  // ---- views ----
  V2.viewMissions = function () {
    if (!V2.state.missionsHome && !V2.state.missionsError) {
      V2.fetchMissions();
      return shell("Missions", {
        actions: `<button class="btn" data-nav="kickoff">New mission</button>`,
      }) + `<div class="empty"><div class="big"><span class="spin"></span> Loading missions…</div></div></div>`;
    }
    if (V2.state.missionsError && !V2.state.missionsHome) {
      return shell("Missions") + errPanel("Could not load missions", { message: V2.state.missionsError }, { retry: "missions" }) + `</div>`;
    }
    const rows = V2.state.missionsHome.missions || [];
    const cards = rows.map((m) => `<article class="mc-card mc-mission-card" data-nav="missions/${esc(m.missionId)}">
      <div class="mc-card-h">
        <b>${esc(m.title)}</b>
        <span class="mc-pill ${esc(m.status)}">${esc(m.statusLabel)}</span>
      </div>
      <div class="mc-card-p">${esc(m.phaseLabel)}</div>
      <div class="mc-card-m">${esc(m.deliverablesLabel)}</div>
      <div class="mc-card-d">${esc(m.directorState)}</div>
      <div class="mc-card-f">${esc(m.workersLine)}${m.openDecisionCount ? ` · ${m.openDecisionCount} open decision${m.openDecisionCount === 1 ? "" : "s"}` : ""}</div>
      <div class="mc-card-meta muted">${esc(m.latestUpdate)} · ${esc(m.updatedLabel || "")}</div>
      <div class="mc-card-cta">${actionBtn(m.primaryAction)}</div>
    </article>`).join("") || `<div class="rempty">No missions yet. Start from a Mission Brief.</div>`;

    return shell("Missions", {
      lead: "Director-managed work across your org.",
      actions: `<button class="btn" data-nav="kickoff">New mission</button>`,
    }) + `<div class="mc-list">${cards}</div></div>`;
  };

  V2.viewMissionDetail = function (id) {
    V2.state.selectedMissionId = id;
    const dashPayload = V2.state.overview;
    const dash = dashPayload?.dashboard || dashPayload?.overview;
    if (!dash || (dash.missionId || dash.header?.missionId) !== id) {
      V2.fetchDashboard(id);
      return shell("Mission Dashboard", { missionId: id, active: "dashboard" })
        + `<div class="empty"><div class="big"><span class="spin"></span> Opening dashboard…</div></div></div>`;
    }
    if (V2.state.overviewError) {
      return shell("Mission Dashboard", { missionId: id, active: "dashboard" })
        + errPanel("Could not open mission", { message: V2.state.overviewError }, { retry: "overview:" + id }) + `</div>`;
    }

    const s = dash.summary || {};
    const dir = dash.director || {};
    const conf = dash.confidence || {};
    const needs = dash.needsMe || [];
    const work = dash.currentWork || [];
    const progress = dash.recentProgress || [];
    const timeline = dash.timeline || [];

    const summaryStrip = `<section class="mc-dash-summary">
      <div class="mc-dash-title-row">
        <div>
          <h2>${esc(s.title)}</h2>
          <div class="mc-pill ${esc(s.status || "")}">${esc(s.statusLabel)}</div>
        </div>
        <div class="mc-hero-actions">${actionBtn(s.primaryAction)}</div>
      </div>
      <div class="mc-stat-grid">
        <div class="mc-stat"><div class="mc-stat-k">Phase</div><div class="mc-stat-v">${esc(s.phase)}</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Deliverables</div><div class="mc-stat-v">${esc(s.deliverablesLabel)}</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Workers</div><div class="mc-stat-v">${esc(s.activeWorkers)} active</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Confidence</div><div class="mc-stat-v">${esc(s.confidencePercent)}%</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Next checkpoint</div><div class="mc-stat-v">${esc(s.nextCheckpoint)}</div></div>
      </div>
    </section>`;

    const directorSec = `<section class="mc-sec mc-director">
      <h3>Director</h3>
      <p class="mc-director-assess">${esc(dir.assessment)}</p>
      <div class="mc-grid">
        <div>
          <div class="mc-stat-k">Current focus</div>
          <ul>${(dir.focus || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </div>
        <div>
          <div class="mc-stat-k">Current risk</div>
          <ul>${(dir.risks || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </div>
        <div>
          <div class="mc-stat-k">Current recovery</div>
          <ul>${(dir.recoveries || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </div>
        <div>
          <div class="mc-stat-k">Next</div>
          <p>${esc(dir.next)}</p>
          <p><b>Recommendation:</b> ${esc(dir.recommendation)}</p>
        </div>
      </div>
    </section>`;

    const needsSec = `<section class="mc-sec mc-needs-me">
      <h3>Needs Me</h3>
      ${needs.length
        ? needs.map((it) => `<article class="mc-card mc-needs-card">
            <div class="mc-card-h"><b>${esc(it.title)}</b><span class="mc-pill">${esc(it.urgency)}</span></div>
            <p>${esc(it.body)}</p>
            ${it.recommendation ? `<p><b>Recommendation:</b> ${esc(it.recommendation)}</p>` : ""}
            ${actionBtn(it.primaryAction)}
          </article>`).join("")
        : `<div class="rempty">Nothing needs you right now.</div>`}
    </section>`;

    const workSec = `<section class="mc-sec">
      <h3>Current Work</h3>
      ${work.length
        ? work.map((w) => `<div class="mc-work-row">
            <div class="mc-card-h"><b>${esc(w.title)}</b><span class="mc-pill">${esc(w.statusLabel)}</span></div>
            ${w.handledBy ? `<div class="muted">Handled by ${esc(w.handledBy)}</div>` : `<div class="muted">Unassigned</div>`}
            ${w.progressSummary ? `<div>${esc(w.progressSummary)}</div>` : ""}
            ${w.healthLabel ? `<div class="muted">${esc(w.healthLabel)}</div>` : ""}
          </div>`).join("")
        : `<div class="rempty">No work items yet</div>`}
    </section>`;

    const recentSec = `<section class="mc-sec">
      <h3>Recent Progress</h3>
      ${progress.length
        ? progress.map((p) => `<div class="mc-tl-row">
            <div class="mc-tl-time">${esc(p.timeLabel)}</div>
            <div><b>${esc(p.headline)}</b>${p.explanation ? `<div class="muted">${esc(p.explanation)}</div>` : ""}</div>
          </div>`).join("")
        : `<div class="rempty">No milestones yet</div>`}
    </section>`;

    const tlSec = `<section class="mc-sec">
      <h3>Timeline</h3>
      ${timeline.length
        ? timeline.map((e) => `<div class="mc-tl-row">
            <div class="mc-tl-time">${esc(e.timeLabel)} · ${esc(e.actor)}</div>
            <div><b>${esc(e.headline)}</b>${e.explanation ? `<div class="muted">${esc(e.explanation)}</div>` : ""}</div>
          </div>`).join("")
        : `<div class="rempty">No timeline events</div>`}
      <button class="btn sm" data-nav="timeline/${esc(id)}">Full timeline</button>
    </section>`;

    const confSec = `<section class="mc-sec mc-confidence">
      <h3>Mission Confidence · ${esc(conf.percent)}%</h3>
      <p class="muted">${esc(conf.bandLabel || "")}${conf.change ? ` · ${esc(conf.change.summary)}` : ""}</p>
      <div class="mc-conf-bar"><div class="mc-conf-fill" style="width:${Number(conf.percent) || 0}%"></div></div>
      <div class="mc-conf-factors">${(conf.factors || []).map((f) =>
        `<div class="mc-conf-f"><b>${esc(f.label)}</b> ${esc(f.score)} <span class="muted">(${esc(f.weight)}%) — ${esc(f.note)}</span></div>`).join("")}</div>
    </section>`;

    return shell(s.title || "Mission Dashboard", {
      missionId: id,
      active: "dashboard",
      lead: `${esc(s.statusLabel)} · Confidence ${esc(s.confidencePercent)}% · Next: ${esc(s.nextCheckpoint)}`,
      actions: actionBtn(s.primaryAction),
    }) + summaryStrip + directorSec + needsSec + `<div class="mc-grid">${workSec}${recentSec}</div>` + confSec + tlSec + `</div>`;
  };

  V2.viewNeedsYou = function () {
    if (!V2.state.needsYou) {
      V2.fetchNeedsYou();
      return shell("Needs You") + `<div class="empty"><span class="spin"></span> Loading…</div></div>`;
    }
    const items = V2.state.needsYou.items || [];
    const cards = items.map((it) => `<article class="mc-card">
      <div class="mc-card-h"><b>${esc(it.title)}</b><span class="mc-pill">${esc(it.urgency)}</span></div>
      <div class="muted">${esc(it.missionTitle)}</div>
      <p>${esc(it.body)}</p>
      ${it.recommendation ? `<p><b>Director:</b> ${esc(it.recommendation)}</p>` : ""}
      ${actionBtn(it.primaryAction)}
    </article>`).join("") || `<div class="rempty">Nothing needs you right now.</div>`;
    return shell("Needs You", { lead: "Decisions, recoveries, and approvals waiting on you." })
      + `<div class="mc-list">${cards}</div></div>`;
  };

  V2.viewTimeline = function (missionId) {
    const mid = missionId || V2.state.selectedMissionId;
    if (!mid) {
      return shell("Timeline") + `<div class="rempty">Open a mission to see its story.</div>
        <button class="btn" data-nav="missions">Missions</button></div>`;
    }
    if (!V2.state.timelineVm || V2.state.timelineMissionId !== mid) {
      V2.fetchTimeline(mid);
      return shell("Timeline", { missionId: mid, active: "timeline" })
        + `<div class="empty"><span class="spin"></span> Loading timeline…</div></div>`;
    }
    const page = V2.state.timelineVm;
    const events = page.events || [];
    const rows = events.map((e) => `<article class="mc-tl-event">
      <div class="mc-tl-time">${esc(e.timeLabel)} · ${esc(e.actor)}</div>
      <h4>${esc(e.headline)}</h4>
      ${e.explanation ? `<p>${esc(e.explanation)}</p>` : ""}
      ${e.expandable ? `<details><summary>Details</summary><pre class="mono">${esc(JSON.stringify(e.detail, null, 2))}</pre></details>` : ""}
    </article>`).join("") || `<div class="rempty">No timeline events yet for this mission.</div>`;

    return shell(page.title || "Timeline", {
      missionId: mid,
      active: "timeline",
      lead: "The story of this mission in plain language.",
    }) + `<div class="mc-tl">${rows}</div></div>`;
  };

  V2.viewWorkers = function () {
    if (!V2.state.workersHome) {
      V2.fetchWorkers();
      return shell("Workers") + `<div class="empty"><span class="spin"></span> Loading workers…</div></div>`;
    }
    const groups = V2.state.workersHome.groups || [];
    const html = groups.map((g) => `<section class="mc-sec">
      <h3>${esc(g.missionTitle || "Unassigned")}</h3>
      ${(g.workers || []).map((w) => `<article class="mc-card" data-nav="workers/${esc(w.workerId)}">
        <div class="mc-card-h"><b>${esc(w.deliverable)}</b><span class="mc-pill">${esc(w.healthLabel)}</span></div>
        <div>${esc(w.lastProgressSummary)}</div>
        <div class="muted">Director: ${esc(w.directorAction)}</div>
        ${w.decisionState ? `<div class="warn">${esc(w.decisionState)}</div>` : ""}
        <div class="muted">${[w.modelLabel, w.slotLabel].filter(Boolean).map(esc).join(" · ")}</div>
        ${actionBtn(w.primaryAction)}
      </article>`).join("") || `<div class="rempty">No workers on this mission</div>`}
    </section>`).join("") || `<div class="rempty">No workers yet</div>`;

    return shell("Workers", { lead: "Work first. Model and slot are secondary." }) + html + `</div>`;
  };

  V2.viewWorkerDetail = function (workerId) {
    if (!V2.state.workerDetail || V2.state.workerDetail.worker?.workerId !== workerId) {
      V2.fetchWorker(workerId);
      return shell("Worker") + `<div class="empty"><span class="spin"></span> Loading…</div></div>`;
    }
    if (V2.state.workerDetailError) {
      return shell("Worker") + errPanel("Worker not found", { message: V2.state.workerDetailError }) + `</div>`;
    }
    const w = V2.state.workerDetail.worker;
    return shell(w.deliverable, {
      lead: `${esc(w.missionTitle)} · ${esc(w.healthLabel)}`,
      actions: `<button class="btn sm" data-nav="workers">← Workers</button>`,
    }) + `
      <section class="mc-sec">
        <h3>Assignment</h3>
        <p>${esc(w.objective)}</p>
        <p><b>Current activity:</b> ${esc(w.currentActivity)}</p>
        <p><b>Next step:</b> ${esc(w.nextStep)}</p>
        <p><b>Director:</b> ${esc(w.directorAction)}</p>
        ${w.issueDetail ? `<p class="warn">${esc(w.issueDetail)}</p>` : ""}
      </section>
      <section class="mc-sec">
        <h3>Required outputs</h3>
        ${(w.requiredOutputs || []).map((o) => `<div class="mc-asg">${esc(o.label || o)}</div>`).join("") || `<div class="muted">None listed</div>`}
      </section>
      <section class="mc-sec">
        <h3>Evidence</h3>
        ${(w.evidence || []).map((a) => `<div class="mc-ev"><b>${esc(a.title)}</b> — ${esc(a.proves)}</div>`).join("") || `<div class="muted">None yet</div>`}
      </section>
      <details class="mc-diag"><summary>Technical details</summary>
        <pre class="mono">${esc(JSON.stringify(w.technical || {}, null, 2))}</pre>
      </details>
    </div>`;
  };

  V2.viewDecisions = function (missionId) {
    const mid = missionId || null;
    if (!V2.state.decisionsVm || V2.state.decisionsMissionId !== mid) {
      V2.fetchDecisions(mid);
      return shell("Decisions", { missionId: mid, active: "decisions" })
        + `<div class="empty"><span class="spin"></span> Loading decisions…</div></div>`;
    }
    const rows = (V2.state.decisionsVm.decisions || []).map((d) => `<article class="mc-card" data-nav="decisions/${esc(d.decisionId)}">
      <div class="mc-card-h"><b>${esc(d.question || d.title)}</b><span class="mc-pill">${esc(d.urgency)}</span></div>
      <div class="muted">${esc(d.missionTitle)} · ${esc(d.requestedLabel)} · ${esc(d.statusLabel)}</div>
      <p>${esc((d.situation || "").slice(0, 220))}${(d.situation || "").length > 220 ? "…" : ""}</p>
      <p><b>Recommendation:</b> ${esc(d.recommendation)}</p>
      ${d.pausedWork?.length ? `<p class="warn">Paused: ${esc(d.pausedWork.map((w) => w.title).join(", "))}</p>` : ""}
      ${actionBtn(d.primaryAction)}
    </article>`).join("") || `<div class="rempty">No decisions here.</div>`;

    return shell("Decisions", {
      missionId: mid,
      active: mid ? "decisions" : null,
      lead: mid ? "Decisions for this mission." : "Open decisions across missions.",
    }) + `<div class="mc-list">${rows}</div></div>`;
  };

  V2.viewDecisionDetail = function (decisionId) {
    if (!V2.state.decisionDetail || V2.state.decisionDetail.decision?.decisionId !== decisionId) {
      V2.fetchDecision(decisionId, V2.state.selectedMissionId);
      return shell("Decision") + `<div class="empty"><span class="spin"></span> Loading decision…</div></div>`;
    }
    if (V2.state.decisionDetailError) {
      return shell("Decision") + errPanel("Decision not found", { message: V2.state.decisionDetailError }) + `</div>`;
    }
    const d = V2.state.decisionDetail.decision;
    const s = d.sections || {};
    const open = d.status === "open";
    const actions = open ? `<div class="mc-actions mobile-decision">
      ${(d.actions || []).map((a) => {
        if (a.id === "ask") return `<button class="btn ghost" data-mc-ask="${esc(d.decisionId)}">${esc(a.label)}</button>`;
        if (a.id === "reject") return `<button class="btn ghost" data-mc-reject="${esc(d.decisionId)}">${esc(a.label)}</button>`;
        return `<button class="btn ${a.id === "approve" ? "" : "ghost"}" data-mc-answer="${esc(d.decisionId)}" data-option="${esc(a.optionId)}" data-mission="${esc(d.missionId)}">${esc(a.label)}</button>`;
      }).join("")}
    </div>` : `<div class="mc-pill">${esc(d.statusLabel)}</div>`;

    return shell(d.title, {
      missionId: d.missionId,
      active: "decisions",
      lead: `${esc(d.missionTitle)} · ${esc(d.urgency)} · ${esc(d.requestedLabel)}`,
    }) + `<article class="mc-decision mobile-decision">
      <section><h3>1. What happened?</h3><p>${esc(s.whatHappened || d.situation)}</p></section>
      <section><h3>2. Why does it matter?</h3><p>${esc(s.whyItMatters || d.whyItMatters)}</p></section>
      <section><h3>3. What does Director recommend?</h3><p>${esc(s.recommendation || d.recommendation)}</p></section>
      <section><h3>4. What is the impact?</h3><ul>${(s.impact || d.impactLines || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
      <section><h3>5. What are the alternatives?</h3><ul>${(s.alternatives || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
      <section><h3>6. What evidence supports this?</h3><ul>${(Array.isArray(s.evidence) ? s.evidence : []).map((x) => `<li>${esc(typeof x === "string" ? x : x.title || x)}</li>`).join("")}</ul></section>
      <section><h3>7. What work is paused?</h3>
        ${(d.pausedWork || []).map((w) => `<div class="mc-work"><b>${esc(w.title)}</b> · ${esc(w.statusLabel)}</div>`).join("") || `<p class="muted">No work paused</p>`}
      </section>
      <section><h3>8. What happens after I answer?</h3><p>${esc(s.afterAnswer || d.afterAnswer)}</p></section>
      ${actions}
    </article></div>`;
  };

  V2.viewEvidence = function (missionId) {
    const mid = missionId || V2.state.selectedMissionId;
    if (!mid) {
      return shell("Evidence") + `<div class="rempty">Open a mission to review evidence.</div>
        <button class="btn" data-nav="missions">Missions</button></div>`;
    }
    if (!V2.state.evidenceVm || V2.state.evidenceMissionId !== mid) {
      V2.fetchEvidence(mid);
      return shell("Evidence", { missionId: mid, active: "evidence" })
        + `<div class="empty"><span class="spin"></span> Loading evidence…</div></div>`;
    }
    const page = V2.state.evidenceVm;
    const cards = (page.artifacts || []).map((a) => `<article class="mc-card mc-ev-card">
      <div class="mc-card-h"><b>${esc(a.title)}</b><span class="mc-pill">${esc(a.typeLabel)}</span></div>
      <p><b>Proves:</b> ${esc(a.proves)}</p>
      ${a.acceptanceCriteriaIds?.length ? `<p class="muted">Criteria: ${esc(a.acceptanceCriteriaIds.join(", "))}</p>` : ""}
      <p class="muted">${esc(a.producedBy)} · ${esc(a.whenLabel)}${a.commit ? ` · ${esc(a.commit)}` : ""}</p>
      ${a.command ? `<p class="mono">${esc(a.command)}${a.exitCode != null ? ` → ${a.exitCode === 0 ? "passed" : "failed"}` : ""}</p>` : ""}
      ${a.previewLabel ? `<div>${esc(a.previewLabel)}</div>` : ""}
      ${a.technicalPath ? `<details class="mc-diag"><summary>Technical location</summary><code>${esc(a.technicalPath)}</code></details>` : ""}
    </article>`).join("") || `<div class="rempty">No evidence collected yet.</div>`;

    const cov = (page.coverage || []).map((c) =>
      `<div class="mc-ac">${esc(c.statusLabel)} — ${esc(c.statement)}</div>`).join("");

    return shell(page.title || "Evidence", {
      missionId: mid,
      active: "evidence",
      lead: "What the work proves — not filesystem paths.",
    }) + `<section class="mc-sec"><h3>Acceptance coverage</h3>${cov || `<div class="muted">No criteria mapped</div>`}</section>
      <div class="mc-list">${cards}</div></div>`;
  };

  V2.viewKickoff = function (missionId) {
    const step = V2.state.kickoffStep || "empty";
    const draft = V2.state.kickoffDraft;
    const busy = V2.state.kickoffBusy;

    if (V2.state.kickoffError) {
      return shell("Mission Brief") + errPanel(
        "Kickoff request failed",
        V2.state.kickoffError,
        { saved: V2.state.kickoffError.saved, retry: "kickoff" },
      ) + `<button class="btn ghost" data-mc-kickoff-reset="1">Start over</button></div>`;
    }

    if (busy) {
      return shell("Mission Brief") + `<div class="empty"><div class="big"><span class="spin"></span> ${esc(busy)}…</div>
        <p class="muted">This should only take a moment.</p></div></div>`;
    }

    // Existing mission readiness / approval
    if (missionId && !draft) {
      if (!V2.state.kickoffVm || V2.state.kickoffMissionId !== missionId) {
        V2.fetchKickoff(missionId);
        return shell("Mission Brief") + `<div class="empty"><span class="spin"></span> Loading readiness…</div></div>`;
      }
      const k = V2.state.kickoffVm;
      if (k.mode === "empty" || !k.title) {
        return shell("Mission Brief") + kickoffEmptyHtml() + `</div>`;
      }
      return shell(k.title, { lead: "Readiness and approval" }) + kickoffReadinessHtml(k) + `</div>`;
    }

    if (step === "empty" || (!draft && !missionId)) {
      return shell("Mission Brief", { lead: "Paste or import a brief to start." }) + kickoffEmptyHtml() + `</div>`;
    }

    if (step === "review" && draft) {
      return shell(draft.title || "Review Mission Brief") + kickoffReviewHtml(draft) + `</div>`;
    }

    if ((step === "readiness" || step === "approval") && draft) {
      return shell(draft.title || "Readiness") + kickoffReadinessHtml(draft) + `</div>`;
    }

    return shell("Mission Brief") + kickoffEmptyHtml() + `</div>`;
  };

  function kickoffEmptyHtml() {
    return `<section class="mc-sec mc-kickoff-empty">
      <h3>Start a mission</h3>
      <p>Paste a sprint brief or import Markdown. Director will parse the structure for your review.</p>
      <div class="mc-grid">
        <div>
          <label class="muted">Paste Sprint</label>
          <textarea id="mc-brief-md" class="mc-textarea" rows="14" placeholder="# Access & Identity V2&#10;&#10;Objective: …&#10;&#10;## Phases&#10;- Authority inventory&#10;- Canonical model"></textarea>
          <button class="btn" data-mc-kickoff-md="1">Review with Director</button>
        </div>
        <div>
          <label class="muted">Import Markdown</label>
          <p class="muted">Same as paste — drop the full brief text, including objectives and phases.</p>
          <p class="muted">JSON Mission Briefs remain supported for automation. Operators should not need them.</p>
          <details class="mc-diag"><summary>Advanced: paste JSON Mission Brief</summary>
            <textarea id="mc-brief-json" class="mc-textarea" rows="8" placeholder='{ "title": "…", "objective": "…" }'></textarea>
            <button class="btn ghost" data-mc-kickoff-paste="1">Review JSON</button>
          </details>
        </div>
      </div>
    </section>`;
  }

  function kickoffReviewHtml(k) {
    return `<section class="mc-sec">
      <h3>Review</h3>
      <p><b>Objective</b></p><p>${esc(k.objective)}</p>
      <p><b>Phases</b></p>
      <ol>${(k.phases || []).map((p) => `<li><b>${esc(p.title)}</b> — ${esc(p.objective || "")}</li>`).join("")}</ol>
      <p><b>Acceptance criteria</b></p>
      <ul>${(k.acceptanceCriteria || []).map((c) => `<li>${esc(c.statement || c)}</li>`).join("")}</ul>
      <p><b>Constraints</b></p>
      <ul>${(k.constraints || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      <p><b>Sources</b></p>
      <ul>${(k.sources || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
      <div class="mc-actions">
        <button class="btn ghost" data-mc-kickoff-reset="1">Back</button>
        <button class="btn" data-mc-kickoff-ingest="1">Continue to readiness</button>
      </div>
    </section>`;
  }

  function kickoffReadinessHtml(k) {
    const findings = (k.findings || []).map((f) =>
      `<div class="mc-card ${f.severity === "blocking" ? "warn" : ""}">${esc(f.message)}</div>`).join("")
      || `<div class="rempty">No operational gaps — ready to start.</div>`;
    return `<section class="mc-sec">
      <h3>Readiness</h3>
      <p>Director-resolved operational gaps and mission ambiguities:</p>
      ${findings}
      <p><b>Initial assignment plan:</b> ${esc(k.assignmentCount ?? "—")} deliverable assignment(s)</p>
      <p class="muted">Execution follows the Mission Brief phases. Director will not invent a new plan.</p>
      <div class="mc-actions">
        <button class="btn" data-mc-kickoff-start="${esc(k.missionId || "")}" ${k.canStart === false ? "disabled" : ""}>${esc(k.primaryAction?.label || "Start mission")}</button>
      </div>
    </section>`;
  }

  V2.viewSettings = function () {
    return shell("Settings", { lead: "Diagnostics and legacy tools." }) + `
      <section class="mc-sec">
        <h3>Diagnostics</h3>
        <p class="muted">Compatibility surfaces for the previous Command Center.</p>
        <h4>Legacy tools</h4>
        <div class="row gap">
          <button class="btn ghost" data-legacy-nav="command">Open Legacy Board</button>
          <button class="btn ghost" data-legacy-nav="director">Open Legacy Director</button>
        </div>
      </section>
    </div>`;
  };

  // Answer decision
  async function answerDecision(missionId, decisionId, optionId, response) {
    V2.state.kickoffBusy = "Recording your decision";
    bump(); schedulePaint();
    try {
      await post("/api/v2/decisions/answer", {
        mission_id: missionId,
        decision_id: decisionId,
        chosen_option_id: optionId,
        response: response || "Operator answered from Mission Control",
      });
      V2.state.decisionDetail = null;
      V2.state.overview = null;
      V2.state.decisionsVm = null;
      V2.state.needsYou = null;
      V2.state.kickoffBusy = null;
      bump(); schedulePaint();
      location.hash = "#/missions/" + encodeURIComponent(missionId);
    } catch (e) {
      V2.state.kickoffBusy = null;
      V2.state.kickoffError = e;
      bump(); schedulePaint();
    }
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-mc-answer],[data-mc-ask],[data-mc-reject],[data-mc-kickoff-paste],[data-mc-kickoff-md],[data-mc-kickoff-ingest],[data-mc-kickoff-start],[data-mc-kickoff-reset],[data-legacy-nav],[data-mc-retry]");
    if (!t) return;

    if (t.dataset.legacyNav) {
      const u = new URL(location.href);
      u.searchParams.set("legacy", "1");
      u.hash = "#/" + t.dataset.legacyNav;
      location.href = u.pathname + u.search + u.hash;
      return;
    }
    if (t.dataset.mcRetry === "missions") { V2.state.missionsHome = null; V2.fetchMissions(); return; }
    if (t.dataset.mcRetry?.startsWith("overview:")) {
      const id = t.dataset.mcRetry.slice(9);
      V2.state.overview = null;
      V2.fetchOverview(id);
      return;
    }
    if (t.dataset.mcRetry === "kickoff") { V2.state.kickoffError = null; bump(); schedulePaint(); return; }

    if (t.dataset.mcAnswer) {
      answerDecision(t.dataset.mission, t.dataset.mcAnswer, t.dataset.option);
      return;
    }
    if (t.dataset.mcAsk) {
      const msg = prompt("What should Director clarify?");
      if (msg) alert("Director note recorded locally: " + msg + "\n(Ask-Director channel will deliver in a later tranche.)");
      return;
    }
    if (t.dataset.mcReject) {
      const msg = prompt("Provide direction for Director:");
      if (!msg) return;
      const d = V2.state.decisionDetail?.decision;
      if (d) answerDecision(d.missionId, d.decisionId, d.options?.[d.options.length - 1]?.id || d.recommendationId, "Reject: " + msg);
      return;
    }

    if (t.dataset.mcKickoffReset) {
      V2.state.kickoffDraft = null;
      V2.state.kickoffStep = "empty";
      V2.state.kickoffError = null;
      V2.state.kickoffVm = null;
      bump(); schedulePaint();
      return;
    }

    if (t.dataset.mcKickoffPaste) {
      const raw = document.getElementById("mc-brief-json")?.value?.trim();
      if (!raw) { alert("Paste a Mission Brief JSON first"); return; }
      try {
        const j = JSON.parse(raw);
        V2.state.kickoffDraft = {
          mode: "review",
          title: j.title,
          objective: j.objective,
          phases: (j.plan || []).map((p) => ({ id: p.phaseId, title: p.title, objective: p.objective, outputs: p.requiredOutputs || [] })),
          acceptanceCriteria: j.acceptanceCriteria || [],
          constraints: (j.constraints || []).map((c) => (typeof c === "string" ? c : c.text)),
          sources: (j.sourceMaterials || []).map((s) => s.ref || s.title || s.id),
          raw: j,
          canStart: true,
          findings: [],
          assignmentCount: (j.plan || []).length,
          primaryAction: { label: "Start mission" },
        };
        V2.state.kickoffStep = "review";
        bump(); schedulePaint();
      } catch (e) {
        V2.state.kickoffError = e;
        bump(); schedulePaint();
      }
      return;
    }

    if (t.dataset.mcKickoffMd) {
      const md = document.getElementById("mc-brief-md")?.value?.trim() || "";
      if (!md) { alert("Paste a sprint brief first"); return; }
      const lines = md.split("\n");
      const title = (lines.find((l) => l.startsWith("# ")) || "# Untitled mission").replace(/^#\s+/, "");
      const bodyLines = lines.filter((l) => l && !l.startsWith("#"));
      const objective = bodyLines.join(" ").trim() || title;
      const phaseLines = [];
      let inPhases = false;
      for (const line of lines) {
        if (/^##\s+phases?/i.test(line)) { inPhases = true; continue; }
        if (inPhases && /^##\s+/.test(line)) break;
        if (inPhases && /^\s*[-*]\s+/.test(line)) phaseLines.push(line.replace(/^\s*[-*]\s+/, "").trim());
      }
      const plan = (phaseLines.length ? phaseLines : ["Initial delivery"]).map((t, i) => ({
        phaseId: `p${i + 1}`,
        order: i + 1,
        title: t,
        objective: t,
        requiredOutputs: [],
        acceptanceCriteriaIds: [`AC${i + 1}`],
        dependencies: i ? [`p${i}`] : [],
      }));
      const j = {
        title,
        objective,
        plan,
        acceptanceCriteria: plan.map((p, i) => ({ id: `AC${i + 1}`, statement: `${p.title} is complete with evidence` })),
        constraints: [{ id: "C1", text: "Do not push, merge, or promote without approval" }],
        sourceMaterials: [],
      };
      V2.state.kickoffDraft = {
        mode: "review",
        title,
        objective,
        phases: plan.map((p) => ({ id: p.phaseId, title: p.title, objective: p.objective, outputs: [] })),
        acceptanceCriteria: j.acceptanceCriteria,
        constraints: j.constraints.map((c) => c.text),
        sources: [],
        raw: j,
        canStart: true,
        findings: [],
        assignmentCount: plan.length,
        primaryAction: { label: "Start mission" },
      };
      V2.state.kickoffStep = "review";
      bump(); schedulePaint();
      return;
    }

    if (t.dataset.mcKickoffIngest) {
      const draft = V2.state.kickoffDraft;
      if (!draft?.raw) return;
      V2.state.kickoffBusy = "Saving Mission Brief";
      bump(); schedulePaint();
      post("/api/v2/missions/brief/ingest", draft.raw)
        .then((res) => {
          const mid = res.brief?.missionId || res.mission?.mission_id;
          V2.state.kickoffBusy = null;
          V2.state.kickoffDraft = {
            ...draft,
            missionId: mid,
            mode: "approval",
            findings: (res.readiness?.findings || []).map((f) => ({
              severity: f.blocking ? "blocking" : "info",
              message: f.message || f.code || "Finding",
            })),
            canStart: res.readiness?.ready !== false,
            assignmentCount: (draft.phases || []).length,
            primaryAction: { label: "Start mission" },
            version: res.brief?.version,
          };
          V2.state.kickoffStep = "readiness";
          bump(); schedulePaint();
        })
        .catch((e) => {
          V2.state.kickoffBusy = null;
          V2.state.kickoffError = e;
          bump(); schedulePaint();
        });
      return;
    }

    if (t.dataset.mcKickoffStart != null) {
      const draft = V2.state.kickoffDraft;
      const mid = t.dataset.mcKickoffStart || draft?.missionId;
      if (!mid) return;
      V2.state.kickoffBusy = "Starting mission";
      bump(); schedulePaint();
      post("/api/v2/missions/brief/approve", {
        mission_id: mid,
        brief_id: mid,
        version: draft?.version,
      })
        .then((res) => {
          V2.state.kickoffBusy = null;
          V2.state.kickoffDraft = null;
          V2.state.kickoffStep = "empty";
          V2.state.missionsHome = null;
          V2.state.overview = null;
          bump(); schedulePaint();
          const id = res.mission?.mission_id || mid;
          location.hash = "#/missions/" + encodeURIComponent(id);
        })
        .catch((e) => {
          V2.state.kickoffBusy = null;
          V2.state.kickoffError = e;
          bump(); schedulePaint();
        });
    }
  });

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => { if (!V2.state.missionsHome) V2.fetchMissions(); }, { timeout: 2000 });
  } else {
    setTimeout(() => { if (!V2.state.missionsHome) V2.fetchMissions(); }, 50);
  }
})();
