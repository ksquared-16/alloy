/**
 * Mission overlays must keep Settlement's authoritative household/children truth.
 *
 * Commit-critical `subjectIdentityTruth` may carry a queue-seeded `_inquiry_children`
 * projection (names + DOB from `related_subjects_summary`). Spreading that on top of a
 * settled drawer VM blanked Program/Gender and falsely flipped Children → "Needs info"
 * when the same family was opened from All/Tours vs Waitlist.
 */

import type { SubjectIdentityTruth } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

const SETTLEMENT_OWNED_COLLECTION_KEYS = ["_inquiry_children", "_household_children"] as const;

function collectionRichness(value: unknown): number {
    if (!Array.isArray(value) || value.length === 0) return 0;
    let score = value.length;
    for (const row of value) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const r = row as Record<string, unknown>;
        for (const key of [
            "gender",
            "gender_label",
            "desired_program_label",
            "program_label",
            "program",
            "desired_program_type",
            "schedule_label",
            "desired_schedule_label",
            "first_name",
            "last_name",
        ]) {
            if (r[key] != null && String(r[key]).trim()) score += 1;
        }
    }
    return score;
}

/**
 * Merge commit-critical identity bindings onto settled truth without clobbering richer
 * Settlement collections.
 */
export function mergeSubjectIdentityTruthOntoSettled(
    settledTruth: Record<string, unknown>,
    subjectIdentityTruth: SubjectIdentityTruth | null | undefined,
): Record<string, unknown> {
    if (!subjectIdentityTruth) return settledTruth;
    const next: Record<string, unknown> = { ...settledTruth, ...subjectIdentityTruth };
    for (const key of SETTLEMENT_OWNED_COLLECTION_KEYS) {
        const settledValue = settledTruth[key];
        const commitValue = (subjectIdentityTruth as Record<string, unknown>)[key];
        if (collectionRichness(settledValue) >= collectionRichness(commitValue)) {
            if (settledValue !== undefined) next[key] = settledValue;
            else delete next[key];
        }
    }
    return next;
}
