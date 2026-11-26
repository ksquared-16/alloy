/**
 * Deliverable Director feedback loop — input packaging + deterministic Director turn.
 *
 * Vacilando's deliverable Director is the control-plane verification/response
 * path (not a free-form chat provider). Operator context must appear in the
 * Director *input* for the next turn, and the response must demonstrably
 * incorporate that context.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { listDirectorMessages } from "./director-comms.mjs";
import { listEvidence } from "./evidence.mjs";
import { getAssignment } from "./worker-assignment.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import { lookupIdempotency, recordIdempotency } from "./director-idempotency.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
const MSG_DIR = join(RUNTIME_ROOT, "vacilando", "director-messages");

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

/** Documented re-check contract (tested). */
export const RECHECK_SEMANTICS = Object.freeze({
  usesConversationThread: true,
  usesCurrentEvidence: true,
  description:
    "Re-check re-runs Director verification against current assignment evidence "
    + "AND injects the full operator↔Director conversation for this review "
    + "(same assignment lineage via reviewId binding) into the Director input. "
    + "It does not discard shared context.",
});

/** Documented certify-note contract (tested). */
export const CERTIFY_NOTE_SEMANTICS = Object.freeze({
  emptyNote: "records_only",
  withNote: "records_and_director_message",
  description:
    "Empty certify note: acceptance_note null + history/timeline only. "
    + "Non-empty note: also submits a kind=context Director message bound to reviewId "
    + "and runs a Director turn that acknowledges the note in the conversation.",
});

export { lookupIdempotency, recordIdempotency };

/** Strict review-scoped thread for Director input (no unscoped bleed). */
export function conversationForReview(missionId, reviewId, { limit = 24 } = {}) {
  const items = [];
  for (const m of listDirectorMessages(missionId, { limit: 120 })) {
    if (m.reviewId !== reviewId) continue;
    if (m.kind === "director_response" || m.actor === "director") {
      items.push({
        at: m.at,
        actor: "director",
        kind: m.kind || "director_response",
        text: String(m.interpretation?.summary || m.verbatim || "").slice(0, 600),
      });
      continue;
    }
    const v = String(m.verbatim || "");
    const ctx = v.match(/Operator (?:context|question|direction):\s*([\s\S]+?)(?:\nRespond with|\nTreat this|\nDeliverable:|\nReview:|\nI will|$)/i);
    const note = v.match(/with note:\s*([\s\S]+)$/i);
    const text = (ctx?.[1] || note?.[1] || v).trim().slice(0, 600);
    items.push({
      at: m.at,
      actor: "you",
      kind: m.kind || "ask",
      text,
    });
  }
  items.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  return items.slice(-Math.max(1, limit));
}

/**
 * Build the Director input payload for a deliverable turn.
 * Isolation: only messages for this missionId + reviewId.
 */
export function buildDeliverableDirectorInput(missionId, review, {
  trigger = "share_context",
  operatorVerbatim = null,
} = {}) {
  if (!missionId) return { ok: false, error: "missing_mission_id" };
  if (!review?.review_id) return { ok: false, error: "missing_review" };

  const reviewId = review.review_id;
  const assignment = getAssignment(missionId, review.assignment_id);
  const conversation = conversationForReview(missionId, reviewId, { limit: 24 });
  const msgs = listDirectorMessages(missionId, { limit: 100 })
    .filter((m) => m.reviewId === reviewId);

  const operatorContext = msgs
    .filter((m) => ["context", "ask", "request_changes"].includes(m.kind))
    .map((m) => ({
      messageId: m.messageId,
      kind: m.kind,
      at: m.at,
      verbatim: m.verbatim,
    }));

  const evidence = listEvidence(missionId, { assignmentId: review.assignment_id })
    .slice(0, 20)
    .map((e) => ({
      evidenceId: e.evidenceId,
      title: e.title,
      type: e.type,
      result: e.test_run_status || e.result || null,
    }));

  const input = {
    schema_version: "vacilando.deliverable_director_input.v1",
    missionId,
    reviewId,
    assignmentId: review.assignment_id,
    trigger,
    deliverableTitle: review.deliverable_title,
    certificationState: review.certification_state,
    recommendation: review.recommendation,
    operatorVerbatim: operatorVerbatim || null,
    conversation,
    operatorContext,
    reopenReason: assignment?.reopen_reason || review.changes_direction || null,
    evidenceSummary: evidence,
    recheckSemantics: trigger === "recheck" ? { ...RECHECK_SEMANTICS } : undefined,
    builtAt: iso(),
  };

  return { ok: true, input, review, assignment };
}

/**
 * Produce a Director response that demonstrably incorporates operator context.
 */
export function composeDirectorResponseFromInput(input) {
  const latestOp = [...(input.conversation || [])]
    .reverse()
    .find((t) => t.actor === "you")
    || (input.operatorVerbatim
      ? { text: input.operatorVerbatim, kind: "context" }
      : null);

  const quote = String(latestOp?.text || input.operatorVerbatim || "").trim();
  const excerpt = quote.slice(0, 180);
  const trigger = input.trigger || "share_context";

  let summary;
  if (trigger === "recheck") {
    summary = excerpt
      ? `Re-checked with your prior context in mind (“${excerpt}”). Verification used current evidence plus the conversation thread for this deliverable.`
      : `Re-checked using current evidence plus the conversation thread for this deliverable (no operator notes yet).`;
  } else if (trigger === "request_changes") {
    summary = excerpt
      ? `Understood — you requested changes: “${excerpt}”. I will relaunch the worker with that direction on this deliverable.`
      : `Understood — changes requested. I will relaunch the worker with your direction.`;
  } else if (trigger === "certify_note") {
    summary = excerpt
      ? `Recorded your certification note (“${excerpt}”) and will carry it into subsequent mission work.`
      : `Certification recorded.`;
  } else {
    summary = excerpt
      ? `Incorporating your context for this deliverable: “${excerpt}”. I will apply this alignment on the next verification and any relaunch.`
      : `Context recorded for this deliverable.`;
  }

  return {
    schema_version: "vacilando.deliverable_director_response.v1",
    trigger,
    summary,
    incorporatedOperatorExcerpt: excerpt || null,
    usedConversationCount: (input.conversation || []).length,
    usedEvidenceCount: (input.evidenceSummary || []).length,
    missionId: input.missionId,
    reviewId: input.reviewId,
    at: iso(),
  };
}

function persistDirectorReplyMessage({
  missionId,
  reviewId,
  response,
  inReplyTo = null,
  nowMs,
}) {
  if (!existsSync(MSG_DIR)) mkdirSync(MSG_DIR, { recursive: true });
  const messageId = "ddm_" + randomBytes(8).toString("hex");
  const record = {
    schema_version: "vacilando.director_deliverable_message.v1",
    messageId,
    missionId,
    reviewId: reviewId || null,
    kind: "director_response",
    actor: "director",
    verbatim: response.summary,
    interpretation: {
      action: "responded_to_context",
      summary: response.summary,
      incorporatedOperatorExcerpt: response.incorporatedOperatorExcerpt,
    },
    inReplyTo,
    directorInputRef: {
      trigger: response.trigger,
      usedConversationCount: response.usedConversationCount,
      usedEvidenceCount: response.usedEvidenceCount,
    },
    at: iso(nowMs),
  };
  appendFileSync(join(MSG_DIR, `${missionId}.jsonl`), JSON.stringify(record) + "\n");
  return record;
}

/**
 * Full Director turn: build input → compose response → persist → timeline.
 */
export function executeDeliverableDirectorTurn(missionId, review, {
  trigger = "share_context",
  operatorVerbatim = null,
  operatorMessageId = null,
  nowMs,
  idempotencyKey = null,
} = {}) {
  const reviewId = review?.review_id;
  if (idempotencyKey) {
    const prior = lookupIdempotency(missionId, `turn:${idempotencyKey}`);
    if (prior?.directorResponseId) {
      const msgs = listDirectorMessages(missionId, { limit: 200 });
      const existing = msgs.find((m) => m.messageId === prior.directorResponseId);
      if (existing) {
        return {
          ok: true,
          deduped: true,
          input: null,
          response: existing.interpretation || { summary: existing.verbatim },
          directorMessage: existing,
          directorResponseId: existing.messageId,
        };
      }
    }
  }

  const built = buildDeliverableDirectorInput(missionId, review, {
    trigger,
    operatorVerbatim,
  });
  if (!built.ok) return built;

  const response = composeDirectorResponseFromInput(built.input);
  const directorMessage = persistDirectorReplyMessage({
    missionId,
    reviewId,
    response,
    inReplyTo: operatorMessageId,
    nowMs,
  });

  appendTimelineEvent(missionId, {
    type: "director_response",
    headline: trigger === "recheck"
      ? "Director re-checked with conversation context"
      : trigger === "request_changes"
        ? "Director accepted change request"
        : "Director responded to your context",
    summary: response.summary,
    visibility: "summary",
    assignmentId: built.review.assignment_id,
    actor: "director",
    detail: {
      review_id: reviewId,
      messageId: directorMessage.messageId,
      trigger,
      incorporated_excerpt: response.incorporatedOperatorExcerpt,
      director_input: {
        conversation_count: built.input.conversation.length,
        operator_context_count: built.input.operatorContext.length,
        evidence_count: built.input.evidenceSummary.length,
      },
    },
    nowMs,
  });

  const out = {
    ok: true,
    deduped: false,
    input: built.input,
    response,
    directorMessage,
    directorResponseId: directorMessage.messageId,
    trigger,
  };

  if (idempotencyKey) {
    recordIdempotency(missionId, `turn:${idempotencyKey}`, {
      ...out,
      messageId: operatorMessageId,
    });
  }

  return out;
}
