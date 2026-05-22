/**
 * Packet review presentation — re-exports shared Forms review layer for backward compatibility.
 */
export {
    operatorReviewStatusLabel,
    isPacketReviewAwaitingDecision,
    formatFormsProvenanceLine as formatPacketReviewProvenanceLine,
} from "@/lib/forms/review/formsReviewPresentation";

export type { DocumentProvenanceV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

export {
    artifactKindBadgeClass,
    formatPacketDocumentProvenanceLine,
    formatShortDate,
} from "@/lib/forms/packets/documentProvenanceDisplay";
