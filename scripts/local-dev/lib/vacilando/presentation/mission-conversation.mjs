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
import {
  getOpenDeliverableReview,
  deliverableReviewVm,
} from "../deliverable-review.mjs";

/** Friendly titles for known long-lived missions (display only). */
const MISSION_DISPLAY_TITLES = Object.freeze({
  msn_f74ed02c126c88d7ff: "Identity Platform",
});

let _listCache = { at: 0, filter: null, payload: null };
const LIST_CACHE_MS = 8000;

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
    const slot = Number(mission?.worker_slot ?? mission?.slot) || null;
    const identity = slot ? resolveSlotIdentity(slot) : null;
    missions.push({
      kind: "mission_nav_item",
      missionId,
      workspaceId: missionId,
      title: displayMissionTitle(missionId, fallbackTitle || mission?.title),
      needsYou: false,
      needsCount: 0,
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
export function compressCurrentState(cs, { provider = null, slot = null, serverStatus = null } = {}) {
  if (!cs) return null;
  const lines = [];
  if (cs.currentPhase) lines.push(String(cs.currentPhase).slice(0, 40));
  const waiting =
    cs.postureId === "operator_review"
    || cs.postureId === "decision_required"
    || cs.postureId === "deliverable_review"
    || cs.postureId === "awaiting_completion"
    || /waiting on you/i.test(String(cs.recommendation || ""))
    || /waiting on you/i.test(String(cs.currentPhase || ""));
  if (waiting && !lines.some((l) => /waiting on you/i.test(l))) {
    lines.push("Waiting on You");
  }
  const workerBits = [provider, slot != null ? `Slot ${slot}` : null].filter(Boolean).join(" · ");
  if (workerBits) lines.push(workerBits);
  if (serverStatus) lines.push(`Server ${serverStatus}`);
  return {
    kind: "current_state_compact",
    derived: true,
    editable: false,
    phase: cs.currentPhase || "—",
    goal: String(cs.workingOn || cs.currentGoal || "—").slice(0, 48),
    next: String(cs.nextExpectedCheckpoint || cs.recommendation || "—").slice(0, 48),
    blockedBy: cs.blockedBy && cs.blockedBy !== "Nothing" ? String(cs.blockedBy).slice(0, 48) : null,
    recommendation: cs.recommendation || null,
    postureId: cs.postureId || null,
    summaryLines: lines.slice(0, 4),
    primaryAction: cs.primaryAction || null,
    secondaryAction: cs.secondaryAction || null,
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
 * Prefers open deliverable review; otherwise a soft card from posture + evidence
 * so "Review Outcome" never navigates away from the conversation.
 */
export function inlineReviewCardVm(missionId) {
  const open = getOpenDeliverableReview(missionId);
  if (open) {
    const vm = deliverableReviewVm(missionId, open);
    if (vm) {
      const evidence = (vm.evidence || []).slice(0, 8).map((e) => ({
        evidenceId: e.evidence_id || e.evidenceId || e.id,
        title: e.title || e.label || e.type || "Evidence",
        type: e.type || e.kind || "artifact",
        previewHref: (e.evidence_id || e.evidenceId || e.id)
          ? `/api/v2/evidence/file?missionId=${encodeURIComponent(missionId)}&evidenceId=${encodeURIComponent(e.evidence_id || e.evidenceId || e.id)}`
          : null,
      }));

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
      if (evidence.some((e) => e.previewHref)) {
        buttons.push({ kind: "toggle_screenshots", label: "View Screenshots", missionId });
      }

      return {
        kind: "inline_review",
        reviewId: vm.reviewId,
        missionId,
        headline: vm.headline,
        waveLabel: vm.waveLabel,
        summary: vm.executiveSummary?.text
          || (vm.executiveSummary?.sentences || []).join(" ")
          || vm.directorRecommendation?.summary
          || "",
        recommendation: vm.directorRecommendation?.headline || vm.recommendation?.headline || null,
        confidencePct: vm.directorRecommendation?.confidencePct ?? vm.recommendation?.confidencePct ?? null,
        evidence,
        buttons,
        operatorMayApprove: Boolean(vm.operatorMayApprove),
      };
    }
  }

  const posture = deriveMissionPosture(missionId);
  if (!posture || !["operator_review", "deliverable_review", "awaiting_completion", "decision_required"].includes(posture.id)) {
    return null;
  }

  const evidence = (listEvidence(missionId) || []).slice(-8).reverse().map((e) => {
    const id = e.evidence_id || e.id;
    return {
      evidenceId: id,
      title: e.title || e.label || e.type || "Evidence",
      type: e.type || e.kind || "artifact",
      previewHref: id
        ? `/api/v2/evidence/file?missionId=${encodeURIComponent(missionId)}&evidenceId=${encodeURIComponent(id)}`
        : null,
    };
  });

  const buttons = [
    { kind: "provide_feedback", label: "Give Feedback", missionId },
    { kind: "reopen_work", label: "Continue Discovery", missionId },
  ];
  if (posture.primaryAction?.kind === "certify_completion") {
    buttons.unshift({
      kind: "certify_completion",
      label: posture.primaryAction.label || "Approve",
      missionId,
    });
  } else if (posture.primaryAction?.kind === "advance_implementation") {
    buttons.unshift({
      kind: "advance_implementation",
      label: posture.primaryAction.label || "Continue",
      missionId,
    });
  }
  if (evidence.some((e) => e.previewHref)) {
    buttons.push({ kind: "toggle_screenshots", label: "View Screenshots", missionId });
  }

  return {
    kind: "inline_review",
    reviewId: null,
    missionId,
    soft: true,
    headline: posture.primaryAction?.label || "Review Outcome",
    waveLabel: posture.label || null,
    summary: posture.explanation || posture.detail || "",
    recommendation: posture.recommendation || posture.primaryAction?.label || null,
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
