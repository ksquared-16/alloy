/**
 * Vacilando Mission Control UI (Execution System V2 §14–16).
 * Primary surfaces: Missions, Timeline, Workers, Decisions, Evidence, Settings.
 * Loaded after app.js; extends routing without duplicating the runtime.
 */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const api = async (p, b) => {
    const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) });
    return { status: r.status, data: await r.json() };
  };
  const get = async (p) => { const r = await fetch(p); return r.json(); };

  // Extend crumbs + default route
  if (typeof window.CRUMBS === "undefined") {
    // patch via app globals if exposed — we patch CRUMBS object in app by mutating after load
  }

  const V2 = (window.VacilandoV2 = window.VacilandoV2 || {});
  V2.state = V2.state || {};

  V2.fetchMissions = async () => {
    try {
      V2.state.missions = await get("/api/v2/missions");
      if (typeof window.render === "function") window.render(true);
    } catch { /* keep */ }
  };
  V2.fetchMission = async (id) => {
    try {
      V2.state.detail = await get("/api/v2/mission?id=" + encodeURIComponent(id));
      if (typeof window.render === "function") window.render(true);
    } catch { /* keep */ }
  };
  V2.fetchWorkers = async () => {
    try {
      V2.state.workers = await get("/api/v2/workers");
      if (typeof window.render === "function") window.render(true);
    } catch { /* keep */ }
  };
  V2.fetchDecisions = async () => {
    try {
      V2.state.decisions = await get("/api/v2/decisions?status=open");
      if (typeof window.render === "function") window.render(true);
    } catch { /* keep */ }
  };
  V2.fetchEvidence = async (missionId) => {
    try {
      const q = missionId ? "?mission_id=" + encodeURIComponent(missionId) : "";
      V2.state.evidence = await get("/api/v2/evidence" + q);
      if (typeof window.render === "function") window.render(true);
    } catch { /* keep */ }
  };

  V2.viewMissions = function () {
    if (!V2.state.missions) { V2.fetchMissions(); return `<div class="empty"><div class="big"><span class="spin"></span> Loading missions…</div></div>`; }
    const rows = (V2.state.missions.missions || []);
    const cards = rows.length ? rows.map((m) => {
      const pct = m.progress?.percent ?? 0;
      const phase = m.current_phase ? `Phase ${m.current_phase.index || "—"} of ${m.current_phase.total || "—"} · ${esc(m.current_phase.title)}` : "—";
      return `<div class="mc-card" data-nav="missions/${esc(m.mission_id)}">
        <div class="mc-card-h"><b>${esc(m.title)}</b>
          <span class="mbadge ${m.decision_required ? "auth" : m.status === "executing" ? "ok" : "muted"}">${esc(m.status_label || m.status)}</span></div>
        <div class="mc-card-p">${phase}</div>
        <div class="mc-prog"><div class="mc-prog-bar" style="width:${pct}%"></div></div>
        <div class="mc-card-m muted">${pct}% complete · Workers ${m.workers?.running || 0} running · ${m.workers?.validating || 0} validating · ${m.workers?.waiting || 0} waiting</div>
        <div class="mc-card-d">Director · ${esc(m.director_state || "—")}</div>
        <div class="mc-card-f">Decision required · ${m.decision_required ? "Yes" : "No"} · Updated ${esc((m.updated_at || "").replace("T", " ").slice(0, 16) || "—")}</div>
      </div>`;
    }).join("") : `<div class="rempty">No Mission Brief missions yet. Paste a plan to begin.</div>`;

    return `<div class="mc-wrap">
      <div class="mc-hero">
        <h2>Missions</h2>
        <p class="dsub">User-owned plans. Director operationalizes — it does not invent the product plan.</p>
        <button class="btn go" data-brief-intake>New Mission Brief</button>
        <button class="btn sm" data-nav="director">Legacy Director</button>
      </div>
      <div class="mc-list">${cards}</div>
    </div>`;
  };

  V2.viewMissionDetail = function (id) {
    const d = V2.state.detail;
    if (!d || d.mission_id !== id) { V2.fetchMission(id); return `<div class="empty"><div class="big"><span class="spin"></span> Opening mission…</div></div>`; }
    const s = d.summary || {};
    const kick = d.mission?.kickoff_status === "awaiting_kickoff_approval";
    const openDec = (d.open_decisions || [])[0];
    const timeline = (d.timeline || []).slice(-12).map((e) =>
      `<div class="tle"><span class="tle-t">${esc(e.type)}</span><span class="tle-s">${esc(e.summary)}</span><span class="tle-a muted">${esc((e.at || "").replace("T", " ").slice(0, 16))}</span></div>`
    ).join("");
    const workers = (d.workers || []).map((w) =>
      `<div class="mc-wrow" data-nav="workers/${esc(w.workerId)}"><b>${esc(w.workerId)}</b> · ${esc(w.status)}${w.slot ? ` · slot ${esc(w.slot)}` : ""}</div>`
    ).join("") || `<div class="muted">No worker heartbeats yet</div>`;
    const cov = (d.evidence || []).map((c) =>
      `<div class="mc-ac ${c.status}"><b>${esc(c.id)}</b> ${esc(c.statement || "")} · ${esc(c.status)} · ${c.evidence_count} evidence</div>`
    ).join("");
    const asgs = (d.assignments || []).map((a) =>
      `<div class="mc-asg"><span class="mbadge muted">${esc(a.status)}</span> <b>${esc(a.title)}</b></div>`
    ).join("");

    const kickoff = kick ? `<div class="kickoff-card">
      <div class="kickoff-h"><b>${esc(d.brief?.title || d.row?.title)}</b>
        <span class="muted">Brief v${esc(String(d.brief?.version))} · awaiting approval</span></div>
      <div class="kickoff-recv">Plan received · ${(d.brief?.plan || []).length} phases · ${(d.brief?.acceptanceCriteria || []).length} AC · ${(d.brief?.sourceMaterials || []).length} sources · ${(d.brief?.constraints || []).length} constraints</div>
      <div class="kickoff-changes"><div class="dlabel">Plan changes made by Director</div><div>None</div></div>
      <div class="kickoff-act"><button class="btn go" data-v2-approve="${esc(id)}" data-ver="${esc(String(d.brief?.version))}">Ready to begin</button></div>
    </div>` : "";

    const decisionCard = openDec ? V2.renderDecisionCard(openDec, { compact: true }) : "";

    return `<div class="mc-wrap wide">
      <div class="dmhead"><button class="btn sm" data-nav="missions">← Missions</button>
        <div class="dmtitle"><h2>${esc(d.brief?.title || d.row?.title || id)}</h2>
          <span class="dmintent">${esc(s.status?.label || d.status?.label || "")} · Brief v${esc(String(d.brief?.version || "—"))}</span></div>
        <span class="mbadge ok big">${esc(String(d.progress?.percent ?? 0))}%</span>
      </div>
      ${kickoff}
      <div class="mc-summary">
        <div class="dlabel">Director summary</div>
        <ol class="mc-q">
          <li><b>Where are we?</b> ${esc(s.where_are_we)}</li>
          <li><b>What changed?</b> ${esc(s.what_changed)}</li>
          <li><b>Are we blocked?</b> ${esc(s.blocked_detail || (s.are_we_blocked ? "Yes" : "No"))}</li>
          <li><b>Is user input required?</b> ${s.is_user_input_required ? "Yes" : "No"}</li>
          <li><b>What happens next?</b> ${esc(s.what_happens_next)}</li>
        </ol>
      </div>
      ${decisionCard}
      <div class="mc-grid">
        <section class="mc-sec"><div class="dlabel">Assignments</div>${asgs || "<div class='muted'>—</div>"}</section>
        <section class="mc-sec"><div class="dlabel">Workers</div>${workers}</section>
      </div>
      <section class="mc-sec"><div class="dlabel">Evidence coverage</div>${cov || "<div class='muted'>No acceptance criteria mapped yet</div>"}</section>
      <section class="timeline-seed"><div class="dlabel">Mission timeline</div>${timeline || "<div class='muted'>—</div>"}</section>
    </div>`;
  };

  V2.renderDecisionCard = function (d, { compact = false } = {}) {
    if (!d) return "";
    const opts = (d.options || []).map((o) =>
      `<button class="btn sm" data-v2-answer="${esc(d.decisionId)}" data-mission="${esc(d.missionId)}" data-opt="${esc(o.optionId)}">${esc(o.label)}</button>
       <div class="muted mc-opt-d">${esc(o.description || "")}</div>`
    ).join("");
    return `<div class="mc-decision ${compact ? "compact" : ""}" id="decision-${esc(d.decisionId)}">
      <div class="mc-decision-h"><b>${esc(d.title)}</b><span class="mbadge auth">Decision required</span></div>
      <div class="mc-d-q"><div class="dlabel">What happened?</div><p>${esc(d.situation)}</p></div>
      <div class="mc-d-q"><div class="dlabel">Why does it matter?</div><p>${esc(d.whyThisMatters)}</p></div>
      <div class="mc-d-q"><div class="dlabel">Director recommends</div><p><b>${esc(d.recommendation || "—")}</b> — ${esc(d.recommendationReason || "")}</p></div>
      <div class="mc-d-q"><div class="dlabel">Alternatives</div>${opts || "<div class='muted'>—</div>"}</div>
      <div class="mc-d-q"><div class="dlabel">Work paused</div><p>${esc((d.affectedAssignments || []).join(", ") || "None")}</p></div>
      <div class="muted">After you respond, affected workers re-acknowledge context and resume automatically.</div>
    </div>`;
  };

  V2.viewDecisions = function (decisionId) {
    if (!V2.state.decisions) { V2.fetchDecisions(); return `<div class="empty"><div class="big"><span class="spin"></span> Loading decisions…</div></div>`; }
    const list = V2.state.decisions.decisions || [];
    if (decisionId) {
      const d = list.find((x) => x.decisionId === decisionId);
      if (!d) {
        // fetch single
        get("/api/v2/decision?id=" + encodeURIComponent(decisionId)).then((j) => {
          V2.state.oneDecision = j.decision;
          if (typeof window.render === "function") window.render(true);
        });
        const one = V2.state.oneDecision;
        if (one && one.decisionId === decisionId) {
          return `<div class="mc-wrap mobile-decision">${V2.renderDecisionCard(one)}</div>`;
        }
        return `<div class="empty"><div class="big"><span class="spin"></span> Opening decision…</div></div>`;
      }
      return `<div class="mc-wrap mobile-decision">${V2.renderDecisionCard(d)}</div>`;
    }
    const rows = list.map((d) =>
      `<div class="mc-card" data-nav="decisions/${esc(d.decisionId)}?mission=${esc(d.missionId)}">
        <div class="mc-card-h"><b>${esc(d.title)}</b><span class="mbadge auth">Open</span></div>
        <div class="muted">${esc(d.situation).slice(0, 140)}</div>
      </div>`
    ).join("") || `<div class="rempty">No open decisions</div>`;
    return `<div class="mc-wrap"><div class="mc-hero"><h2>Decisions</h2><p class="dsub">Product and architecture choices only — routine engineering stays with Director.</p></div><div class="mc-list">${rows}</div></div>`;
  };

  V2.viewWorkers = function (workerId) {
    if (!V2.state.workers) { V2.fetchWorkers(); return `<div class="empty"><div class="big"><span class="spin"></span> Loading workers…</div></div>`; }
    if (workerId) {
      get("/api/v2/worker?id=" + encodeURIComponent(workerId)).then((j) => {
        V2.state.workerDetail = j;
        if (typeof render === "function") render(true);
      });
      const wd = V2.state.workerDetail;
      if (!wd || wd.telemetry?.workerId !== workerId) {
        return `<div class="empty"><div class="big"><span class="spin"></span> Opening worker…</div></div>`;
      }
      const t = wd.telemetry;
      const ev = (wd.evidence || []).map((a) =>
        `<div class="mc-ev"><b>${esc(a.type)}</b> ${esc(a.title)}${a.fileUri && a.type === "screenshot" ? ` <a href="${esc(a.fileUri)}" target="_blank">view</a>` : ""}</div>`
      ).join("");
      return `<div class="mc-wrap">
        <div class="dmhead"><button class="btn sm" data-nav="workers">← Workers</button>
          <div class="dmtitle"><h2>${esc(t.workerId)}</h2><span class="dmintent">${esc(t.status)}</span></div></div>
        <div class="mc-summary">
          <div>Slot ${esc(t.slot || "—")} · Port ${esc(t.port || "—")} · Branch ${esc(t.branch || "—")}</div>
          <div>Last heartbeat ${esc((t.lastHeartbeatAt || "").replace("T", " ").slice(0, 19))}</div>
          <div>Last progress ${esc((t.lastProgressAt || "").replace("T", " ").slice(0, 19))}</div>
          <div>CPU ${t.cpuPercent != null ? t.cpuPercent + "%" : "—"} · Mem ${t.memoryMb != null ? t.memoryMb + " MB" : "—"}</div>
          <div>Active command · ${esc(t.activeCommand || "—")}</div>
          <div>Assignment · ${esc(wd.assignment?.title || t.assignmentId || "—")}</div>
        </div>
        <section class="mc-sec"><div class="dlabel">Evidence</div>${ev || "<div class='muted'>—</div>"}</section>
        <details class="mc-diag"><summary>Diagnostic · raw telemetry</summary><pre class="mono">${esc(JSON.stringify(t, null, 2))}</pre></details>
      </div>`;
    }
    const rows = (V2.state.workers.workers || []).map((w) =>
      `<div class="mc-card" data-nav="workers/${esc(w.workerId)}">
        <div class="mc-card-h"><b>${esc(w.workerId)}</b><span class="mbadge ${w.status === "healthy" ? "ok" : w.status === "stalled" || w.status === "unresponsive" ? "err" : "muted"}">${esc(w.status)}</span></div>
        <div class="muted">slot ${esc(w.slot || "—")} · ${esc(w.activeCommand || "idle")}</div>
      </div>`
    ).join("") || `<div class="rempty">No worker heartbeats recorded</div>`;
    return `<div class="mc-wrap"><div class="mc-hero"><h2>Workers</h2><p class="dsub">Operational health and evidence — not raw terminals.</p></div><div class="mc-list">${rows}</div></div>`;
  };

  V2.viewEvidence = function () {
    if (!V2.state.evidence) { V2.fetchEvidence(); return `<div class="empty"><div class="big"><span class="spin"></span> Loading evidence…</div></div>`; }
    const galleries = V2.state.evidence.galleries || [];
    if (V2.state.evidence.artifacts) {
      const shots = (V2.state.evidence.artifacts || []).filter((a) => a.type === "screenshot");
      const rest = (V2.state.evidence.artifacts || []).filter((a) => a.type !== "screenshot");
      return `<div class="mc-wrap">
        <div class="mc-hero"><h2>Evidence gallery</h2></div>
        <div class="mc-shots">${shots.map((a) => `<figure class="mc-shot"><figcaption>${esc(a.title)}</figcaption><div class="muted">${esc(a.description || a.fileUri || "")}</div></figure>`).join("") || "<div class='muted'>No screenshots</div>"}</div>
        <div class="mc-list">${rest.map((a) => `<div class="mc-ev"><b>${esc(a.type)}</b> ${esc(a.title)}</div>`).join("")}</div>
        <section class="mc-sec"><div class="dlabel">Coverage</div>${(V2.state.evidence.coverage || []).map((c) => `<div class="mc-ac ${c.status}">${esc(c.id)} · ${esc(c.status)}</div>`).join("")}</section>
      </div>`;
    }
    const rows = galleries.map((g) =>
      `<div class="mc-card" data-evidence-mission="${esc(g.mission_id)}"><b>${esc(g.mission_id)}</b> · ${(g.artifacts || []).length} artifacts</div>`
    ).join("") || `<div class="rempty">No evidence yet</div>`;
    return `<div class="mc-wrap"><div class="mc-hero"><h2>Evidence</h2><p class="dsub">Screenshots and validation live with the mission.</p></div><div class="mc-list">${rows}</div></div>`;
  };

  V2.viewTimeline = function () {
    // Global timeline = concat recent mission timelines from missions list
    if (!V2.state.missions) { V2.fetchMissions(); return `<div class="empty"><div class="big"><span class="spin"></span> Loading…</div></div>`; }
    const ids = (V2.state.missions.missions || []).map((m) => m.mission_id).slice(0, 8);
    if (!V2.state.globalTimeline) {
      Promise.all(ids.map((id) => get("/api/v2/mission/timeline?id=" + encodeURIComponent(id))))
        .then((all) => {
          V2.state.globalTimeline = all.flatMap((t, i) => (t.timeline || []).map((e) => ({ ...e, mission_id: ids[i] })))
            .sort((a, b) => String(b.at).localeCompare(String(a.at)));
          if (typeof window.render === "function") window.render(true);
        });
      return `<div class="empty"><div class="big"><span class="spin"></span> Loading timeline…</div></div>`;
    }
    const rows = V2.state.globalTimeline.slice(0, 40).map((e) =>
      `<div class="tle"><span class="tle-t">${esc(e.type)}</span><span class="tle-s"><a data-nav="missions/${esc(e.mission_id)}">${esc(e.mission_id.slice(0, 12))}…</a> ${esc(e.summary)}</span><span class="tle-a muted">${esc((e.at || "").replace("T", " ").slice(0, 16))}</span></div>`
    ).join("") || `<div class="rempty">No timeline events</div>`;
    return `<div class="mc-wrap"><div class="mc-hero"><h2>Timeline</h2><p class="dsub">Structured system of record — not chat.</p></div><div class="timeline-seed">${rows}</div></div>`;
  };

  V2.showBriefIntake = function () {
    const ov = document.createElement("div");
    ov.className = "ov";
    ov.innerHTML = `<div class="ov-card wide">
      <h3>New Mission Brief</h3>
      <p class="muted">Paste your plan. Director will operationalize it — not invent a new product plan.</p>
      <label class="dlabel">Title</label>
      <input class="f-title" placeholder="Access & Identity V2" />
      <label class="dlabel">Objective</label>
      <textarea class="f-obj" rows="2" placeholder="Ship the approved Access & Identity V2 plan"></textarea>
      <label class="dlabel">Phases (one per line: id | title | objective)</label>
      <textarea class="f-phases" rows="6" placeholder="p0 | Catalog integrity | Lock permission catalog&#10;p1 | Audit trail | Durable audit log"></textarea>
      <label class="dlabel">Acceptance criteria (one per line: id | statement)</label>
      <textarea class="f-ac" rows="4" placeholder="AC1 | permission_definitions is canonical&#10;AC2 | mutations write audit events"></textarea>
      <label class="dlabel">Constraints (one per line)</label>
      <textarea class="f-c" rows="2" placeholder="No push without approval"></textarea>
      <label class="dlabel">Sources (one per line)</label>
      <textarea class="f-s" rows="2" placeholder="docs/platform/planning/…"></textarea>
      <div class="ov-actions">
        <button class="btn cancel">Cancel</button>
        <button class="btn go ok">Review readiness</button>
      </div>
      <div class="f-ready muted"></div>
    </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector(".cancel").onclick = close;
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    ov.querySelector(".ok").onclick = async () => {
      const title = ov.querySelector(".f-title").value.trim();
      const objective = ov.querySelector(".f-obj").value.trim();
      const plan = ov.querySelector(".f-phases").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => {
        const [phaseId, t, obj] = l.split("|").map((x) => x.trim());
        return { phaseId: phaseId || `p${i}`, order: i + 1, title: t || phaseId, objective: obj || "", requiredOutputs: [], acceptanceCriteriaIds: [] };
      });
      const acceptanceCriteria = ov.querySelector(".f-ac").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => {
        const [id, statement] = l.split("|").map((x) => x.trim());
        return { id: id || `AC${i + 1}`, statement: statement || id };
      });
      // Wire AC ids onto phases round-robin if empty
      plan.forEach((p, i) => {
        if (!p.acceptanceCriteriaIds.length && acceptanceCriteria[i]) p.acceptanceCriteriaIds = [acceptanceCriteria[i].id];
        else if (!p.acceptanceCriteriaIds.length && acceptanceCriteria[0]) p.acceptanceCriteriaIds = [acceptanceCriteria[0].id];
      });
      const constraints = ov.querySelector(".f-c").value.split("\n").map((l) => l.trim()).filter(Boolean).map((t, i) => ({ id: `C${i + 1}`, text: t }));
      const sourceMaterials = ov.querySelector(".f-s").value.split("\n").map((l) => l.trim()).filter(Boolean).map((ref, i) => ({ id: `S${i + 1}`, ref, kind: "document" }));
      const body = {
        title, objective, plan, acceptanceCriteria, constraints, sourceMaterials,
        executionPreferences: { mergeTarget: "staging", maxConcurrentWorkers: 1, requireUserApprovalBeforeMerge: true },
      };
      ov.querySelector(".f-ready").textContent = "Ingesting…";
      const { data } = await api("/api/v2/missions/brief/ingest", body);
      if (!data.ok) { ov.querySelector(".f-ready").textContent = data.error || "Failed"; return; }
      const r = data.readiness;
      const amb = (r.mission_ambiguities || []).map((g) => g.message).join("; ");
      const ops = (r.operational_gaps || []).map((g) => g.message).join("; ");
      ov.querySelector(".f-ready").innerHTML = `
        <div><b>Readiness:</b> ${r.ready ? "Ready" : "Blocked on mission ambiguity"}</div>
        ${amb ? `<div class="warnink">Mission ambiguities: ${esc(amb)}</div>` : ""}
        ${ops ? `<div class="muted">Operational gaps: ${esc(ops)}</div>` : ""}
        <div>Plan changes by Director: None</div>
        <button class="btn go" data-go-mission>Open mission</button>`;
      ov.querySelector("[data-go-mission]").onclick = () => {
        close();
        location.hash = "#/missions/" + data.mission.mission_id;
      };
      V2.state.missions = null;
    };
  };

  // Click handlers
  document.addEventListener("click", async (e) => {
    const t = (a) => e.target.closest(a);
    let n;
    if ((n = t("[data-brief-intake]"))) { e.preventDefault(); V2.showBriefIntake(); return; }
    if ((n = t("[data-evidence-mission]"))) {
      e.preventDefault();
      V2.state.evidence = null;
      await V2.fetchEvidence(n.dataset.evidenceMission);
      return;
    }
    if ((n = t("[data-v2-approve]"))) {
      e.preventDefault();
      const { data } = await api("/api/v2/missions/brief/approve", {
        brief_id: n.dataset.v2Approve,
        mission_id: n.dataset.v2Approve,
        version: Number(n.dataset.ver),
      });
      if (typeof toast === "function") toast(data.ok ? "ok" : "err", data.ok ? "Executing" : "Blocked", data.detail || data.error || "");
      V2.state.detail = null;
      await V2.fetchMission(n.dataset.v2Approve);
      return;
    }
    if ((n = t("[data-v2-answer]"))) {
      e.preventDefault();
      const { data } = await api("/api/v2/decisions/answer", {
        mission_id: n.dataset.mission,
        decision_id: n.dataset.v2Answer,
        chosen_option_id: n.dataset.opt,
      });
      if (typeof toast === "function") toast(data.ok ? "ok" : "err", data.ok ? "Decision recorded" : "Failed", data.error || "");
      V2.state.decisions = null;
      V2.state.detail = null;
      if (typeof render === "function") render(true);
      return;
    }
  });

  // Patch app routing — monkey-patch render's view map via wrapping
  const origParse = window.parseRoute;
  // We can't access parseRoute if not global. Patch via hashchange + override after app defines render.

  V2.install = function () {
    // Patch CRUMBS if we can find setActiveNav's closure — instead update #nav and intercept render.
    const nav = document.getElementById("nav");
    if (nav && !nav.dataset.v2) {
      nav.dataset.v2 = "1";
      nav.innerHTML = `
        <a data-route="missions"><svg class="ico"><use href="#i-sprints"/></svg>Missions</a>
        <a data-route="timeline"><svg class="ico"><use href="#i-activity"/></svg>Timeline</a>
        <a data-route="workers"><svg class="ico"><use href="#i-workers"/></svg>Workers</a>
        <a data-route="decisions"><svg class="ico"><use href="#i-approvals"/></svg>Decisions<span class="badge" id="nb-decisions">0</span></a>
        <a data-route="evidence"><svg class="ico"><use href="#i-repo"/></svg>Evidence</a>
        <a data-route="settings"><svg class="ico"><use href="#i-repo"/></svg>Settings</a>
        <div class="nav-sep"></div>
        <a data-route="director" class="muted-nav"><svg class="ico"><use href="#i-home"/></svg>Legacy Director</a>
        <a data-route="command" class="muted-nav"><svg class="ico"><use href="#i-home"/></svg>Command Center</a>
        <a data-route="trust" class="muted-nav"><svg class="ico"><use href="#i-approvals"/></svg>Runtime Trust</a>
      `;
    }

    // Wrap render
    if (window.__v2RenderWrapped) return;
    const tryWrap = () => {
      // Access render from the script scope — it's not on window. Use MutationObserver on #view via hash routing instead.
    };
    tryWrap();
  };

  // Override by patching the hash router: listen and replace #view when on v2 routes
  function v2Route() {
    const p = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    // support ?mission= on decisions
    const name = p[0] || "missions";
    let param = p[1];
    if (param && param.includes("?")) param = param.split("?")[0];
    return { name, param, raw: p };
  }

  const V2_ROUTES = new Set(["missions", "timeline", "workers", "decisions", "evidence"]);

  function paintV2() {
    const r = v2Route();
    if (!V2_ROUTES.has(r.name) && r.name !== "") return false;
    if (!r.name || r.name === "") {
      // default to missions
    }
    const name = r.name || "missions";
    if (!V2_ROUTES.has(name)) return false;
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
    const crumb = document.getElementById("crumb");
    if (crumb) crumb.textContent = ({ missions: "Missions", timeline: "Timeline", workers: "Workers", decisions: "Decisions", evidence: "Evidence" })[name] || name;
    const V = document.getElementById("view");
    if (!V) return true;
    if (name === "missions" && r.param) V.innerHTML = V2.viewMissionDetail(r.param);
    else if (name === "missions") V.innerHTML = V2.viewMissions();
    else if (name === "timeline") V.innerHTML = V2.viewTimeline();
    else if (name === "workers" && r.param) V.innerHTML = V2.viewWorkers(r.param);
    else if (name === "workers") V.innerHTML = V2.viewWorkers();
    else if (name === "decisions" && r.param) V.innerHTML = V2.viewDecisions(r.param);
    else if (name === "decisions") V.innerHTML = V2.viewDecisions();
    else if (name === "evidence") V.innerHTML = V2.viewEvidence();
    return true;
  }

  // Intercept render by observing hash and taking over #view for V2 routes
  const _render = () => {
    V2.install();
    if (paintV2()) return;
  };

  window.addEventListener("hashchange", () => { _render(); });
  // Patch app's render: monkey-patch after a tick by wrapping Mutation... instead override go default
  document.addEventListener("DOMContentLoaded", () => {
    V2.install();
    if (!location.hash || location.hash === "#" || location.hash === "#/") location.hash = "#/missions";
    _render();
    // Re-paint after app.js render clobbers us
    const V = document.getElementById("view");
    if (V) {
      const mo = new MutationObserver(() => {
        const r = v2Route();
        if (V2_ROUTES.has(r.name || "missions") && V2_ROUTES.has(r.name)) {
          // If app rendered command center into a V2 route, repaint
          if (V.querySelector(".mc-wrap") || V.querySelector(".kickoff-card")) return;
          if (V2_ROUTES.has(r.name)) paintV2();
        }
      });
      mo.observe(V, { childList: true });
    }
    // Periodic soft refresh of open-decision badge
    setInterval(async () => {
      try {
        const j = await get("/api/v2/decisions?status=open");
        const el = document.getElementById("nb-decisions");
        if (el) el.textContent = String((j.decisions || []).length);
      } catch { /* ignore */ }
    }, 8000);
  });

  // Also run install immediately if DOM ready
  if (document.readyState !== "loading") {
    V2.install();
    if (!location.hash || location.hash === "#" || location.hash === "#/") location.hash = "#/missions";
    setTimeout(_render, 0);
    setTimeout(_render, 200);
    setTimeout(_render, 800);
  }
})();
