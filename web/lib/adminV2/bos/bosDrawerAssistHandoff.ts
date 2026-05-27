import { buildOpportunityOperationalContext, type OpportunityQueuePreviewSeed } from "@/lib/adminV2/bos/activeOperationalContext";
import { operatorDisplayNameFromEmail } from "@/lib/adminV2/bos/communication/operatorDisplayNameFromEmail";
import {
    buildBosAssistHandoffPackage,
    buildOverviewDataForBosHandoff,
    type QueueBosHandoffPreview,
} from "@/lib/adminV2/bos/bosAssistHandoffRouting";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import type { QueueOperationalReadPreviewSlot } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";

type GlobalAssistantHandoff = NonNullable<ReturnType<typeof useGlobalAssistantOptional>>;

/** Native Review Assist CTA — not a configurable record action. */
export const BOS_ASSIST_CTA_DRAWER = "Work with BOS";

export const ADMINV2_ASK_BOS_HANDOFF_EVENT = "adminv2:ask-bos-handoff";

export type AskBosHandoffDetail = {
    opportunity_id: string;
    display_name?: string | null;
    /** Queue L0 operational read — grounds assist when entity GET is not loaded. */
    queue_preview?: QueueBosHandoffPreview | null;
};

/** Build queue preview payload from CRM compact operational read slot. */
export function queueBosHandoffPreviewFromOperationalRead(
    slot: QueueOperationalReadPreviewSlot | null | undefined
): QueueBosHandoffPreview | null {
    const doNext = slot?.operationalRead?.trim();
    if (!doNext || !slot) return null;
    return {
        doNext,
        whyNow: slot.whyNow?.trim() || null,
        urgencyBand: slot.urgencyBand ?? null,
    };
}

/** Queue row / drawer registry action — opens BOS with record context (no autonomous apply). */
export function launchAdminV2AskBos(detail: AskBosHandoffDetail): void {
    if (typeof window === "undefined") return;
    const opportunityId = detail.opportunity_id.trim();
    if (!opportunityId) return;
    window.dispatchEvent(
        new CustomEvent<AskBosHandoffDetail>(ADMINV2_ASK_BOS_HANDOFF_EVENT, {
            detail: { opportunity_id: opportunityId, display_name: detail.display_name ?? null },
        })
    );
}

export function triggerBosDrawerAssistHandoff(args: {
    globalAssistant: GlobalAssistantHandoff;
    entityId: string;
    overviewData: Record<string, unknown>;
    queuePreviewSeed?: OpportunityQueuePreviewSeed | null;
    opportunitySingular?: string;
    operatorDisplayName?: string | null;
}): void {
    const entityId = args.entityId.trim();
    if (!entityId) return;
    const entityLabel =
        String((args.overviewData as { name?: string }).name ?? "").trim() ||
        args.opportunitySingular?.trim() ||
        "Inquiry";
    const overview = buildOverviewDataForBosHandoff({
        entityId,
        entityLabel,
        overviewData: args.overviewData,
    });
    args.globalAssistant.setAssistantContext(
        buildOpportunityOperationalContext({
            entityId,
            overviewData: overview,
            queuePreviewSeed: args.queuePreviewSeed ?? null,
            opportunitySingular: args.opportunitySingular?.trim() || "Inquiry",
            sourceSurface: "opportunity_drawer",
        })
    );
    const handoff = buildBosAssistHandoffPackage({
        entityLabel,
        overviewData: overview,
        operatorDisplayName: args.operatorDisplayName ?? null,
    });
    args.globalAssistant.focusCommandBar({
        expandThread: true,
        seedCommand: handoff.seedCommand,
        preferMode: "task_assist",
        autoSubmitSeedCommand: true,
        taskAssistHandoffIntent: handoff.taskAssistIntent,
        taskAssistHandoffBootstrap: handoff.taskAssistBootstrap,
    });
}
