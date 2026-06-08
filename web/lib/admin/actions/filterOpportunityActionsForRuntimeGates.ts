import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { opportunityHasReviewableEnrollmentPacket } from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";

function actionListIncludesReviewPacket(actions: ResolvedActionsBySlot): boolean {
    for (const slot of Object.values(actions)) {
        if (!Array.isArray(slot)) continue;
        if (slot.some((a) => a.key === "review_enrollment_packet")) return true;
    }
    return false;
}

function stripReviewPacketFromSlot(list: ResolvedActionForClient[] | undefined): ResolvedActionForClient[] {
    return (list ?? []).filter((a) => a.key !== "review_enrollment_packet");
}

/** Hide review_enrollment_packet when no completed session awaits operator review. */
export async function filterOpportunityActionsForRuntimeGates(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string | null | undefined,
    entityId: string | null | undefined,
    actions: ResolvedActionsBySlot
): Promise<ResolvedActionsBySlot> {
    const et = (entityType ?? "").trim().toLowerCase();
    const id = (entityId ?? "").trim();
    if ((et !== "opportunity" && et !== "opportunities") || !id) return actions;
    if (!actionListIncludesReviewPacket(actions)) return actions;

    const hasReviewable = await opportunityHasReviewableEnrollmentPacket(supabase, orgId, id);
    if (hasReviewable) return actions;

    return {
        ...actions,
        primary: stripReviewPacketFromSlot(actions.primary),
        secondary: stripReviewPacketFromSlot(actions.secondary),
        overflow: stripReviewPacketFromSlot(actions.overflow),
        header: stripReviewPacketFromSlot(actions.header),
        right_rail: stripReviewPacketFromSlot(actions.right_rail),
        row_inline: stripReviewPacketFromSlot(actions.row_inline),
    };
}
