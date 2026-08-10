/**
 * How every tour communication is classified for the eligibility gate.
 *
 * ## Why this is declared rather than defaulted
 *
 * `tourCommsOrchestrator` enqueued with no `category` and no `audience`, so every
 * tour message took `recordCategoryFallback("canonicalOutboundEnqueue:unspecified")`
 * and the audience silently defaulted to external. The fallback is deliberately
 * bounded, counted and logged — it is a compatibility ramp, not a classification.
 * A send that reaches a parent is a policy decision, and a policy decision that
 * nobody wrote down is one nobody can review.
 *
 * ## What the classification decides
 *
 * `evaluateEligibility` treats category as policy, not a label:
 *
 *   - `transactional` and `emergency` are exempt from recipient **opt-out**
 *   - `transactional` and `emergency` are exempt from **quiet hours**
 *   - suppression (bounce/complaint) and channel usability bind every category
 *
 * So classifying a tour message `transactional` means it reaches a parent who
 * asked not to be contacted, at any hour. These entries therefore record what
 * tour comms have always been in practice — `operational`, which respects both
 * opt-out and quiet hours — rather than quietly widening reach while calling it
 * a cleanup.
 *
 * ## Known conflict, not yet resolved
 *
 * `purposeRegistry`'s `tour_coordination` entry names this exact call site
 * (`source: "tours.comms_orchestrator"`) and declares `categories: ["transactional"]`
 * with `allowsExternalOperational: false`. That contradicts the classification
 * below, so no purpose is passed here: `validatePurpose` would reject every tour
 * send the moment purpose validation reaches this path (today only `canonicalSend`
 * enforces it, and the orchestrator calls the enqueue directly).
 *
 * Resolving it is a compliance decision — whether a tour invitation may override a
 * parent's opt-out — not a refactor. Until it is made, this file is the honest
 * record of current behaviour and the conflict stays visible.
 */

import type { TourCommsEventKey } from "@/lib/tours/comms/tourCommsConfig";
import type { MessageAudience, MessageCategory } from "@/lib/communications/eligibility/types";

/** Attributes the enqueue to this orchestrator instead of `…:unspecified`. */
export const TOUR_COMMS_CALL_SITE = "tours.comms_orchestrator";

export type TourCommsClassification = {
    audience: MessageAudience;
    category: MessageCategory;
};

const EXTERNAL_OPERATIONAL: TourCommsClassification = {
    audience: "external",
    category: "operational",
};

/**
 * Total over `TourCommsEventKey` — a test asserts every key is present, so adding
 * a tour notification kind forces a classification decision instead of inheriting
 * one silently.
 */
export const TOUR_COMMS_CLASSIFICATION: Record<TourCommsEventKey, TourCommsClassification> = {
    // Precedes any booking: outbound to a lead who has not asked for it. The one
    // kind where `transactional` would be hardest to defend.
    tour_invitation: EXTERNAL_OPERATIONAL,
    tour_confirmation: EXTERNAL_OPERATIONAL,
    tour_reminder: EXTERNAL_OPERATIONAL,
    tour_reschedule: EXTERNAL_OPERATIONAL,
    tour_cancel: EXTERNAL_OPERATIONAL,
    tour_no_show_followup: EXTERNAL_OPERATIONAL,
    // Declared for completeness — the orchestrator does not currently dispatch it.
    // Classified external so it cannot reach a provider on an internal assumption
    // that was never checked; revisit if it is ever routed to staff.
    tour_pending_internal: EXTERNAL_OPERATIONAL,
};

export function classifyTourComms(eventKey: TourCommsEventKey): TourCommsClassification {
    return TOUR_COMMS_CLASSIFICATION[eventKey];
}
