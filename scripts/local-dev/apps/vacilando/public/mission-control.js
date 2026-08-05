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
  let apiToken = null;
  async function ensureApiSession() {
    if (apiToken !== null) return apiToken;
    try {
      const r = await fetch("/api/v2/session", { cache: "no-store" });
      const j = await r.json();
      apiToken = j.authRequired ? (j.token || "") : "";
    } catch {
      apiToken = "";
    }
    return apiToken;
  }

  const get = async (p) => {
    const headers = {};
    if (p.startsWith("/api/v2/deliverable-reviews") || p.startsWith("/api/v2/director/messages")) {
      const tok = await ensureApiSession();
      if (tok) headers.Authorization = `Bearer ${tok}`;
    }
    const r = await fetch(p, { cache: "no-store", headers });
    if (!r.ok) throw new Error(`http_${r.status}`);
    return r.json();
  };
  const post = async (p, body) => {
    const headers = { "content-type": "application/json" };
    if (p.startsWith("/api/v2/deliverable-reviews") || p.startsWith("/api/v2/director/")) {
      const tok = await ensureApiSession();
      if (tok) headers.Authorization = `Bearer ${tok}`;
    }
    if (body?.idempotency_key || body?.idempotencyKey) {
      headers["X-Idempotency-Key"] = body.idempotency_key || body.idempotencyKey;
    }
    const r = await fetch(p, {
      method: "POST",
      headers,
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

  const DEFAULT_MAX_AGE_MS = 12000;

  function markFetched(key) {
    V2.state._fetchedAt = V2.state._fetchedAt || {};
    V2.state._fetchedAt[key] = Date.now();
  }

  /** Soft-expire: next paint revalidates, but keeps last-known data until fetch returns. */
  V2.expirePresentationCaches = function () {
    V2.state._fetchedAt = {};
    V2.state._decisionRevalidated = null;
  };

  /**
   * Stale-while-revalidate. If cache is older than maxAgeMs (or missing), kick a
   * fetch without blanking the current view. Hard-invalidated keys have no data.
   */
  V2.revalidate = function (key, fetcher, { maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
    const at = V2.state._fetchedAt?.[key] || 0;
    const stale = Date.now() - at > maxAgeMs;
    if (!stale) return false;
    V2.state._inflight = V2.state._inflight || {};
    if (V2.state._inflight[key]) return true;
    V2.state._inflight[key] = true;
    Promise.resolve()
      .then(() => fetcher())
      .catch(() => { /* keep prior */ })
      .finally(() => {
        if (V2.state._inflight) V2.state._inflight[key] = false;
        markFetched(key);
      });
    return true;
  };

  /** Fingerprint for paint suppression — ignore heartbeat / relative-time churn. */
  function stableViewFingerprint(value) {
    const VOLATILE = new Set([
      "updatedAt", "updated_at", "updatedLabel", "timeLabel", "heartbeatLabel",
      "heartbeatSecondsAgo", "generatedAt", "generated_at", "sessionDuration",
      "lastHeartbeatAt", "estimatedCheckpoint", "estimatedCheckpointLabel",
    ]);
    const walk = (v) => {
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") {
        const out = {};
        for (const [k, val] of Object.entries(v)) {
          if (VOLATILE.has(k)) continue;
          out[k] = walk(val);
        }
        return out;
      }
      return v;
    };
    try { return JSON.stringify(walk(value)); } catch { return String(Date.now()); }
  }

  function paintIfChanged(cacheKey, payload, { force = false } = {}) {
    const next = stableViewFingerprint(payload);
    V2.state._paintFp = V2.state._paintFp || {};
    if (!force && V2.state._paintFp[cacheKey] === next) return false;
    V2.state._paintFp[cacheKey] = next;
    bump();
    schedulePaint();
    return true;
  }

  /** Update heartbeat / activity copy in place — avoids full-page flash. */
  function patchLiveActivity(payload) {
    const dash = payload?.dashboard || payload?.overview || payload;
    const work = dash?.currentWork || [];
    for (const w of work) {
      const live = w.liveActivity;
      if (!live?.sessionId) continue;
      const sid = String(live.sessionId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const el = document.querySelector(`[data-live-session="${sid}"]`);
      if (!el) continue;
      const bits = [
        live.filesInspected != null ? `${live.filesInspected} files inspected` : null,
        live.percent != null ? `${live.percent}% complete` : null,
        live.heartbeatLabel ? `Heartbeat: ${live.heartbeatLabel}` : null,
        live.estimatedCheckpoint ? `Estimated checkpoint: ${live.estimatedCheckpoint}` : null,
      ].filter(Boolean).join(" · ");
      const title = el.querySelector("[data-live-title]");
      const detail = el.querySelector("[data-live-detail]");
      const meta = el.querySelector("[data-live-meta]");
      if (title) title.textContent = `${live.workerLabel || "Worker"} · ${live.activity || "—"}`;
      if (detail) {
        if (live.detail) { detail.hidden = false; detail.textContent = live.detail; }
        else detail.hidden = true;
      }
      if (meta) meta.textContent = bits;
    }
  }

  /** Drop cached Mission Control views so Refresh / external Director answers are visible. */
  V2.invalidatePresentationCaches = function () {
    V2.state.decisionDetail = null;
    V2.state.decisionDetailError = null;
    V2.state._decisionRevalidated = null;
    V2.state.decisionsVm = null;
    V2.state.needsYou = null;
    V2.state.overview = null;
    V2.state.missionsHome = null;
    V2.state.timelineVm = null;
    V2.state.timelineMissionId = null;
    V2.state.workersHome = null;
    V2.state.workerDetail = null;
    V2.state.evidenceVm = null;
    V2.state.evidenceMissionId = null;
    V2.state.runtimeDiagnostics = null;
    V2.state.trustedHostDiagnostics = null;
    V2.state.improvementsHome = null;
    V2.state.improvementDetail = null;
    V2.state.workspaceRuntime = null;
    V2.state.workspaceId = null;
    V2.state.workspaceShell = null;
    V2.state.workspaceMessages = null;
    V2.state.workspaceMessagesStatus = null;
    V2.state.workspacePage = null;
    V2.state._fetchedAt = {};
    V2.state._inflight = {};
    V2.state._paintFp = {};
  };

  /** Reload whatever Mission Control route is on screen after a hard invalidate. */
  V2.reloadActiveView = function () {
    let name = "missions";
    let sub = null;
    let missionQ = null;
    try {
      const raw = location.hash.replace(/^#\/?/, "");
      const [pathPart, queryPart] = raw.split("?");
      const p = (pathPart || "").split("/").filter(Boolean);
      name = p[0] || "missions";
      sub = p[1] || null;
      missionQ = new URLSearchParams(queryPart || "").get("mission");
    } catch { /* */ }
    if (name === "needs-you") V2.fetchNeedsYou();
    else if (name === "workspaces" || name === "workspace") V2.fetchWorkspace(sub || "ws_identity");
    else if (name === "missions" && sub) V2.fetchDashboard(sub);
    else if (name === "missions") V2.fetchMissions(V2.state.missionsFilter || "active");
    else if (name === "timeline") V2.fetchTimeline(sub || missionQ || V2.state.selectedMissionId);
    else if (name === "workers" && sub) V2.fetchWorker(sub);
    else if (name === "workers") V2.fetchWorkers();
    else if (name === "decisions" && sub) V2.fetchDecision(sub, V2.state.selectedMissionId);
    else if (name === "decisions") V2.fetchDecisions(missionQ || V2.state.selectedMissionId);
    else if (name === "evidence") V2.fetchEvidence(sub || missionQ || V2.state.selectedMissionId);
    else if (name === "settings") V2.fetchRuntimeDiagnostics?.();
    else if (name === "improvements" && sub) V2.fetchImprovement(sub);
    else if (name === "improvements") V2.fetchImprovements();
    else V2.fetchNeedsYou();
    bump();
    schedulePaint();
  };

  /** True while Improve / review / confirm dialogs own the screen. */
  V2.hasOperatorOverlay = function () {
    return !!document.querySelector(".ov");
  };

  /** Apply a known revision bump (invalidate + reload). */
  V2.applyPresentationRevision = function (next) {
    if (V2.hasOperatorOverlay()) {
      V2.state._pendingServerRevision = next;
      return false;
    }
    V2.state._serverRevision = next;
    V2.state._pendingServerRevision = null;
    V2.invalidatePresentationCaches();
    V2.reloadActiveView();
    return true;
  };

  /**
   * Poll control-plane revision. When Director/workers mutate durable state
   * outside this window, caches drop and the active view reloads.
   * Never hard-reloads while an operator dialog is open (avoids flash / focus loss).
   */
  V2.syncPresentationRevision = async function ({ force = false } = {}) {
    if (V2.state._revisionInflight) return;
    V2.state._revisionInflight = true;
    try {
      const j = await get("/api/v2/revision");
      const next = j.revision || "";
      const prev = V2.state._serverRevision || null;
      V2.state._serverRevisionAt = Date.now();
      const changed = !!(prev && next && prev !== next);
      if (force || changed) {
        if (!V2.applyPresentationRevision(next) && !force) {
          // Deferred under overlay — keep displayed revision as prev until dialog closes.
          return;
        }
        try { await V2.fetchNeedsYou(); } catch { /* */ }
      } else {
        V2.state._serverRevision = next || prev;
        if (!prev) {
          try { await V2.fetchNeedsYou(); } catch { /* */ }
        }
      }
    } catch { /* offline — keep prior */ }
    finally {
      V2.state._revisionInflight = false;
    }
  };

  V2.flushPendingPresentationRevision = function () {
    const pending = V2.state._pendingServerRevision;
    if (!pending || V2.hasOperatorOverlay()) return;
    V2.applyPresentationRevision(pending);
    V2.fetchNeedsYou?.().catch(() => {});
  };

  V2.startFreshnessLoop = function () {
    if (V2.state._freshnessStarted) return;
    V2.state._freshnessStarted = true;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      if (V2.hasOperatorOverlay()) return;
      V2.flushPendingPresentationRevision();
      try {
        const raw = location.hash.replace(/^#\/?/, "");
        const name = (raw.split("?")[0] || "").split("/").filter(Boolean)[0] || "missions";
        if (!V2.isPrimaryRoute(name)) return;
      } catch { return; }
      V2.syncPresentationRevision();
    };
    setInterval(tick, 2500);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (V2.hasOperatorOverlay()) {
          V2.syncPresentationRevision({ force: false });
          return;
        }
        V2.flushPendingPresentationRevision();
        V2.syncPresentationRevision({ force: false });
        // Soft expire only — do not hard-reload the whole view on every focus.
        V2.expirePresentationCaches();
      }
    });
    window.addEventListener("focus", () => {
      V2.syncPresentationRevision({ force: false });
    });
    window.addEventListener("hashchange", () => {
      // Soft-expire on navigation so the destination revalidates without blanking.
      V2.expirePresentationCaches();
      // Route changes dismiss leftover dialogs so MC is never locked.
      document.querySelectorAll(".ov").forEach((el) => {
        try { el.remove(); } catch { /* */ }
      });
      V2.flushPendingPresentationRevision();
    });
    // Apply deferred revision shortly after an overlay closes.
    document.addEventListener("click", () => {
      queueMicrotask(() => V2.flushPendingPresentationRevision());
    }, true);
    // First sync shortly after boot.
    setTimeout(() => V2.syncPresentationRevision(), 400);
  };

  V2.isPrimaryRoute = function (name) {
    return ["workspaces", "workspace", "missions", "needs-you", "timeline", "workers", "decisions", "evidence", "kickoff", "improvements", "settings"].includes(name);
  };

  /** Skip revision-driven hard reloads while Workspace Runtime is opening. */
  const _origSync = V2.syncPresentationRevision;
  V2.syncPresentationRevision = async function (opts) {
    try {
      const raw = location.hash.replace(/^#\/?/, "");
      const name = (raw.split("?")[0] || "").split("/").filter(Boolean)[0] || "";
      if ((name === "workspaces" || name === "workspace") && !V2.state.workspaceMessages?.length) {
        return;
      }
    } catch { /* */ }
    return _origSync.call(V2, opts);
  };

  function currentOperatorContext() {
    const r = (() => {
      try {
        const raw = location.hash.replace(/^#\/?/, "");
        const [pathPart] = raw.split("?");
        const p = (pathPart || "").split("/").filter(Boolean);
        return { name: p[0] || "missions", sub: p[1] || null };
      } catch {
        return { name: "missions", sub: null };
      }
    })();
    const missionId = V2.state.selectedMissionId
      || (r.name === "missions" && r.sub ? r.sub : null)
      || (r.name === "kickoff" && r.sub ? r.sub : null)
      || (r.name === "timeline" && r.sub ? r.sub : null)
      || (r.name === "evidence" && r.sub ? r.sub : null)
      || null;
    const screenMap = {
      workspaces: "Missions",
      workspace: "Missions",
      missions: r.sub ? "Mission Dashboard" : "Missions",
      "needs-you": "Needs You",
      workers: "Workers",
      decisions: "Decisions",
      evidence: "Evidence",
      timeline: "Mission Journey",
      kickoff: "Mission Brief",
      improvements: "Improvements",
      settings: "Settings",
    };
    return {
      missionId,
      currentScreen: screenMap[r.name] || r.name,
      currentSection: r.sub || null,
      currentRoute: location.hash || "#/missions",
    };
  }

  function toast(msg, kind = "ok") {
    document.querySelectorAll(".toast").forEach((el) => el.remove());
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch { /* */ } }, 2800);
  }

  /** True when Mission Conversation Runtime is the active surface. */
  function onMissionConversation() {
    const h = location.hash || "";
    return h.startsWith("#/workspaces") || h.startsWith("#/workspace");
  }

  /** Stay on conversation — refresh shell + messages instead of Mission Dashboard. */
  async function refreshMissionConversation(missionId) {
    const id = missionId || V2.state.workspaceId || V2.state.selectedMissionId;
    if (!id) return;
    V2.state.workspaceShell = null;
    V2.state._wsInlineReviewOpen = false;
    V2.state._wsShowShots = false;
    await V2.fetchWorkspaceShell(id);
    await V2.fetchWorkspaceMessages(id);
  }

  function openImproveDialog() {
    document.querySelectorAll(".ov.ci-improve").forEach((el) => el.remove());
    const ov = document.createElement("div");
    ov.className = "ov ci-improve";
    ov.innerHTML = `<div class="ov-card wide" role="dialog" aria-label="Improve Vacilando">
      <h3>Improve Vacilando</h3>
      <p class="mc-lead">Tell Director what slowed you down or felt confusing.
We'll capture the context automatically.</p>
      <label class="ci-q">What happened?
        <textarea id="ci-happened" rows="5" autofocus placeholder="Examples:&#10;• I wasn't sure why the mission paused.&#10;• I expected Director to launch a worker.&#10;• I couldn't find the evidence.&#10;• The timeline didn't explain what changed."></textarea>
      </label>
      <label class="ci-q">What should have happened?
        <textarea id="ci-expected" rows="4" placeholder="Describe the experience you expected."></textarea>
      </label>
      <fieldset class="ci-interrupt">
        <legend>How much did this interrupt you?</legend>
        <label><input type="radio" name="ci-interrupt" value="Minor" /> Minor</label>
        <label><input type="radio" name="ci-interrupt" value="Moderate" checked /> Moderate</label>
        <label><input type="radio" name="ci-interrupt" value="Significant" /> Significant</label>
        <label><input type="radio" name="ci-interrupt" value="Blocked me" /> Blocked me</label>
      </fieldset>
      <div class="ov-actions">
        <button type="button" class="btn ghost" data-ci-cancel>Cancel</button>
        <button type="button" class="btn" data-ci-save>Send to Director</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", (ev) => {
      if (ev.target === ov || ev.target.closest("[data-ci-cancel]")) ov.remove();
    });
    ov.querySelector("[data-ci-save]")?.addEventListener("click", async () => {
      const what = ov.querySelector("#ci-happened")?.value?.trim();
      const expected = ov.querySelector("#ci-expected")?.value?.trim();
      const interrupt = ov.querySelector('input[name="ci-interrupt"]:checked')?.value || "Moderate";
      if (!what) {
        toast("Tell Director what happened.", "err");
        return;
      }
      const ctx = currentOperatorContext();
      try {
        await post("/api/v2/improvements", {
          what_happened: what,
          expected_behavior: expected || null,
          interrupt,
          mission_id: ctx.missionId,
          current_screen: ctx.currentScreen,
          current_section: ctx.currentSection,
          current_route: ctx.currentRoute,
        });
        ov.remove();
        toast("Observation captured.");
        V2.state.improvementsHome = null;
        if (location.hash.startsWith("#/improvements")) {
          V2.fetchImprovements();
        }
      } catch (e) {
        toast(String(e.message || e), "err");
      }
    });
    setTimeout(() => ov.querySelector("#ci-happened")?.focus(), 30);
  }

  V2.openImproveDialog = openImproveDialog;

  function missionSubnav(missionId, active) {
    if (!missionId) return "";
    const tabs = [
      ["dashboard", `missions/${missionId}`, "Dashboard"],
      ["timeline", `timeline/${missionId}`, "Journey"],
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
    if (action.kind === "inline_review_expand") {
      return `<button class="btn" type="button" data-ws-inline-review="${esc(action.missionId || "")}" data-review="${esc(action.reviewId || "")}">${esc(action.label || "Review Outcome")}</button>`;
    }
    if (action.kind === "drev_approve" && action.reviewId) {
      return `<button class="btn" type="button" data-drev-approve="${esc(action.reviewId)}" data-mission="${esc(action.missionId)}">${esc(action.label || "Approve")}</button>`;
    }
    if (action.kind === "drev_changes" && action.reviewId) {
      return `<button class="btn ghost" type="button" data-drev-changes="${esc(action.reviewId)}" data-mission="${esc(action.missionId)}">${esc(action.label || "Request Rework")}</button>`;
    }
    if (action.kind === "drev_recheck" && action.reviewId) {
      return `<button class="btn ghost" type="button" data-drev-recheck="${esc(action.reviewId)}" data-mission="${esc(action.missionId)}">${esc(action.label || "Recheck")}</button>`;
    }
    if (action.kind === "toggle_screenshots") {
      return `<button class="btn ghost" type="button" data-ws-toggle-shots="${esc(action.missionId || "")}">${esc(action.label || "View Screenshots")}</button>`;
    }
    if (action.kind === "server_start" && action.missionId) {
      return `<button class="btn" type="button" data-mc-server-start="${esc(action.missionId)}" data-worktree="${esc(action.worktree || "")}">${esc(action.label || "Start Server")}</button>`;
    }
    if (action.kind === "server_stop" && action.missionId) {
      return `<button class="btn ghost" type="button" data-mc-server-stop="${esc(action.missionId)}" data-worktree="${esc(action.worktree || "")}">${esc(action.label || "Stop")}</button>`;
    }
    if (action.kind === "server_restart" && action.missionId) {
      return `<button class="btn ghost" type="button" data-ws-server-restart="${esc(action.missionId)}" data-worktree="${esc(action.worktree || "")}">${esc(action.label || "Restart")}</button>`;
    }
    if (action.kind === "open_url" && action.href) {
      return `<a class="btn" href="${esc(action.href)}" target="_blank" rel="noopener">${esc(action.label || "Open")}</a>`;
    }
    if (action.kind === "worker_pause" || action.kind === "worker_resume" || action.kind === "worker_doctor" || action.kind === "sprint_finish" || action.kind === "open_pr") {
      return `<button class="btn ghost sm" type="button" data-ws-cmd="${esc(action.command || "")}" data-slot="${esc(action.slot)}" data-worktree="${esc(action.worktree || "")}" data-branch="${esc(action.branch || "")}">${esc(action.label)}</button>`;
    }
    if (action.kind === "certify_completion" && action.missionId) {
      return `<button class="btn" data-mc-certify="${esc(action.missionId)}">${esc(action.label || "Certify completion")}</button>`;
    }
    if (action.kind === "reject_completion" && action.missionId) {
      return `<button class="btn ghost" data-mc-reject-completion="${esc(action.missionId)}">${esc(action.label || "Not complete — send back")}</button>`;
    }
    if (action.kind === "reopen_work" && action.missionId) {
      return `<button class="btn" data-mc-reopen-work="${esc(action.missionId)}">${esc(action.label || "Request More Discovery")}</button>`;
    }
    if ((action.kind === "review_outcome" || action.kind === "review_deliverable") && action.missionId) {
      return `<button class="btn" data-mc-review-outcome="${esc(action.missionId)}">${esc(action.label || "Review deliverable")}</button>`;
    }
    if (action.kind === "recheck_deliverable" && action.missionId && action.reviewId) {
      return `<button class="btn" type="button" data-drev-recheck="${esc(action.reviewId)}" data-mission="${esc(action.missionId)}">${esc(action.label || "Have Director re-check")}</button>`;
    }
    if (action.kind === "ask_director_deliverable" && action.missionId) {
      return `<button class="btn ghost" type="button" data-drev-ask="${esc(action.reviewId || "")}" data-mission="${esc(action.missionId)}">${esc(action.label || "Ask Director")}</button>`;
    }
    if (action.kind === "advance_implementation" && action.missionId) {
      return `<button class="btn" data-mc-advance="${esc(action.missionId)}">${esc(action.label || "Begin Implementation")}</button>`;
    }
    if (action.kind === "park_outcome" && action.missionId) {
      return `<button class="btn ghost" data-mc-park-outcome="${esc(action.missionId)}">${esc(action.label || "Park Mission")}</button>`;
    }
    if (action.kind === "review_findings") {
      return `<button class="btn ghost" type="button" data-mc-review-findings="${esc(action.missionId || "")}">${esc(action.label || "Review Findings")}</button>`;
    }
    if (action.kind === "provide_feedback") {
      return `<button class="btn ghost" type="button" data-mc-provide-feedback="${esc(action.missionId || "")}">${esc(action.label || "Provide Feedback")}</button>`;
    }
    if (action.kind === "dispatch_ready" && action.missionId) {
      return `<button class="btn" data-mc-dispatch="${esc(action.missionId)}">${esc(action.label || "Start work")}</button>`;
    }
    if (action.kind === "resume_stalled" && action.missionId) {
      return `<button class="btn" data-mc-resume-stalled="${esc(action.missionId)}">${esc(action.label || "Resume work")}</button>`;
    }
    if (!action.href) return `<button class="btn" disabled>${esc(action.label || "Action")}</button>`;
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
  V2.fetchOverview = async (id) => {
    try {
      const had = Boolean(V2.state.overview);
      const payload = await get("/api/v2/views/mission/dashboard?id=" + encodeURIComponent(id));
      V2.state.overview = payload;
      V2.state.selectedMissionId = id;
      V2.state.overviewError = null;
      markFetched(`overview:${id}`);
      // Soft-patch live activity without a full shell rewrite when nothing material changed.
      // Always full-paint when recovering from a blank/missing dashboard.
      if (!paintIfChanged(`overview:${id}`, payload, { force: !had })) {
        patchLiveActivity(payload);
      }
    } catch (e) {
      V2.state.overviewError = String(e.message || e);
      bump(); schedulePaint();
    }
  };
  V2.fetchDashboard = V2.fetchOverview;
  V2.fetchNeedsYou = async () => {
    try {
      V2.state.needsYou = await get("/api/v2/views/needs-you");
      const items = V2.state.needsYou.items || [];
      const el = document.getElementById("nb-needs");
      if (el) el.textContent = String(items.length);
      try {
        if (window.vacilandoNative?.setDockBadge) window.vacilandoNative.setDockBadge(items.length);
      } catch { /* */ }
      markFetched("needsYou");
      paintIfChanged("needsYou", V2.state.needsYou);
    } catch { /* keep */ }
  };
  V2.fetchWorkers = async () => {
    try {
      V2.state.workersHome = await get("/api/v2/views/workers");
      markFetched("workers");
      bump(); schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchWorker = async (id) => {
    try {
      V2.state.workerDetail = await get("/api/v2/views/worker?id=" + encodeURIComponent(id));
      markFetched(`worker:${id}`);
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
      markFetched(`decisions:${missionId || "open"}`);
      bump(); schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchDecision = async (decisionId, missionId) => {
    try {
      let url = "/api/v2/views/decision?id=" + encodeURIComponent(decisionId);
      if (missionId) url += "&mission_id=" + encodeURIComponent(missionId);
      V2.state.decisionDetail = await get(url);
      V2.state.decisionDetailError = null;
      markFetched(`decision:${decisionId}`);
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
      markFetched(`timeline:${id}`);
      bump(); schedulePaint();
    } catch { /* keep */ }
  };
  V2.fetchEvidence = async (id) => {
    try {
      V2.state.evidenceVm = await get("/api/v2/views/mission/evidence?id=" + encodeURIComponent(id));
      V2.state.evidenceMissionId = id;
      markFetched(`evidence:${id}`);
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
      markFetched(`kickoff:${id || "empty"}`);
      bump(); schedulePaint();
    } catch (e) {
      V2.state.kickoffError = e;
      bump(); schedulePaint();
    }
  };

  /** V3-2 Workspace Runtime — fast shell + progressive messages. */
  V2.fetchWorkspaceShell = async function (workspaceId) {
    const id = workspaceId || V2.state.workspaceId || "ws_identity";
    const prevId = V2.state.workspaceId;
    if (prevId && prevId !== id) {
      V2.state.workspaceMessages = null;
      V2.state.workspaceMessagesStatus = "loading";
      V2.state.workspacePage = null;
      V2.state._wsStickBottom = true;
    }
    V2.state.workspaceId = id;
    const seq = (V2.state._wsShellSeq = (V2.state._wsShellSeq || 0) + 1);
    try {
      const j = await get("/api/v2/views/workspace-shell?id=" + encodeURIComponent(id));
      if (seq !== V2.state._wsShellSeq || V2.state.workspaceId !== id) return;
      V2.state.workspaceShell = j.shell || j;
      V2.state.workspaceList = j.shell?.missions || j.workspaces || V2.state.workspaceList || [];
      V2.state.workspaceError = null;
      // Compat shape for reply/actions that still read workspaceRuntime
      V2.state.workspaceRuntime = {
        ...(V2.state.workspaceRuntime || {}),
        kind: "workspace_runtime",
        workspace: V2.state.workspaceShell.workspace,
        missionId: V2.state.workspaceShell.missionId,
        currentState: V2.state.workspaceShell.currentState,
        currentStateCompact: V2.state.workspaceShell.currentStateCompact,
        context: V2.state.workspaceShell.context,
        operational: V2.state.workspaceShell.operational,
        inlineReview: V2.state.workspaceShell.inlineReview,
        sinceLastVisit: V2.state.workspaceShell.sinceLastVisit,
        composer: V2.state.workspaceShell.composer,
        messages: V2.state.workspaceMessages || [],
        page: V2.state.workspacePage || null,
        messagesStatus: V2.state.workspaceMessagesStatus || "loading",
      };
      if (j.shell?.missionId) V2.state.selectedMissionId = j.shell.missionId;
      markFetched(`workspace-shell:${id}`);
      // Best-effort PR lookup — does not block shell paint
      const wt = j.shell?.operational?.worker?.worktree;
      const br = j.shell?.operational?.worker?.branch;
      if (wt) {
        fetch(`/api/pr?worktree=${encodeURIComponent(wt)}&branch=${encodeURIComponent(br || "")}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((pr) => {
            if (V2.state.workspaceId !== id) return;
            V2.state._wsPr = pr;
            bump(); schedulePaint();
          })
          .catch(() => {});
      }
    } catch (e) {
      if (seq !== V2.state._wsShellSeq || V2.state.workspaceId !== id) return;
      V2.state.workspaceError = String(e.message || e);
    }
    bump(); schedulePaint();
    if (V2.state.workspaceId === id && !V2.state._wsSending) {
      V2.fetchWorkspaceMessages(id);
    }
  };

  V2.fetchWorkspaceMessages = async function (workspaceId, { beforeEventId = null, prepend = false } = {}) {
    const id = workspaceId || V2.state.workspaceId || "ws_identity";
    if (V2.state.workspaceId && V2.state.workspaceId !== id) return;
    const seq = (V2.state._wsMsgSeq = (V2.state._wsMsgSeq || 0) + 1);
    if (!prepend) V2.state.workspaceMessagesStatus = V2.state.workspaceMessages?.length ? "ready" : "loading";
    try {
      let url = "/api/v2/views/workspace-messages?id=" + encodeURIComponent(id) + "&limit=40";
      if (beforeEventId) url += "&before=" + encodeURIComponent(beforeEventId);
      const j = await get(url);
      if (seq !== V2.state._wsMsgSeq || V2.state.workspaceId !== id) return;
      const incoming = j.messages || [];
      if (prepend && V2.state.workspaceMessages?.length) {
        const have = new Set(V2.state.workspaceMessages.map((m) => m.messageId));
        const older = incoming.filter((m) => !have.has(m.messageId));
        V2.state.workspaceMessages = older.concat(V2.state.workspaceMessages);
        V2.state._wsStickBottom = false;
        V2.state._wsPreserveScroll = true;
      } else if (!prepend) {
        V2.state.workspaceMessages = incoming;
        V2.state._wsStickBottom = true;
      }
      V2.state.workspacePage = j.page || null;
      V2.state.workspaceMessagesStatus = j.messagesStatus || (incoming.length ? "ready" : "empty_known");
      V2.state.workspaceMessagesInlineReview = j.inlineReview || null;
      if (V2.state.workspaceRuntime) {
        V2.state.workspaceRuntime.messages = V2.state.workspaceMessages;
        V2.state.workspaceRuntime.page = V2.state.workspacePage;
        V2.state.workspaceRuntime.messagesStatus = V2.state.workspaceMessagesStatus;
        V2.state.workspaceRuntime.inlineReview = j.inlineReview || null;
        V2.state.workspaceRuntime.empty = j.empty;
      }
      markFetched(`workspace-messages:${id}`);
      // Fire-and-forget last-seen — do not block reading
      const newest = V2.state.workspaceMessages?.[V2.state.workspaceMessages.length - 1];
      if (newest?.messageId && !prepend) {
        post("/api/v2/workspace/last-seen", {
          workspace_id: id,
          event_id: newest.messageId,
          at: newest.createdAt || null,
        }).catch(() => {});
      }
    } catch (e) {
      if (seq !== V2.state._wsMsgSeq || V2.state.workspaceId !== id) return;
      if (!V2.state.workspaceMessages?.length) {
        V2.state.workspaceMessagesStatus = "error";
        V2.state.workspaceMessagesError = String(e.message || e);
      }
    }
    bump(); schedulePaint();
  };

  /** @deprecated use fetchWorkspaceShell — kept for reloadActiveView */
  V2.fetchWorkspace = function (workspaceId) {
    return V2.fetchWorkspaceShell(workspaceId);
  };

  V2.afterWorkspacePaint = function () {
    const thread = document.getElementById("ws-thread");
    if (thread) {
      if (V2.state._wsPreserveScroll && V2.state._wsScrollHeight != null) {
        thread.scrollTop = thread.scrollHeight - V2.state._wsScrollHeight;
        V2.state._wsPreserveScroll = false;
        V2.state._wsScrollHeight = null;
      } else if (V2.state._wsStickBottom !== false) {
        thread.scrollTop = thread.scrollHeight;
      }
    }
    const ta = document.getElementById("ws-composer");
    if (ta && V2.state._wsComposer != null) {
      ta.value = V2.state._wsComposer;
      try { ta.focus({ preventScroll: true }); } catch { /* */ }
    }
  };

  V2.viewWorkspace = function (workspaceId) {
    const id = workspaceId || V2.state.workspaceId || "ws_identity";
    const shellReady = V2.state.workspaceShell && V2.state.workspaceId === id;
    if (!V2.state._wsSending) {
      V2.revalidate(`workspace-shell:${id}`, () => V2.fetchWorkspaceShell(id), { maxAgeMs: 15000 });
    }
    if (!shellReady) {
      if (!V2.state._wsSending) V2.fetchWorkspaceShell(id);
      // Instant frame — never blank the whole app on cold open
      return `<div class="ws-shell ws-shell-boot" data-workspace="${esc(id)}">
        <aside class="ws-nav" aria-label="Missions">
          <div class="ws-nav-label">Missions</div>
          <button type="button" class="ws-nav-item on" data-nav="workspaces/${esc(id)}">
            <span class="ws-nav-title">Opening…</span>
            <span class="ws-nav-blurb">Loading mission…</span>
          </button>
        </aside>
        <section class="ws-main" aria-label="Conversation">
          <header class="ws-main-h"><h1>Mission</h1><p class="ws-main-sub">Opening conversation…</p></header>
          <div class="ws-thread" id="ws-thread"><div class="ws-loading"><span class="spin"></span> Loading conversation…</div></div>
          <footer class="ws-composer-wrap">
            <textarea id="ws-composer" class="ws-composer" rows="2" placeholder="Message…" disabled></textarea>
            <button type="button" class="btn ws-send" disabled>Send</button>
          </footer>
        </section>
        <aside class="ws-context" aria-label="Runtime">
          <div class="ws-ctx-label">Current State</div>
          <p class="ws-ctx-derived">Loading…</p>
        </aside>
      </div>`;
    }
    if (V2.state.workspaceError && !V2.state.workspaceShell) {
      return `<div class="ws-shell"><div class="rempty">Could not load mission: ${esc(V2.state.workspaceError)}</div>
        <button class="btn" type="button" data-ws-retry="${esc(id)}">Retry</button></div>`;
    }
    const rt = V2.state.workspaceShell;
    if (rt.missing) {
      return `<div class="ws-shell"><div class="rempty">Mission not found on this host.</div></div>`;
    }
    const ws = rt.workspace || {};
    const list = (rt.missions?.length ? rt.missions : null)
      || (V2.state.workspaceList?.length ? V2.state.workspaceList : [ws]);
    const compact = rt.currentStateCompact || {};
    const ops = rt.operational || rt.context?.operational || {};
    const worker = ops.worker || rt.context?.worker || {};
    const server = ops.server || rt.context?.server || {};
    const msgs = V2.state.workspaceMessages || [];
    const msgStatus = V2.state.workspaceMessagesStatus || rt.messagesStatus || "loading";
    const page = V2.state.workspacePage || {};
    const since = rt.sinceLastVisit;
    const inlineReview = V2.state._wsInlineReviewOpen
      ? (V2.state.workspaceMessagesInlineReview || rt.inlineReview)
      : null;
    const showShots = Boolean(V2.state._wsShowShots);

    const activeId = ws.workspaceId || ws.missionId || id;
    const nav = list.map((w) => {
      const mid = w.missionId || w.workspaceId || w.id;
      const active = mid === activeId || mid === id;
      const badge = w.needsYou || w.needsCount
        ? `<span class="ws-nav-badge">${esc(String(w.needsCount || "!"))}</span>`
        : "";
      const meta = [w.provider, w.slot != null ? `slot ${w.slot}` : null, w.phase]
        .filter(Boolean).join(" · ");
      return `<button type="button" class="ws-nav-item${active ? " on" : ""}" data-nav="workspaces/${esc(mid)}">
        <span class="ws-nav-row"><span class="ws-nav-title">${esc(w.title || "Mission")}</span>${badge}</span>
        ${meta ? `<span class="ws-nav-blurb">${esc(meta)}</span>` : ""}
      </button>`;
    }).join("");

    const sinceHtml = since ? `<section class="ws-since" aria-label="Since your last visit">
      <h2 class="ws-since-title">${esc(since.title || "Since your last visit")}</h2>
      <ul class="ws-since-list">
        ${(since.lines || []).map((l) => `<li title="${esc(l.provenance?.type || l.provenance?.source || "")}">${esc(l.text)}</li>`).join("")}
      </ul>
    </section>` : "";

    const reviewHtml = inlineReview ? `<section class="ws-inline-review" id="ws-inline-review">
      <header class="ws-inline-review-h">
        <h2>${esc(inlineReview.headline || "Review Outcome")}</h2>
        <button type="button" class="btn ghost sm" data-ws-inline-review-close>Close</button>
      </header>
      ${inlineReview.waveLabel ? `<p class="ws-inline-wave">${esc(inlineReview.waveLabel)}</p>` : ""}
      ${inlineReview.summary ? `<div class="ws-inline-block"><div class="ws-inline-k">Summary</div><p>${esc(inlineReview.summary)}</p></div>` : ""}
      ${inlineReview.recommendation ? `<div class="ws-inline-block"><div class="ws-inline-k">Recommendation</div><p>${esc(inlineReview.recommendation)}${inlineReview.confidencePct != null ? ` · ${esc(inlineReview.confidencePct)}%` : ""}</p></div>` : ""}
      ${(inlineReview.evidence || []).length ? `<div class="ws-inline-block"><div class="ws-inline-k">Evidence</div>
        <ul class="ws-artifact-list">${inlineReview.evidence.map((e) =>
          `<li>${e.previewHref
            ? `<button type="button" class="btn link sm" data-ws-artifact="${esc(e.previewHref)}" data-title="${esc(e.title || "")}">${esc(e.title || e.type || "Artifact")}</button>`
            : esc(e.title || e.type || "Artifact")}</li>`).join("")}</ul>
      </div>` : ""}
      ${showShots && (inlineReview.evidence || []).some((e) => e.previewHref)
        ? `<div class="ws-shot-grid">${inlineReview.evidence.filter((e) => e.previewHref).map((e) =>
          `<figure class="ws-shot"><img src="${esc(e.previewHref)}" alt="${esc(e.title || "")}" loading="lazy"/><figcaption>${esc(e.title || "")}</figcaption></figure>`).join("")}</div>`
        : ""}
      <div class="ws-msg-actions mc-actions">${(inlineReview.buttons || []).map((b) => actionBtn(b)).join("")}</div>
    </section>` : "";

    let threadBody = "";
    if (msgStatus === "loading" && !msgs.length) {
      threadBody = `<div class="ws-loading" data-ws-msgs-loading="1"><span class="spin"></span> Loading conversation…</div>`;
    } else if (msgStatus === "error" && !msgs.length) {
      threadBody = `<div class="ws-empty">Could not load conversation.
        <button type="button" class="btn sm" data-ws-retry-msgs="${esc(id)}">Retry</button></div>`;
    } else {
      const loadEarlier = page.hasEarlier
        ? `<div class="ws-load-earlier"><button type="button" class="btn ghost sm" data-ws-earlier="${esc(id)}" data-before="${esc(page.oldestEventId || "")}">Load earlier</button></div>`
        : "";
      const msgHtml = msgs.map((m) => {
        const from = m.from || {};
        const when = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
        const prov = m.provenance?.type ? `<span class="ws-msg-prov" title="Projected from ${esc(m.provenance.type)}">${esc(m.provenance.type)}</span>` : "";
        const actions = (m.actions || []).map((a) => actionBtn(a)).join("");
        const arts = (m.artifacts || []).filter((a) => a.previewHref || a.title).map((a) =>
          a.previewHref
            ? `<button type="button" class="ws-art-chip" data-ws-artifact="${esc(a.previewHref)}" data-title="${esc(a.title || "")}">${esc(a.title || a.type || "Artifact")}</button>`
            : `<span class="ws-art-chip">${esc(a.title || a.type || "")}</span>`
        ).join("");
        return `<article class="ws-msg role-${esc(from.role || "system")} kind-${esc(m.kind || "system")}" data-event="${esc(m.messageId || "")}">
          <header class="ws-msg-h">
            <span class="ws-msg-from">${esc(from.label || "System")}</span>
            <span class="ws-msg-when">${esc(when)}</span>
            ${prov}
          </header>
          <div class="ws-msg-body">${esc(m.body || "")}</div>
          ${m.detail && m.detail !== m.body ? `<div class="ws-msg-detail">${esc(m.detail)}</div>` : ""}
          ${arts ? `<div class="ws-msg-arts">${arts}</div>` : ""}
          ${actions ? `<div class="ws-msg-actions mc-actions">${actions}</div>` : ""}
        </article>`;
      }).join("");
      threadBody = loadEarlier + (msgHtml || `<div class="ws-empty">No projected messages yet.</div>`);
    }

    const stateCompact = `<div class="ws-state-compact">
      ${(compact.summaryLines || []).map((l) => `<div class="ws-state-line">${esc(l)}</div>`).join("") || `<div class="ws-state-line">${esc(compact.phase || "—")}</div>`}
      <dl class="ws-state-mini">
        <div><dt>Goal</dt><dd>${esc(compact.goal || "—")}</dd></div>
        <div><dt>Next</dt><dd>${esc(compact.next || "—")}</dd></div>
        ${compact.blockedBy ? `<div><dt>Blocked</dt><dd>${esc(compact.blockedBy)}</dd></div>` : ""}
      </dl>
    </div>`;

    const serverActions = (server.actions || []).map((a) => actionBtn(a)).join("");
    const workerActions = (ops.workerActions || []).map((a) => actionBtn(a)).join("");
    const prHref = V2.state._wsPr?.pr?.url || null;
    const prLabel = V2.state._wsPr?.pr?.number ? `PR #${V2.state._wsPr.pr.number}` : (prHref ? "Open PR" : "—");

    const ctxBits = `<div class="ws-ctx-block">
      <div class="ws-ctx-k">Runtime</div>
      <div class="ws-ctx-v">${esc(worker.provider || "—")}${worker.slot != null ? ` · slot ${esc(worker.slot)}` : ""}</div>
      <div class="ws-ctx-v mono muted">${esc(worker.worktree || "—")}</div>
      <div class="ws-ctx-v mono">${esc(worker.branch || "—")}</div>
    </div>
    <div class="ws-ctx-block">
      <div class="ws-ctx-k">Server</div>
      <div class="ws-ctx-v">${esc(server.statusLabel || server.status || "—")}${server.port ? ` · :${esc(server.port)}` : ""}</div>
      ${server.url ? `<div class="ws-ctx-v"><a href="${esc(server.url)}" target="_blank" rel="noopener">${esc(server.url)}</a></div>` : ""}
      <div class="ws-ctx-actions">${serverActions}</div>
    </div>
    <div class="ws-ctx-block">
      <div class="ws-ctx-k">PR</div>
      <div class="ws-ctx-v">${prHref ? `<a href="${esc(prHref)}" target="_blank" rel="noopener">${esc(prLabel)}</a>` : esc(prLabel)}</div>
    </div>
    <div class="ws-ctx-block">
      <div class="ws-ctx-k">Worker</div>
      <div class="ws-ctx-actions">${workerActions}</div>
    </div>`;

    const draft = V2.state._wsComposer || "";
    const busy = V2.state._wsSending ? " disabled" : "";
    const composerEnabled = rt.composer?.enabled !== false && !V2.state._wsSending;
    const artifactModal = V2.state._wsArtifact
      ? `<div class="ws-artifact-ov" data-ws-artifact-backdrop>
          <div class="ws-artifact-card" role="dialog">
            <header><b>${esc(V2.state._wsArtifact.title || "Artifact")}</b>
              <button type="button" class="btn ghost sm" data-ws-artifact-close>Close</button></header>
            <iframe src="${esc(V2.state._wsArtifact.href)}" title="Artifact"></iframe>
          </div>
        </div>`
      : "";

    return `<div class="ws-shell" data-workspace="${esc(activeId)}">
      <aside class="ws-nav" aria-label="Missions">
        <div class="ws-nav-label">Missions</div>
        ${nav}
      </aside>
      <section class="ws-main" aria-label="Conversation">
        <header class="ws-main-h">
          <h1>${esc(ws.title || "Mission")}</h1>
        </header>
        <div class="ws-thread" id="ws-thread">${sinceHtml}${reviewHtml}${threadBody}</div>
        <footer class="ws-composer-wrap">
          <textarea id="ws-composer" class="ws-composer" rows="2" placeholder="${esc(rt.composer?.placeholder || "Message…")}"${composerEnabled ? "" : " disabled"}>${esc(draft)}</textarea>
          <button type="button" class="btn ws-send" data-ws-send="${esc(activeId)}"${busy}>Send</button>
        </footer>
      </section>
      <aside class="ws-context" aria-label="Runtime">
        <div class="ws-ctx-label">Current State</div>
        ${stateCompact}
        <div class="ws-ctx-label">Operations</div>
        ${ctxBits}
      </aside>
      ${artifactModal}
    </div>`;
  };

  // ---- views ----
  V2.fetchMissions = async function (filter) {
    const f = filter || V2.state.missionsFilter || "active";
    V2.state.missionsFilter = f;
    try {
      V2.state.missionsHome = await get("/api/v2/views/missions?filter=" + encodeURIComponent(f));
      V2.state.missionsError = null;
      markFetched(`missions:${f}`);
    } catch (e) {
      V2.state.missionsError = String(e.message || e);
    }
    bump(); schedulePaint();
  };

  /**
   * DX-4 phase rail — shared by the Overview strip and the Mission Journey page.
   * Spec §10.2: complete ✓, you-are-here ●, decision gate ◆, upcoming ○.
   */
  V2.journeyRailHtml = function (rail, { currentId = null } = {}) {
    const items = rail || [];
    if (!items.length) return "";
    return `<ol class="mc-journey-rail" aria-label="Mission journey phases">
      ${items.map((s, i) => {
        const cur = s.current || s.status === "current" || s.id === currentId;
        const gate = Boolean(s.gate);
        const mark = s.status === "complete" ? "✓"
          : s.gatePending ? "◆"
            : cur ? "●"
              : s.status === "blocked" ? "!"
                : "○";
        const label = s.gateLabel
          ? `${s.title} — ${s.gatePending ? "decision waiting" : "decision"}: ${s.gateLabel}`
          : s.title;
        return `<li class="mc-journey-rail-item status-${esc(s.status || "")}${cur ? " here" : ""}${gate ? " gate" : ""}${s.gatePending ? " gate-pending" : ""}" title="${esc(label)}">
          ${i ? `<span class="mc-journey-rail-sep" aria-hidden="true">→</span>` : ""}
          <span class="mc-journey-rail-mark">${mark}</span>
          <span class="mc-journey-rail-title">${esc(s.title)}</span>
        </li>`;
      }).join("")}
    </ol>`;
  };

  V2.viewMissions = function () {
    V2.revalidate(`missions:${V2.state.missionsFilter || "active"}`, () => V2.fetchMissions(V2.state.missionsFilter || "active"));
    if (!V2.state.missionsHome && !V2.state.missionsError) {
      V2.fetchMissions(V2.state.missionsFilter || "active");
      return shell("Director Portfolio", {
        actions: `<button class="btn" data-nav="kickoff">Create Mission</button>`,
      }) + `<div class="empty"><div class="big"><span class="spin"></span> Loading portfolio…</div></div></div>`;
    }
    if (V2.state.missionsError && !V2.state.missionsHome) {
      return shell("Director Portfolio") + errPanel("Could not load portfolio", { message: V2.state.missionsError }, { retry: "missions" }) + `</div>`;
    }
    const home = V2.state.missionsHome || {};
    const filter = home.filter || V2.state.missionsFilter || "active";
    const pf = home.portfolio || {};
    const counts = pf.counts || {};
    const empty = pf.emptyState || home.emptyState;
    const isHistory = filter === "archived" || filter === "history";

    function portfolioCardHtml(m) {
      const conf = m.confidence?.percent != null
        ? `${m.confidence.percent}%${m.confidence.bandLabel ? ` · ${m.confidence.bandLabel}` : ""}`
        : (m.confidence?.bandLabel || "—");
      return `<article class="mc-card mc-portfolio-card tone-${esc(m.outcome?.tone || "neutral")}${m.stale ? " is-stale" : ""}">
        <div class="mc-card-h">
          <b data-nav="missions/${esc(m.missionId)}" style="cursor:pointer">${esc(m.title)}</b>
          <span class="mc-pill">${esc(m.statusLabel || m.groupLabel)}</span>
        </div>
        <dl class="mc-portfolio-dl">
          <div><dt>Phase</dt><dd>${esc(m.phase || "—")}</dd></div>
          <div><dt>Outcome</dt><dd>${esc(m.outcome?.label || "—")}${m.outcome?.sentence ? `<span class="muted"> — ${esc(m.outcome.sentence)}</span>` : ""}</dd></div>
          <div><dt>Recommendation</dt><dd>${esc(m.recommendation || "—")}</dd></div>
          ${m.blocker ? `<div><dt>Blocker</dt><dd class="mc-portfolio-blocker">${esc(m.blocker)}</dd></div>` : ""}
          <div><dt>Owner</dt><dd>${esc(m.owner || "—")}</dd></div>
          <div><dt>Confidence</dt><dd>${esc(conf)}</dd></div>
        </dl>
        <div class="mc-card-meta muted">${esc(m.deliverablesLabel || "")}${m.updatedLabel ? ` · ${esc(m.updatedLabel)}` : ""}${m.stale ? " · Stale" : ""}</div>
        <div class="mc-card-cta mc-actions">${m.archived
          ? `<button class="btn ghost" data-nav="missions/${esc(m.missionId)}">Open history</button>`
          : `${actionBtn(m.nextAction || m.primaryAction)}${m.secondaryAction ? actionBtn(m.secondaryAction) : ""}
             <button class="btn ghost" data-nav="missions/${esc(m.missionId)}">Open</button>`}</div>
      </article>`;
    }

    const countStrip = isHistory ? "" : `<section class="mc-portfolio-counts" aria-label="Portfolio counts">
      <div class="mc-stat-grid mc-home-stats mc-portfolio-stat-grid">
        <div class="mc-stat"><div class="mc-stat-k">Active</div><div class="mc-stat-v">${counts.active ?? 0}</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Waiting on Director</div><div class="mc-stat-v">${counts.needsAttention ?? 0}</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Blocked</div><div class="mc-stat-v">${counts.blocked ?? 0}</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Ready for Implementation</div><div class="mc-stat-v">${counts.readyImplementation ?? 0}</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Ready for Promotion</div><div class="mc-stat-v">${counts.readyClose ?? 0}</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Recently Completed</div><div class="mc-stat-v">${counts.completedRecently ?? 0}</div></div>
      </div>
    </section>`;

    const focusCards = (pf.focus || []).slice(0, 5);
    const cc = pf.commandCenter || home.commandCenter || {};
    const ccLanes = (cc.lanes || []).filter((l) => (l.cards || []).length > 0);

    function commandCardHtml(c) {
      const conf = c.confidence?.percent != null
        ? `${c.confidence.percent}%${c.confidence.bandLabel ? ` · ${c.confidence.bandLabel}` : ""}`
        : (c.confidence?.bandLabel || "—");
      return `<article class="mc-card mc-command-card" data-command-lane="${esc(c.laneId || "")}">
        <div class="mc-card-h">
          <div>
            <p class="mc-portfolio-kicker">${esc(c.actionTitle || c.laneLabel || "Action")}</p>
            <b data-nav="missions/${esc(c.missionId)}" style="cursor:pointer">${esc(c.title)}</b>
          </div>
          <span class="mc-pill">${esc(c.phase || c.laneLabel || "")}</span>
        </div>
        <dl class="mc-portfolio-dl">
          <div><dt>Why here</dt><dd>${esc(c.reason || "—")}</dd></div>
          <div><dt>Recommended</dt><dd>${esc(c.recommendation || "—")}</dd></div>
          <div><dt>Expected</dt><dd>${esc(c.expectedOutcome || "—")}</dd></div>
          <div><dt>Confidence</dt><dd>${esc(conf)}</dd></div>
          ${c.blocker ? `<div><dt>Blocker</dt><dd class="mc-portfolio-blocker">${esc(c.blocker)}</dd></div>` : ""}
          <div><dt>Evidence</dt><dd>${esc(c.evidence?.label || "—")}</dd></div>
          ${c.timeSensitivity ? `<div><dt>Timing</dt><dd>${esc(c.timeSensitivity)}</dd></div>` : ""}
        </dl>
        <div class="mc-card-cta mc-actions">
          ${actionBtn(c.primaryAction)}
          <button class="btn ghost" data-nav="missions/${esc(c.missionId)}">Open mission</button>
        </div>
      </article>`;
    }

    const commandSec = (!isHistory && (ccLanes.length || cc.lead))
      ? `<section class="mc-command-center" id="mc-command-center" aria-label="Executive Command Center">
          <div class="mc-command-center-h">
            <div>
              <p class="mc-portfolio-kicker">Needs Action</p>
              <h3>${esc(cc.sectionTitle || "Executive Command Center")}</h3>
              <p class="muted"><b>${esc(cc.lead || "")}</b> — ${esc(cc.question || "What can you do right now?")}</p>
            </div>
          </div>
          ${ccLanes.map((lane) => `<div class="mc-command-lane" data-command-lane="${esc(lane.id)}">
            <div class="mc-command-lane-h">
              <h4>${esc(lane.label)} <span class="muted">${lane.count}</span></h4>
              ${lane.blurb ? `<p class="muted">${esc(lane.blurb)}</p>` : ""}
            </div>
            <div class="mc-list mc-command-list">${(lane.cards || []).map(commandCardHtml).join("")}</div>
          </div>`).join("")}
        </section>`
      : "";

    const focusSec = (!isHistory && focusCards.length && !ccLanes.length)
      ? `<section class="mc-portfolio-focus" aria-label="Fifteen minute focus">
          <div class="mc-portfolio-focus-h">
            <div>
              <p class="mc-portfolio-kicker">15-minute focus</p>
              <h3>${esc(pf.focusLead || "Start here")}</h3>
              <p class="muted">${esc(pf.focusQuestion || "If you only have 15 minutes — start here.")}</p>
            </div>
            <button class="btn ghost" type="button" data-nav="needs-you">Needs You inbox</button>
          </div>
          ${focusCards.length ? `<ol class="mc-portfolio-focus-ol">${focusCards.map((m) => `<li>
            <button class="btn link" type="button" data-nav="missions/${esc(m.missionId)}">${esc(m.title)}</button>
            <span class="muted"> — ${esc(m.recommendation || m.statusLabel || "")}</span>
            ${actionBtn(m.nextAction || m.primaryAction)}
          </li>`).join("")}</ol>` : ""}
        </section>`
      : "";

    const groups = (pf.groups || []).filter((g) => (g.missions || []).length > 0);
    const groupSecs = groups.map((g) => `<section class="mc-portfolio-group" data-portfolio-group="${esc(g.id)}" aria-label="${esc(g.label)}">
      <div class="mc-portfolio-group-h">
        <h3>${esc(g.label)} <span class="muted">${g.count}</span></h3>
        ${g.blurb ? `<p class="muted">${esc(g.blurb)}</p>` : ""}
      </div>
      <div class="mc-list mc-portfolio-list">${(g.missions || []).map(portfolioCardHtml).join("")}</div>
    </section>`).join("");

    const emptyHtml = (pf.empty || (!groups.length && !focusCards.length && !ccLanes.length))
      ? (empty
        ? `<div class="rempty">
            <h3>${esc(empty.title)}</h3>
            <p>${esc(empty.body)}</p>
            <button class="btn" data-nav="kickoff">Create Mission</button>
          </div>`
        : `<div class="rempty">No missions in this view.</div>`)
      : "";

    const filterBar = `<div class="mc-filter-bar row gap" style="margin-bottom:12px">
      <button class="btn ghost ${filter === "active" ? "active" : ""}" type="button" data-missions-filter="active">Portfolio (${home.activeCount ?? counts.active ?? 0})</button>
      <button class="btn ghost ${isHistory ? "active" : ""}" type="button" data-missions-filter="archived">Mission History (${home.archivedCount ?? 0})</button>
      <button class="btn ghost" type="button" data-nav="workers">Workers</button>
      <button class="btn" data-nav="kickoff">Create Mission</button>
    </div>`;

    return shell(isHistory ? "Mission History" : "Director Portfolio", {
      lead: isHistory
        ? "Archived certification and validation history — read-only."
        : "Where to look (Portfolio) and what to do (Command Center) — without opening every mission.",
      actions: isHistory
        ? `<button class="btn" data-nav="kickoff">Create Mission</button>`
        : `<button class="btn ghost" type="button" data-mc-day-start>Start of day</button>
           <button class="btn ghost" type="button" data-mc-day-stop>Stop of day</button>
           <button class="btn" data-nav="kickoff">Create Mission</button>`,
    }) + filterBar + countStrip + commandSec + focusSec + groupSecs + emptyHtml + `</div>`;
  };

  V2.viewMissionDetail = function (id) {
    V2.state.selectedMissionId = id;
    V2.revalidate(`overview:${id}`, () => V2.fetchDashboard(id), { maxAgeMs: 12000 });
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
    const timeline = dash.timeline || [];
    const providers = dash.providers || [];
    const usage = dash.resourcesUsage || {};
    const exec = dash.executive || {};
    const outcomeHero = exec.outcome || {};
    const execOverview = exec.overview || {};
    const decisionPack = exec.decisions || {};
    const evidenceStrip = exec.evidence || {};
    const confGlance = exec.confidence || {};
    const journeyStrip = exec.journey || dash.journey || null;

    const heroPrimary = exec.primaryAction || s.primaryAction;
    // Never promote vague "Review outcome" as the only hero CTA when a real decision exists.
    const heroPrimarySafe = heroPrimary?.kind === "review_outcome" && decisionPack.hasRecommendation
      ? (decisionPack.primaryAction || heroPrimary)
      : heroPrimary;

    const summaryStrip = `<section class="mc-dash-summary">
      <div class="mc-dash-title-row">
        <div>
          <h2>${esc(s.title)}</h2>
          <div class="mc-pill ${esc(s.status || "")}">${esc(s.statusLabel)}</div>
        </div>
        <div class="mc-hero-actions">
          ${actionBtn(heroPrimarySafe)}
          ${s.certifyAction ? actionBtn(s.certifyAction) : ""}
        </div>
      </div>
      <div class="mc-stat-grid mc-stat-grid-compact">
        <div class="mc-stat"><div class="mc-stat-k">Phase</div><div class="mc-stat-v">${esc(s.phase)}</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Deliverables</div><div class="mc-stat-v">${esc(s.deliverablesLabel)}</div></div>
        <div class="mc-stat"><div class="mc-stat-k">Next</div><div class="mc-stat-v">${esc(execOverview.doNext || s.nextCheckpoint)}</div></div>
      </div>
    </section>`;

    const outcomeHeroSec = outcomeHero.label ? `<section class="mc-sec mc-outcome-hero tone-${esc(outcomeHero.tone || "neutral")}" id="mc-outcome-hero">
      <p class="mc-outcome-kicker">Mission Outcome</p>
      <h3 class="mc-outcome-label">${esc(outcomeHero.label)}</h3>
      <p>${esc(outcomeHero.sentence || "")}</p>
      ${outcomeHero.meta ? `<p class="muted">${esc(outcomeHero.meta)}</p>` : ""}
    </section>` : "";

    const execSummarySec = execOverview.blocks?.length ? `<section class="mc-sec mc-exec-summary" id="mc-exec-summary">
      <h3>Executive summary</h3>
      <dl class="mc-exec-dl">
        ${execOverview.blocks.map((b) => `<div class="mc-exec-row"><dt>${esc(b.label)}</dt><dd>${esc(b.text)}</dd></div>`).join("")}
      </dl>
    </section>` : "";

    function decisionCardHtml(card, { primary = false } = {}) {
      if (!card) return "";
      const kindAttr = card.kind === "certify_completion" ? "data-mc-certify"
        : card.kind === "reopen_work" ? "data-mc-reopen-work"
          : card.kind === "park_outcome" ? "data-mc-park-outcome"
            : card.kind === "advance_implementation" ? "data-mc-advance"
              : card.kind === "resume_stalled" ? "data-mc-resume-stalled"
              : card.kind === "review_findings" ? "data-mc-review-findings"
                : card.kind === "provide_feedback" ? "data-mc-provide-feedback"
                  : card.action?.kind === "open_mission" || card.action?.kind === "open_missions" || card.action?.href
                    ? "data-nav"
                    : null;
      if (!kindAttr && !card.presentationOnly) return "";
      const btnClass = primary ? "btn" : "btn ghost";
      const expected = card.expectedOutcome || card.expectedOutput || "";
      const rel = (card.pathRelationNote || card.relationshipHint)
        ? `<li><span class="muted">Relation to recommended</span> ${esc(card.pathRelationNote || card.relationshipHint)}</li>`
        : "";
      const tech = card.technicalConsequence
        ? `<li><span class="muted">Technical consequence</span> ${esc(card.technicalConsequence)}</li>`
        : "";
      const workers = card.workersAssignedLabel
        ? `<li><span class="muted">Workers</span> ${esc(card.workersAssignedLabel)}</li>`
        : "";
      let btn;
      if (card.kind === "review_findings") {
        btn = `<button class="${btnClass}" type="button" data-mc-review-findings="${esc(card.missionId || id)}">${esc(card.buttonLabel || card.title)}</button>`;
      } else if (card.kind === "provide_feedback") {
        btn = `<button class="${btnClass}" type="button" data-mc-provide-feedback="${esc(card.missionId || id)}">${esc(card.buttonLabel || card.title)}</button>`;
      } else if (kindAttr === "data-nav" && card.action?.href) {
        btn = `<button class="${btnClass}" type="button" data-nav="${esc(card.action.href)}">${esc(card.buttonLabel || card.title)}</button>`;
      } else if (kindAttr) {
        btn = `<button class="${btnClass}" type="button" ${kindAttr}="${esc(card.missionId || id)}">${esc(card.buttonLabel || card.title)}</button>`;
      } else {
        btn = "";
      }
      return `<article class="mc-card mc-decision-card${primary ? " recommended" : ""}" data-continuation-kind="${esc(card.kind || "")}">
        <div class="mc-card-h">
          <b>${esc(card.title)}</b>
          ${primary ? `<span class="mc-pill ok">Recommended</span>` : ""}
        </div>
        <ul class="mc-decision-meta">
          <li><span class="muted">Why</span> ${esc(card.whyChoose || "")}</li>
          <li><span class="muted">Expected outcome</span> ${esc(expected || card.whatHappensNext || "")}</li>
          <li><span class="muted">Work</span> ${esc(card.workLaunchesLabel || "")}</li>
          ${workers}
          ${rel}
          ${tech}
        </ul>
        ${card.unavailableNote ? `<p class="muted">${esc(card.unavailableNote)}</p>` : ""}
        ${btn}
      </article>`;
    }

    const feedbackSurface = decisionPack.feedbackSurface || {};
    const collabPack = exec.collaborationFull || exec.collaboration || {};
    const feedbackPanel = `<section class="mc-sec mc-feedback-panel" id="mc-feedback-panel" hidden>
      <h3>${esc(feedbackSurface.title || "Provide Feedback")}</h3>
      <p>${esc(feedbackSurface.blurb || "")}</p>
      <label class="muted" for="mc-feedback-type">Type</label>
      <select id="mc-feedback-type" class="mc-feedback-type">
        ${(collabPack.composeTypes || [
          { id: "feedback", label: "Feedback" },
          { id: "implementation_guidance", label: "Implementation Guidance" },
          { id: "decision", label: "Decision" },
          { id: "clarification", label: "Clarification" },
          { id: "revision_request", label: "Revision Request" },
          { id: "question", label: "Question" },
          { id: "approval_note", label: "Approval Note" },
          { id: "information", label: "Information" },
        ]).map((t) => `<option value="${esc(t.id)}"${t.id === (feedbackSurface.defaultType || "feedback") ? " selected" : ""}>${esc(t.label)}</option>`).join("")}
      </select>
      <label class="muted" for="mc-feedback-text">Guidance</label>
      <textarea id="mc-feedback-text" class="mc-feedback-text" rows="4" placeholder="${esc(feedbackSurface.placeholder || "")}"></textarea>
      <p class="muted">${esc(feedbackSurface.captureNote || "Persists as Director Collaboration on this mission.")}</p>
      <div class="mc-actions">
        <button class="btn ghost" type="button" data-mc-feedback-dismiss>Close</button>
        <button class="btn" type="button" data-mc-feedback-save="${esc(id)}">Save to Collaboration</button>
      </div>
    </section>`;

    const decisionSec = (decisionPack.cards || []).length ? `<section class="mc-sec mc-decisions mc-continuation" id="mc-decisions">
      <h3>${esc(decisionPack.sectionTitle || "Recommended Next Action")}</h3>
      ${decisionPack.recommended
        ? `<div class="mc-decision-primary">
            ${decisionCardHtml(decisionPack.recommended, { primary: true })}
            ${decisionPack.whyRecommended ? `<p class="mc-cont-why"><b>Why this is recommended</b> — ${esc(decisionPack.whyRecommended)}</p>` : ""}
            ${decisionPack.expectedOutcome ? `<p class="mc-cont-outcome"><b>Expected outcome</b> — ${esc(decisionPack.expectedOutcome)}</p>` : ""}
          </div>`
        : `<p class="muted">Choose deliberately — reviewing alone does not change anything.</p>`}
      ${(decisionPack.alternatives || []).length
        ? `<details class="mc-decision-alts" ${decisionPack.recommended ? "" : "open"}>
            <summary>${esc(decisionPack.alternativesTitle || (decisionPack.recommended ? "Alternative decisions" : "Available options"))}</summary>
            ${decisionPack.alternatives.map((c) => decisionCardHtml(c)).join("")}
          </details>`
        : ""}
      ${feedbackPanel}
    </section>` : "";

    const collabSec = (() => {
      const c = collabPack;
      const cards = c.cards || [];
      const rows = cards.length
        ? cards.map((item) => {
          const actions = (item.statusActions || []).map((a) =>
            `<button class="btn ghost sm" type="button" data-mc-collab-status="${esc(item.id)}" data-status="${esc(a.status)}" data-mission="${esc(id)}">${esc(a.label)}</button>`
          ).join("");
          return `<article class="mc-card mc-collab-card status-${esc(item.status || "open")}${item.projected ? " projected" : ""}">
            <div class="mc-card-h">
              <b>${esc(item.typeLabel || item.title)}</b>
              <span class="mc-pill">${esc(item.statusLabel || item.status || "")}</span>
            </div>
            ${item.title && item.title !== item.typeLabel ? `<p class="mc-collab-title">${esc(item.title)}</p>` : ""}
            <p class="mc-collab-body">${esc(item.body || "")}</p>
            <p class="muted mc-collab-meta">
              ${item.author ? `Author ${esc(item.author)}` : ""}
              ${item.recordedLabel ? ` · Recorded ${esc(item.recordedLabel)}` : ""}
              ${item.deliverableLabel ? ` · ${esc(item.deliverableLabel)}` : ""}
              ${item.projected ? " · From Decisions archive" : ""}
            </p>
            ${actions ? `<div class="mc-actions mc-collab-actions">${actions}</div>` : ""}
          </article>`;
        }).join("")
        : `<p class="muted">${esc(c.emptyMessage || "No collaboration recorded yet.")}</p>`;
      const composer = c.composer || {};
      return `<section class="mc-sec mc-collaboration" id="mc-collaboration">
        <div class="mc-card-h">
          <h3 style="margin:0">${esc(c.sectionTitle || "Director Collaboration")}</h3>
          <button class="btn ghost sm" type="button" data-mc-provide-feedback="${esc(id)}">Add guidance</button>
        </div>
        <p class="muted">${c.summary
          ? `${esc(String(c.summary.open || 0))} open · ${esc(String(c.summary.total || 0))} total${c.summary.revisionOpen ? ` · ${esc(String(c.summary.revisionOpen))} revision open` : ""}`
          : "Why this path was chosen — institutional memory for the initiative."}</p>
        <div class="mc-collab-list">${rows}</div>
        <details class="mc-collab-compose">
          <summary>Record collaboration</summary>
          <p class="muted">${esc(composer.blurb || "")}</p>
          <label class="muted" for="mc-collab-type">Type</label>
          <select id="mc-collab-type" class="mc-feedback-type">
            ${(c.composeTypes || []).map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("")}
          </select>
          <label class="muted" for="mc-collab-text">Body</label>
          <textarea id="mc-collab-text" class="mc-feedback-text" rows="3" placeholder="${esc(composer.placeholder || "")}"></textarea>
          <button class="btn" type="button" data-mc-collab-save="${esc(id)}">Save</button>
        </details>
      </section>`;
    })();

    const confGlanceSec = (() => {
      const c = confGlance;
      if (!c?.label && c?.kind !== "explained_confidence") return "";
      const label = c.label || "Confidence";
      const rec = c.recommendation?.verb || c.recommendation || null;
      const recDetail = typeof c.recommendation === "object" ? c.recommendation.detail : null;
      const supporting = c.supporting || [];
      const reducing = c.reducing || [];
      const uncertainty = c.remainingUncertainty || [];
      const increase = c.increaseConfidence || [];
      const mark = (m) => (m === "support" ? "✓" : m === "concern" ? "✗" : "⚠");

      const whyRows = [
        ...supporting.map((f) => `<li class="mc-conf-item support"><span class="mc-conf-mark">${mark(f.mark)}</span><div><b>${esc(f.label)}</b><div class="muted">${esc(f.text)}</div></div></li>`),
        ...reducing.map((f) => `<li class="mc-conf-item ${esc(f.mark || "partial")}"><span class="mc-conf-mark">${mark(f.mark)}</span><div><b>${esc(f.label)}</b><div class="muted">${esc(f.text)}</div></div></li>`),
      ].join("");

      const uncRows = uncertainty.length
        ? uncertainty.map((u) => `<li class="${u.blocking ? "blocking" : ""}"><b>${esc(u.label)}</b> — ${esc(u.text)}${u.blocking ? ` <span class="mc-pill warn">Blocking</span>` : ""}</li>`).join("")
        : `<li class="muted">None material recorded</li>`;

      const incRows = increase.length
        ? increase.map((x) => `<li>
            <b>${esc(x.what)}</b>
            <div class="muted">${esc(x.why)}</div>
            <div class="muted">Expected: ${esc(x.expectedImprovement)}</div>
          </li>`).join("")
        : `<li class="muted">Nothing material — confidence factors are already supportive.</li>`;

      return `<section class="mc-sec mc-conf-explained tone-${esc(c.tone || "neutral")}" id="mc-conf-glance">
        <h3>${esc(label)}</h3>
        <div class="mc-conf-overall">
          <div class="mc-conf-pct">${c.percent != null ? `${esc(String(c.percent))}%` : "—"}</div>
          <div>
            <div class="mc-pill ${esc(c.tone || "")}">${esc(c.bandLabel || "—")}</div>
            ${rec ? `<p class="mc-conf-rec"><b>Recommended:</b> ${esc(rec)}</p>` : ""}
            ${recDetail ? `<p class="muted">${esc(recDetail)}</p>` : ""}
            ${c.blocking ? `<p class="warn">Unresolved uncertainty is treated as blocking until addressed.</p>` : ""}
          </div>
        </div>
        <h4>Why this confidence</h4>
        <ul class="mc-conf-why-list">${whyRows || `<li class="muted">Director is still forming a confidence picture.</li>`}</ul>
        <h4>Remaining uncertainty</h4>
        <ul class="mc-conf-uncertainty">${uncRows}</ul>
        <h4>What increases confidence</h4>
        <ul class="mc-conf-increase">${incRows}</ul>
        ${c.secondaryNote ? `<p class="muted">${esc(c.secondaryNote)}</p>` : ""}
        <p class="muted">Raw factor scores and weights are under Technical depth.</p>
      </section>`;
    })();

    const evidenceStripSec = (() => {
      const strip = evidenceStrip;
      if (!strip || (strip.empty && !strip.primaryProof)) {
        return `<section class="mc-sec mc-evidence-strip" id="mc-evidence-strip">
          <div class="mc-card-h"><h3 style="margin:0">Evidence</h3>
            <button class="btn ghost sm" type="button" data-nav="evidence/${esc(id)}">Open gallery</button>
          </div>
          <p class="muted">No evidence artifacts yet.</p>
        </section>`;
      }
      const kinds = (strip.kinds || []).map((k) => `<li>${esc(k.label)}</li>`).join("");
      const primary = strip.primaryProof;
      const thumbs = (strip.preview || []).map((a) => {
        if (a.previewHref) {
          return `<figure class="mc-ev-thumb">
            <img src="${esc(a.previewHref)}" alt="${esc(a.title)}" loading="lazy" />
            <figcaption>${esc(a.title)}</figcaption>
          </figure>`;
        }
        return `<figure class="mc-ev-thumb missing">
          <div class="mc-ev-thumb-ph">${esc(a.typeLabel || "Proof")}</div>
          <figcaption>${esc(a.title)}</figcaption>
        </figure>`;
      }).join("");
      const sufficiency = (strip.sufficiency || []).slice(0, 4).map((s) =>
        `<li class="tone-${esc(s.tone || "info")}">${esc(s.text)}</li>`).join("");
      return `<section class="mc-sec mc-evidence-strip" id="mc-evidence-strip">
        <div class="mc-card-h"><h3 style="margin:0">Evidence</h3>
          <button class="btn ghost sm" type="button" data-nav="evidence/${esc(id)}">${esc(strip.reviewLabel || "Review evidence")}</button>
        </div>
        ${kinds ? `<ul class="mc-ev-kinds">${kinds}</ul>` : ""}
        ${primary ? `<p class="mc-ev-primary"><span class="muted">Primary proof</span><br/><b>${esc(primary.title)}</b>
          <span class="muted"> — ${esc(primary.proves || primary.typeLabel || "")}</span></p>` : ""}
        ${thumbs ? `<div class="mc-ev-thumbs">${thumbs}</div>` : ""}
        ${sufficiency ? `<ul class="mc-ev-sufficiency">${sufficiency}</ul>` : ""}
        ${strip.hasVisualProof === false ? `<p class="muted">No screenshot evidence on this mission.</p>` : ""}
        <div class="mc-depth-links">
          <button class="btn ghost sm" type="button" data-nav="evidence/${esc(id)}">Open gallery</button>
          <button class="btn ghost sm" type="button" data-nav="timeline/${esc(id)}">Mission Journey</button>
          <button class="btn ghost sm" type="button" data-nav="decisions/${esc(id)}">Decisions archive</button>
          <a class="btn ghost sm" href="#mc-depth">Technical depth</a>
        </div>
      </section>`;
    })();

    const journeyRailHtml = V2.journeyRailHtml;

    const journeyStripSec = journeyStrip?.rail?.length ? `<section class="mc-sec mc-journey-strip" id="mc-journey-strip">
      <div class="mc-card-h">
        <h3 style="margin:0">Mission Journey</h3>
        <button class="btn ghost sm" type="button" data-nav="timeline/${esc(id)}">Open journey</button>
      </div>
      <p class="mc-journey-here">${esc(journeyStrip.youAreHereLabel || "")}</p>
      ${journeyRailHtml(journeyStrip.rail, { currentId: journeyStrip.currentStageId })}
      ${journeyStrip.nextAfterHere ? `<p class="muted"><b>Next:</b> ${esc(journeyStrip.nextAfterHere)}</p>` : ""}
    </section>` : "";

    const outcome = dash.outcome;
    const showOutcome = Boolean(outcome) && (V2.state.showOutcome !== false);
    // Mission-level choice cards now live in decisionSec; keep empty here to avoid duplicates.
    const missionChoices = "";

    function renderDeliverableConversation(thread) {
      const rows = Array.isArray(thread) ? thread : [];
      if (!rows.length) {
        return `<div class="drev-thread" id="drev-thread">
          <h4>Conversation</h4>
          <p class="muted drev-thread-empty">No notes yet. Share context or certify with a note to start the thread.</p>
        </div>`;
      }
      const bubbles = rows.map((m) => {
        const who = m.actor === "director" ? "Director" : "You";
        const cls = m.actor === "director" ? "director" : "you";
        const when = m.at ? esc(String(m.at).replace("T", " ").slice(0, 16)) : "";
        return `<div class="drev-bubble ${cls}">
          <div class="drev-bubble-meta"><span>${who}</span>${when ? `<time>${when}</time>` : ""}</div>
          <div class="drev-bubble-text">${esc(m.text || "")}</div>
        </div>`;
      }).join("");
      return `<div class="drev-thread" id="drev-thread">
        <h4>Conversation</h4>
        <div class="drev-thread-list">${bubbles}</div>
      </div>`;
    }

    function renderDeliverableReview(o) {
      if (!o || o.kind !== "deliverable_review") return null;
      const ready = Boolean(o.operatorMayApprove);
      const rec = o.directorRecommendation || o.recommendation || {};
      const cert = o.certification || {};
      const confidence = cert.confidence || {};
      const confPct = confidence.pct ?? rec.confidencePct;
      const discList = (rec.discrepancies || o.reconciliation?.blocking || [])
        .map((d) => `<li>${esc(d.detail || d)}</li>`).join("");
      const chips = (cert.chips || []).map((c) => {
        const mark = c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "·";
        const cls = c.status === "pass" ? "ok" : c.status === "fail" ? "bad" : "warn";
        return `<li class="drev-chip ${cls}"><span class="drev-chip-mark">${mark}</span>${esc(c.label)}</li>`;
      }).join("");
      const confReasons = (confidence.reasons || []).map((x) => `<li>${esc(x)}</li>`).join("");
      const execSentences = (o.executiveSummary?.sentences || [])
        .map((s) => `<p class="drev-exec-line">${esc(s)}</p>`).join("");
      const asking = o.askingYouToApprove || {};
      const approving = (asking.approving || []).map((x) => `<li>${esc(x)}</li>`).join("");
      const notApproving = (asking.not_approving || []).map((x) => `<li>${esc(x)}</li>`).join("");
      const impact = (o.approvalImpact?.immediately || []).map((x) => `<li>${esc(x)}</li>`).join("");
      const checks = (o.verification?.checks || []).map((c) => {
        const pill = c.status === "pass" ? "ok" : c.status === "fail" ? "bad" : "warn";
        return `<li class="drev-check"><span class="mc-pill ${pill}">${esc(c.status)}</span>
          <div><b>${esc(c.label)}</b><div class="muted">${esc(c.detail || "")}</div></div></li>`;
      }).join("");
      const verifiedFacts = (o.verification?.verifiedFacts || []).map((f) =>
        `<li><b>${esc(f.label)}</b><div class="muted">${esc(f.detail || "")}</div></li>`).join("");
      const judgment = (o.verification?.yourJudgment || []).map((f) =>
        `<li><b>${esc(f.label)}</b><div class="muted">${esc(f.detail || "")}</div></li>`).join("");
      const evidence = (o.evidence || []).map((e) => {
        const status = e.test_run_status || e.result || "recorded";
        const pill = status === "failed" ? "bad" : status === "passed" ? "ok" : "warn";
        const statusLabel = status === "passed" ? "Passed" : status === "failed" ? "Failed" : status;
        return `<article class="mc-card drev-ev">
          <div class="mc-card-h"><b>${esc(e.title)}</b><span class="mc-pill ${pill}">${esc(statusLabel)}</span></div>
          <p><b>Proves</b><br/>${esc(e.proves)}</p>
          <p><b>Result</b><br/>${esc(e.result_summary || statusLabel)}</p>
          ${(e.acceptanceCriteriaCovered || []).length ? `<p><b>Criteria</b><br/>${esc(e.acceptanceCriteriaCovered.join(", "))}</p>` : ""}
          ${e.commit ? `<p><b>Commit</b><br/><code>${esc(e.commit)}</code></p>` : ""}
          <p class="muted">${esc(e.timestamp || "")}${e.source ? ` · ${esc(e.source)}` : ""}</p>
        </article>`;
      }).join("");
      const actions = [];
      if (o.actions?.approve) {
        actions.push(`<button class="btn" type="button" data-drev-approve="${esc(o.reviewId)}" data-mission="${esc(id)}" ${V2.state.kickoffBusy ? "disabled" : ""}>Certify ${esc(o.waveLabel || "deliverable")}</button>`);
      }
      if (o.actions?.recheck) {
        actions.push(`<button class="btn" type="button" data-drev-recheck="${esc(o.reviewId)}" data-mission="${esc(id)}" ${V2.state.kickoffBusy ? "disabled" : ""}>Have Director re-check</button>`);
      }
      if (o.actions?.requestChanges) {
        actions.push(`<button class="btn ghost" type="button" data-drev-changes="${esc(o.reviewId)}" data-mission="${esc(id)}">Request changes</button>`);
      }
      if (o.actions?.shareContext || o.actions?.askDirector) {
        actions.push(`<button class="btn ghost" type="button" data-drev-context="${esc(o.reviewId)}" data-mission="${esc(id)}">Share context with Director</button>`);
      }
      const risks = (o.residualRisks || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li class=\"muted\">None recorded</li>";
      const deferred = (o.deferredWork || []).map((x) => `<li>${esc(x)}</li>`).join("");
      const changed = (o.whatChanged || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li class=\"muted\">—</li>";
      const notChanged = (o.whatDidNotChange || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li class=\"muted\">—</li>";
      const recCardClass = ready ? "drev-rec ok" : "drev-rec blocked";
      const wave = o.waveLabel || "this deliverable";
      const stuck = Boolean(o.stuck) && !ready;
      const step = ready ? 3 : (o.certificationState === "accepted" ? 4 : stuck ? 3 : 2);
      const blockers = (o.blockersPlain || []).map((x) => `<li>${esc(x)}</li>`).join("");
      const processStrip = `<article class="mc-card drev-process">
          <p class="drev-process-kicker">How this works</p>
          <h4 style="margin-top:0">Where you are in the process</h4>
          <p class="drev-role">Think of this like signing off a manager’s report — not doing the work yourself.</p>
          <ol class="drev-steps">
            <li class="done"><span class="drev-step-n">1</span><div><b>A worker finished ${esc(wave)}</b><div class="muted">Someone did the assignment and attached proof.</div></div></li>
            <li class="${step >= 2 ? "done" : ""}"><span class="drev-step-n">2</span><div><b>Director checked that proof</b><div class="muted">Director reviewed evidence and wrote a recommendation for you.</div></div></li>
            <li class="${step === 3 ? "here" : step > 3 ? "done" : ""}"><span class="drev-step-n">3</span><div><b>${ready ? "You’re here — say yes or no" : stuck ? "You’re here — Director is stuck" : "Waiting on Director"}</b><div class="muted">${ready ? "Press Certify if you trust Director’s recommendation. Or share context / request changes." : stuck ? "Don’t guess. Press “Have Director re-check” first. Only request changes if you want a worker to redo something specific." : "You’ll get a decision when Director is ready."}</div></div></li>
            <li class="${step >= 4 ? "done" : ""}"><span class="drev-step-n">4</span><div><b>Mission moves on</b><div class="muted">After you certify, this page should change — Director unlocks the next piece of work.</div></div></li>
          </ol>
        </article>`;
      const stuckBanner = stuck ? `<article class="mc-card drev-stuck">
          <h4 style="margin-top:0">What’s blocking you</h4>
          <p>Director has not cleared this deliverable yet, so Certify is unavailable. That is a Director problem to resolve — not something you should reverse-engineer from technical jargon.</p>
          ${blockers ? `<p class="drev-conf-sub">In plain English</p><ul>${blockers}</ul>` : ""}
          <div class="mc-actions" style="margin-top:12px">${actions.join("")}</div>
        </article>` : "";
      return `<section class="mc-sec mc-outcome mc-drev" id="mc-outcome">
        <h3>${esc(o.headline)}</h3>
        <p class="muted">${esc(o.assignment?.title || "")}</p>
        ${ready ? `<p class="drev-you-are-here">Right now: Director is asking you to approve ${esc(wave)}’s certification so the mission can continue.</p>` : ""}
        ${stuck ? `<p class="drev-you-are-here drev-stuck-here">Right now: you’re blocked on Director for ${esc(wave)}. Use “Have Director re-check” — don’t sit in Share context loops without a re-check.</p>` : ""}

        ${processStrip}
        ${stuckBanner}
        ${renderDeliverableConversation(o.conversation)}

        ${execSentences ? `<article class="mc-card drev-exec">
          <h4 style="margin-top:0">What got done (plain English)</h4>
          ${execSentences}
        </article>` : ""}

        <article class="mc-card ${recCardClass}">
          <h4 style="margin-top:0">Director’s recommendation</h4>
          <p class="drev-rec-headline">${esc(rec.headline || (ready ? "Approve" : "Director cannot yet certify"))}</p>
          ${confPct != null ? `<div class="drev-conf"><span class="drev-conf-label">Confidence</span><span class="drev-conf-pct">${esc(String(confPct))}%</span></div>` : ""}
          <p class="drev-conf-sub">What Director is telling you</p>
          <p style="white-space:pre-wrap">${esc(rec.summary || rec.detail || "")}</p>
          ${discList ? `<ul>${discList}</ul>` : ""}
          ${stuck ? "" : `<div class="mc-actions" style="margin-top:12px">${actions.join("") || `<span class="muted">Certification disabled until Director can recommend it</span>`}</div>`}
        </article>

        <article class="mc-card drev-cert">
          <h4 style="margin-top:0">Director Certification</h4>
          <ul class="drev-chips">${chips || "<li class=\"muted\">Certification pending</li>"}</ul>
          ${confPct != null ? `<div class="drev-conf" style="margin-top:14px">
            <span class="drev-conf-label">${esc(confidence.label || "Certification Confidence")}</span>
            <span class="drev-conf-pct">${esc(String(confPct))}%</span>
          </div>` : ""}
          ${confReasons ? `<p class="drev-conf-sub">Because</p><ul class="drev-conf-reasons">${confReasons}</ul>` : ""}
          <details class="mc-diag drev-verify">
            <summary>View verification details</summary>
            <ul class="drev-checks">${checks || "<li class=\"muted\">No checks recorded</li>"}</ul>
            ${verifiedFacts ? `<h4>Director verified</h4><ul>${verifiedFacts}</ul>` : ""}
          </details>
        </article>

        ${ready ? `<article class="mc-card">
          <h4 style="margin-top:0">What I'm asking you to approve</h4>
          <p><b>You are approving:</b></p>
          <ul>${approving || "<li class=\"muted\">—</li>"}</ul>
          <p><b>You are not approving:</b></p>
          <ul>${notApproving || "<li class=\"muted\">—</li>"}</ul>
        </article>

        <article class="mc-card">
          <h4 style="margin-top:0">Approval Impact</h4>
          <p class="muted">Immediately after approval, Director will:</p>
          <ul>${impact || "<li class=\"muted\">Continue the mission</li>"}</ul>
          <p class="muted">If you request changes: ${esc(o.rejectionConsequence || "")}</p>
        </article>` : `<article class="mc-card">
          <h4 style="margin-top:0">Why Certify is unavailable</h4>
          <p>You’re not being asked to approve anything yet. Director still has open verification gaps${blockers ? ":" : "."}</p>
          ${blockers ? `<ul>${blockers}</ul>` : ""}
        </article>`}

        <h4>Remaining risk</h4>
        <ul>${risks}</ul>
        ${deferred ? `<h4>Deferred work</h4><ul>${deferred}</ul>` : ""}

        ${judgment ? `<details class="mc-diag"><summary>Your judgment</summary><ul class="drev-judgment">${judgment}</ul></details>` : ""}

        <details class="mc-diag drev-tech" style="margin-top:18px">
          <summary>Technical details</summary>
          <h4>What changed</h4>
          <ul>${changed}</ul>
          <h4>What did not change</h4>
          <ul>${notChanged}</ul>
          <h4>Evidence inventory</h4>
          <div class="drev-ev-grid">${evidence || "<p class=\"muted\">No translated evidence</p>"}</div>
          <p class="muted">Worker claim (not Director-confirmed truth):</p>
          <p style="white-space:pre-wrap">${esc(o.technical?.workerClaimSummary || "—")}</p>
          ${(o.technical?.files || []).length ? `<div class="mc-stat-k">Files touched</div><ul>${o.technical.files.map((f) => `<li class="mono">${esc(f)}</li>`).join("")}</ul>` : ""}
          <p class="muted">Assignment <code>${esc(o.technical?.assignmentId || o.assignmentId || "—")}</code>
            · Review <code>${esc(o.technical?.reviewId || o.reviewId || "—")}</code></p>
          <p class="muted">Verified ${esc(o.technical?.verifiedAt || "—")} by ${esc(o.technical?.verifiedBy || "—")}</p>
          <button class="btn ghost" data-nav="evidence/${esc(id)}">Open Evidence gallery</button>
          <button class="btn ghost" data-nav="timeline/${esc(id)}">Open Mission Journey</button>
        </details>
        ${missionChoices ? `<h4 style="margin-top:22px">Mission next steps</h4>${missionChoices}` : ""}
      </section>`;
    }

    const drevSec = outcome?.kind === "deliverable_review" ? renderDeliverableReview(outcome) : null;
    const certifiedSec = outcome?.kind === "deliverable_certified" ? `<section class="mc-sec mc-outcome mc-drev" id="mc-outcome">
      <h3>${esc(outcome.headline)}</h3>
      <p class="muted">${esc(outcome.assignmentTitle || "")}</p>
      <article class="mc-card drev-rec ok">
        <h4 style="margin-top:0">Done — your part for ${esc(outcome.waveLabel || "this deliverable")}</h4>
        <p>${esc(outcome.summary || "")}</p>
        <ol class="drev-steps" style="margin-top:12px">
          <li class="done"><span class="drev-step-n">1</span><div><b>Worker finished</b></div></li>
          <li class="done"><span class="drev-step-n">2</span><div><b>Director checked</b></div></li>
          <li class="done"><span class="drev-step-n">3</span><div><b>You certified</b></div></li>
          <li class="here"><span class="drev-step-n">4</span><div><b>Mission continues</b><div class="muted">Director unlocks the next assignment when ready.</div></div></li>
        </ol>
      </article>
      ${missionChoices || ""}
    </section>` : null;
    const outcomeSec = drevSec || certifiedSec || (outcome ? `<section class="mc-sec mc-outcome" id="mc-outcome">
      <h3>${esc(outcome.headline)}</h3>
      <p>${esc(outcome.summary || "")}</p>
      ${missionChoices || ""}
    </section>` : "");

    const local = dash.localServer || {};
    const localActions = [];
    if (local.actions?.start) {
      localActions.push(`<button class="btn" type="button" data-mc-server-start="${esc(id)}" data-worktree="${esc(local.actions.start.worktree || local.worktree || "")}">${esc(local.actions.start.label)}</button>`);
    }
    if (local.actions?.open) {
      localActions.push(`<a class="btn" href="${esc(local.actions.open.href)}" target="_blank" rel="noopener">${esc(local.actions.open.label)} ↗</a>`);
    }
    if (local.actions?.stop) {
      localActions.push(`<button class="btn ghost" type="button" data-mc-server-stop="${esc(id)}" data-worktree="${esc(local.actions.stop.worktree || local.worktree || "")}">${esc(local.actions.stop.label)}</button>`);
    }
    const localServerSec = `<section class="mc-sec mc-local-server">
      <div class="mc-card-h">
        <b>${esc(local.title || "Local Alloy app")}</b>
        <span class="mc-pill ${esc(local.status || "")}">${esc(local.statusLabel || (local.available === false ? "Unavailable" : "—"))}</span>
      </div>
      <p>${esc(local.detail || "")}</p>
      <p class="muted">${esc(local.note || "Workers do not need this server to code.")}</p>
      ${local.worktree || local.slot != null ? `<p class="muted mono">${local.worktree ? esc(local.worktree) : ""}${local.slot != null ? ` · slot ${esc(local.slot)}` : ""}${local.port ? ` · :${esc(local.port)}` : ""}</p>` : ""}
      ${local.conflictDetail ? `<p class="mc-error-inline">${esc(local.conflictDetail)}</p>` : ""}
      <div class="mc-actions" style="margin-top:10px">${localActions.join("") || `<span class="muted">No server actions available</span>`}</div>
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
            <div class="mc-actions">${actionBtn(it.primaryAction)}${actionBtn(it.secondaryAction)}</div>
          </article>`).join("")
        : `<div class="rempty">Nothing needs you right now.</div>`}
    </section>`;

    const workSec = `<section class="mc-sec">
      <h3>Current Work</h3>
      ${work.length
        ? work.map((w) => {
            const live = w.liveActivity;
            const liveBlock = live && ["active", "starting", "waiting_ack", "blocked"].includes(w.lifecycleState)
              ? `<div class="mc-live-activity" data-live-session="${esc(live.sessionId || "")}">
                  <div data-live-title><b>${esc(live.workerLabel || "Worker")}</b> · ${esc(live.activity || "—")}</div>
                  <div class="muted" data-live-detail ${live.detail ? "" : "hidden"}>${esc(live.detail || "")}</div>
                  <div class="muted" data-live-meta>${esc([
                    live.filesInspected != null ? `${live.filesInspected} files inspected` : null,
                    live.percent != null ? `${live.percent}% complete` : null,
                    live.heartbeatLabel ? `Heartbeat: ${live.heartbeatLabel}` : null,
                    live.estimatedCheckpoint ? `Estimated checkpoint: ${live.estimatedCheckpoint}` : null,
                  ].filter(Boolean).join(" · "))}</div>
                </div>`
              : "";
            const rowActions = w.status === "running" || w.lifecycleState === "active"
              ? `<div class="mc-actions" style="margin-top:8px"><button class="btn ghost sm" type="button" data-mc-resume-stalled="${esc(id)}">Relaunch worker</button></div>`
              : "";
            return `<div class="mc-work-row">
            <div class="mc-card-h"><b>${esc(w.title)}</b><span class="mc-pill">${esc(w.lifecycleLabel || w.statusLabel)}</span></div>
            <div class="muted">${esc(w.handledByLabel || w.lifecycleExplanation || "Director is preparing execution")}</div>
            ${liveBlock || (w.progressSummary && w.progressSummary !== w.lifecycleExplanation ? `<div>${esc(w.progressSummary)}</div>` : "")}
            ${rowActions}
          </div>`;
          }).join("")
        : `<div class="rempty">No work items yet</div>`}
    </section>`;

    const usageSec = `<details class="mc-sec mc-usage">
      <summary><h3 style="display:inline">Resources &amp; Usage</h3></summary>
      <p class="muted">${esc(usage.note || "Provider-reported usage only.")}</p>
      ${(usage.byProvider || []).map((u) => `<div class="mc-usage-row">
        <b>${esc(u.provider)}</b>
        <span>${esc(u.activeWorkers)} active</span>
        <span>Session: ${esc(u.sessionDuration)}</span>
        <span>Tokens: ${esc(u.tokens)}</span>
        <span>Est. cost: ${esc(u.estimatedCost)}</span>
      </div>`).join("") || `<div class="rempty">No usage recorded yet</div>`}
    </details>`;

    // DX-4 §10.5 — Recent Progress merged into Mission Journey; no duplicate column here.

    const tlSec = `<section class="mc-sec">
      <h3>Engineering timeline</h3>
      <p class="muted">Event history. Prefer Mission Journey for operational progress.</p>
      ${timeline.length
        ? timeline.map((e) => `<div class="mc-tl-row">
            <div class="mc-tl-time">${esc(e.timeLabel)} · ${esc(e.actor)}</div>
            <div>
              <b>${esc(e.headline)}</b>
              ${e.explanation && e.explanation !== e.headline ? `<div class="muted">${esc(e.explanation)}</div>` : ""}
              ${e.technical || e.expandable ? `<details class="mc-diag"><summary>Technical details</summary><pre class="mono">${esc(e.technical || JSON.stringify(e.detail || {}, null, 2))}</pre></details>` : ""}
            </div>
          </div>`).join("")
        : `<div class="rempty">No timeline events</div>`}
      <button class="btn sm" data-nav="timeline/${esc(id)}">Mission Journey</button>
    </section>`;

    const confSec = `<section class="mc-sec mc-confidence">
      <h3>Mission Confidence (calculation)</h3>
      <div class="mc-conf-big">${esc(conf.percent)}%</div>
      <p class="muted">${esc(conf.bandLabel || "")}</p>
      <div class="mc-conf-bar"><div class="mc-conf-fill" style="width:${Number(conf.percent) || 0}%"></div></div>
      <h4>Why?</h4>
      <ul class="mc-conf-why">${(conf.why || []).map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      <details class="mc-diag"><summary>Show technical calculation</summary>
        <div class="mc-conf-factors">${(conf.factors || []).map((f) =>
          `<div class="mc-conf-f"><b>${esc(f.label)}</b> ${esc(f.score)} <span class="muted">(${esc(f.weight)}%) — ${esc(f.note)}</span></div>`).join("")}</div>
      </details>
    </section>`;

    const relaunchBtn = (dash.posture?.busy || (dash.currentWork || []).some((w) => w.status === "running"))
      ? `<button class="btn ghost" type="button" data-mc-resume-stalled="${esc(id)}">Relaunch worker</button>`
      : "";

    const depthSec = `<details class="mc-sec mc-depth" id="mc-depth">
      <summary><h3 style="display:inline">Technical depth</h3>
        <span class="muted"> — local app, workers, usage, work inventory, confidence math</span>
      </summary>
      <div class="mc-depth-body">
        <div class="mc-depth-toolbar">
          <button class="btn ghost sm" type="button" data-ci-open>Improve Vacilando</button>
          ${relaunchBtn}
          ${providers.length ? `<div class="mc-provider-line">${providers.map((p) => `<span>${esc(p.label)}</span>`).join("")}</div>` : ""}
        </div>
        ${localServerSec}
        ${directorSec}
        ${needsSec}
        ${workSec}
        ${usageSec}
        ${confSec}
        ${tlSec}
      </div>
    </details>`;

    // DX-6 IA: Outcome → Summary → Confidence → Journey → Evidence → Continuation → Collaboration → Depth
    const l1 = outcomeHeroSec + execSummarySec + confGlanceSec + journeyStripSec + evidenceStripSec + decisionSec + collabSec;
    const certOrOutcome = showOutcome ? outcomeSec : "";

    return shell(s.title || "Mission Dashboard", {
      missionId: id,
      active: "dashboard",
      lead: `${esc(outcomeHero.label || s.statusLabel)} · Next: ${esc(execOverview.doNext || s.nextCheckpoint)}`,
      actions: `${actionBtn(heroPrimarySafe)}`,
    }) + summaryStrip + l1 + certOrOutcome + depthSec + `</div>`;
  };

  V2.viewNeedsYou = function () {
    V2.revalidate("needsYou", () => V2.fetchNeedsYou());
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
      <div class="mc-actions">${actionBtn(it.primaryAction)}${actionBtn(it.secondaryAction)}</div>
    </article>`).join("") || `<div class="rempty">Nothing needs you right now.</div>`;
    return shell("Needs You", { lead: "Decisions, recoveries, and approvals waiting on you." })
      + `<div class="mc-list">${cards}</div></div>`;
  };

  V2.viewTimeline = function (missionId) {
    const mid = missionId || V2.state.selectedMissionId;
    if (!mid) {
      return shell("Mission Journey") + `<div class="rempty">Open a mission to see its journey.</div>
        <button class="btn" data-nav="missions">Missions</button></div>`;
    }
    V2.revalidate(`timeline:${mid}`, () => V2.fetchTimeline(mid));
    if (!V2.state.timelineVm || V2.state.timelineMissionId !== mid) {
      V2.fetchTimeline(mid);
      return shell("Mission Journey", { missionId: mid, active: "timeline" })
        + `<div class="empty"><span class="spin"></span> Loading journey…</div></div>`;
    }
    const page = V2.state.timelineVm;
    const journey = page.journey || {};
    const stages = journey.stages || [];
    const events = page.events || [];

    const stageCards = stages.map((s) => {
      const isHere = s.status === "current";
      const statusLabel = s.status === "complete" ? "Complete"
        : s.status === "current" ? "You are here"
          : s.status === "blocked" ? "Blocked"
            : "Upcoming";
      const gates = (s.gates || []).map((g) => `<li>${esc(g.label)}</li>`).join("");
      return `<article class="mc-journey-stage status-${esc(s.status || "")}${isHere ? " here" : ""}">
        ${isHere ? `<p class="mc-journey-here-badge">YOU ARE HERE</p>` : ""}
        <div class="mc-card-h">
          <h3 style="margin:0">${esc(s.title)}</h3>
          <span class="mc-pill ${esc(s.status === "complete" ? "ok" : s.status === "current" ? "warn" : "")}">${esc(statusLabel)}</span>
        </div>
        <dl class="mc-journey-dl">
          <div><dt>Outcome</dt><dd>${esc(s.outcome || "—")}</dd></div>
          ${s.decisionProduced ? `<div><dt>Decision produced</dt><dd>${esc(s.decisionProduced)}</dd></div>` : ""}
          ${s.decisionWaiting ? `<div><dt>Decision waiting</dt><dd>${esc(s.decisionWaiting)}</dd></div>` : ""}
          ${s.decisionNext && !s.decisionWaiting ? `<div><dt>What happens next</dt><dd>${esc(s.decisionNext)}</dd></div>` : ""}
        </dl>
        ${gates ? `<div class="mc-journey-gates"><span class="muted">Available gates</span><ul>${gates}</ul></div>` : ""}
      </article>`;
    }).join("") || `<div class="rempty">Journey stages unavailable for this mission.</div>`;

    const engRows = events.map((e) => `<article class="mc-tl-event">
      <div class="mc-tl-time">${esc(e.timeLabel)} · ${esc(e.actor)}</div>
      <h4>${esc(e.headline)}</h4>
      ${e.explanation ? `<p>${esc(e.explanation)}</p>` : ""}
      ${e.expandable ? `<details><summary>Details</summary><pre class="mono">${esc(JSON.stringify(e.detail, null, 2))}</pre></details>` : ""}
    </article>`).join("") || `<div class="rempty">No engineering events yet for this mission.</div>`;

    const rail = journey.rail || stages.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      current: s.status === "current",
      gate: Boolean(s.decisionWaiting),
      gatePending: Boolean(s.decisionWaiting),
      gateLabel: s.decisionWaiting || s.decisionProduced || null,
    }));
    const railHtml = V2.journeyRailHtml(rail, { currentId: journey.currentStageId });

    // §10.5 — Recent Progress lives here now, not as a second dashboard column.
    const milestones = page.milestones || [];
    const milestoneSec = milestones.length ? `<section class="mc-sec mc-journey-milestones">
      <h3>Recent progress</h3>
      <p class="muted">Milestones behind the phases above.</p>
      ${milestones.map((m) => `<div class="mc-tl-row">
        <div class="mc-tl-time">${esc(m.timeLabel)}${m.actor ? ` · ${esc(m.actor)}` : ""}</div>
        <div><b>${esc(m.headline)}</b>${m.explanation && m.explanation !== m.headline
          ? `<div class="muted">${esc(m.explanation)}</div>` : ""}</div>
      </div>`).join("")}
    </section>` : "";

    return shell(page.title || "Mission Journey", {
      missionId: mid,
      active: "timeline",
      lead: journey.youAreHereLabel || "Operational progress for this mission — not an engineering log.",
    }) + `
      <section class="mc-sec mc-journey-page" id="mc-journey">
        <h3>Mission Journey</h3>
        <p class="muted">${esc(journey.completedCount || 0)} of ${esc(journey.totalCount || stages.length)} phases complete
          ${journey.nextAfterHere ? ` · Next: ${esc(journey.nextAfterHere)}` : ""}</p>
        ${railHtml}
        <div class="mc-journey-stages">${stageCards}</div>
      </section>
      ${milestoneSec}
      <details class="mc-sec mc-eng-history">
        <summary><h3 style="display:inline">Show engineering activity</h3>
          <span class="muted"> — workers, tests, browser cert, timeline messages</span>
        </summary>
        <div class="mc-tl">${engRows}</div>
      </details>
    </div>`;
  };

  V2.viewWorkers = function () {
    V2.revalidate("workers", () => V2.fetchWorkers());
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
    V2.revalidate(`worker:${workerId}`, () => V2.fetchWorker(workerId));
    if (!V2.state.workerDetail || V2.state.workerDetail.worker?.workerId !== workerId) {
      V2.fetchWorker(workerId);
      return shell("Worker") + `<div class="empty"><span class="spin"></span> Loading…</div></div>`;
    }
    if (V2.state.workerDetailError) {
      return shell("Worker") + errPanel("Worker not found", { message: V2.state.workerDetailError }) + `</div>`;
    }
    const w = V2.state.workerDetail.worker;
    return shell(w.deliverable || w.assignmentTitle || "Worker", {
      lead: `${esc(w.missionTitle)} · ${esc(w.healthLabel)}`,
      actions: `<button class="btn sm" data-nav="workers">← Workers</button>`,
    }) + `
      <section class="mc-sec">
        <h3>Assignment</h3>
        <p><b>${esc(w.assignmentTitle || w.deliverable)}</b></p>
        <p>${esc(w.objective)}</p>
        <p><b>Provider / model:</b> ${esc(w.provider || w.model || "Unknown")}</p>
        <p><b>Runtime:</b> ${esc(w.runtimeDuration || "Unavailable")}</p>
        <p><b>Current session:</b> ${esc(w.currentSession || w.currentActivity)}</p>
        <p><b>Next step:</b> ${esc(w.nextStep)}</p>
        <p><b>Director:</b> ${esc(w.directorAction)}</p>
        ${w.directorManagedRecovery ? `<p class="muted">Director is handling recovery — no action needed from you.</p>` : ""}
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
    V2.revalidate(`decisions:${mid || "open"}`, () => V2.fetchDecisions(mid));
    if (!V2.state.decisionsVm || V2.state.decisionsMissionId !== mid) {
      V2.fetchDecisions(mid);
      return shell("Decisions", { missionId: mid, active: "decisions" })
        + `<div class="empty"><span class="spin"></span> Loading decisions…</div></div>`;
    }
    const decisions = [...(V2.state.decisionsVm.decisions || [])]
      .sort((a, b) => Number(b.status === "open") - Number(a.status === "open"));
    const openCount = decisions.filter((d) => d.status === "open").length;
    const rows = decisions.map((d) => {
      const stop = d.briefing?.stop_reason || d.question || d.title;
      const rec = d.briefing?.recommendation_summary || d.recommendation;
      return `<article class="mc-card" data-nav="decisions/${esc(d.decisionId)}">
      <div class="mc-card-h"><b>${esc(stop)}</b><span class="mc-pill">${esc(d.statusLabel)}</span></div>
      <div class="muted">${esc(d.missionTitle)} · ${esc(d.requestedLabel)}</div>
      <p>${esc((d.situation || "").slice(0, 200))}${(d.situation || "").length > 200 ? "…" : ""}</p>
      <p><b>Director recommends:</b> ${esc(rec)}</p>
      ${actionBtn(d.primaryAction)}
    </article>`;
    }).join("") || `<div class="rempty">No decisions here.</div>`;

    const lead = openCount
      ? (mid ? "Director briefings that need your call." : "Open decisions across missions.")
      : (mid
        ? "No open decisions on this mission. Completion review lives on Dashboard → Needs Me."
        : "No open decisions right now.");

    return shell("Decisions", {
      missionId: mid,
      active: mid ? "decisions" : null,
      lead,
    }) + `<div class="mc-list">${rows}</div></div>`;
  };

  V2.viewDecisionDetail = function (decisionId) {
    const cached = V2.state.decisionDetail?.decision;
    // TTL revalidate always; open decisions also force a hard refetch once per open cache.
    V2.revalidate(`decision:${decisionId}`, () => V2.fetchDecision(decisionId, V2.state.selectedMissionId), {
      maxAgeMs: cached?.status === "open" ? 2000 : DEFAULT_MAX_AGE_MS,
    });
    const revalidateKey = `dec:${decisionId}`;
    const mustRevalidateOpen = cached
      && cached.decisionId === decisionId
      && cached.status === "open"
      && V2.state._decisionRevalidated !== revalidateKey;
    if (!cached || cached.decisionId !== decisionId || mustRevalidateOpen) {
      if (mustRevalidateOpen) V2.state._decisionRevalidated = revalidateKey;
      V2.fetchDecision(decisionId, V2.state.selectedMissionId);
      return shell("Decision") + `<div class="empty"><span class="spin"></span> Loading decision…</div></div>`;
    }
    if (V2.state.decisionDetailError) {
      return shell("Decision") + errPanel("Decision not found", { message: V2.state.decisionDetailError }) + `</div>`;
    }
    const d = V2.state.decisionDetail.decision;
    const s = d.sections || {};
    const b = d.briefing || {};
    const open = d.status === "open";
    const chosen = d.chosen_option_id || d.chosenOptionId || "";
    const resolvedViaTha = !open && /trusted_host|Trusted Host/i.test(`${chosen} ${d.response || ""}`);
    const why = s.whyStopped || b.why_stopped || {};
    const whyBullets = (why.bullets || []).map((x) => `<li>${esc(x)}</li>`).join("");
    const whyBlock = `<p>${esc(why.lead || s.whyItMatters || "")}</p>
      ${whyBullets ? `<ul>${whyBullets}</ul>` : ""}
      ${why.close ? `<p>${esc(why.close)}</p>` : ""}`;

    const recCard = s.recommendedCard || b.recommended_card || {};
    const recWhy = (s.recommendationWhy || b.recommendation_why || []).map((x) => `<li>${esc(x)}</li>`).join("");
    const impact = (s.impact || recCard.impact || d.impactLines || []).map((x) => `<li>${esc(x)}</li>`).join("");

    const altCards = (s.alternatives || b.alternative_cards || []).map((o) => {
      const id = o.id || o.optionId;
      const title = o.title || o.label;
      return `<article class="mc-opt-card">
        <div class="mc-opt-card-h"><b>${esc(title)}</b></div>
        <p>${esc(o.description || "")}</p>
        <p class="muted"><b>When to choose:</b> ${esc(o.whenToChoose || "")}</p>
        ${open && id ? `<button class="btn ghost" data-mc-answer="${esc(d.decisionId)}" data-option="${esc(id)}" data-mission="${esc(d.missionId)}">Choose this</button>` : ""}
      </article>`;
    }).join("");

    const approveSteps = (s.afterApprove || b.approval_steps || []).map((x) => `<li>${esc(x)}</li>`).join("");
    const rejectSteps = (s.afterReject || b.rejection_steps || []).map((x) => `<li>${esc(x)}</li>`).join("");

    const tech = d.technicalDetails || b.technical || {};
    const techJson = esc(JSON.stringify(tech, null, 2));

    const primaryActions = open ? `<div class="mc-actions mc-decision-actions mobile-decision">
      <button class="btn" data-mc-answer="${esc(d.decisionId)}" data-option="${esc(s.recommendedCard?.id || b.recommendation_id || d.recommendationId)}" data-mission="${esc(d.missionId)}">Approve recommendation</button>
      <button class="btn ghost" data-mc-ask="${esc(d.decisionId)}">Ask Director</button>
      <button class="btn ghost" data-mc-reject="${esc(d.decisionId)}">Reject and provide direction</button>
    </div>` : `<div class="mc-pill">${esc(d.statusLabel || "Answered")}</div>`;

    const resolutionBanner = resolvedViaTha ? `<section class="mc-briefing-sec">
      <div class="mc-rec-card" style="border-color: var(--ok, #2a7a4b)">
        <div class="mc-rec-badge">Resolved</div>
        <p class="mc-rec-summary">Director already fulfilled this via a Trusted Host Action. No Terminal, Supabase, or credential step is needed.</p>
        <p class="muted">${esc(d.response || "Census ran on the trusted host; results returned to Claude.")}</p>
        <div class="mc-actions">
          <button class="btn" data-nav="missions/${esc(d.missionId)}">Back to mission</button>
          <button class="btn ghost" data-nav="needs-you">Open Needs You</button>
        </div>
      </div>
    </section>` : (!open ? `<section class="mc-briefing-sec">
      <p class="muted">This decision is already answered (${esc(chosen || d.statusLabel || "answered")}). It is shown for history only.</p>
    </section>` : "");

    return shell(open ? "Director needs your decision" : "Decision history", {
      missionId: d.missionId,
      active: "decisions",
      lead: `${esc(d.missionTitle)} · ${esc(d.requestedLabel)}`,
    }) + `<article class="mc-decision mc-briefing mobile-decision">
      <header class="mc-briefing-hero">
        <p class="mc-briefing-kicker">${open ? "Director needs your decision" : "Decision history"}</p>
        <h2 class="mc-briefing-stop">${esc(s.stopReason || b.stop_reason || d.title)}</h2>
      </header>

      ${resolutionBanner}

      <section class="mc-briefing-sec">
        <h3>What happened?</h3>
        <p>${esc(s.whatHappened || d.situation)}</p>
      </section>

      <section class="mc-briefing-sec">
        <h3>Why did I stop?</h3>
        ${whyBlock}
      </section>

      ${open ? `<section class="mc-briefing-sec mc-briefing-rec">
        <h3>Director’s recommendation</h3>
        <div class="mc-rec-card">
          <div class="mc-rec-badge">Recommended</div>
          <p class="mc-rec-summary">${esc(s.recommendation || b.recommendation_summary || d.recommendation)}</p>
          <p class="mc-rec-path muted">${esc(recCard.title || b.recommendation_label || "")}</p>
          <h4>Why?</h4>
          <ul>${recWhy || `<li>${esc(d.recommendationReason || "Best path given the Mission Brief and accepted work.")}</li>`}</ul>
          <h4>Estimated impact</h4>
          <ul>${impact || "<li>Review carefully before continuing</li>"}</ul>
          <button class="btn" data-mc-answer="${esc(d.decisionId)}" data-option="${esc(recCard.id || b.recommendation_id || d.recommendationId)}" data-mission="${esc(d.missionId)}">Continue with recommendation</button>
        </div>
      </section>

      <section class="mc-briefing-sec">
        <h3>Other options</h3>
        <div class="mc-opt-grid">${altCards || `<p class="muted">No alternatives were offered.</p>`}</div>
      </section>

      <section class="mc-briefing-sec">
        <h3>What happens after I answer?</h3>
        <div class="mc-after-grid">
          <div class="mc-after-card">
            <h4>If you approve</h4>
            <p>${esc(s.approvalResult || b.approval_result || d.afterAnswer || "")}</p>
            ${approveSteps ? `<p class="muted">Director will:</p><ul>${approveSteps}</ul>` : ""}
          </div>
          <div class="mc-after-card">
            <h4>If you reject</h4>
            <p>${esc(s.rejectionResult || b.rejection_result || "Director keeps work paused and waits for new direction.")}</p>
            ${rejectSteps ? `<ul>${rejectSteps}</ul>` : ""}
          </div>
        </div>
      </section>` : ""}

      ${d.pausedWork?.length && open ? `<section class="mc-briefing-sec">
        <h3>Work waiting on this</h3>
        ${(d.pausedWork || []).map((w) => `<div class="mc-work"><b>${esc(w.title)}</b> · ${esc(w.statusLabel)}</div>`).join("")}
      </section>` : ""}

      ${primaryActions}

      <details class="mc-diag mc-tech-details">
        <summary>Technical details</summary>
        <p class="muted">Worker reasoning, session metadata, and raw decision fields — not required to decide.</p>
        <pre class="mono">${techJson}</pre>
      </details>
    </article></div>`;
  };

  V2.viewEvidence = function (missionId) {
    const mid = missionId || V2.state.selectedMissionId;
    if (!mid) {
      return shell("Evidence") + `<div class="rempty">Open a mission to review evidence.</div>
        <button class="btn" data-nav="missions">Missions</button></div>`;
    }
    V2.revalidate(`evidence:${mid}`, () => V2.fetchEvidence(mid));
    if (!V2.state.evidenceVm || V2.state.evidenceMissionId !== mid) {
      V2.fetchEvidence(mid);
      return shell("Evidence", { missionId: mid, active: "evidence" })
        + `<div class="empty"><span class="spin"></span> Loading evidence…</div></div>`;
    }
    const page = V2.state.evidenceVm;
    const kinds = (page.kinds || []).map((k) => `<li>${esc(k.label)}</li>`).join("");
    const primary = page.primaryProof;
    const sufficiency = (page.sufficiency?.statements || page.sufficiency || [])
      .map((s) => `<li class="tone-${esc(s.tone || "info")}">${esc(s.text)}</li>`).join("");

    function cardHtml(a) {
      if (!a) return "";
      const img = a.previewHref && a.presentation === "media"
        ? `<a class="mc-ev-media" href="${esc(a.previewHref)}" target="_blank" rel="noopener">
            <img src="${esc(a.previewHref)}" alt="${esc(a.title)}" loading="lazy" />
          </a>`
        : "";
      return `<article class="mc-card mc-ev-card cat-${esc(a.category || "")} result-${esc(a.result || "")}">
        ${a.fixtureOnly ? `<p class="mc-ev-fixture">Fixture-only evidence</p>` : ""}
        ${img}
        <div class="mc-card-h">
          <b>${esc(a.title)}</b>
          <span class="mc-pill">${esc(a.typeLabel)}</span>
        </div>
        <p class="muted">${esc(a.categoryLabel || "")}${a.comparisonRole ? ` · ${esc(a.comparisonRole)}` : ""}</p>
        <p><b>Proves:</b> ${esc(a.proves)}</p>
        <p><b>Result:</b> ${esc(a.resultLabel || "—")}</p>
        <p class="muted">${esc(a.producedBy)} · ${esc(a.whenLabel || "—")}${a.commit ? ` · ${esc(a.commit)}` : ""}
          ${a.environment ? ` · ${esc(a.environment)}` : ""}</p>
        ${a.acceptanceCriteriaIds?.length ? `<p class="muted">Criteria: ${esc(a.acceptanceCriteriaIds.join(", "))}</p>` : ""}
        <details class="mc-diag"><summary>Technical details</summary>
          ${a.command ? `<p class="mono">${esc(a.command)}${a.exitCode != null ? ` → ${a.exitCode === 0 ? "passed" : "failed"}` : ""}</p>` : ""}
          ${a.technicalPath ? `<code>${esc(a.technicalPath)}</code>` : `<p class="muted">No file path recorded</p>`}
          <pre class="mono">${esc(JSON.stringify(a.provenance || { evidenceId: a.evidenceId }, null, 2))}</pre>
        </details>
      </article>`;
    }

    const pairHtml = (page.pairs || []).map((p) => `<section class="mc-ev-pair">
      <h4>${esc(p.title || "Before / After")}</h4>
      <p class="muted">${esc(p.whatChanged || "")}</p>
      <div class="mc-ev-pair-grid">
        <div><p class="mc-ev-pair-label">Before</p>${cardHtml(p.before)}</div>
        <div><p class="mc-ev-pair-label">After</p>${cardHtml(p.after)}</div>
      </div>
    </section>`).join("");

    const groups = (page.groups || []).map((g) => `<section class="mc-sec mc-ev-group" id="ev-${esc(g.id)}">
      <h3>${esc(g.label)} <span class="muted">(${esc(String(g.count))})</span></h3>
      <div class="mc-ev-grid">${(g.items || []).map(cardHtml).join("")}</div>
    </section>`).join("");

    // Fallback flat list if groups empty but artifacts exist
    const flat = !groups && (page.artifacts || []).length
      ? `<div class="mc-ev-grid">${page.artifacts.map(cardHtml).join("")}</div>`
      : "";

    const cov = (page.coverage || []).map((c) =>
      `<div class="mc-ac">${esc(c.statusLabel)} — ${esc(c.statement)}</div>`).join("");

    return shell(page.title || "Evidence", {
      missionId: mid,
      active: "evidence",
      lead: page.empty
        ? (page.emptyMessage || "Director is waiting on proof artifacts")
        : "Proof first — paths and commands stay under Technical details.",
    }) + `
      <section class="mc-sec mc-ev-hero">
        ${kinds ? `<ul class="mc-ev-kinds">${kinds}</ul>` : ""}
        ${primary ? `<p class="mc-ev-primary"><span class="muted">Strongest proof</span><br/><b>${esc(primary.title)}</b>
          <span class="muted"> — ${esc(primary.proves || "")}</span></p>` : ""}
        ${sufficiency ? `<ul class="mc-ev-sufficiency">${sufficiency}</ul>` : ""}
      </section>
      ${pairHtml}
      ${groups || flat || `<div class="rempty">${esc(page.emptyMessage || "No evidence collected yet.")}</div>`}
      <details class="mc-sec">
        <summary><h3 style="display:inline">Acceptance coverage</h3>
          <span class="muted"> — secondary to gallery</span>
        </summary>
        ${cov || `<div class="muted">No criteria mapped</div>`}
      </details>
    </div>`;
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

  function kickoffInterpretationHtml(k) {
    const title = k.title && !/^untitled/i.test(k.title) ? k.title : null;
    const outcomes = k.expectedOutcomes || (k.acceptanceCriteria || []).map((c) => c.statement || c);
    const deliverables = k.deliverables || (k.phases || []).map((p) => ({ title: p.title, statusLabel: null, outputs: p.outputs || [] }));
    const findings = (k.findings || []).map((f) =>
      `<div class="mc-card ${f.severity === "blocking" ? "warn" : ""}">${esc(f.message)}</div>`).join("");
    const assessment = k.directorAssessment || (k.canStart === false ? "Needs clarification" : "Ready");
    const raw = k.raw || k.rawBrief || null;
    const phases = k.phases || [];
    const reused = k.reusedArtifacts || [];
    const conf = k.compilationConfidence != null ? `${k.compilationConfidence}%` : null;
    const risks = k.risks || [];
    const report = k.compilationReport;
    return `<section class="mc-sec mc-brief-interp mc-compiled-review">
      <p class="mc-stat-k">Mission Review — Compiled Mission</p>
      <div class="mc-brief-head">
        <div class="mc-stat-k">Mission</div>
        <h2>${esc(title || "Title needed")}</h2>
        ${!title ? `<p class="warn-text">Compiler could not recover a title — confirm before starting.</p>` : ""}
      </div>
      <div class="mc-stat-k">Objective</div>
      <p>${esc(k.objective || "—")}</p>
      <div class="mc-stat-k">Execution phases</div>
      <ol>${phases.map((p) => `<li><b>${esc(p.title)}</b>${p.objective ? ` — ${esc(p.objective)}` : ""}${p.kind ? ` <span class="muted">(${esc(p.kind)})</span>` : ""}</li>`).join("") || "<li class=\"muted\">None</li>"}</ol>
      <div class="mc-stat-k">Deliverables</div>
      <ul>${(deliverables || []).map((d) => `<li><b>${esc(d.title)}</b>${d.statusLabel ? ` · <span class="mc-pill ${d.status === "reused" ? "executing" : ""}">${esc(d.statusLabel)}</span>` : ""}</li>`).join("") || "<li class=\"muted\">None</li>"}</ul>
      <div class="mc-stat-k">Accepted artifacts being reused</div>
      <ul>${reused.map((a) => `<li><b>${esc(a.title)}</b> <span class="muted">${esc(a.path || "")}</span></li>`).join("") || "<li class=\"muted\">None reused</li>"}</ul>
      <div class="mc-stat-k">Dependencies</div>
      <ul>${phases.filter((p) => (p.outputs || []).length || p.objective).slice(0, 8).map((p) => `<li>${esc(p.title)}${(p.outputs || []).length ? ` → ${esc((p.outputs || []).join(", "))}` : ""}</li>`).join("") || "<li class=\"muted\">Phase order as listed above</li>"}</ul>
      <div class="mc-stat-k">Expected decisions</div>
      <ul>${(k.expectedDecisions || []).map((d) => `<li>${esc(d.title || d.prompt || JSON.stringify(d))}</li>`).join("") || "<li class=\"muted\">None expected at compile time</li>"}</ul>
      <div class="mc-stat-k">Warnings / risks</div>
      ${risks.length || findings
        ? `<ul>${risks.map((r) => `<li class="warn">${esc(r)}</li>`).join("")}</ul>${findings}`
        : `<ul><li class="muted">None</li></ul>`}
      <div class="mc-stat-k">Acceptance criteria</div>
      <ul>${(outcomes || []).map((o) => `<li>${esc(typeof o === "string" ? o : o.statement || o)}</li>`).join("") || "<li class=\"muted\">None listed</li>"}</ul>
      <div class="mc-stat-k">Worker disciplines</div>
      <ul>${(k.recommendedWorkerDisciplines || ["General engineering"]).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
      <div class="mc-stat-k">Compilation confidence</div>
      <p><span class="mc-pill ${k.readyToExecute ? "executing" : "decision_required"}">${esc(conf || assessment)}</span>
        ${k.readyToExecute ? " · Ready to execute" : " · Not ready to execute"}</p>
      <div class="mc-stat-k">Director assessment</div>
      <p>${esc(assessment)}</p>
      ${report ? `<details class="mc-diag"><summary>Compilation Report</summary>
        <pre class="mono">${esc(JSON.stringify({
          reused: report.accepted_artifacts_reused,
          new_work: report.new_work_identified,
          warnings: report.warnings,
          conflicts: report.conflicts,
          decisions: report.compiler_decisions,
          confidence: report.compilation_confidence,
          execution: report.execution_summary,
        }, null, 2))}</pre>
      </details>` : ""}
      <details class="mc-diag mc-raw-brief"><summary>View Source — Raw Mission Brief</summary>
        <pre class="mono">${esc(raw ? JSON.stringify(raw, null, 2) : "Original document available after save.")}</pre>
      </details>
      <div class="mc-actions">
        <button class="btn ghost" data-mc-kickoff-reset="1">Back</button>
        ${k.missionId
          ? `<button class="btn" data-mc-kickoff-start="${esc(k.missionId)}" ${k.canStart === false ? "disabled" : ""}>${esc(k.primaryAction?.label || "Start mission")}</button>`
          : `<button class="btn" data-mc-kickoff-ingest="1">Compile & continue</button>`}
      </div>
    </section>`;
  }

  function kickoffReviewHtml(k) {
    return kickoffInterpretationHtml(k);
  }

  function kickoffReadinessHtml(k) {
    return kickoffInterpretationHtml({
      ...k,
      directorAssessment: k.directorAssessment || (k.canStart === false ? "Needs clarification" : "Ready"),
    });
  }

  V2.fetchRuntimeDiagnostics = async function () {
    try {
      V2.state.runtimeDiagnostics = await get("/api/v2/runtime/diagnostics");
      V2.state.runtimeDiagnosticsError = null;
    } catch (e) {
      V2.state.runtimeDiagnosticsError = String(e.message || e);
    }
    try {
      V2.state.dayOps = await get("/api/v2/day");
    } catch {
      V2.state.dayOps = null;
    }
    try {
      const j2 = await get("/api/v2/trusted-host/diagnostics");
      V2.state.trustedHostDiagnostics = j2.diagnostics || j2;
      V2.state.trustedHostDiagnosticsError = null;
    } catch (e) {
      V2.state.trustedHostDiagnosticsError = String(e.message || e);
    }
    markFetched("runtimeDiagnostics");
    paintIfChanged("runtimeDiagnostics", {
      diag: V2.state.runtimeDiagnostics,
      day: V2.state.dayOps,
      tha: V2.state.trustedHostDiagnostics,
    });
  };

  V2.viewSettings = function () {
    V2.revalidate("runtimeDiagnostics", () => V2.fetchRuntimeDiagnostics(), { maxAgeMs: 8000 });
    if (!V2.state.runtimeDiagnostics && !V2.state.runtimeDiagnosticsError) {
      V2.fetchRuntimeDiagnostics();
    }
    const diag = V2.state.runtimeDiagnostics;
    const day = V2.state.dayOps || {};
    const claude = diag?.claude || {};
    const ex = diag?.execution || {};
    const tha = V2.state.trustedHostDiagnostics;
    const claudePill = claude.state === "available" ? "ok"
      : claude.state === "auth_missing" ? "warn"
        : "bad";
    const thaHostPill = !tha ? ""
      : (tha.hostRuntimeAvailable && tha.databaseCredentialAvailable) ? "ok" : "warn";
    const dayPill = day.status === "paused" ? "warn" : "ok";
    return shell("Settings", { lead: "Day controls, diagnostics, and legacy tools." }) + `
      <section class="mc-sec">
        <h3>Start / stop of day</h3>
        <p>${esc(day.detail || "Pause all registered workers overnight, or resume them in the morning.")}</p>
        <p class="muted">${esc(day.note || "Uses alloy-worker-pause --all / alloy-worker-resume --all.")}</p>
        <div class="mc-card-h" style="margin:10px 0">
          <b>Day status</b>
          <span class="mc-pill ${dayPill}">${esc(day.statusLabel || "—")}</span>
        </div>
        <div class="mc-actions row gap">
          <button class="btn" type="button" data-mc-day-start>Start of day</button>
          <button class="btn ghost" type="button" data-mc-day-stop>Stop of day</button>
        </div>
      </section>
      <section class="mc-sec">
        <h3>Diagnostics</h3>
        <p class="muted">Execution runtime configuration and Claude availability.</p>
        ${V2.state.runtimeDiagnosticsError && !diag
          ? `<p class="muted">Could not load diagnostics: ${esc(V2.state.runtimeDiagnosticsError)}</p>`
          : ""}
        <div class="mc-stat-grid">
          <div class="mc-stat"><div class="mc-stat-k">Configured provider</div><div class="mc-stat-v">${esc(ex.configuredProvider || "…")}</div></div>
          <div class="mc-stat"><div class="mc-stat-k">Resolved provider</div><div class="mc-stat-v">${esc(ex.resolvedProvider || "…")}</div></div>
          <div class="mc-stat"><div class="mc-stat-k">Auto-dispatch</div><div class="mc-stat-v">${diag ? (ex.autoDispatch ? "On" : "Off") : "…"}</div></div>
          <div class="mc-stat"><div class="mc-stat-k">Mock authorized</div><div class="mc-stat-v">${diag ? (ex.mockAuthorized ? "Yes (test-only)" : "No") : "…"}</div></div>
          <div class="mc-stat"><div class="mc-stat-k">Desktop-owned</div><div class="mc-stat-v">${diag ? (ex.desktopOwned ? "Yes" : "No") : "…"}</div></div>
          <div class="mc-stat"><div class="mc-stat-k">Control plane PID</div><div class="mc-stat-v">${esc(String(diag?.pid || "…"))}</div></div>
        </div>
        <article class="mc-card" style="margin-top:12px">
          <div class="mc-card-h"><b>Claude</b><span class="mc-pill ${claudePill}">${esc(claude.label || (diag ? "Unknown" : "Checking…"))}</span></div>
          <p>${esc(claude.detail || "Loading Claude availability…")}</p>
          ${claude.bin ? `<p class="muted">CLI: ${esc(claude.bin)}</p>` : ""}
        </article>
        <article class="mc-card" style="margin-top:12px">
          <div class="mc-card-h"><b>Trusted Host Actions</b><span class="mc-pill ${thaHostPill || "muted"}">${esc(tha ? (tha.hostRuntimeAvailable ? "Runtime ready" : "Unavailable") : "Checking…")}</span></div>
          <p class="muted">Privileged operations run on the desktop-owned host. Workers never receive credentials. Secret values are never shown.</p>
          ${V2.state.trustedHostDiagnosticsError && !tha
            ? `<p class="muted">Could not load: ${esc(V2.state.trustedHostDiagnosticsError)}</p>`
            : ""}
          ${tha ? `
          <div class="mc-stat-grid" style="margin-top:8px">
            <div class="mc-stat"><div class="mc-stat-k">Host runtime</div><div class="mc-stat-v">${tha.hostRuntimeAvailable ? "Available" : "Missing"}</div></div>
            <div class="mc-stat"><div class="mc-stat-k">Database credential</div><div class="mc-stat-v">${tha.databaseCredentialAvailable ? "Available on host" : "Unavailable"}</div></div>
            <div class="mc-stat"><div class="mc-stat-k">Approved DB target</div><div class="mc-stat-v"><code>${esc(tha.approvedDatabaseTarget || "—")}</code></div></div>
            <div class="mc-stat"><div class="mc-stat-k">Registered actions</div><div class="mc-stat-v">${esc(String((tha.registeredActions || []).length))}</div></div>
            <div class="mc-stat"><div class="mc-stat-k">Active actions</div><div class="mc-stat-v">${esc(String((tha.activeActions || []).length))}</div></div>
            <div class="mc-stat"><div class="mc-stat-k">Last success</div><div class="mc-stat-v">${esc(tha.lastSuccessfulAction ? `${tha.lastSuccessfulAction.actionType} @ ${tha.lastSuccessfulAction.at}` : "—")}</div></div>
          </div>
          ${(tha.registeredActions || []).length ? `<ul style="margin-top:8px">${tha.registeredActions.map((a) =>
            `<li><code>${esc(a.actionType || a.type || a)}</code>${a.riskClass ? ` — ${esc(a.riskClass)}` : ""}</li>`).join("")}</ul>` : ""}
          ${(tha.recentFailures || []).length ? `<div style="margin-top:8px"><div class="mc-stat-k">Recent failures</div><ul>${tha.recentFailures.map((f) =>
            `<li><code>${esc(f.id)}</code> — ${esc(typeof f.reason === "object" ? (f.reason.code || JSON.stringify(f.reason)) : (f.reason || "failed"))}</li>`).join("")}</ul></div>` : ""}
          ` : ""}
        </article>
        <article class="mc-card" style="margin-top:12px">
          <div class="mc-card-h"><b>Desktop notifications</b><span class="mc-pill ${typeof Notification === "undefined" ? "bad" : (Notification.permission === "granted" ? "ok" : Notification.permission === "denied" ? "bad" : "warn")}">${esc(typeof Notification === "undefined" ? "Unavailable" : Notification.permission === "granted" ? "Enabled" : Notification.permission === "denied" ? "Blocked" : "Not enabled")}</span></div>
          <p class="muted">Alerts when Needs You changes — decisions, approvals, and failed silent recoveries. Dock badge mirrors the Needs You count.</p>
          ${typeof Notification !== "undefined" && Notification.permission !== "granted"
            ? `<button class="btn" type="button" data-notify-enable>Enable notifications</button>`
            : `<p class="muted">You'll get a notification when something new needs you (not on every refresh).</p>`}
        </article>
        ${(diag?.sessions?.recent || []).length ? `<div style="margin-top:12px">
          <div class="mc-stat-k">Recent execution sessions</div>
          <ul>${diag.sessions.recent.map((s) => `<li><code>${esc(s.sessionId)}</code> — ${esc(s.status)} — ${esc(s.activity || "")}</li>`).join("")}</ul>
        </div>` : ""}
        <h4 style="margin-top:20px">Legacy tools</h4>
        <div class="row gap">
          <button class="btn ghost" data-legacy-nav="command">Open Legacy Board</button>
          <button class="btn ghost" data-legacy-nav="director">Open Legacy Director</button>
        </div>
      </section>
      <section class="mc-sec">
        <h3>Continuous Improvement</h3>
        <p class="muted">Observations drive future Vacilando work — not speculative redesign.</p>
        <button class="btn" data-nav="improvements">Open Improvement Center</button>
      </section>
    </div>`;
  };

  V2.fetchImprovements = async function (opts) {
    const status = (opts && opts.status) || V2.state.improvementsStatus || "All";
    const missionScope = (opts && opts.missionScope) || V2.state.improvementsMissionScope || "active";
    V2.state.improvementsStatus = status;
    V2.state.improvementsMissionScope = missionScope;
    try {
      const q = new URLSearchParams({
        status,
        mission_scope: missionScope,
      });
      V2.state.improvementsHome = await get("/api/v2/views/improvements?" + q.toString());
      V2.state.improvementsError = null;
      bump(); schedulePaint();
    } catch (e) {
      V2.state.improvementsError = String(e.message || e);
      bump(); schedulePaint();
    }
  };

  V2.fetchImprovement = async (id) => {
    try {
      V2.state.improvementDetail = await get("/api/v2/views/improvement?id=" + encodeURIComponent(id));
      V2.state.improvementError = null;
      bump(); schedulePaint();
    } catch (e) {
      V2.state.improvementError = String(e.message || e);
      bump(); schedulePaint();
    }
  };

  V2.viewImprovements = function () {
    if (!V2.state.improvementsHome && !V2.state.improvementsError) {
      V2.fetchImprovements();
      return shell("Improvements", { lead: "Product feedback from real mission use." })
        + `<div class="empty"><div class="big"><span class="spin"></span> Loading…</div></div></div>`;
    }
    if (V2.state.improvementsError && !V2.state.improvementsHome) {
      return shell("Improvements") + errPanel("Could not load improvements", { message: V2.state.improvementsError }) + `</div>`;
    }
    const home = V2.state.improvementsHome || {};
    const rows = home.improvements || [];
    const status = home.filter?.status || V2.state.improvementsStatus || "All";
    const scope = home.filter?.missionScope || V2.state.improvementsMissionScope || "active";
    const counts = home.counts || {};
    const statusBtns = ["All", "New", "Planned", "Implemented"].map((s) =>
      `<button class="btn ghost ${status === s ? "active" : ""}" type="button" data-imp-status="${s}">${s}</button>`
    ).join("");
    const scopeBtns = [
      ["active", `Active missions (${counts.activeMissions ?? "—"})`],
      ["archived", `Archived missions (${counts.archivedMissions ?? "—"})`],
      ["all", `All (${counts.total ?? "—"})`],
    ].map(([k, label]) =>
      `<button class="btn ghost ${scope === k ? "active" : ""}" type="button" data-imp-scope="${k}">${label}</button>`
    ).join("");
    const cards = rows.map((m) => `<article class="mc-card" data-nav="improvements/${esc(m.id)}">
      <div class="mc-card-h"><b>${esc(m.title)}</b><span class="mc-pill">${esc(m.status)}</span></div>
      <div class="mc-card-p">${esc(m.missionTitle)} · ${esc(m.category)} · ${esc(m.severity)}</div>
      <div class="mc-card-meta muted">${esc(m.created)}</div>
    </article>`).join("") || `<div class="rempty">${scope === "active"
      ? "No observations on active missions. Validation feedback is under Archived missions."
      : "No observations in this filter."}</div>`;
    return shell("Improvements", {
      lead: "Product feedback from real mission use. Validation history stays linked to archived missions.",
      actions: `<button class="btn" type="button" data-ci-open>Improve Vacilando</button>`,
    }) + `<div class="mc-filter-bar row gap" style="margin-bottom:8px;flex-wrap:wrap">${scopeBtns}</div>
    <div class="mc-filter-bar row gap" style="margin-bottom:12px;flex-wrap:wrap">${statusBtns}</div>
    <div class="mc-list">${cards}</div></div>`;
  };

  V2.viewImprovementDetail = function (id) {
    const payload = V2.state.improvementDetail;
    const d = payload?.improvement;
    if (!d || d.id !== id) {
      V2.fetchImprovement(id);
      return shell("Observation", { lead: "Loading…" })
        + `<div class="empty"><div class="big"><span class="spin"></span> Opening…</div></div></div>`;
    }
    if (V2.state.improvementError) {
      return shell("Observation") + errPanel("Could not open observation", { message: V2.state.improvementError }) + `</div>`;
    }
    const interp = d.directorInterpretation || {};
    return shell(d.title || "Observation", {
      lead: `${esc(d.missionTitle || "No mission")} · ${esc(interp.potentialCategory || d.category)} · ${esc(d.timestamp)}`,
      actions: `<button class="btn ghost" data-nav="improvements">Back</button>`,
    }) + `<section class="mc-sec">
      <h3>Operator</h3>
      <p>${esc(interp.operatorObservation || d.description)}</p>
      ${d.expectedBehavior ? `<p class="muted">Expected: ${esc(d.expectedBehavior)}</p>` : ""}
      <h3>Director</h3>
      <p>${esc(interp.directorInterpretation || "Director has not interpreted this yet.")}</p>
      <ul>
        <li>Potential category: ${esc(interp.potentialCategory || d.category || "—")}</li>
        <li>Potential severity: ${esc(interp.potentialSeverity || d.severity || "—")}</li>
        <li>Potential future mission: ${esc(interp.potentialFutureMission || "—")}</li>
      </ul>
      <details class="mc-diag"><summary>Attached context</summary>
        <ul>
          <li>Phase: ${esc(d.currentPhase || "—")}</li>
          <li>Screen: ${esc(d.currentScreen || "—")}</li>
          <li>Route: ${esc(d.currentRoute || "—")}</li>
          <li>Confidence: ${esc(d.directorEnrichment?.confidencePercent ?? "—")}%</li>
          <li>Provider: ${esc(d.provider || "—")}</li>
        </ul>
      </details>
    </section></div>`;
  };

  async function refreshNeedsBadge() {
    try {
      const j = await get("/api/v2/views/needs-you");
      V2.state.needsYou = j;
      const n = (j.items || []).length;
      const el = document.getElementById("nb-needs");
      if (el) el.textContent = String(n);
      try {
        if (window.vacilandoNative?.setDockBadge) window.vacilandoNative.setDockBadge(n);
      } catch { /* */ }
      bump();
    } catch { /* keep */ }
  }

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
      await refreshNeedsBadge();
      bump(); schedulePaint();
      location.hash = "#/missions/" + encodeURIComponent(missionId);
    } catch (e) {
      V2.state.kickoffBusy = null;
      V2.state.kickoffError = e;
      bump(); schedulePaint();
    }
  }

  function openDirectorTextDialog({ title, lead, confirmLabel, placeholder, allowEmpty = false, onSubmit }) {
    document.querySelectorAll(".ov.drev-dialog").forEach((el) => el.remove());
    const ov = document.createElement("div");
    ov.className = "ov drev-dialog";
    ov.innerHTML = `<div class="ov-card wide" role="dialog" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3>
      <p class="mc-lead">${esc(lead || "")}</p>
      <label class="ci-q">Your message
        <textarea id="drev-msg" rows="5" autofocus placeholder="${esc(placeholder || "Write direction for Director…")}"></textarea>
      </label>
      <div class="ov-actions">
        <button type="button" class="btn ghost" data-drev-cancel>Cancel</button>
        <button type="button" class="btn" data-drev-send>${esc(confirmLabel || "Send")}</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", (ev) => {
      if (ev.target === ov || ev.target.closest("[data-drev-cancel]")) ov.remove();
    });
    ov.querySelector("[data-drev-send]")?.addEventListener("click", async () => {
      const msg = ov.querySelector("#drev-msg")?.value?.trim() || "";
      if (!allowEmpty && !msg) { toast("Enter a message for Director.", "err"); return; }
      try {
        await onSubmit(msg);
        ov.remove();
      } catch (e) {
        toast(String(e.message || e), "err");
      }
    });
    setTimeout(() => ov.querySelector("#drev-msg")?.focus(), 30);
  }

  function openCertifyDialog({ missionId, reviewId, waveLabel }) {
    document.querySelectorAll(".ov.drev-dialog").forEach((el) => el.remove());
    const ov = document.createElement("div");
    ov.className = "ov drev-dialog";
    const label = waveLabel ? `Certify ${waveLabel}` : "Certify deliverable";
    ov.innerHTML = `<div class="ov-card wide" role="dialog" aria-label="${esc(label)}">
      <h3>${esc(label)}</h3>
      <p class="mc-lead">Confirm you trust Director’s recommendation. Optionally leave a note for alignment — residual risk you accept, preference for the next wave, or product judgment.</p>
      <label class="ci-q">Note for Director <span class="muted">(optional)</span>
        <textarea id="drev-msg" rows="4" autofocus placeholder="e.g. Accept residual risk on X; prefer Y for next wave…"></textarea>
      </label>
      <div class="ov-actions">
        <button type="button" class="btn ghost" data-drev-cancel>Cancel</button>
        <button type="button" class="btn" data-drev-send>Confirm certify</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", (ev) => {
      if (ev.target === ov || ev.target.closest("[data-drev-cancel]")) ov.remove();
    });
    ov.querySelector("[data-drev-send]")?.addEventListener("click", async () => {
      const note = ov.querySelector("#drev-msg")?.value?.trim() || "";
      const btn = ov.querySelector("[data-drev-send]");
      if (btn) btn.disabled = true;
      const ok = await acceptDeliverable(missionId, reviewId, note);
      if (ok) ov.remove();
      else if (btn) btn.disabled = false;
    });
    setTimeout(() => ov.querySelector("#drev-msg")?.focus(), 30);
  }

  function scrollToOutcomeThread() {
    requestAnimationFrame(() => {
      const el = document.getElementById("drev-thread")
        || document.getElementById("mc-outcome")
        || document.querySelector(".mc-outcome");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function acceptDeliverable(missionId, reviewId, operatorNote = "") {
    if (V2.state.kickoffBusy) return false;
    V2.state.kickoffBusy = "Recording your certification";
    bump(); schedulePaint();
    try {
      const note = String(operatorNote || "").trim();
      const out = await post("/api/v2/deliverable-reviews/accept", {
        mission_id: missionId,
        review_id: reviewId,
        response: note || "Operator certified deliverable from Mission Control",
        operator_note: note || null,
      });
      if (out && out.ok === false) {
        throw Object.assign(new Error(out.detail || out.error || "Certification failed"), { body: out });
      }
      V2.state.overview = null;
      V2.state.missionsHome = null;
      V2.state.needsYou = null;
      V2.state.kickoffBusy = null;
      V2.state.lastCertFlash = {
        missionId,
        reviewId,
        at: Date.now(),
        label: "You certified this deliverable. Director is continuing the mission.",
      };
      await refreshNeedsBadge();
      toast("Certified. Director will unlock the next work.", "ok");
      bump(); schedulePaint();
      if (onMissionConversation()) {
        await refreshMissionConversation(missionId);
      } else {
        await V2.fetchDashboard(missionId);
        bump(); schedulePaint();
        scrollToOutcomeThread();
      }
      return true;
    } catch (e) {
      V2.state.kickoffBusy = null;
      toast(String(e?.body?.detail || e.message || e), "err");
      bump(); schedulePaint();
      return false;
    }
  }

  async function recheckDeliverable(missionId, reviewId) {
    if (V2.state.kickoffBusy) return;
    V2.state.kickoffBusy = "Director is re-checking";
    bump(); schedulePaint();
    try {
      const out = await post("/api/v2/deliverable-reviews/recheck", {
        mission_id: missionId,
        review_id: reviewId,
      });
      if (out && out.ok === false) {
        throw Object.assign(new Error(out.detail || out.error || "Re-check failed"), { body: out });
      }
      // Do not blank the dashboard before replacement arrives — that produced an
      // empty beige screen with only the toast after "still blocked" rechecks.
      V2.state._paintFp = {};
      V2.state.missionsHome = null;
      V2.state.needsYou = null;
      V2.state.kickoffBusy = null;
      const state = out?.review?.certification_state;
      toast(
        state === "ready_for_review"
          ? "Director re-checked — Certify is available now."
          : "Director re-checked — still blocked. Scroll to What’s blocking you.",
        state === "ready_for_review" ? "ok" : "err",
      );
      await refreshNeedsBadge();
      await V2.fetchDashboard(missionId);
      V2.state.showOutcome = true;
      bump(); schedulePaint();
      if (onMissionConversation()) {
        await refreshMissionConversation(missionId);
        return;
      }
      requestAnimationFrame(() => {
        const el = document.getElementById("mc-outcome")
          || document.querySelector(".drev-stuck-here")
          || document.querySelector(".mc-outcome");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      V2.state.kickoffBusy = null;
      toast(String(e?.body?.detail || e.message || e), "err");
      bump(); schedulePaint();
      try { await V2.fetchDashboard(missionId); } catch { /* */ }
    }
  }

  async function certifyCompletion(missionId) {
    V2.state.kickoffBusy = "Certifying completion";
    V2.state.kickoffError = null;
    toast("Certifying completion…", "ok");
    bump(); schedulePaint();
    try {
      const out = await post("/api/v2/missions/certify", {
        mission_id: missionId,
        actor: "operator",
        response: "Operator certified completion from Mission Control",
      });
      if (out && out.ok === false) {
        throw Object.assign(new Error(out.detail || out.error || "Certification failed"), { body: out });
      }
      V2.state.overview = null;
      V2.state.missionsHome = null;
      V2.state.needsYou = null;
      V2.state.kickoffBusy = null;
      await refreshNeedsBadge();
      bump(); schedulePaint();
      toast("Mission certified — open Mission History to review it.", "ok");
      location.hash = "#/missions?filter=archived";
    } catch (e) {
      V2.state.kickoffBusy = null;
      bump(); schedulePaint();
      toast(e?.message || String(e), "err");
    }
  }

  async function dispatchReady(missionId) {
    toast("Starting work…", "ok");
    try {
      const out = await post("/api/v2/missions/dispatch", {
        mission_id: missionId,
        actor: "operator",
        slot: 6,
      });
      if (out && out.ok === false) {
        throw Object.assign(new Error(out.detail || out.error || "Dispatch failed"), { body: out });
      }
      V2.state.overview = null;
      V2.state.missionsHome = null;
      V2.state.needsYou = null;
      await refreshNeedsBadge();
      bump(); schedulePaint();
      toast("Director is launching the worker.", "ok");
      location.hash = "#/missions/" + encodeURIComponent(missionId);
    } catch (e) {
      toast(e?.message || String(e), "err");
    }
  }

  async function resumeStalled(missionId) {
    const ok = window.confirm(
      "Resume this mission?\n\nThe previous worker went silent. Vacilando will reset the stalled assignment and relaunch work — it will not pretend the old process is still running."
    );
    if (!ok) return;
    toast("Resuming after silence…", "ok");
    try {
      const out = await post("/api/v2/missions/resume-stalled", {
        mission_id: missionId,
        actor: "operator",
        response: "Operator resumed after worker went silent",
        dispatch: true,
      });
      if (out && out.ok === false) {
        throw Object.assign(new Error(out.detail || out.error || "Resume failed"), { body: out });
      }
      V2.state.overview = null;
      V2.state.missionsHome = null;
      V2.state.needsYou = null;
      await refreshNeedsBadge();
      bump(); schedulePaint();
      toast("Relaunching worker.", "ok");
      location.hash = "#/missions/" + encodeURIComponent(missionId);
    } catch (e) {
      toast(e?.message || String(e), "err");
    }
  }

  async function missionServerCommand(action, missionId) {
    const label = action === "start" ? "Starting local Alloy app…" : "Stopping local Alloy app…";
    toast(label, "ok");
    try {
      const out = await post("/api/v2/missions/local-server", {
        mission_id: missionId,
        action,
      });
      if (out && out.ok === false) {
        throw new Error(out.detail || out.error || "Server command failed");
      }
      V2.state.overview = null;
      V2.state._paintFp = {};
      bump(); schedulePaint();
      toast(out.message || (action === "start" ? "Server starting…" : "Server stopped"), "ok");
      if (onMissionConversation()) {
        await refreshMissionConversation(missionId);
        if (action === "start") watchMissionServerReady(missionId, out.localServer?.port);
      } else if (action === "start") {
        watchMissionServerReady(missionId, out.localServer?.port);
      } else if (missionId) {
        setTimeout(() => V2.fetchDashboard(missionId), 800);
      }
    } catch (e) {
      toast(e?.message || String(e), "err");
    }
  }

  function watchMissionServerReady(missionId, _port) {
    const deadline = Date.now() + 90000;
    const iv = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(iv);
        toast("Local Alloy app did not come up in time", "err");
        return;
      }
      try {
        if (!missionId) { clearInterval(iv); return; }
        if (onMissionConversation()) {
          await V2.fetchWorkspaceShell(missionId);
          const local = V2.state.workspaceShell?.operational?.server;
          if (local?.running || local?.status === "running") {
            clearInterval(iv);
            toast(`App is up on :${local.port}`, "ok");
          }
          return;
        }
        const dash = await get("/api/v2/views/mission/dashboard?id=" + encodeURIComponent(missionId));
        V2.state.overview = dash;
        if (!paintIfChanged(`overview:${missionId}`, dash)) patchLiveActivity(dash);
        const local = dash?.dashboard?.localServer || dash?.localServer;
        if (local?.status === "running") {
          clearInterval(iv);
          toast(`App is up on :${local.port}`, "ok");
        }
      } catch { /* keep polling */ }
    }, 3000);
  }

  async function runDayOps(kind) {
    const path = kind === "start" ? "/api/v2/day/start" : "/api/v2/day/stop";
    toast(kind === "start" ? "Starting the day…" : "Stopping the day…", "ok");
    try {
      const out = await post(path, {});
      if (out && out.ok === false) {
        throw new Error(out.detail || out.error || "Day command failed");
      }
      V2.state.dayOps = out.dayOps || null;
      V2.state.runtimeDiagnostics = null;
      bump(); schedulePaint();
      toast(out.message || (kind === "start" ? "Start of day complete." : "Stop of day complete."), "ok");
    } catch (e) {
      toast(e?.message || String(e), "err");
    }
  }

  async function advanceImplementation(missionId) {
    const ok = window.confirm(
      "Advance this same mission to implementation?\n\nDiscovery stays on the timeline. Wave 0 (live authority census) becomes ready to Start work.\nThe mission will not close."
    );
    if (!ok) return;
    toast("Advancing to implementation…", "ok");
    try {
      const out = await post("/api/v2/missions/advance-implementation", {
        mission_id: missionId,
        actor: "operator",
        response: "Operator advanced discovery → implementation on the same mission",
      });
      if (out && out.ok === false) {
        throw Object.assign(new Error(out.detail || out.error || "Advance failed"), { body: out });
      }
      V2.state.overview = null;
      V2.state.missionsHome = null;
      V2.state.needsYou = null;
      V2.state.showOutcome = null;
      await refreshNeedsBadge();
      bump(); schedulePaint();
      toast("Advanced. Click Start work for Wave 0.", "ok");
      location.hash = "#/missions/" + encodeURIComponent(missionId);
    } catch (e) {
      toast(e?.message || String(e), "err");
    }
  }

  async function parkOutcome(missionId) {
    toast("Parking mission…", "ok");
    try {
      const out = await post("/api/v2/missions/park-outcome", {
        mission_id: missionId,
        actor: "operator",
        response: "Operator parked after review — no worker launch",
      });
      if (out && out.ok === false) {
        throw Object.assign(new Error(out.detail || out.error || "Park failed"), { body: out });
      }
      V2.state.overview = null;
      V2.state.missionsHome = null;
      V2.state.needsYou = null;
      await refreshNeedsBadge();
      bump(); schedulePaint();
      toast("Parked. Nothing will launch until you choose again.", "ok");
      location.hash = "#/missions/" + encodeURIComponent(missionId);
    } catch (e) {
      toast(e?.message || String(e), "err");
    }
  }

  async function reopenWork(missionId) {
    const ok = window.confirm(
      "Need more work?\n\nThis reopens the assignment so you can Start work again.\nIt does not launch a worker by itself.\n\nContinue?"
    );
    if (!ok) return;
    toast("Reopening for more work…", "ok");
    try {
      const out = await post("/api/v2/missions/reopen-work", {
        mission_id: missionId,
        actor: "operator",
        response: "Operator requested more work after reviewing the outcome",
      });
      if (out && out.ok === false) {
        throw Object.assign(new Error(out.detail || out.error || "Reopen failed"), { body: out });
      }
      V2.state.overview = null;
      V2.state.missionsHome = null;
      V2.state.needsYou = null;
      V2.state.showOutcome = null;
      await refreshNeedsBadge();
      bump(); schedulePaint();
      toast("Reopened. Click Start work when you want a worker to run.", "ok");
      location.hash = "#/missions/" + encodeURIComponent(missionId);
    } catch (e) {
      toast(e?.message || String(e), "err");
    }
  }

  async function rejectCompletion(missionId) {
    toast("Sending completion back…", "ok");
    try {
      const out = await post("/api/v2/missions/reject-completion", {
        mission_id: missionId,
        actor: "operator",
        response: "Operator rejected completion — work is not finished",
      });
      if (out && out.ok === false) {
        throw Object.assign(new Error(out.detail || out.error || "Reject failed"), { body: out });
      }
      V2.state.overview = null;
      V2.state.missionsHome = null;
      V2.state.needsYou = null;
      await refreshNeedsBadge();
      bump(); schedulePaint();
      toast("Completion sent back — mission stays open.", "ok");
      location.hash = "#/missions/" + encodeURIComponent(missionId);
    } catch (e) {
      toast(e?.message || String(e), "err");
    }
  }

  async function sendDirectorMessage(kind, decisionId, missionId, message) {
    V2.state.kickoffBusy = kind === "ask" ? "Asking Director" : "Sending direction";
    bump(); schedulePaint();
    try {
      const out = await post("/api/v2/director/message", {
        mission_id: missionId,
        decision_id: decisionId,
        kind,
        message,
      });
      V2.state.decisionDetail = null;
      V2.state.overview = null;
      V2.state.decisionsVm = null;
      V2.state.needsYou = null;
      V2.state.kickoffBusy = null;
      V2.state.lastDirectorMessage = out;
      await refreshNeedsBadge();
      bump(); schedulePaint();
      location.hash = "#/missions/" + encodeURIComponent(missionId);
    } catch (e) {
      V2.state.kickoffBusy = null;
      V2.state.kickoffError = e;
      bump(); schedulePaint();
    }
  }

  document.addEventListener("click", async (ev) => {
    if (ev.target.closest("#improve-vacilando-btn") || ev.target.closest("[data-ci-open]")) {
      openImproveDialog();
      return;
    }
    const wsRetry = ev.target.closest("[data-ws-retry]");
    if (wsRetry) {
      ev.preventDefault();
      V2.state.workspaceShell = null;
      V2.state.workspaceMessages = null;
      V2.state.workspaceRuntime = null;
      V2.fetchWorkspaceShell(wsRetry.dataset.wsRetry || "ws_identity");
      return;
    }
    const wsRetryMsgs = ev.target.closest("[data-ws-retry-msgs]");
    if (wsRetryMsgs) {
      ev.preventDefault();
      V2.fetchWorkspaceMessages(wsRetryMsgs.dataset.wsRetryMsgs || "ws_identity");
      return;
    }
    const inlineOpen = ev.target.closest("[data-ws-inline-review]");
    if (inlineOpen) {
      ev.preventDefault();
      V2.state._wsInlineReviewOpen = true;
      V2.state._wsStickBottom = true;
      bump(); schedulePaint();
      requestAnimationFrame(() => {
        document.getElementById("ws-inline-review")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    if (ev.target.closest("[data-ws-inline-review-close]")) {
      ev.preventDefault();
      V2.state._wsInlineReviewOpen = false;
      bump(); schedulePaint();
      return;
    }
    if (ev.target.closest("[data-ws-toggle-shots]")) {
      ev.preventDefault();
      V2.state._wsShowShots = !V2.state._wsShowShots;
      V2.state._wsInlineReviewOpen = true;
      bump(); schedulePaint();
      return;
    }
    const art = ev.target.closest("[data-ws-artifact]");
    if (art) {
      ev.preventDefault();
      V2.state._wsArtifact = { href: art.dataset.wsArtifact, title: art.dataset.title || "Artifact" };
      bump(); schedulePaint();
      return;
    }
    if (ev.target.closest("[data-ws-artifact-close]") || ev.target.closest("[data-ws-artifact-backdrop]") === ev.target) {
      ev.preventDefault();
      V2.state._wsArtifact = null;
      bump(); schedulePaint();
      return;
    }
    const restart = ev.target.closest("[data-ws-server-restart]");
    if (restart) {
      ev.preventDefault();
      const mid = restart.dataset.wsServerRestart;
      toast("Restarting local server…");
      post("/api/v2/missions/local-server", { mission_id: mid, action: "stop" })
        .then(() => post("/api/v2/missions/local-server", { mission_id: mid, action: "start" }))
        .then(() => {
          toast("Local server restarted.");
          V2.state.workspaceShell = null;
          V2.fetchWorkspaceShell(mid);
        })
        .catch((e) => toast(String(e.message || e), "err"));
      return;
    }
    const cmdBtn = ev.target.closest("[data-ws-cmd]");
    if (cmdBtn) {
      ev.preventDefault();
      const command = cmdBtn.dataset.wsCmd;
      const slot = Number(cmdBtn.dataset.slot);
      if (!command || !slot) return;
      const input = { slot };
      if (command === "promotion.open_pr") {
        input.title = `Vacilando · slot ${slot}`;
      }
      toast(`Running ${command}…`);
      fetch("/api/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, input, confirm: true, actor: "operator" }),
      })
        .then(async (r) => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || j.detail || `http_${r.status}`);
          toast(`${command} ok`);
          if (command === "promotion.open_pr") {
            const wt = cmdBtn.dataset.worktree;
            const br = cmdBtn.dataset.branch;
            if (wt) {
              const pr = await fetch(`/api/pr?worktree=${encodeURIComponent(wt)}&branch=${encodeURIComponent(br || "")}`).then((x) => x.json());
              V2.state._wsPr = pr;
              if (pr?.pr?.url) window.open(pr.pr.url, "_blank", "noopener");
            }
          }
          if (onMissionConversation()) {
            const mid = V2.state.workspaceId || V2.state.selectedMissionId;
            if (mid) await refreshMissionConversation(mid);
          }
          bump(); schedulePaint();
        })
        .catch((e) => toast(String(e.message || e), "err"));
      return;
    }
    const wsEarlier = ev.target.closest("[data-ws-earlier]");
    if (wsEarlier) {
      ev.preventDefault();
      const before = wsEarlier.dataset.before;
      if (!before) return;
      const thread = document.getElementById("ws-thread");
      if (thread) V2.state._wsScrollHeight = thread.scrollHeight;
      V2.fetchWorkspaceMessages(wsEarlier.dataset.wsEarlier || "ws_identity", {
        beforeEventId: before,
        prepend: true,
      });
      return;
    }
    const wsSend = ev.target.closest("[data-ws-send]");
    if (wsSend) {
      ev.preventDefault();
      ev.stopPropagation();
      if (V2.state._wsSending) return;
      const workspaceId = wsSend.dataset.wsSend || V2.state.workspaceId || "ws_identity";
      const ta = document.getElementById("ws-composer");
      const text = (ta?.value || V2.state._wsComposer || "").trim();
      if (!text) {
        toast("Type a message first.", "err");
        return;
      }
      V2.state._wsSending = true;
      bump(); schedulePaint();
      try {
        const out = await post("/api/v2/workspace/reply", {
          workspace_id: workspaceId,
          text,
          actor: "operator",
        });
        V2.state._wsComposer = "";
        V2.state._wsStickBottom = true;
        V2.state._wsShellSeq = (V2.state._wsShellSeq || 0) + 1;
        V2.state._wsMsgSeq = (V2.state._wsMsgSeq || 0) + 1;
        if (out.runtime) {
          V2.state.workspaceShell = {
            kind: "workspace_shell",
            workspace: out.runtime.workspace,
            missionId: out.runtime.missionId,
            currentState: out.runtime.currentState,
            context: out.runtime.context,
            sinceLastVisit: out.runtime.sinceLastVisit,
            composer: out.runtime.composer,
            messagesStatus: "ready",
            lastSeen: out.runtime.lastSeen,
          };
          V2.state.workspaceMessages = out.runtime.messages || [];
          V2.state.workspacePage = out.runtime.page || null;
          V2.state.workspaceMessagesStatus = "ready";
          V2.state.workspaceRuntime = out.runtime;
          V2.state.workspaceId = out.runtime.workspace?.workspaceId || workspaceId;
          markFetched(`workspace-shell:${V2.state.workspaceId}`);
          markFetched(`workspace-messages:${V2.state.workspaceId}`);
        } else {
          V2.state.workspaceShell = null;
          await V2.fetchWorkspaceShell(workspaceId);
        }
        toast("Sent.");
      } catch (e) {
        toast(String(e.message || e), "err");
      } finally {
        V2.state._wsSending = false;
        bump(); schedulePaint();
      }
      return;
    }
    if (ev.target.closest("[data-notify-enable]")) {
      if (typeof Notification === "undefined") {
        toast("Notifications are unavailable in this environment.", "err");
        return;
      }
      Notification.requestPermission().then((p) => {
        toast(p === "granted" ? "Notifications enabled." : p === "denied" ? "Notifications blocked — enable in System Settings → Notifications." : "Permission not granted.");
        bump(); schedulePaint();
      }).catch(() => toast("Could not request notification permission.", "err"));
      return;
    }
    const drevApprove = ev.target.closest("[data-drev-approve]");
    if (drevApprove) {
      ev.preventDefault();
      ev.stopPropagation();
      if (drevApprove.disabled || V2.state.kickoffBusy) return;
      openCertifyDialog({
        missionId: drevApprove.dataset.mission,
        reviewId: drevApprove.dataset.drevApprove,
        waveLabel: drevApprove.textContent?.replace(/^Certify\s+/i, "").trim() || "",
      });
      return;
    }
    const drevRecheck = ev.target.closest("[data-drev-recheck]");
    if (drevRecheck) {
      ev.preventDefault();
      ev.stopPropagation();
      if (drevRecheck.disabled || V2.state.kickoffBusy) return;
      recheckDeliverable(drevRecheck.dataset.mission, drevRecheck.dataset.drevRecheck);
      return;
    }
    const drevChanges = ev.target.closest("[data-drev-changes]");
    if (drevChanges) {
      const missionId = drevChanges.dataset.mission;
      const reviewId = drevChanges.dataset.drevChanges;
      openDirectorTextDialog({
        title: "Request changes",
        lead: "Director will reopen this assignment with your direction. Prior evidence and review history stay recorded.",
        confirmLabel: "Send to Director",
        onSubmit: async (direction) => {
          await post("/api/v2/deliverable-reviews/request-changes", {
            mission_id: missionId,
            review_id: reviewId,
            direction,
          });
          V2.state.overview = null;
          await refreshNeedsBadge();
          toast("Changes requested — Director will relaunch.");
          if (onMissionConversation()) {
            await refreshMissionConversation(missionId);
          } else {
            await V2.fetchDashboard(missionId);
            V2.state.showOutcome = true;
            bump(); schedulePaint();
            scrollToOutcomeThread();
          }
        },
      });
      return;
    }
    const drevContext = ev.target.closest("[data-drev-context],[data-drev-ask]");
    if (drevContext) {
      const missionId = drevContext.dataset.mission;
      const reviewId = drevContext.dataset.drevContext || drevContext.dataset.drevAsk;
      openDirectorTextDialog({
        title: "Share context with Director",
        lead: "Leave alignment notes Director should keep — product judgment, residual risk you accept, preference for the next wave, or a question. Review context is attached automatically.",
        confirmLabel: "Share with Director",
        placeholder: "Share context or ask Director…",
        onSubmit: async (message) => {
          await post("/api/v2/deliverable-reviews/share-context", {
            mission_id: missionId,
            review_id: reviewId,
            message,
          });
          toast("Context shared with Director.");
          V2.state.showOutcome = true;
          await V2.fetchDashboard(missionId);
          bump(); schedulePaint();
          scrollToOutcomeThread();
        },
      });
      return;
    }
    const filterBtn = ev.target.closest("[data-missions-filter],[data-imp-status],[data-imp-scope]");
    if (filterBtn) {
      if (filterBtn.dataset.missionsFilter) {
        V2.state.missionsHome = null;
        V2.fetchMissions(filterBtn.dataset.missionsFilter);
        return;
      }
      if (filterBtn.dataset.impStatus || filterBtn.dataset.impScope) {
        V2.state.improvementsHome = null;
        V2.fetchImprovements({
          status: filterBtn.dataset.impStatus || V2.state.improvementsStatus || "All",
          missionScope: filterBtn.dataset.impScope || V2.state.improvementsMissionScope || "active",
        });
        return;
      }
    }

    const t = ev.target.closest("[data-mc-answer],[data-mc-ask],[data-mc-reject],[data-mc-certify],[data-mc-reject-completion],[data-mc-reopen-work],[data-mc-park-outcome],[data-mc-advance],[data-mc-review-outcome],[data-mc-dispatch],[data-mc-resume-stalled],[data-mc-server-start],[data-mc-server-stop],[data-mc-day-start],[data-mc-day-stop],[data-mc-kickoff-paste],[data-mc-kickoff-md],[data-mc-kickoff-ingest],[data-mc-kickoff-start],[data-mc-kickoff-reset],[data-legacy-nav],[data-mc-retry],[data-mc-review-findings],[data-mc-provide-feedback],[data-mc-feedback-dismiss],[data-mc-feedback-save],[data-mc-collab-save],[data-mc-collab-status]");
    if (!t) return;

    if (t.hasAttribute("data-mc-review-findings")) {
      const el = document.getElementById("mc-exec-summary");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("mc-findings-focus");
        setTimeout(() => el.classList.remove("mc-findings-focus"), 1600);
      } else if (t.getAttribute("data-mc-review-findings")) {
        V2.nav(`evidence/${t.getAttribute("data-mc-review-findings")}`);
      }
      return;
    }
    if (t.hasAttribute("data-mc-provide-feedback")) {
      const missionId = t.getAttribute("data-mc-provide-feedback");
      if (onMissionConversation() || !document.getElementById("mc-feedback-panel")) {
        openDirectorTextDialog({
          title: "Give Feedback",
          lead: "Guidance stays on this mission timeline — no other screen required.",
          confirmLabel: "Save Feedback",
          placeholder: "What should Director know or change?",
          onSubmit: async (body) => {
            await post("/api/v2/missions/collaboration", {
              mission_id: missionId,
              type: "feedback",
              body,
              actor: "director",
            });
            toast("Feedback saved to the mission.");
            if (onMissionConversation()) await refreshMissionConversation(missionId);
            else {
              V2.state.overview = null;
              await V2.fetchDashboard(missionId);
              bump(); schedulePaint();
            }
          },
        });
        return;
      }
      const panel = document.getElementById("mc-feedback-panel");
      if (panel) {
        panel.hidden = false;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        const ta = document.getElementById("mc-feedback-text");
        if (ta) ta.focus();
      } else {
        const compose = document.querySelector(".mc-collab-compose");
        if (compose) {
          compose.open = true;
          compose.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      return;
    }
    if (t.hasAttribute("data-mc-feedback-dismiss")) {
      const panel = document.getElementById("mc-feedback-panel");
      if (panel) panel.hidden = true;
      return;
    }
    async function saveCollaboration(missionId, type, body) {
      const text = String(body || "").trim();
      if (!text) {
        toast("Add guidance text before saving.", "warn");
        return false;
      }
      await post("/api/v2/missions/collaboration", {
        mission_id: missionId,
        type: type || "feedback",
        body: text,
        actor: "director",
      });
      toast("Saved to Director Collaboration.");
      V2.state.overview = null;
      await V2.fetchDashboard(missionId);
      bump(); schedulePaint();
      requestAnimationFrame(() => {
        document.getElementById("mc-collaboration")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return true;
    }
    if (t.hasAttribute("data-mc-feedback-save")) {
      const missionId = t.getAttribute("data-mc-feedback-save");
      const type = document.getElementById("mc-feedback-type")?.value || "feedback";
      const body = document.getElementById("mc-feedback-text")?.value || "";
      await saveCollaboration(missionId, type, body);
      const panel = document.getElementById("mc-feedback-panel");
      if (panel) panel.hidden = true;
      return;
    }
    if (t.hasAttribute("data-mc-collab-save")) {
      const missionId = t.getAttribute("data-mc-collab-save");
      const type = document.getElementById("mc-collab-type")?.value || "feedback";
      const body = document.getElementById("mc-collab-text")?.value || "";
      await saveCollaboration(missionId, type, body);
      return;
    }
    if (t.hasAttribute("data-mc-collab-status")) {
      const entryId = t.getAttribute("data-mc-collab-status");
      const status = t.getAttribute("data-status");
      const missionId = t.getAttribute("data-mission");
      await post("/api/v2/missions/collaboration/status", {
        mission_id: missionId,
        entry_id: entryId,
        status,
        actor: "director",
      });
      toast(`Marked ${status}.`);
      V2.state.overview = null;
      await V2.fetchDashboard(missionId);
      bump(); schedulePaint();
      return;
    }

    if (t.dataset.mcCertify) {
      const ok = window.confirm(
        "Close Without Continuing?\n\nThis abandons further work on this mission — no implementation or follow-on here.\n\nPrefer Begin Implementation if you want the work to continue on this same mission."
      );
      if (!ok) return;
      certifyCompletion(t.dataset.mcCertify);
      return;
    }
    if (t.dataset.mcRejectCompletion) {
      rejectCompletion(t.dataset.mcRejectCompletion);
      return;
    }
    if (t.dataset.mcReopenWork) {
      reopenWork(t.dataset.mcReopenWork);
      return;
    }
    if (t.dataset.mcParkOutcome) {
      parkOutcome(t.dataset.mcParkOutcome);
      return;
    }
    if (t.dataset.mcAdvance) {
      advanceImplementation(t.dataset.mcAdvance);
      return;
    }
    if (t.dataset.mcReviewOutcome) {
      const mid = t.dataset.mcReviewOutcome;
      if (onMissionConversation()) {
        V2.state._wsInlineReviewOpen = true;
        bump(); schedulePaint();
        requestAnimationFrame(() => {
          document.getElementById("ws-inline-review")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }
      V2.state.showOutcome = true;
      if (!location.hash.includes(mid)) {
        location.hash = "#/missions/" + encodeURIComponent(mid);
      }
      bump(); schedulePaint();
      requestAnimationFrame(() => {
        const el = document.getElementById("mc-outcome");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else toast("Scroll to Outcome on this dashboard.", "ok");
      });
      return;
    }
    if (t.dataset.mcDispatch) {
      dispatchReady(t.dataset.mcDispatch);
      return;
    }
    if (t.dataset.mcResumeStalled) {
      resumeStalled(t.dataset.mcResumeStalled);
      return;
    }
    if (t.dataset.mcServerStart) {
      const ok = window.confirm(
        "Start the local Alloy app for this mission?\n\nThis is for your QA click-through only. Claude/Cursor do not need it to code.\nPrefer one running Alloy app at a time."
      );
      if (!ok) return;
      missionServerCommand("start", t.dataset.mcServerStart);
      return;
    }
    if (t.dataset.mcServerStop) {
      missionServerCommand("stop", t.dataset.mcServerStop);
      return;
    }
    if (t.hasAttribute("data-mc-day-start")) {
      const ok = window.confirm(
        "Start of day — resume all paused workers?\n\nRuns: alloy-worker-resume --all"
      );
      if (!ok) return;
      runDayOps("start");
      return;
    }
    if (t.hasAttribute("data-mc-day-stop")) {
      const ok = window.confirm(
        "Stop of day — pause all registered workers for the night?\n\nRuns: alloy-worker-pause --all\nWorktrees and changes are preserved."
      );
      if (!ok) return;
      runDayOps("stop");
      return;
    }

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
      const d = V2.state.decisionDetail?.decision;
      const msg = prompt("What should Director clarify?");
      if (!msg || !d) return;
      sendDirectorMessage("ask", d.decisionId, d.missionId, msg);
      return;
    }
    if (t.dataset.mcReject) {
      const d = V2.state.decisionDetail?.decision;
      const msg = prompt("Provide direction for Director:");
      if (!msg || !d) return;
      sendDirectorMessage("reject_direction", d.decisionId, d.missionId, msg);
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
      let title = (lines.find((l) => l.startsWith("# ")) || "").replace(/^#\s+/, "").trim();
      const bodyLines = lines.filter((l) => l && !l.startsWith("#"));
      const objective = bodyLines.join(" ").trim();
      if (!title || /^untitled(\s+mission)?$/i.test(title)) {
        const fromObj = (objective.split(/[.!\n]/)[0] || "").trim();
        title = fromObj.length >= 8 ? (fromObj.length > 72 ? fromObj.slice(0, 69) + "…" : fromObj) : "";
      }
      const phaseLines = [];
      let inPhases = false;
      for (const line of lines) {
        if (/^##\s+phases?/i.test(line)) { inPhases = true; continue; }
        if (inPhases && /^##\s+/.test(line)) break;
        if (inPhases && /^\s*[-*]\s+/.test(line)) phaseLines.push(line.replace(/^\s*[-*]\s+/, "").trim());
      }
      if (!title && phaseLines[0]) title = phaseLines[0];
      const plan = (phaseLines.length ? phaseLines : (title ? [title] : [])).map((t, i) => ({
        phaseId: `p${i + 1}`,
        order: i + 1,
        title: t,
        objective: t,
        requiredOutputs: [],
        acceptanceCriteriaIds: [`AC${i + 1}`],
        dependencies: i ? [`p${i}`] : [],
      }));
      const j = {
        title: title || "",
        objective: objective || title || "",
        plan,
        acceptanceCriteria: plan.map((p, i) => ({ id: `AC${i + 1}`, statement: `${p.title} is complete with evidence` })),
        constraints: [{ id: "C1", text: "Do not push, merge, or promote without approval" }],
        sourceMaterials: [],
      };
      const needsTitle = !j.title;
      V2.state.kickoffDraft = {
        mode: "review",
        title: j.title,
        objective: j.objective,
        expectedOutcomes: j.acceptanceCriteria.map((c) => c.statement),
        deliverables: plan.map((p) => ({ title: p.title, objective: p.objective, outputs: [] })),
        recommendedWorkerDisciplines: /access|identity|role/i.test(`${j.title} ${j.objective}`)
          ? ["Platform / Access", "Runtime / Workflow"]
          : ["General engineering"],
        directorAssessment: needsTitle ? "Needs clarification" : "Ready",
        phases: plan.map((p) => ({ id: p.phaseId, title: p.title, objective: p.objective, outputs: [] })),
        acceptanceCriteria: j.acceptanceCriteria,
        constraints: j.constraints.map((c) => c.text),
        sources: [],
        raw: j,
        canStart: !needsTitle && plan.length > 0,
        findings: needsTitle
          ? [{ severity: "blocking", message: "Please confirm a mission title — Director could not infer one from the brief" }]
          : [],
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
          const interp = res.interpretation || {};
          V2.state.kickoffBusy = null;
          V2.state.kickoffDraft = {
            ...draft,
            ...interp,
            missionId: mid,
            title: interp.title || res.brief?.title || draft.title,
            mode: "approval",
            findings: (res.readiness?.findings || interp.findings || []).map((f) => ({
              severity: f.blocking ? "blocking" : "info",
              message: f.message || f.code || "Finding",
            })),
            directorAssessment: res.readiness?.directorAssessment || interp.directorAssessment
              || (res.readiness?.ready === false ? "Needs clarification" : "Ready"),
            canStart: res.readiness?.ready !== false,
            assignmentCount: (draft.phases || []).length,
            primaryAction: { label: "Start mission" },
            version: res.brief?.version,
            raw: res.brief || draft.raw,
            rawBrief: res.brief || draft.raw,
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

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t && t.id === "ws-composer") {
      V2.state._wsComposer = t.value;
      V2.state._wsStickBottom = false;
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" || ev.shiftKey) return;
    const t = ev.target;
    if (!t || t.id !== "ws-composer") return;
    ev.preventDefault();
    document.querySelector("[data-ws-send]")?.click();
  });

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => {
      try {
        const raw = location.hash.replace(/^#\/?/, "");
        const name = (raw.split("?")[0] || "").split("/").filter(Boolean)[0] || "missions";
        if (name !== "workspaces" && name !== "workspace") {
          if (!V2.state.missionsHome) V2.fetchMissions();
          V2.fetchNeedsYou();
        } else {
          setTimeout(() => V2.fetchNeedsYou(), 4000);
        }
      } catch {
        if (!V2.state.missionsHome) V2.fetchMissions();
        V2.fetchNeedsYou();
      }
      V2.startFreshnessLoop();
    }, { timeout: 2000 });
  } else {
    setTimeout(() => {
      try {
        const raw = location.hash.replace(/^#\/?/, "");
        const name = (raw.split("?")[0] || "").split("/").filter(Boolean)[0] || "missions";
        if (name !== "workspaces" && name !== "workspace") {
          if (!V2.state.missionsHome) V2.fetchMissions();
          V2.fetchNeedsYou();
        } else {
          // Defer Needs You until after Identity shell/messages settle.
          setTimeout(() => V2.fetchNeedsYou(), 4000);
        }
      } catch {
        if (!V2.state.missionsHome) V2.fetchMissions();
        V2.fetchNeedsYou();
      }
      V2.startFreshnessLoop();
    }, 50);
  }
})();
