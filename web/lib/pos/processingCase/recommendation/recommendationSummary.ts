/**
 * POS — compact recommendation summary for queue rows / Home cards.
 *
 * Pure mapping from the existing FP8a read model (`IntakeRecommendation` from
 * `resolveIntakeIdentity`) to a tiny shape the queue/Home can render before a case
 * is opened. No matching logic here — this only relabels an already-computed
 * recommendation. Safe to import on both server and client (no DB, no secrets).
 */

import type { IntakeRecommendation } from "@/lib/forms/intake/resolveIntakeIdentity";
import { resolveDecisionReadiness } from "@/lib/pos/decisionPresentation";

export type RecActionKey =
    | "link_existing"
    | "create_new"
    | "update_existing"
    | "route_for_review"
    | "manual_review";

export type RecConfidenceKey = "ready" | "high" | "medium" | "low" | "review";

export interface QueueRecommendationSummary {
    action: RecActionKey;
    confidence: RecConfidenceKey;
    /** Existing record the operator would link to, when known. */
    matchedName: string | null;
}

export const REC_ACTION_LABELS: Record<RecActionKey, string> = {
    link_existing: "Link existing",
    create_new: "Create new",
    update_existing: "Update existing",
    route_for_review: "Route for review",
    manual_review: "Manual review",
};

export const REC_CONFIDENCE_LABELS: Record<RecConfidenceKey, string> = {
    ready: "Ready",
    high: "High",
    medium: "Medium",
    low: "Low",
    review: "Review",
};

/** Compact readiness key from the shared readiness resolver (queue rows mirror the Decision Conversation). */
function readinessKey(rec: IntakeRecommendation): RecConfidenceKey {
    const tone = resolveDecisionReadiness(rec).tone;
    if (tone === "ready") return "ready";
    if (tone === "match") return "high";
    return "review";
}

/** Default for sources without an automated recommendation (packet/document/import). */
export const MANUAL_REVIEW_SUMMARY: QueueRecommendationSummary = {
    action: "manual_review",
    confidence: "review",
    matchedName: null,
};

export function summarizeIntakeRecommendation(rec: IntakeRecommendation): QueueRecommendationSummary {
    if (rec.decision === "link") {
        const cand = rec.candidates.find((c) => c.id === rec.recommendedCandidateId) ?? rec.candidates[0] ?? null;
        return { action: "link_existing", confidence: readinessKey(rec), matchedName: cand?.label ?? null };
    }
    if (rec.decision === "create") {
        // Ready to create — a searched identifier returned no match. Never "Medium" merely for that.
        return { action: "create_new", confidence: readinessKey(rec), matchedName: null };
    }
    // route → needs a human; surface a candidate name when ambiguity produced one.
    const cand = rec.candidates[0] ?? null;
    return { action: "route_for_review", confidence: "review", matchedName: cand?.label ?? null };
}
