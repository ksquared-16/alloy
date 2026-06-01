"use client";

import BosDrawerAssistCta from "@/components/admin/drawer/BosDrawerAssistCta";
import { DrawerHeaderAttentionBlock } from "@/components/admin/drawer/DrawerHeaderAttentionBlock";
import type { OpportunityQueuePreviewSeed } from "@/lib/adminV2/bos/activeOperationalContext";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { OpportunityDrawerHeaderActionsMenu } from "@/components/admin/opportunity/OpportunityDrawerHeaderActionsMenu";
import { ActionPreflightBlockedPanel } from "@/components/admin/opportunity/ActionPreflightBlockedPanel";
import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";

type Props = {
    opportunityId: string;
    overviewData: Record<string, unknown>;
    opportunitySingular?: string;
    queuePreviewSeed?: OpportunityQueuePreviewSeed | null;
    inquiryWorkflow?: boolean;
    menuActions: ResolvedActionForClient[];
    showRegistryActions: boolean;
    canMutate: boolean;
    actionLoadingKey?: string | null;
    onActionSelect: (action: ResolvedActionForClient) => void;
    actionPreflightBlocked?: ActionPreflightUiPayload | null;
    onDismissActionPreflightBlocked?: () => void;
};

/** Title rail: guidance in the header band; actions pinned far right (single row). */
export function OpportunityDrawerHeaderControls({
    opportunityId,
    overviewData,
    opportunitySingular = "Inquiry",
    queuePreviewSeed = null,
    inquiryWorkflow = false,
    menuActions,
    showRegistryActions,
    canMutate,
    actionLoadingKey = null,
    onActionSelect,
    actionPreflightBlocked = null,
    onDismissActionPreflightBlocked,
}: Props) {
    return (
        <div
            className="flex w-full min-w-0 max-w-full flex-col items-stretch gap-1"
            data-opportunity-header-controls="true"
        >
            <div
                className="flex w-full min-w-0 items-start gap-3"
                data-opportunity-header-controls-row="composed"
            >
                <div className="min-w-0 flex-1 self-center">
                    <DrawerHeaderAttentionBlock overviewData={overviewData} />
                </div>
                <div
                    className="flex shrink-0 flex-nowrap items-center justify-end gap-2 self-start"
                    data-opportunity-header-controls-row="actions"
                >
                    <BosDrawerAssistCta
                        bare
                        entityId={opportunityId}
                        overviewData={overviewData}
                        opportunitySingular={opportunitySingular}
                        queuePreviewSeed={queuePreviewSeed}
                        inquiryWorkflow={inquiryWorkflow}
                    />
                    {showRegistryActions ?
                        <OpportunityDrawerHeaderActionsMenu
                            actions={menuActions}
                            inquiryWorkflow={inquiryWorkflow}
                            disabled={!canMutate || !!actionLoadingKey}
                            busyKey={actionLoadingKey}
                            onSelect={onActionSelect}
                        />
                    :   null}
                </div>
            </div>
            {actionPreflightBlocked ?
                <ActionPreflightBlockedPanel
                    opportunityId={opportunityId}
                    preflight={actionPreflightBlocked}
                    onDismiss={onDismissActionPreflightBlocked}
                />
            :   null}
        </div>
    );
}
