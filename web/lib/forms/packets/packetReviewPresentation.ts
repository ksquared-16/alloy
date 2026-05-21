import type { DocumentProvenanceV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import {
    artifactKindBadgeClass,
    formatPacketDocumentProvenanceLine,
    formatShortDate,
} from "@/lib/forms/packets/documentProvenanceDisplay";

/** @deprecated Use `formatPacketDocumentProvenanceLine` from `documentProvenanceDisplay`. */
export const formatPacketReviewProvenanceLine = formatPacketDocumentProvenanceLine;

export { formatShortDate, artifactKindBadgeClass };

export function operatorReviewStatusLabel(status: string | null): string {
    if (status == null) return "Needs review";
    const s = status.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Matches review PATCH gate on completed sessions. */
export function isPacketReviewAwaitingDecision(
    sessionStatus: string,
    operatorReviewStatus: string | null
): boolean {
    return (
        sessionStatus === "completed" &&
        (operatorReviewStatus == null ||
            operatorReviewStatus === "needs_review" ||
            operatorReviewStatus === "needs_correction")
    );
}

export type { DocumentProvenanceV1 };
