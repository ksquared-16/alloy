/**
 * Vacilando V3-1 — Workspace Runtime (presentation projection).
 *
 * Conversation is a VIEW over authoritative mission timeline / posture /
 * continuation — not a second persistence layer.
 *
 * Vertical slice: ONE workspace (Identity Platform) only.
 */
import { getBrief } from "../mission-brief.mjs";
import { getMission } from "../commands/missions.mjs";
import { readTimeline } from "../timeline.mjs";
import { appendTimelineEvent } from "../timeline.mjs";
import { deriveMissionPosture } from "../mission-posture.mjs";
import { missionContinuationVm } from "./mission-continuation.mjs";
import { canAdvanceToImplementation } from "../mission-advance.mjs";
import { listAssignments } from "../worker-assignment.mjs";
import { listDecisions } from "../decisions.mjs";
import { listEvidence } from "../evidence.mjs";
import { resolveSlotIdentity } from "../identity.mjs";
import { missionLocalServerVm } from "../mission-local-server.mjs";
import { getMissionConfidence } from "../mission-confidence.mjs";

/** V3-1 single workspace — Identity Platform (richest live timeline). */
export const V3_1_WORKSPACE = Object.freeze({
  workspaceId: "ws_identity",
  title: "Identity Platform",
  missionId: "msn_f74ed02c126c88d7ff",
  blurb: "Access & Identity — long-lived workspace",
});

export function listV31Workspaces() {
  return [V3_1_WORKSPACE];
}

export function resolveV31Workspace(workspaceId) {
  const id = String(workspaceId || "").trim();
  if (!id || id === V3_1_WORKSPACE.workspaceId || id === "identity" || id === V3_1_WORKSPACE.missionId) {
    return { ...V3_1_WORKSPACE };
  }
  return null;
}

function participantFromActor(actor, type) {
  const a = String(actor || "").toLowerCase();
  const t = String(type || "");
  if (a === "operator" || t === "operator_message") {
    return { id: "kelly", label: "Kelly", role: "human" };
  }
  if (a.includes("cursor")) return { id: "cursor", label: "Cursor", role: "worker" };
  if (a.includes("claude") || a === "worker") return { id: "claude", label: "Claude", role: "worker" };
  if (
    a.includes("director")
    || t === "director_response"
    || t === "director_execution_started"
    || t === "decision_requested"
    || t === "decision_answered"
  ) {
    return { id: "director", label: "Director", role: "counsel" };
  }
  if (
    t.startsWith("assignment_")
    || t === "progress"
    || t === "validation"
    || t === "evidence_added"
    || t === "worker_start_report"
    || t === "completion_submitted"
  ) {
    return { id: "claude", label: "Claude", role: "worker" };
  }
  return { id: "system", label: "System", role: "system" };
}

function messageKindForEvent(type, participant) {
  if (type === "operator_message") return "human";
  if (type === "director_response" || type === "decision_requested") return "director_counsel";
  if (type === "decision_answered") return "approval_result";
  if (type === "evidence_added" || type === "validation" || type === "deliverable_verified") return "evidence_bundle";
  if (participant.role === "worker") return "worker_update";
  if (participant.role === "counsel") return "director_counsel";
  if (participant.role === "human") return "human";
  return "system";
}

/**
 * Project timeline events → conversation messages (view, not copy).
 */
export function projectTimelineToMessages(missionId, { limit = 80 } = {}) {
  const events = readTimeline(missionId, { limit: Math.max(limit * 3, 200) });
  // Prefer summary-visible + operator/director/worker-meaningful types; keep order.
  const meaningful = events.filter((e) => {
    const t = e.type;
    if (e.visibility === "debug") return false;
    if (["resource_claim", "resource_release", "context_invalidated", "worker_health"].includes(t)) return false;
    return true;
  });
  const slice = meaningful.slice(-limit);
  return slice.map((e) => {
    const from = participantFromActor(e.actor, e.type);
    return {
      messageId: e.event_id,
      kind: messageKindForEvent(e.type, from),
      from,
      body: e.headline || e.summary || e.type,
      detail: e.summary && e.summary !== e.headline ? e.summary : null,
      createdAt: e.at || e.occurred_at,
      provenance: {
        source: "timeline",
        eventId: e.event_id,
        type: e.type,
        actor: e.actor,
      },
      artifacts: Array.isArray(e.evidence_ids)
        ? e.evidence_ids.map((id) => ({ artifactId: id, type: "evidence", title: id }))
        : [],
      actions: [],
    };
  });
}

/**
 * Derived Current State — never manually authored.
 */
export function deriveCurrentState(missionId) {
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  const posture = deriveMissionPosture(missionId);
  const advance = canAdvanceToImplementation(missionId);
  const cont = missionContinuationVm(missionId, {
    choices: posture.choices || [],
    posture,
    advance,
  });
  const assignments = listAssignments(missionId);
  const openBlocked = assignments.find((a) => a.status === "blocked");
  const completed = assignments.filter((a) => a.status === "complete" || a.status === "accepted");
  const lastCompleted = completed.length
    ? (completed[completed.length - 1].title || completed[completed.length - 1].deliverable || "Deliverable")
    : null;
  const active = assignments.find((a) => ["active", "running", "in_progress", "dispatched", "acked"].includes(String(a.status || "").toLowerCase()))
    || assignments.find((a) => !["complete", "accepted", "cancelled"].includes(String(a.status || "").toLowerCase()));

  const workingOn = active?.title
    || brief?.objective?.slice?.(0, 120)
    || brief?.title
    || "Ongoing work";

  const phase = posture.label
    || mission?.current_phase
    || mission?.status
    || "Active";

  const recommendation = cont.recommended?.buttonLabel
    || cont.recommended?.title
    || posture.primaryAction?.label
    || posture.next
    || "Continue";

  const checkpoint = cont.recommended?.expectedOutcome
    || posture.next
    || "Next worker update";

  return {
    kind: "current_state",
    derived: true,
    editable: false,
    workspaceTitle: V3_1_WORKSPACE.title,
    workingOn: String(workingOn).slice(0, 160),
    currentPhase: String(phase).slice(0, 80),
    currentGoal: String(brief?.objective || workingOn).slice(0, 200),
    lastCompleted: lastCompleted ? String(lastCompleted).slice(0, 120) : "—",
    blockedBy: openBlocked?.blocker?.message
      || (posture.id === "blocked" ? (posture.detail || "Blocked") : null)
      || "Nothing",
    nextExpectedCheckpoint: String(checkpoint).slice(0, 160),
    recommendation: String(recommendation).slice(0, 120),
    postureId: posture.id,
    primaryAction: posture.primaryAction || cont.primaryAction || null,
    secondaryAction: posture.secondaryAction || null,
  };
}

export function deriveContextRail(missionId) {
  const mission = getMission(missionId);
  const slot = Number(mission?.worker_slot ?? mission?.slot) || null;
  const identity = slot ? resolveSlotIdentity(slot) : null;
  const local = missionLocalServerVm(missionId);
  const evidence = listEvidence(missionId);
  const openDecisions = listDecisions(missionId, { status: "open" });
  const confidence = getMissionConfidence(missionId);

  return {
    kind: "context_rail",
    worker: {
      slot,
      provider: identity?.provider || mission?.provider || null,
      worktree: identity?.worktree_name || null,
      branch: identity?.branch || null,
      health: identity?.ok === false ? "conflict" : "ok",
    },
    branch: identity?.branch || null,
    server: {
      port: local?.port || identity?.port || null,
      status: local?.status || local?.state || null,
      running: Boolean(local?.running || local?.status === "running"),
    },
    pr: null,
    evidence: {
      count: evidence.length,
      jumpLabel: evidence.length ? `${evidence.length} artifact${evidence.length === 1 ? "" : "s"}` : "None yet",
    },
    openDecisions: openDecisions.length,
    confidence: {
      percent: confidence?.percent ?? null,
      bandLabel: confidence?.bandLabel || null,
    },
    settings: { workspaceId: V3_1_WORKSPACE.workspaceId },
  };
}

/**
 * Full Workspace Runtime VM for V3-1.
 */
export function workspaceRuntimeVm(workspaceId = V3_1_WORKSPACE.workspaceId) {
  const ws = resolveV31Workspace(workspaceId);
  if (!ws) return null;
  const missionId = ws.missionId;
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  if (!brief && !mission) {
    return {
      kind: "workspace_runtime",
      workspace: ws,
      missing: true,
      error: "mission_not_found",
      messages: [],
      currentState: null,
      context: null,
    };
  }

  const currentState = deriveCurrentState(missionId);
  const messages = projectTimelineToMessages(missionId, { limit: 100 });
  // Attach primary action to last director/system message that needs you
  if (currentState.primaryAction && messages.length) {
    const last = messages[messages.length - 1];
    if (currentState.postureId && ["decision_required", "operator_review", "deliverable_review", "awaiting_completion"].includes(currentState.postureId)) {
      last.actions = [currentState.primaryAction].filter(Boolean);
    }
  }

  return {
    kind: "workspace_runtime",
    workspace: {
      ...ws,
      title: brief?.title?.startsWith("Mission 2") ? ws.title : (ws.title),
      missionTitle: brief?.title || mission?.title || ws.title,
    },
    missionId,
    currentState,
    context: deriveContextRail(missionId),
    messages,
    composer: {
      placeholder: `Message ${ws.title}…`,
      enabled: true,
    },
    empty: messages.length === 0,
  };
}

/**
 * Kelly reply — appends authoritative timeline event (conversation is a view).
 */
export function postWorkspaceReply(workspaceId, { text, actor = "operator" } = {}) {
  const ws = resolveV31Workspace(workspaceId);
  if (!ws) return { ok: false, error: "workspace_not_found" };
  const body = String(text || "").trim();
  if (!body) return { ok: false, error: "empty_message" };
  if (body.length > 8000) return { ok: false, error: "message_too_long" };

  const ev = appendTimelineEvent(ws.missionId, {
    type: "operator_message",
    summary: body.slice(0, 500),
    headline: body.length > 120 ? `${body.slice(0, 117)}…` : body,
    visibility: "summary",
    actor: actor === "kelly" ? "operator" : actor,
    detail: { workspaceId: ws.workspaceId, source: "v3_workspace_composer" },
  });

  return {
    ok: true,
    eventId: ev.event_id,
    runtime: workspaceRuntimeVm(ws.workspaceId),
  };
}
