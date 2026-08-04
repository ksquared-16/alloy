/**
 * Vacilando — Operator ↔ Director communication (Mission Dashboard closeout).
 *
 * Replaces Ask Director / Reject-with-direction stubs.
 * Operator message is persisted verbatim; Director interprets and acts:
 *   - resume work
 *   - create a revised decision
 *   - ask one focused clarification
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import { join } from "node:path";
import { appendTimelineEvent } from "./timeline.mjs";
import { getDecision, answerDecision, createDecision, listDecisions } from "./decisions.mjs";
import { resumeAssignments, pauseAssignments, listAssignments } from "./worker-assignment.mjs";
import { lookupIdempotency, recordIdempotency } from "./director-idempotency.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "director-messages");

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function fileFor(missionId) {
  return join(DIR, `${missionId}.jsonl`);
}

function persistMessage(rec) {
  ensureDir();
  appendFileSync(fileFor(rec.missionId), JSON.stringify(rec) + "\n");
  return rec;
}

export function listDirectorMessages(missionId, { limit = 100 } = {}) {
  try {
    const lines = readFileSync(fileFor(missionId), "utf8").split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/**
 * Deterministic interpretation of operator text.
 * Prefer clarification when the message is a question; revised decision when
 * rejecting; resume when affirming an existing recommendation.
 */
export function interpretOperatorMessage({ kind, message, decision = null } = {}) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  const isQuestion = /\?/.test(text) || /^(what|why|how|when|who|which|can|could|should|would)\b/i.test(text);
  const affirms = /\b(approve|approved|yes|lgtm|go ahead|proceed|accept|keep 7|keep the recommendation)\b/i.test(lower);
  const rejects = kind === "reject_direction"
    || /\b(reject|instead|prefer|change|don't|do not|rather)\b/i.test(lower);

  // Alignment notes are recorded; only escalate to clarification when clearly a question.
  if (kind === "context" && !isQuestion) {
    return {
      action: "acknowledged",
      summary: "Director recorded your context and will keep it in mind for this mission.",
    };
  }

  if (kind === "ask" || kind === "context" || (isQuestion && kind !== "reject_direction")) {
    return {
      action: "clarification",
      summary: "Director needs one focused clarification before acting.",
      clarificationQuestion: decision
        ? `Regarding “${decision.title}”: ${text.endsWith("?") ? "What constraint should I optimize for — security window or ops convenience?" : "What single outcome should I optimize for?"}`
        : "What single outcome should I optimize for?",
    };
  }

  if (rejects && !affirms) {
    return {
      action: "revised_decision",
      summary: "Director will open a revised decision that incorporates your direction.",
    };
  }

  return {
    action: "resume",
    summary: "Director will resume paused work with your direction recorded.",
  };
}

/**
 * Submit Ask Director, Share context, or Reject with direction.
 * Always preserves verbatim operator text for audit.
 */
export function submitOperatorDirectorMessage({
  missionId,
  decisionId = null,
  reviewId = null,
  kind, // ask | context | reject_direction | request_changes
  message,
  actor = "operator",
  nowMs,
  idempotencyKey = null,
  skipSideEffects = false,
} = {}) {
  if (!missionId) return { ok: false, error: "missing_mission_id" };
  if (!["ask", "context", "reject_direction", "request_changes"].includes(kind)) {
    return { ok: false, error: "invalid_kind" };
  }
  const verbatim = String(message || "").trim();
  if (!verbatim) return { ok: false, error: "empty_message" };

  if (idempotencyKey) {
    const prior = lookupIdempotency(missionId, `msg:${idempotencyKey}`);
    if (prior?.messageId) {
      const existing = listDirectorMessages(missionId, { limit: 200 })
        .find((m) => m.messageId === prior.messageId);
      if (existing) {
        return { ok: true, deduped: true, message: existing, messageId: existing.messageId, interpretation: existing.interpretation, outcome: { action: "deduped" } };
      }
    }
  }

  const decision = decisionId ? getDecision(missionId, decisionId) : null;
  if (decisionId && !decision) return { ok: false, error: "decision_not_found" };

  const messageId = "odm_" + randomBytes(8).toString("hex");
  const interpretation = kind === "request_changes"
    ? {
      action: "request_changes_recorded",
      summary: "Director recorded your change request for this deliverable.",
    }
    : interpretOperatorMessage({ kind, message: verbatim, decision });

  const record = persistMessage({
    schema_version: "vacilando.operator_director_message.v1",
    messageId,
    missionId,
    decisionId: decisionId || null,
    reviewId: reviewId || null,
    kind,
    verbatim,
    actor,
    interpretation,
    idempotencyKey: idempotencyKey || null,
    at: iso(nowMs),
  });

  if (idempotencyKey) {
    recordIdempotency(missionId, `msg:${idempotencyKey}`, { messageId, trigger: kind });
  }

  if (skipSideEffects) {
    return { ok: true, deduped: false, message: record, messageId, interpretation, outcome: { action: interpretation.action } };
  }

  const askLike = kind === "ask" || kind === "context";
  appendTimelineEvent(missionId, {
    type: "operator_message",
    summary: kind === "reject_direction" || kind === "request_changes"
      ? `You requested changes: ${verbatim.slice(0, 120)}`
      : kind === "context"
        ? `You shared context with Director: ${verbatim.slice(0, 120)}`
        : `You asked Director: ${verbatim.slice(0, 120)}`,
    headline: kind === "reject_direction" || kind === "request_changes"
      ? "You requested changes"
      : kind === "context"
        ? "You shared context with Director"
        : "Asked Director",
    visibility: "summary",
    decisionId: decisionId || null,
    actor,
    detail: {
      messageId,
      kind,
      verbatim,
      reviewId: reviewId || null,
    },
    nowMs,
  });

  let outcome = { action: interpretation.action };
  let revisedDecision = null;
  let answered = null;

  if (kind === "reject_direction" && decision && decision.status === "open") {
    answered = answerDecision({
      missionId,
      decisionId,
      chosenOptionId: null,
      response: verbatim,
      actor,
      resumeAssignments: null, // Director decides after interpretation
      nowMs,
    });
  }

  // Deliverable-scoped context/ask: Director turn is owned by deliverable-director-loop
  // (skip heuristic ack so we do not double-fire).
  if (reviewId && (kind === "context" || kind === "ask" || kind === "request_changes")) {
    return {
      ok: true,
      deduped: false,
      message: record,
      messageId,
      interpretation,
      outcome: { action: "awaiting_deliverable_director_turn" },
      answered: null,
      revisedDecision: null,
      openDecisions: listDecisions(missionId, { status: "open" }),
    };
  }

  if (interpretation.action === "acknowledged") {
    appendTimelineEvent(missionId, {
      type: "director_response",
      summary: interpretation.summary,
      headline: "Director recorded your context",
      visibility: "summary",
      decisionId: decisionId || null,
      actor: "director",
      detail: { messageId, action: "acknowledged", verbatim_ref: messageId, reviewId: reviewId || null },
      nowMs,
    });
    outcome = { action: "acknowledged" };
  } else if (interpretation.action === "resume") {
    const paused = listAssignments(missionId).filter((a) => a.status === "paused").map((a) => a.assignmentId);
    const ids = (decision?.affectedAssignments?.length ? decision.affectedAssignments : paused);
    if (ids.length) {
      resumeAssignments(missionId, ids, { reason: "operator_direction", decisionId });
    }
    appendTimelineEvent(missionId, {
      type: "director_response",
      summary: interpretation.summary,
      headline: "Director resumed work",
      visibility: "summary",
      decisionId: decisionId || null,
      actor: "director",
      detail: { messageId, action: "resume", verbatim_ref: messageId },
      nowMs,
    });
    outcome = { action: "resume", resumedAssignments: ids };
  } else if (interpretation.action === "revised_decision") {
    const created = createDecision({
      missionId,
      title: decision ? `Revised: ${decision.title}` : "Direction required",
      situation: `You rejected the prior recommendation and directed: “${verbatim}”`,
      whyThisMatters: decision?.whyThisMatters || "Product direction changed mid-mission.",
      currentPlan: decision?.currentPlan || "",
      discovery: `Prior decision ${decisionId || "(none)"} closed by operator direction.`,
      options: [
        {
          optionId: "follow_direction",
          label: "Follow your direction",
          description: verbatim.slice(0, 280),
        },
        {
          optionId: "keep_prior",
          label: decision?.recommendation
            ? `Keep prior recommendation (${decision.recommendation})`
            : "Keep prior recommendation",
          description: "Ignore the new direction and stay with the previous plan.",
        },
      ],
      recommendation: "follow_direction",
      recommendationReason: "Honor the operator's explicit direction unless they reverse it.",
      impact: decision?.impact || {},
      evidence: [`Operator direction (verbatim message ${messageId})`],
      affectedAssignments: decision?.affectedAssignments || listAssignments(missionId).filter((a) => a.status === "paused").map((a) => a.assignmentId),
      pauseAssignments,
      actor: "director",
      nowMs,
    });
    revisedDecision = created.decision;
    appendTimelineEvent(missionId, {
      type: "director_response",
      summary: interpretation.summary,
      headline: "Director opened a revised decision",
      visibility: "summary",
      decisionId: revisedDecision.decisionId,
      actor: "director",
      detail: { messageId, action: "revised_decision", verbatim_ref: messageId },
      nowMs,
    });
    outcome = { action: "revised_decision", decisionId: revisedDecision.decisionId };
  } else {
    // clarification — keep original decision open for ask; for reject already answered
    appendTimelineEvent(missionId, {
      type: "director_response",
      summary: interpretation.clarificationQuestion || interpretation.summary,
      headline: "Director asked a clarification",
      visibility: "summary",
      decisionId: decisionId || null,
      actor: "director",
      detail: {
        messageId,
        action: "clarification",
        question: interpretation.clarificationQuestion,
        verbatim_ref: messageId,
        reviewId: reviewId || null,
      },
      nowMs,
    });
    outcome = {
      action: "clarification",
      question: interpretation.clarificationQuestion,
      decisionStillOpen: askLike && decision?.status === "open",
    };
  }

  return {
    ok: true,
    message: record,
    interpretation,
    outcome,
    answered: answered?.decision || null,
    revisedDecision,
    openDecisions: listDecisions(missionId, { status: "open" }),
  };
}
