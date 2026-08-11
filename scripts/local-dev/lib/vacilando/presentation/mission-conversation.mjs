/**
 * Vacilando V3-3 — Mission Conversation Runtime (presentation composition).
 *
 * Conversation is the application. Portfolio / Command Center untouched.
 * Projects existing engines into: mission list, compressed state, operational
 * rail, inline review card, message artifacts — no second persistence layer.
 */
import { getMission, readMissions } from "../commands/missions.mjs";
import { getBrief } from "../mission-brief.mjs";
import { deriveMissionPosture } from "../mission-posture.mjs";
import { listAssignments } from "../worker-assignment.mjs";
import { listEvidence } from "../evidence.mjs";
import { resolveSlotIdentity } from "../identity.mjs";
import { missionLocalServerVm } from "../mission-local-server.mjs";
import { listDecisions } from "../decisions.mjs";
import {
  getOpenDeliverableReview,
  deliverableReviewVm,
} from "../deliverable-review.mjs";
import {
  listExecutionSessions,
  getActiveSessionForAssignment,
  sessionLiveVm,
  isSessionActuallyLive,
} from "../execution-session.mjs";
import { silentRecoveryState } from "../silent-worker-recover.mjs";
import { readTimeline } from "../timeline.mjs";
import { missionContinuationVm } from "./mission-continuation.mjs";
import { canAdvanceToImplementation, peekNextImplementationPhase, shouldAutoContinueImplementation, scheduleImplementationChainContinue } from "../mission-advance.mjs";
import { isFixtureMission } from "./mission-filters.mjs";
import { progressBoardVm } from "../progress-board.mjs";
import { missionHealthVm } from "./mission-health.mjs";

const _autoChainOnce = new Set();
function scheduleChainOnce(missionId, fromAssignmentId) {
  const key = `${missionId}:${fromAssignmentId || ""}`;
  if (_autoChainOnce.has(key)) return false;
  _autoChainOnce.add(key);
  scheduleImplementationChainContinue(missionId, {
    fromAssignmentId: fromAssignmentId || null,
    actor: "director",
  });
  return true;
}

function clipOperatorText(value, max = 420) {
  const t = String(value || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const breakAt = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "));
  return `${(breakAt > 140 ? cut.slice(0, breakAt + 1) : cut).trim()}…`;
}

function basenamePath(p) {
  const s = String(p || "").replace(/\\/g, "/");
  const parts = s.split("/");
  return parts[parts.length - 1] || s;
}

function isScreenshotEvidence(e) {
  const type = String(e?.type || "").toLowerCase();
  const path = String(e?.fileUri || e?.externalUri || e?.title || "");
  if (type === "screenshot" || type === "video" || type === "image") return true;
  return /\.(png|jpe?g|gif|webp|webm|mp4)(\?|$)/i.test(path);
}

function evidencePresentation(e) {
  if (isScreenshotEvidence(e)) return "media";
  const type = String(e?.type || "").toLowerCase();
  if (type === "test" || type === "browser") return "result";
  return "document";
}

function evidenceItemsFor(missionId, { assignmentId = null, limit = 8 } = {}) {
  let rows = listEvidence(missionId) || [];
  if (assignmentId) {
    const scoped = rows.filter((e) =>
      (e.assignmentId || e.assignment_id) === assignmentId
      || String(e.title || "").includes(String(assignmentId)));
    if (scoped.length) rows = scoped;
  }
  return rows.slice(-limit).reverse().map((e) => {
    const id = e.evidence_id || e.evidenceId || e.id;
    let title = e.title || e.label || e.type || "Evidence";
    title = String(title)
      .replace(/^Present\s+/i, "")
      .replace(/^Modified\s+/i, "")
      .replace(/^(document|notes|log|diff|test)\s+[—\-]\s+/i, "")
      .trim();
    const presentation = evidencePresentation(e);
    return {
      evidenceId: id,
      title: title.slice(0, 120),
      type: e.type || e.kind || "artifact",
      typeLabel: String(e.type || "file").replace(/_/g, " "),
      presentation,
      previewHref: id
        ? `/api/v2/evidence/file?missionId=${encodeURIComponent(missionId)}&evidenceId=${encodeURIComponent(id)}`
        : null,
    };
  });
}

/** Structure a completion report into a Claude/Cursor-style operator brief. */
function directorBriefFromCompletion(report, lastDone, { readyNext = null, posture = null } = {}) {
  const workerRec = String(report?.recommendation || "").trim();
  const accepts = /\baccept\b/i.test(workerRec);
  const needsWork = /\b(rework|reject|more discovery|incomplete)\b/i.test(workerRec);
  const summary = String(report?.summary || "").replace(/\s+/g, " ").trim();
  const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean);

  let problem = null;
  let fix = null;
  for (const s of sentences) {
    if (!problem && /\b(red|fail|breach|broken|wrong|gap|latent|capped|missing)\b/i.test(s)) {
      problem = clipOperatorText(s, 220);
    } else if (!fix && /\b(fix|fixed|moved|enforced|resolved|green|passed)\b/i.test(s)) {
      fix = clipOperatorText(s, 220);
    }
  }
  if (!problem && sentences[0]) problem = clipOperatorText(sentences[0], 220);
  if (!fix && sentences[1]) fix = clipOperatorText(sentences[1], 220);

  const changes = (report?.changesMade || []).map((c) => basenamePath(c)).filter(Boolean);
  const testsLine = (report?.tests || [])
    .map((t) => t.results || t.summary || t.command)
    .filter(Boolean)[0] || null;
  const commitMatch = String(testsLine || summary).match(/\b([0-9a-f]{7,40})\b/i);
  const commit = commitMatch ? commitMatch[1].slice(0, 8) : null;

  const ac = Array.isArray(report?.acceptanceCriteriaResults) ? report.acceptanceCriteriaResults : [];
  const acMet = ac.filter((r) => /met|pass|ok|done/i.test(String(r.status || ""))).length;

  let verdictId = "decision_needed";
  let verdictLabel = "Waiting on your decision";
  if (accepts && !needsWork) {
    verdictId = "accept_recommended";
    verdictLabel = "Complete — worker recommends Accept";
  } else if (needsWork) {
    verdictId = "needs_work";
    verdictLabel = "Worker asks for more work";
  } else if (ac.length && acMet === ac.length) {
    verdictId = "complete_pending_you";
    verdictLabel = "Criteria met — choose next step";
  }

  const proofLines = [];
  if (ac.length) proofLines.push(`Acceptance: ${acMet}/${ac.length} criteria met`);
  if (testsLine) proofLines.push(clipOperatorText(testsLine, 200));
  if (commit) proofLines.push(`Commit ${commit} (local; not pushed)`);
  if (report?.confidence) proofLines.push(`Worker confidence: ${report.confidence}`);

  return {
    verdictId,
    verdictLabel,
    problem,
    fix,
    doneBullets: changes.slice(0, 6),
    proofLines,
    workerRecommendation: workerRec || null,
    accepts,
    needsWork,
    summary: clipOperatorText(summary || lastDone?.objective || "", 360),
    postureLabel: posture?.label || "Waiting on you",
    readyNextTitle: readyNext?.title || null,
  };
}

/** Friendly titles for known long-lived missions (display only). */
const MISSION_DISPLAY_TITLES = Object.freeze({
  msn_f74ed02c126c88d7ff: "Identity Platform",
});

let _listCache = { at: 0, filter: null, payload: null };
const LIST_CACHE_MS = 8000;

/** Re-export for callers that imported from this module. */
export { isFixtureMission };

export function displayMissionTitle(missionId, fallback = null) {
  if (MISSION_DISPLAY_TITLES[missionId]) return MISSION_DISPLAY_TITLES[missionId];
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  const raw = fallback || brief?.title || mission?.title || missionId;
  if (/^Mission\s+\d+/i.test(String(raw)) && /Identity/i.test(String(raw))) {
    return "Identity Platform";
  }
  return String(raw).slice(0, 80);
}

/**
 * Left-rail mission list — thin, cheap projection (no Portfolio / Needs You scan).
 * Opening a row opens its conversation immediately.
 */
export function missionConversationListVm({ filter = "active", limit = 24 } = {}) {
  if (
    _listCache.payload
    && _listCache.filter === filter
    && Date.now() - _listCache.at < LIST_CACHE_MS
  ) {
    return _listCache.payload;
  }

  const identityId = "msn_f74ed02c126c88d7ff";
  const includeArchived = filter === "archived";
  const rows = readMissions(null, 80) || [];
  const seen = new Set();
  const missions = [];

  function pushItem(missionId, fallbackTitle = null) {
    if (!missionId || seen.has(missionId)) return;
    seen.add(missionId);
    const mission = getMission(missionId);
    if (!includeArchived && mission?.archived) return;
    if (includeArchived && !mission?.archived && missionId !== identityId) return;
    const title = displayMissionTitle(missionId, fallbackTitle || mission?.title);
    if (isFixtureMission(title, missionId) || isFixtureMission(mission?.title, missionId)) return;
    const slot = Number(mission?.worker_slot ?? mission?.slot) || null;
    const identity = slot ? resolveSlotIdentity(slot) : null;
    let needsCount = 0;
    try {
      needsCount = listDecisions(missionId, { status: "open" }).length;
      if (getOpenDeliverableReview(missionId)) needsCount += 1;
    } catch { needsCount = 0; }
    missions.push({
      kind: "mission_nav_item",
      missionId,
      workspaceId: missionId,
      title,
      needsYou: needsCount > 0,
      needsCount,
      phase: null,
      provider: identity?.provider || mission?.provider || null,
      slot,
      workerHealth: identity?.ok === false ? "conflict" : "ok",
    });
  }

  pushItem(identityId, "Identity Platform");
  for (const m of rows) {
    if (missions.length >= limit) break;
    const id = m.mission_id || m.missionId;
    if (!id || id === identityId) continue;
    if (!includeArchived && m.archived) continue;
    // Prefer missions with briefs (same bar as Mission Control active list)
    if (!includeArchived && !getBrief(id) && !m.title) continue;
    pushItem(id, m.title);
  }

  // Enrich Identity phase cheaply once (single posture call)
  const identityRow = missions.find((x) => x.missionId === identityId);
  if (identityRow && getMission(identityId)) {
    try {
      identityRow.phase = deriveMissionPosture(identityId)?.label || null;
    } catch { /* leave null */ }
  }

  const payload = {
    kind: "mission_conversation_list",
    label: "Missions",
    missions: missions.slice(0, limit),
  };
  _listCache = { at: Date.now(), filter, payload };
  return payload;
}

/**
 * Aggressively compressed Current State for the right rail.
 */
export function compressCurrentState(cs, {
  provider = null,
  slot = null,
  serverStatus = null,
  liveProgress = null,
  completionBrief = null,
  progressBoard = null,
  missionHealth = null,
} = {}) {
  if (!cs) return null;
  const lines = [];
  if (missionHealth?.missionProgressLabel) {
    lines.push(`Mission ${missionHealth.missionProgressLabel}`);
  }
  if (missionHealth?.lifecycleLabel) {
    lines.push(missionHealth.lifecycleLabel);
  } else if (cs.currentPhase) {
    lines.push(String(cs.currentPhase).slice(0, 40));
  }

  // Waiting on you ONLY for real operator decisions (or kickoff) — never register empty.
  const waiting =
    missionHealth?.waitingOnYou
    || cs.postureId === "decision_required"
    || cs.postureId === "awaiting_kickoff"
    || (/waiting on you/i.test(String(cs.recommendation || "")) && missionHealth?.waitingOnYou);
  if (waiting && !lines.some((l) => /waiting on you|needs decision/i.test(l))) {
    lines.push(missionHealth?.decision?.title ? "Needs decision" : "Waiting on You");
  }
  if (completionBrief?.verdictLabel && !/waiting on your decision/i.test(completionBrief.verdictLabel)) {
    lines.push(String(completionBrief.verdictLabel).slice(0, 48));
  }
  if (missionHealth?.register?.complete) {
    lines.push(`Current work ${missionHealth.register.done}/${missionHealth.register.total} complete`);
  } else if (missionHealth?.register?.total) {
    lines.push(`Current work ${missionHealth.register.done}/${missionHealth.register.total}`);
  }
  if (liveProgress?.active) {
    const pct = liveProgress.percent != null ? `${liveProgress.percent}%` : null;
    const fresh = liveProgress.freshnessLabel || null;
    lines.push([pct, fresh].filter(Boolean).join(" · ").slice(0, 48) || "In progress");
  }
  const workerBits = [provider, slot != null ? `Slot ${slot}` : null].filter(Boolean).join(" · ");
  if (workerBits) lines.push(workerBits);
  if (serverStatus) lines.push(`Server ${serverStatus}`);

  const goal = missionHealth?.currentObjective
    || completionBrief?.problem
    || liveProgress?.workingOn
    || cs.workingOn
    || cs.currentGoal
    || "—";
  const next = missionHealth?.directorNext
    || completionBrief?.fix
    || (liveProgress?.active
      ? (liveProgress.activity || liveProgress.eta || cs.nextExpectedCheckpoint || cs.recommendation || "—")
      : (completionBrief?.workerRecommendation
        || cs.nextExpectedCheckpoint
        || cs.recommendation
        || "—"));
  const doneBits = (completionBrief?.doneBullets || []).slice(0, 4);
  const proofBits = (completionBrief?.proofLines || []).slice(0, 3);
  return {
    kind: "current_state_compact",
    derived: true,
    editable: false,
    phase: cs.currentPhase || "—",
    goal: String(goal).slice(0, 160),
    next: String(next).slice(0, 200),
    blockedBy: cs.blockedBy && cs.blockedBy !== "Nothing" ? String(cs.blockedBy).slice(0, 48) : null,
    recommendation: cs.recommendation || null,
    postureId: cs.postureId || null,
    summaryLines: lines.slice(0, 7),
    primaryAction: cs.primaryAction || null,
    secondaryAction: cs.secondaryAction || null,
    liveProgress: liveProgress?.active ? liveProgress : null,
    missionHealth: missionHealth || null,
    progressBoard: progressBoard?.hasDepth ? progressBoard : null,
    completionBrief: completionBrief
      ? {
          verdictLabel: completionBrief.verdictLabel || null,
          problem: completionBrief.problem || null,
          fix: completionBrief.fix || null,
          doneBullets: doneBits,
          proofLines: proofBits,
          summary: completionBrief.summary || null,
          workerRecommendation: completionBrief.workerRecommendation || null,
        }
      : null,
  };
}

/**
 * One operator-facing progress card — replaces a flood of "Claude is …" heartbeats.
 * Uses execution-session percent + assignment completion; never invents certainty.
 */
export function liveWorkProgressVm(missionId) {
  if (!missionId) return null;
  const assignments = listAssignments(missionId) || [];
  const terminal = new Set(["complete", "accepted", "cancelled"]);
  const activeStatuses = new Set(["active", "running", "in_progress", "dispatched", "acked"]);
  const done = assignments.filter((a) => terminal.has(String(a.status || "").toLowerCase()));
  const runningClaim = assignments.find((a) => activeStatuses.has(String(a.status || "").toLowerCase())) || null;
  // Ready/waiting/verification are not live work — do not keep a stale "Executing" card up.
  const active = runningClaim;

  let session = null;
  try {
    if (active) {
      session = getActiveSessionForAssignment(missionId, active.assignmentId || active.id);
    }
    if (!session) {
      const sessions = listExecutionSessions({ missionId, limit: 40 }) || [];
      session = sessions.find((s) => isSessionActuallyLive(s)) || null;
    }
  } catch { session = null; }

  const live = sessionLiveVm(session);
  const awaitingYou = Boolean(session && ["awaiting_decision", "awaiting_operator"].includes(session.status));
  const liveRunning = Boolean(live && ["starting", "running", "recovering", "retrying", "producing_evidence", "queued"].includes(live.status));
  if (!liveRunning && !awaitingYou && !active) return null;

  const openDecisions = (() => {
    try { return listDecisions(missionId, { status: "open" }) || []; } catch { return []; }
  })();
  const openReview = (() => {
    try { return getOpenDeliverableReview(missionId); } catch { return null; }
  })();
  const needsYourApproval = awaitingYou || openDecisions.length > 0 || Boolean(openReview);

  const total = assignments.length;
  const assignmentPct = total > 0 ? Math.round((done.length / total) * 100) : null;
  const sessionPct = live?.percent != null ? Number(live.percent) : null;
  let percent = (liveRunning || awaitingYou) && sessionPct != null
    ? sessionPct
    : (assignmentPct != null ? assignmentPct : (sessionPct ?? null));
  if (percent != null) percent = Math.max(0, Math.min(99, Math.round(percent)));

  const hb = live?.heartbeatSecondsAgo;
  let freshness = "idle";
  if (needsYourApproval) {
    freshness = "needs_you";
  } else if (liveRunning) {
    if (hb == null) freshness = "starting";
    else if (hb <= 60) freshness = "live";
    else if (hb <= 180) freshness = "quiet";
    else freshness = "stale";
  } else if (active) {
    freshness = "claimed";
  }

  const doneSummary = done
    .slice(-4)
    .map((a) => String(a.title || a.deliverable || a.assignmentId || "").slice(0, 80))
    .filter(Boolean);

  // Distinct recent activities from timeline (audit), not each as a chat bubble
  let recentActivities = [];
  try {
    const events = readTimeline(missionId, { limit: 80 }) || [];
    const seen = new Set();
    for (let i = events.length - 1; i >= 0 && recentActivities.length < 4; i--) {
      const e = events[i];
      if (e.type !== "progress") continue;
      const label = String(e.summary || e.headline || "")
        .replace(/^Claude is\s+/i, "")
        .replace(/\.$/, "")
        .trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recentActivities.push(label);
    }
    recentActivities.reverse();
  } catch { recentActivities = []; }

  const workingOn = String(
    active?.title || active?.objective || live?.activity || "Ongoing work",
  ).slice(0, 120);

  // "Waiting for approval" is only honest when a real gate exists.
  // Classifier heartbeats often fire that label from tool chatter — don't show it alone.
  let activity = live?.activity && live.activity !== "—" ? live.activity : null;
  if (/waiting for approval/i.test(String(activity || "")) && !needsYourApproval) {
    activity = recentActivities.filter((a) => !/waiting for approval/i.test(a)).slice(-1)[0]
      || "Working";
  }
  if (needsYourApproval) {
    activity = openReview
      ? "Deliverable ready for your review"
      : (openDecisions[0]?.title
        ? `Decision: ${String(openDecisions[0].title).slice(0, 80)}`
        : "Waiting for your approval");
  }

  const buttons = [];
  if (openReview) {
    buttons.push({
      kind: "inline_review_expand",
      label: "Review Outcome",
      missionId,
      reviewId: openReview.review_id || openReview.reviewId || null,
    });
  }
  if (openDecisions[0]) {
    const d = openDecisions[0];
    const rec = d.recommendation || d.recommendation_id || d.options?.[0]?.optionId || d.options?.[0]?.id;
    if (rec) {
      buttons.push({
        kind: "answer_decision",
        label: "Approve recommendation",
        missionId,
        decisionId: d.decisionId || d.id,
        optionId: rec,
      });
    }
    buttons.push({
      kind: "provide_feedback",
      label: "Give Feedback",
      missionId,
    });
  } else if (awaitingYou && session?.decisionRequest) {
    const opts = session.decisionRequest.options || [];
    for (const o of opts.slice(0, 3)) {
      buttons.push({
        kind: "session_decision_option",
        label: o.label || o.optionId || "Choose",
        missionId,
        sessionId: session.sessionId,
        optionId: o.optionId || o.id,
      });
    }
  }

  // Orphaned claim / failed provider session — operator next step is relaunch, not wait.
  const latestFailed = (() => {
    try {
      return (listExecutionSessions({ missionId, limit: 8 }) || [])
        .find((s) => s.status === "failed" || s.status === "interrupted");
    } catch { return null; }
  })();
  if (!needsYourApproval && !liveRunning && (freshness === "claimed" || latestFailed)) {
    const recovering = silentRecoveryState(missionId)?.recovering;
    freshness = recovering ? "recovering" : (latestFailed ? "failed" : freshness);
    activity = recovering
      ? "Director is relaunching the silent worker"
      : (latestFailed?.recovery?.lastError
        ? `Worker failed (${latestFailed.recovery.lastError})`
        : (activity || "Worker is not live"));
    if (!buttons.some((b) => b.kind === "resume_stalled")) {
      buttons.push({
        kind: "resume_stalled",
        label: recovering ? "Director relaunching…" : "Relaunch worker",
        missionId,
        disabled: recovering,
      });
    }
  }

  return {
    kind: "live_work_progress",
    active: true,
    missionId,
    workerLabel: live?.workerLabel || "Worker",
    workingOn,
    activity,
    percent,
    percentLabel: percent != null ? `${percent}%` : "—",
    doneCount: done.length,
    totalCount: total || null,
    doneSummary,
    recentActivities,
    freshness,
    freshnessLabel: ({
      starting: "Starting…",
      live: "Actively working",
      quiet: "Still working",
      stale: "No update recently — may be stuck",
      claimed: "Claimed in progress",
      recovering: "Director relaunching",
      failed: "Worker failed — relaunch needed",
      needs_you: "Waiting on you",
      idle: "Idle",
    })[freshness] || freshness,
    heartbeatLabel: live?.heartbeatLabel || null,
    eta: live?.estimatedCheckpoint || null,
    filesInspected: live?.filesInspected ?? null,
    sessionStatus: live?.status || session?.status || null,
    needsYourApproval,
    howToApprove: needsYourApproval
      ? (buttons.length
        ? "Use the buttons on this card — you do not need to type Approve in chat."
        : "A decision is open — reply in this thread with your choice, or open Review Outcome when it appears.")
      : (buttons.some((b) => b.kind === "resume_stalled")
        ? "Claude’s session failed. Click Relaunch worker — Server Stopped is unrelated."
        : null),
    buttons,
  };
}

/**
 * Operational right rail — only valid actions.
 */
export function operationalRailVm(missionId) {
  const mission = getMission(missionId);
  const slot = Number(mission?.worker_slot ?? mission?.slot) || null;
  const identity = slot ? resolveSlotIdentity(slot) : null;
  const local = missionLocalServerVm(missionId);
  const provider = identity?.provider || mission?.provider || null;

  const serverActions = [];
  if (local?.actions?.start) {
    serverActions.push({
      kind: "server_start",
      label: "Start Server",
      missionId,
      worktree: local.actions.start.worktree || local.worktree,
    });
  }
  if (local?.actions?.open) {
    serverActions.push({
      kind: "open_url",
      label: "Open Local App",
      href: local.actions.open.href || local.url,
    });
  }
  if (local?.status === "running" && local?.actions?.stop && local?.actions?.start) {
    serverActions.push({
      kind: "server_restart",
      label: "Restart",
      missionId,
      worktree: local.worktree,
      sequence: ["stop", "start"],
    });
  }
  if (local?.actions?.stop) {
    serverActions.push({
      kind: "server_stop",
      label: "Stop",
      missionId,
      worktree: local.actions.stop.worktree || local.worktree,
    });
  }

  const workerActions = [];
  if (slot) {
    const assignments = listAssignments(missionId) || [];
    const paused = assignments.some((a) => a.status === "paused" || a.lifecycle === "paused");
    // Only offer the lifecycle action that applies — no disabled cemetery
    if (paused) {
      workerActions.push({ kind: "worker_resume", label: "Resume", slot, command: "worker.resume" });
    } else {
      workerActions.push({ kind: "worker_pause", label: "Pause", slot, command: "worker.pause" });
    }
    workerActions.push({ kind: "worker_doctor", label: "Diagnose", slot, command: "worker.doctor" });
    workerActions.push({ kind: "sprint_finish", label: "Finish Sprint", slot, command: "sprint.finish" });
    workerActions.push({
      kind: "open_pr",
      label: "Open PR",
      slot,
      command: "promotion.open_pr",
      worktree: identity?.worktree_name || local?.worktree || null,
      branch: identity?.branch || local?.branch || null,
    });
  }

  return {
    kind: "operational_rail",
    worker: {
      slot,
      provider,
      worktree: identity?.worktree_name || local?.worktree || null,
      branch: identity?.branch || local?.branch || null,
      health: identity?.ok === false ? "conflict" : "ok",
    },
    server: {
      available: Boolean(local?.available),
      port: local?.port || identity?.port || null,
      status: local?.status || "unknown",
      statusLabel: local?.statusLabel || (local?.status === "running" ? "Running" : "Stopped"),
      url: local?.url || (local?.port ? `http://127.0.0.1:${local.port}` : null),
      running: local?.status === "running",
      actions: serverActions,
    },
    pr: null, // filled by client via GET /api/pr when worktree known
    workerActions,
  };
}

/**
 * Inline Review Outcome card — expands in thread, no navigation.
 * Prefers open deliverable review; otherwise a soft card grounded in the
 * latest completion report + continuation choices (not posture boilerplate).
 */
export function inlineReviewCardVm(missionId) {
  const open = getOpenDeliverableReview(missionId);
  if (open) {
    const vm = deliverableReviewVm(missionId, open);
    if (vm) {
      const evidence = (vm.evidence || []).slice(0, 8).map((e) => {
        const id = e.evidence_id || e.evidenceId || e.id;
        const presentation = evidencePresentation(e);
        return {
          evidenceId: id,
          title: e.title || e.label || e.type || "Evidence",
          type: e.type || e.kind || "artifact",
          typeLabel: String(e.type || "file").replace(/_/g, " "),
          presentation,
          previewHref: id
            ? `/api/v2/evidence/file?missionId=${encodeURIComponent(missionId)}&evidenceId=${encodeURIComponent(id)}`
            : null,
        };
      });
      const mediaEvidence = evidence.filter((e) => e.presentation === "media" && e.previewHref);

      const buttons = [];
      if (vm.actions?.approve) {
        buttons.push({
          kind: "drev_approve",
          label: "Approve",
          missionId,
          reviewId: vm.reviewId,
        });
      }
      if (vm.actions?.requestChanges) {
        buttons.push({
          kind: "drev_changes",
          label: "Request Rework",
          missionId,
          reviewId: vm.reviewId,
        });
      }
      buttons.push({
        kind: "provide_feedback",
        label: "Give Feedback",
        missionId,
      });
      buttons.push({
        kind: "reopen_work",
        label: "Continue Discovery",
        missionId,
      });
      if (vm.actions?.recheck) {
        buttons.push({
          kind: "drev_recheck",
          label: "Recheck",
          missionId,
          reviewId: vm.reviewId,
        });
      }
      if (mediaEvidence.length) {
        buttons.push({ kind: "toggle_screenshots", label: "View Screenshots", missionId });
      }

      const statusFacts = [];
      if (vm.waveLabel) statusFacts.push(vm.waveLabel);
      if (vm.operatorMayApprove) statusFacts.push("Director verified — you may approve");
      else statusFacts.push("Director has not cleared this for approval yet");
      if (vm.confidencePct != null) statusFacts.push(`Confidence ${vm.confidencePct}%`);

      const asgId = open.assignment_id || open.assignmentId;
      const asg = asgId
        ? (listAssignments(missionId) || []).find((a) => (a.assignmentId || a.id) === asgId)
        : null;
      const brief = directorBriefFromCompletion(asg?.completionReport || null, asg, { posture: null });
      const board = progressBoardVm(missionId, { report: asg?.completionReport || null });
      const hardBrief = {
        verdictId: vm.operatorMayApprove ? "ready_to_approve" : brief.verdictId,
        verdictLabel: vm.operatorMayApprove
          ? "Ready to approve"
          : (brief.accepts
            ? "Worker recommends Accept — Director verification incomplete"
            : (vm.headline || brief.verdictLabel)),
        problem: brief.problem,
        fix: brief.fix,
        doneBullets: brief.doneBullets,
        proofLines: [
          ...brief.proofLines,
          ...statusFacts.filter((f) => !brief.proofLines.includes(f)),
        ].slice(0, 6),
        workerRecommendation: brief.workerRecommendation,
      };

      return {
        kind: "inline_review",
        reviewId: vm.reviewId,
        missionId,
        soft: false,
        headline: asg?.title || vm.headline || "Review Outcome",
        waveLabel: hardBrief.verdictLabel,
        whatFinished: asg?.title || vm.waveLabel || vm.headline || null,
        statusFacts: hardBrief.proofLines,
        brief: hardBrief,
        progressBoard: board,
        summary: brief.summary
          || vm.executiveSummary?.text
          || (vm.executiveSummary?.sentences || []).join(" ")
          || vm.directorRecommendation?.summary
          || "",
        findings: (vm.findings || vm.risks || []).slice(0, 4).map((f) =>
          typeof f === "string" ? f : (f.text || f.label || f.title)).filter(Boolean),
        recommendation: vm.operatorMayApprove
          ? (vm.directorRecommendation?.headline || "Approve this deliverable")
          : (brief.accepts
            ? "Hold or request rework — Approve is locked until Director verification clears"
            : (vm.directorRecommendation?.headline || vm.recommendation?.headline || "Director cannot certify yet")),
        recommendationDetail: vm.operatorMayApprove
          ? (vm.directorRecommendation?.summary || vm.recommendation?.summary || null)
          : (brief.accepts
            ? `Worker said: ${brief.workerRecommendation}. Director still needs evidence/verification before Approve unlocks.`
            : (vm.directorRecommendation?.summary || vm.recommendation?.summary || null)),
        nextStep: vm.operatorMayApprove
          ? "Approve to accept this deliverable, or request rework if it is wrong."
          : "Recheck after attaching evidence, Request Rework if wrong, or Continue Discovery for gaps.",
        confidencePct: vm.directorRecommendation?.confidencePct ?? vm.recommendation?.confidencePct ?? null,
        evidence,
        buttons,
        operatorMayApprove: Boolean(vm.operatorMayApprove),
      };
    }
  }

  const posture = deriveMissionPosture(missionId);
  const health = missionHealthVm(missionId, { posture });
  const softPostures = new Set([
    "operator_review",
    "deliverable_review",
    "awaiting_completion",
    "decision_required",
    "mission_idle",
    "director_reconciling",
  ]);
  if (!posture || !softPostures.has(posture.id)) {
    return null;
  }

  const assignments = listAssignments(missionId) || [];
  const completed = assignments.filter((a) =>
    ["complete", "accepted"].includes(String(a.status || "").toLowerCase()));
  const lastDone = [...completed].reverse().find((a) => a.completionReport?.summary)
    || completed[completed.length - 1]
    || null;
  const readyNext = assignments.find((a) => String(a.status || "").toLowerCase() === "ready") || null;
  const report = lastDone?.completionReport || null;

  let cont = null;
  try {
    const advance = canAdvanceToImplementation(missionId);
    cont = missionContinuationVm(missionId, {
      choices: posture.choices || [],
      posture,
      advance,
    });
  } catch { cont = null; }
  const recommended = cont?.recommended || null;

  const brief = directorBriefFromCompletion(report, lastDone, { readyNext, posture });
  if (health?.register?.complete && !health?.waitingOnYou && brief.verdictId === "decision_needed") {
    brief.verdictId = "current_work_complete";
    brief.verdictLabel = "Current work complete — Mission ongoing";
    brief.postureLabel = posture.label || "Idle";
  }
  const board = progressBoardVm(missionId, { report });

  const findings = [];
  for (const risk of (report?.residualRisks || []).slice(0, 3)) {
    const text = typeof risk === "string" ? risk : (risk.text || risk.label || risk.title);
    if (text) findings.push(String(text).slice(0, 180));
  }
  for (const item of (report?.followUpItems || []).slice(0, 3)) {
    const text = typeof item === "string" ? item : (item.text || item.label || item.title);
    if (text) findings.push(`Follow-up: ${String(text).slice(0, 160)}`);
  }

  const evidence = evidenceItemsFor(missionId, {
    assignmentId: lastDone?.assignmentId || lastDone?.id || null,
    limit: 8,
  });
  const mediaEvidence = evidence.filter((e) => e.presentation === "media" && e.previewHref);

  // Align primary CTA with worker Accept when criteria are met — do not lead with
  // "Request More Discovery" just because continuation defaults to reopen.
  let recommendation;
  let recommendationDetail;
  let nextStep;
  let primaryAction = null;

  if (readyNext) {
    recommendation = `Start next: ${readyNext.title}`;
    recommendationDetail = "A ready assignment is queued. Start it when you are satisfied with this outcome.";
    nextStep = `Dispatches “${readyNext.title}” to a worker.`;
    primaryAction = {
      kind: "dispatch_ready",
      label: `Start next: ${String(readyNext.title).slice(0, 42)}`,
      missionId,
    };
  } else if (brief.accepts && !brief.needsWork) {
    let plannedNext = null;
    try { plannedNext = peekNextImplementationPhase(missionId); } catch { plannedNext = null; }
    const autoGate = shouldAutoContinueImplementation(missionId);
    const lastPhase = String(lastDone?.phaseId || "");
    const wave2Done = lastPhase === "impl_w2d" || /W-8|Department scope bypass/i.test(String(lastDone?.title || ""));
    if (plannedNext?.title && autoGate.ok) {
      scheduleChainOnce(missionId, lastDone?.assignmentId || lastDone?.id || null);
      recommendation = wave2Done && /^impl_w3/.test(plannedNext.phaseId)
        ? `Wave 2 complete — starting ${plannedNext.title}`
        : `Continuing — ${plannedNext.title}`;
      recommendationDetail = "Director keeps the approved implementation chain moving. It only stops for an open decision, rework, or when the plan is finished.";
      nextStep = `Starts ${plannedNext.title} automatically.`;
      primaryAction = {
        kind: "open_next_wave",
        label: wave2Done && /^impl_w3/.test(plannedNext.phaseId)
          ? "Start Wave 3"
          : `Start ${String(plannedNext.title).replace(/^Wave\s+\d+\s+[—\-]\s+/i, "").slice(0, 36)}`,
        missionId,
        phaseId: plannedNext.phaseId,
      };
    } else if (plannedNext?.title) {
      recommendation = wave2Done && /^impl_w3/.test(plannedNext.phaseId)
        ? `Wave 2 complete — next is ${plannedNext.title}`
        : `Accept and continue — ${plannedNext.title}`;
      recommendationDetail = wave2Done
        ? "W-0 through W-8 are done. Wave 3 starts at W-9 (one catalog). Click Start Wave 3 to continue."
        : (brief.workerRecommendation
          ? `Worker said: ${brief.workerRecommendation}. Next on the plan is ${plannedNext.title}.`
          : `Criteria met. Next on the plan is ${plannedNext.title}.`);
      nextStep = `Opens and starts ${plannedNext.title}.`;
      primaryAction = {
        kind: "open_next_wave",
        label: wave2Done && /^impl_w3/.test(plannedNext.phaseId) ? "Start Wave 3" : "Accept & start next",
        missionId,
        phaseId: plannedNext.phaseId,
      };
    } else {
      recommendation = "Current work complete — Mission ongoing";
      recommendationDetail = health?.directorNext
        || "The current assignment register is finished. This durable Mission is idle until you give Director a new outcome (e.g. “Continue”, “What’s next?”, or name the next goal). Closing the Mission is rare and intentional.";
      nextStep = "Message Director in the conversation — you do not need to Park or Close.";
      primaryAction = null;
    }
  } else if (posture.id === "mission_idle" || posture.id === "director_reconciling") {
    recommendation = "Current work complete — Mission ongoing";
    recommendationDetail = health?.directorNext || posture.detail;
    nextStep = posture.next || "Message Director to continue.";
    primaryAction = posture.primaryAction || null;
  } else if (recommended?.action) {
    recommendation = recommended.buttonLabel || recommended.title || "Choose a next step";
    recommendationDetail = [
      recommended?.whyChoose || recommended?.why,
      recommended?.expectedOutcome,
    ].filter(Boolean).map((s) => String(s).slice(0, 220)).join(" ");
    nextStep = recommended?.whatHappensNext
      || "Reviewing alone does not change mission state — pick an action below.";
    primaryAction = {
      ...recommended.action,
      label: recommended.buttonLabel || recommended.action.label,
      missionId,
    };
  } else {
    recommendation = brief.workerRecommendation
      ? clipOperatorText(brief.workerRecommendation, 120)
      : "Choose a next step";
    recommendationDetail = null;
    nextStep = "Reviewing alone does not change mission state — pick an action below.";
  }

  const buttons = [];
  const seenKinds = new Set();
  function pushBtn(action) {
    if (!action?.kind || !action.missionId) return;
    if (health?.register?.complete && !health?.waitingOnYou) {
      if (["park_outcome", "certify_completion", "reopen_work"].includes(action.kind)) return;
    }
    const key = `${action.kind}:${action.label || ""}`;
    if (seenKinds.has(key)) return;
    seenKinds.add(key);
    buttons.push(action);
  }

  if (primaryAction) pushBtn(primaryAction);
  if (readyNext && primaryAction?.kind !== "dispatch_ready") {
    pushBtn({
      kind: "dispatch_ready",
      label: `Start next: ${String(readyNext.title).slice(0, 42)}`,
      missionId,
    });
  }
  if (recommended?.action && recommended.action.kind !== primaryAction?.kind) {
    pushBtn({
      ...recommended.action,
      label: recommended.buttonLabel || recommended.action.label,
      missionId,
    });
  }
  for (const alt of (cont?.alternatives || []).slice(0, 4)) {
    if (alt.presentationOnly) continue;
    if (!alt.action?.kind) continue;
    if (["review_findings", "provide_feedback", "park_outcome", "certify_completion", "reopen_work"].includes(alt.action.kind)) continue;
    pushBtn({
      ...alt.action,
      label: alt.buttonLabel || alt.action.label,
      missionId,
    });
  }
  if (mediaEvidence.length) {
    pushBtn({ kind: "toggle_screenshots", label: "View Screenshots", missionId });
  }

  const statusFacts = [
    health?.missionProgressLabel ? `Mission ${health.missionProgressLabel}` : null,
    health?.register?.line ? `Current work: ${health.register.line}` : null,
    ...(brief.proofLines.length ? brief.proofLines : []),
    lastDone?.title ? `Just finished: ${lastDone.title}` : null,
  ].filter(Boolean).slice(0, 6);

  return {
    kind: "inline_review",
    reviewId: null,
    missionId,
    soft: true,
    headline: lastDone?.title
      ? `${lastDone.title}`
      : (health?.currentObjective || "Current work complete"),
    waveLabel: brief.verdictLabel,
    whatFinished: lastDone?.title || null,
    statusFacts,
    brief: {
      verdictId: brief.verdictId,
      verdictLabel: brief.verdictLabel,
      problem: brief.problem,
      fix: brief.fix,
      doneBullets: brief.doneBullets,
      proofLines: brief.proofLines,
      workerRecommendation: brief.workerRecommendation,
    },
    progressBoard: board,
    missionHealth: health,
    summary: brief.summary,
    findings,
    recommendation,
    recommendationDetail: recommendationDetail || null,
    nextStep,
    confidencePct: null,
    evidence,
    buttons,
    operatorMayApprove: false,
  };
}

/**
 * Enrich projected messages with artifact preview hrefs + inline action affordances.
 */
export function enrichConversationMessages(missionId, messages, { currentState = null, inlineReview = null } = {}) {
  const evidenceIndex = new Map();
  for (const e of listEvidence(missionId)) {
    const id = e.evidence_id || e.id;
    if (id) evidenceIndex.set(id, e);
  }

  const out = (messages || []).map((m) => {
    const artifacts = (m.artifacts || []).map((a) => {
      const id = a.artifactId || a.evidenceId || a.id;
      const rec = id ? evidenceIndex.get(id) : null;
      return {
        ...a,
        artifactId: id,
        title: a.title || rec?.title || id,
        type: a.type || rec?.type || "evidence",
        previewHref: id
          ? `/api/v2/evidence/file?missionId=${encodeURIComponent(missionId)}&evidenceId=${encodeURIComponent(id)}`
          : null,
      };
    });
    // Surface evidence_ids from provenance-adjacent timeline detail when empty
    return { ...m, artifacts, actions: m.actions || [] };
  });

  // Attach inline review expand action instead of navigate-away Review Outcome
  if (inlineReview && out.length) {
    const last = out[out.length - 1];
    const actions = (last.actions || []).filter((a) => a.kind !== "review_outcome");
    actions.unshift({
      kind: "inline_review_expand",
      label: "Review Outcome",
      missionId,
      reviewId: inlineReview.reviewId,
    });
    last.actions = actions;
  } else if (currentState?.primaryAction?.kind === "review_outcome" && out.length) {
    const last = out[out.length - 1];
    last.actions = [{
      kind: "inline_review_expand",
      label: currentState.primaryAction.label || "Review Outcome",
      missionId,
      reviewId: currentState.primaryAction.reviewId || null,
    }, ...(last.actions || []).filter((a) => a.kind !== "review_outcome")];
  }

  return out;
}

export function resolveMissionConversationId(id) {
  const raw = String(id || "").trim();
  if (!raw || raw === "ws_identity" || raw === "identity") {
    return "msn_f74ed02c126c88d7ff";
  }
  if (raw.startsWith("msn_")) return raw;
  if (raw.startsWith("ws_")) {
    // legacy workspace ids
    if (raw === "ws_identity") return "msn_f74ed02c126c88d7ff";
  }
  // Allow portfolio mission ids / titles passed as id
  if (getMission(raw) || getBrief(raw)) return raw;
  return null;
}
