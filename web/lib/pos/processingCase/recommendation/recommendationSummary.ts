/**
 * POS — compact recommendation summary for queue rows / Home cards.
 *
 * Pure mapping from the existing FP8a read model (`IntakeRecommendation` from
 * `resolveIntakeIdentity`) to a tiny shape the queue/Home can render before a case
 * is opened. No matching logic here — this only relabels an already-computed
 * recommendation. Safe to import on both server and client (no DB, no secrets).
 */

import type { IntakeRecommendation, IntakeConfidence } from "@/lib/forms/intake/resolveIntakeIdentity";

export type RecActionKey =
    | "link_existing"
    | "create_new"
    | "update_existing"
    | "route_for_review"
    | "manual_review";

export type RecConfidenceKey = "high" | "medium" | "low" | "review";

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
    high: "High",
    medium: "Medium",
    low: "Low",
    review: "Review",
};

/** Default for sources without an automated recommendation (packet/document/import). */
export const MANUAL_REVIEW_SUMMARY: QueueRecommendationSummary = {
    action: "manual_review",
    confidence: "review",
    matchedName: null,
};

function mapConfidence(c: IntakeConfidence): RecConfidenceKey {
    return c === "none" ? "review" : c;
}

export function summarizeIntakeRecommendation(rec: IntakeRecommendation): QueueRecommendationSummary {
    if (rec.decision === "link") {
        const cand = rec.candidates.find((c) => c.id === rec.recommendedCandidateId) ?? rec.candidates[0] ?? null;
        return { action: "link_existing", confidence: mapConfidence(rec.confidence), matchedName: cand?.label ?? null };
    }
    if (rec.decision === "create") {
        return { action: "create_new", confidence: mapConfidence(rec.confidence), matchedName: null };
    }
    // route → needs a human; surface a candidate name when ambiguity produced one.
    const cand = rec.candidates[0] ?? null;
    return { action: "route_for_review", confidence: "review", matchedName: cand?.label ?? null };
}
