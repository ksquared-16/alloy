/**
 * Vacilando V3 — Workspace Runtime (presentation projection).
 *
 * Conversation is a VIEW over authoritative mission timeline / posture /
 * continuation — not a second persistence layer.
 *
 * V3-1: Identity Platform vertical slice.
 * V3-2: Fast shell + bounded first-page messages + load-earlier + compression.
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
import { getMissionConfidence } from "../mission-confidence.mjs";
import { composeSinceLastVisit } from "./workspace-compression.mjs";
import { getWorkspaceLastSeen, setWorkspaceLastSeen } from "./workspace-last-seen.mjs";
import {
  missionConversationListVm,
  compressCurrentState,
  operationalRailVm,
  inlineReviewCardVm,
  enrichConversationMessages,
  resolveMissionConversationId,
  displayMissionTitle,
} from "./mission-conversation.mjs";
import { executeMissionDirectorTurn } from "../mission-conversation-director.mjs";

/** V3-1 single workspace seed — Identity Platform (still the primary conversation). */
export const V3_1_WORKSPACE = Object.freeze({
  workspaceId: "ws_identity",
  title: "Identity Platform",
  missionId: "msn_f74ed02c126c88d7ff",
  blurb: "Access & Identity — long-lived mission",
});

/** Bounded first page — keep cold open fast; older history via beforeEventId. */
export const WORKSPACE_FIRST_PAGE = 40;
export const WORKSPACE_PAGE_SIZE = 40;

export function listV31Workspaces() {
  const list = missionConversationListVm({ filter: "active" });
  return (list.missions || []).map((m) => ({
    workspaceId: m.missionId,
    title: m.title,
    missionId: m.missionId,
    blurb: m.phase || "",
    needsYou: m.needsYou,
    needsCount: m.needsCount,
    provider: m.provider,
    slot: m.slot,
    phase: m.phase,
  }));
}

export function resolveV31Workspace(workspaceId) {
  const missionId = resolveMissionConversationId(workspaceId);
  if (!missionId) return null;
  const title = displayMissionTitle(missionId);
  return {
    workspaceId: missionId,
    title,
    missionId,
    blurb: title,
  };
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

function isMeaningfulEvent(e) {
  const t = e.type;
  if (e.visibility === "debug") return false;
  if (["resource_claim", "resource_release", "context_invalidated", "worker_health"].includes(t)) return false;
  return true;
}

function eventToMessage(e) {
  const from = participantFromActor(e.actor, e.type);
  const actions = [];
  if (e.type === "director_response" && e.detail?.proposedAction) {
    actions.push(e.detail.proposedAction);
  }
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
    actions,
  };
}

/**
 * Project timeline events → conversation messages (view, not copy).
 * Supports pagination via beforeEventId (exclusive cursor toward older history).
 */
export function projectTimelineToMessages(missionId, {
  limit = WORKSPACE_FIRST_PAGE,
  beforeEventId = null,
} = {}) {
  // Read enough to page through filtered meaningful events.
  const readLimit = Math.min(5000, Math.max(limit * 8, 400));
  const events = readTimeline(missionId, { limit: readLimit });
  const meaningful = events.filter(isMeaningfulEvent);

  let end = meaningful.length;
  if (beforeEventId) {
    const idx = meaningful.findIndex((e) => e.event_id === beforeEventId);
    if (idx < 0) {
      return {
        messages: [],
        page: { limit, beforeEventId, hasEarlier: false, oldestEventId: null, newestEventId: null },
      };
    }
    end = idx;
  }
  const start = Math.max(0, end - limit);
  const slice = meaningful.slice(start, end);
  const messages = slice.map(eventToMessage);
  return {
    messages,
    page: {
      limit,
      beforeEventId: beforeEventId || null,
      hasEarlier: start > 0,
      oldestEventId: messages[0]?.messageId || null,
      newestEventId: messages[messages.length - 1]?.messageId || null,
      meaningfulTotalHint: meaningful.length,
    },
  };
}

/**
 * Request-scoped memo for expensive derived projections during one shell build.
 */
const _deriveMemo = new Map();
function memoDerive(key, fn) {
  if (_deriveMemo.has(key)) return _deriveMemo.get(key);
  const v = fn();
  _deriveMemo.set(key, v);
  // Clear after turn — keep request-scoped only.
  queueMicrotask(() => _deriveMemo.delete(key));
  setTimeout(() => _deriveMemo.delete(key), 0);
  return v;
}

/**
 * Derived Current State — never manually authored.
 */
export function deriveCurrentState(missionId) {
  return memoDerive(`currentState:${missionId}`, () => {
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
  });
}

/**
 * Context rail — superseded by operationalRailVm on shell; kept for compat.
 */
export function deriveContextRail(missionId) {
  const ops = operationalRailVm(missionId);
  return {
    kind: "context_rail",
    worker: ops.worker,
    branch: ops.worker?.branch || null,
    server: {
      port: ops.server?.port || null,
      status: ops.server?.status || null,
      running: Boolean(ops.server?.running),
      url: ops.server?.url || null,
      statusLabel: ops.server?.statusLabel || null,
    },
    pr: ops.pr,
    evidence: { count: listEvidence(missionId).length, jumpLabel: null },
    openDecisions: listDecisions(missionId, { status: "open" }).length,
    confidence: {
      percent: getMissionConfidence(missionId)?.percent ?? null,
      bandLabel: getMissionConfidence(missionId)?.bandLabel || null,
    },
    settings: { workspaceId: missionId },
    operational: ops,
  };
}

function workspaceMeta(ws, brief, mission) {
  const title = displayMissionTitle(ws.missionId, ws.title);
  return {
    ...ws,
    title,
    missionTitle: brief?.title || mission?.title || title,
  };
}

/**
 * Fast shell VM — no message list. Usable before conversation history resolves.
 */
export function workspaceShellVm(workspaceId = V3_1_WORKSPACE.workspaceId, {
  operatorId = "kelly",
} = {}) {
  const ws = resolveV31Workspace(workspaceId);
  if (!ws) return null;
  const missionId = ws.missionId;
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  const missions = listV31Workspaces();
  if (!brief && !mission) {
    return {
      kind: "workspace_shell",
      workspace: ws,
      missionId,
      missing: true,
      error: "mission_not_found",
      currentState: null,
      currentStateCompact: null,
      context: null,
      operational: null,
      inlineReview: null,
      sinceLastVisit: null,
      missions,
      messagesStatus: "unavailable",
      composer: { placeholder: `Message ${ws.title}…`, enabled: false },
    };
  }

  const currentState = deriveCurrentState(missionId);
  currentState.workspaceTitle = displayMissionTitle(missionId);
  const operational = operationalRailVm(missionId);
  // Reuse ops for context rail — avoid second operationalRailVm / port probe
  const context = {
    kind: "context_rail",
    worker: operational.worker,
    branch: operational.worker?.branch || null,
    server: {
      port: operational.server?.port || null,
      status: operational.server?.status || null,
      running: Boolean(operational.server?.running),
      url: operational.server?.url || null,
      statusLabel: operational.server?.statusLabel || null,
    },
    pr: operational.pr,
    evidence: { count: null, jumpLabel: null },
    openDecisions: null,
    confidence: { percent: null, bandLabel: null },
    settings: { workspaceId: missionId },
    operational,
  };
  const currentStateCompact = compressCurrentState(currentState, {
    provider: operational.worker?.provider,
    slot: operational.worker?.slot,
    serverStatus: operational.server?.statusLabel || operational.server?.status,
  });
  const inlineReview = inlineReviewCardVm(missionId);
  // Defer expensive since-last-visit off the critical shell path (V3-4 Opening fix)
  const sinceLastVisit = null;

  return {
    kind: "workspace_shell",
    workspace: workspaceMeta(ws, brief, mission),
    missionId,
    currentState,
    currentStateCompact,
    context,
    operational,
    inlineReview,
    sinceLastVisit,
    missions,
    messagesStatus: "loading",
    composer: {
      placeholder: `Message Director about ${displayMissionTitle(missionId)}…`,
      enabled: true,
    },
    lastSeen: getWorkspaceLastSeen(missionId, { operatorId }),
  };
}

/**
 * Paginated conversation messages for a workspace.
 */
export function workspaceMessagesVm(workspaceId = V3_1_WORKSPACE.workspaceId, {
  limit = WORKSPACE_FIRST_PAGE,
  beforeEventId = null,
  currentState = null,
} = {}) {
  const ws = resolveV31Workspace(workspaceId);
  if (!ws) return null;
  const missionId = ws.missionId;
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  if (!brief && !mission) {
    return {
      kind: "workspace_messages",
      workspaceId: ws.workspaceId,
      missionId,
      missing: true,
      messages: [],
      page: { hasEarlier: false },
      messagesStatus: "empty_known",
    };
  }

  const projected = projectTimelineToMessages(missionId, { limit, beforeEventId });
  const cs = currentState || deriveCurrentState(missionId);
  const inlineReview = beforeEventId ? null : inlineReviewCardVm(missionId);
  let messages = projected.messages;
  if (!beforeEventId && cs.primaryAction && messages.length) {
    const last = messages[messages.length - 1];
    if (cs.postureId && ["decision_required", "operator_review", "deliverable_review", "awaiting_completion"].includes(cs.postureId)) {
      last.actions = [cs.primaryAction].filter(Boolean);
    }
  }
  messages = enrichConversationMessages(missionId, messages, {
    currentState: cs,
    inlineReview,
  });

  return {
    kind: "workspace_messages",
    workspaceId: ws.workspaceId,
    missionId,
    messages,
    inlineReview,
    page: projected.page,
    messagesStatus: messages.length ? "ready" : (projected.page.hasEarlier ? "ready" : "empty_known"),
    empty: messages.length === 0 && !beforeEventId && !projected.page.hasEarlier,
  };
}

/**
 * Full Workspace Runtime VM (compat / reply refresh).
 * V3-2 prefers shell + messages endpoints for open path.
 */
export function workspaceRuntimeVm(workspaceId = V3_1_WORKSPACE.workspaceId, {
  messageLimit = WORKSPACE_FIRST_PAGE,
  operatorId = "kelly",
} = {}) {
  const shell = workspaceShellVm(workspaceId, { operatorId });
  if (!shell) return null;
  if (shell.missing) {
    return {
      kind: "workspace_runtime",
      workspace: shell.workspace,
      missing: true,
      error: shell.error,
      messages: [],
      currentState: null,
      context: null,
      sinceLastVisit: null,
    };
  }
  const page = workspaceMessagesVm(workspaceId, {
    limit: messageLimit,
    currentState: shell.currentState,
  });
  return {
    kind: "workspace_runtime",
    workspace: shell.workspace,
    missionId: shell.missionId,
    currentState: shell.currentState,
    currentStateCompact: shell.currentStateCompact,
    context: shell.context,
    operational: shell.operational,
    inlineReview: page.inlineReview || shell.inlineReview,
    sinceLastVisit: shell.sinceLastVisit,
    missions: shell.missions,
    messages: page.messages,
    page: page.page,
    messagesStatus: page.messagesStatus,
    composer: shell.composer,
    empty: page.empty,
    lastSeen: shell.lastSeen,
  };
}

/**
 * Kelly reply — appends authoritative timeline event (conversation is a view).
 * Returns shell + latest page (bounded) so clients stay fast.
 */
export function postWorkspaceReply(workspaceId, { text, actor = "operator", operatorId = "kelly" } = {}) {
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

  // V3-4: composer talks to Director — deterministic grounded reply in-thread
  let director = null;
  try {
    director = executeMissionDirectorTurn(ws.missionId, {
      operatorText: body,
      operatorEventId: ev.event_id,
    });
  } catch (e) {
    director = { ok: false, error: String(e?.message || e) };
  }

  const runtime = workspaceRuntimeVm(ws.workspaceId, { operatorId });
  return {
    ok: true,
    eventId: ev.event_id,
    message: eventToMessage(ev),
    directorMessage: director?.ok ? director.message : null,
    director: director?.ok
      ? {
        ok: true,
        mode: director.intent?.mode || null,
        proposedAction: director.proposedAction || null,
        collaborationId: director.collaboration?.id || null,
      }
      : { ok: false, error: director?.error || "director_turn_failed" },
    runtime,
  };
}

export { getWorkspaceLastSeen, setWorkspaceLastSeen, composeSinceLastVisit };
