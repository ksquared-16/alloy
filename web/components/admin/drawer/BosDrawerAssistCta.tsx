"use client";

import {
    BOS_ASSIST_CTA_DRAWER,
    triggerBosDrawerAssistHandoff,
} from "@/lib/adminV2/bos/bosDrawerAssistHandoff";
import type { OpportunityQueuePreviewSeed } from "@/lib/adminV2/bos/activeOperationalContext";
import { operatorDisplayNameFromEmail } from "@/lib/adminV2/bos/communication/operatorDisplayNameFromEmail";
import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import OpportunityDrawerHeaderActionButton from "@/components/admin/opportunity/OpportunityDrawerHeaderActionButton";
import OpportunityDrawerHeaderActionsPanel from "@/components/admin/opportunity/OpportunityDrawerHeaderActionsPanel";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";

type Props = {
    entityId: string;
    overviewData: Record<string, unknown>;
    opportunitySingular?: string;
    queuePreviewSeed?: OpportunityQueuePreviewSeed | null;
    /** Title-rail header — no card chrome wrapper. */
    bare?: boolean;
    inquiryWorkflow?: boolean;
    proofLayoutActions?: boolean;
    /** Bend Pine filled treatment for Lead command header. */
    actionVariant?: "default" | "juniper";
};

/**
 * Native Review Assist BOS handoff — shares header button primitive with registry drawer actions.
 */
export default function BosDrawerAssistCta({
    entityId,
    overviewData,
    opportunitySingular = "Inquiry",
    queuePreviewSeed = null,
    bare = false,
    inquiryWorkflow = true,
    proofLayoutActions = false,
    actionVariant = "default",
}: Props) {
    const globalAssistant = useGlobalAssistantOptional();
    const { userEmail } = useAdminAuth();
    const id = entityId.trim();
    if (!id || !globalAssistant || !isTaskAssistV1UiEnabled()) return null;

    const operatorDisplayName = operatorDisplayNameFromEmail(userEmail);

    const button = (
        <OpportunityDrawerHeaderActionButton
            label={BOS_ASSIST_CTA_DRAWER}
            inquiryWorkflow={inquiryWorkflow}
            proofLayoutActions={proofLayoutActions}
            actionVariant={actionVariant}
            leadingIcon={
                actionVariant === "juniper" ?
                    <BosMark size="sm" color="#ffffff" />
                :   <BosMark size="sm" horizon />
            }
            data-drawer-action="bos_assist"
            data-bos-assist-button="true"
            onClick={() =>
                triggerBosDrawerAssistHandoff({
                    globalAssistant,
                    entityId: id,
                    overviewData,
                    queuePreviewSeed,
                    opportunitySingular,
                    operatorDisplayName,
                })
            }
        />
    );

    if (bare) return button;

    return (
        <OpportunityDrawerHeaderActionsPanel inquiryWorkflow align="start" data-drawer-slot="bos_assist_cta">
            {button}
        </OpportunityDrawerHeaderActionsPanel>
    );
}
