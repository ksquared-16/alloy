import type { PacketReviewInsightV1 } from "@/lib/forms/packets/packetReviewInsightTypes";
import {
    bosReviewReadinessPresentation,
    type BosReviewAssistModel,
} from "@/lib/forms/review/bosReviewAssistPresentation";

/** Map P2-5 insight contract into UX-H assist panel model. */
export function bosReviewAssistFromPacketInsight(insight: PacketReviewInsightV1): BosReviewAssistModel {
    const readiness = bosReviewReadinessPresentation(insight.readiness_state);
    const summary =
        insight.summary_bullets[0]?.trim() ??
        "Review submitted answers and documents, then record your decision.";
    return {
        readinessKey: insight.readiness_state,
        readinessLabel: readiness.label,
        readinessTone: readiness.tone,
        summary,
        summaryBullets: insight.summary_bullets,
        keyChanges: insight.key_changes,
        attentionItems: insight.attention_items,
        suggestedFocus: insight.suggested_focus,
        reviewPaths: insight.review_paths,
        confidenceNotes: insight.confidence_notes,
        humanAuthorityNote: insight.human_authority_note,
        checklist: insight.checklist,
    };
}
