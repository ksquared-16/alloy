/**
 * POS — compact classification badge for queue rows / Home cards.
 *
 * Pure relabel of the EXISTING FP9 stored classification (`StoredProcessingClassification`).
 * No recompute, no extraction, no new fields. `null` in → `null` out, which the UI
 * renders as "Awaiting classification". Safe on server and client (types only).
 */

import type { ProcessingClassificationStatus, StoredProcessingClassification } from "./types";

export interface ClassificationBadgeVM {
    status: ProcessingClassificationStatus; // classified | unknown | unsupported
    label: string; // detected type label, e.g. "Subsidy contract"
    /** 0..0.95; only meaningful (and shown) when status is "classified". */
    confidence: number | null;
}

export const CLASSIFICATION_STATUS_LABELS: Record<ProcessingClassificationStatus, string> = {
    classified: "Classified",
    unknown: "Unknown",
    unsupported: "Unsupported",
};

/** Awaiting = the case has no stored classification yet (null). */
export const CLASSIFICATION_AWAITING_LABEL = "Awaiting classification";

export function classificationBadgeFromStored(c: StoredProcessingClassification | null): ClassificationBadgeVM | null {
    if (!c) return null;
    return {
        status: c.status,
        label: c.label,
        confidence: c.status === "classified" ? c.confidence : null,
    };
}
