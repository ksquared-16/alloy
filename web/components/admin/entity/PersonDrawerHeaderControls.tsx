"use client";

import type { ReactNode } from "react";

import BosDrawerAssistCta from "@/components/admin/drawer/BosDrawerAssistCta";
import { DrawerHeaderAttentionBlock } from "@/components/admin/drawer/DrawerHeaderAttentionBlock";
import { OpportunityDrawerHeaderActionsMenu } from "@/components/admin/opportunity/OpportunityDrawerHeaderActionsMenu";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { shouldRouteDrawerActionsToCommandRail } from "@/lib/bos/bosRightRailCopilotFlag";

type Props = {
    personId: string;
    overviewData: Record<string, unknown>;
    opportunitySingular?: string;
    /** Save / registry actions rendered on the top row beside Work with BOS. */
    actionsSlot?: ReactNode;
    /** Proof-layout header — actions row only (no attention block below). */
    proofLayoutActions?: boolean;
    menuActions?: ResolvedActionForClient[];
    showRegistryActions?: boolean;
    canMutate?: boolean;
    actionLoadingKey?: string | null;
    onActionSelect?: (action: ResolvedActionForClient) => void;
    actionsDisabledReason?: string | null;
};

/** Person drawer title-rail — controls top-right; attention context below (full width, left-aligned). */
export function PersonDrawerHeaderControls({
    personId,
    overviewData,
    opportunitySingular = "Person",
    actionsSlot = null,
    proofLayoutActions = false,
    menuActions = [],
    showRegistryActions = false,
    canMutate = false,
    actionLoadingKey = null,
    onActionSelect,
    actionsDisabledReason = null,
}: Props) {
    const routeActionsToRail = shouldRouteDrawerActionsToCommandRail();
    const actionsRow = (
        <div
            className="flex shrink-0 flex-nowrap items-center justify-end gap-2 overflow-visible"
            data-person-header-controls-row="actions"
        >
            <BosDrawerAssistCta
                bare
                entityId={personId}
                overviewData={overviewData}
                opportunitySingular={opportunitySingular}
                inquiryWorkflow={false}
                proofLayoutActions={proofLayoutActions}
                actionVariant="juniper"
            />
            {showRegistryActions && !routeActionsToRail ?
                <OpportunityDrawerHeaderActionsMenu
                    actions={menuActions}
                    disabled={!canMutate || menuActions.length === 0}
                    disabledReason={actionsDisabledReason}
                    busyKey={actionLoadingKey}
                    onSelect={onActionSelect ?? (() => undefined)}
                    proofLayoutActions={proofLayoutActions}
                />
            :   actionsSlot}
        </div>
    );

    if (proofLayoutActions) {
        return actionsRow;
    }

    return (
        <div className="flex w-full min-w-0 max-w-full flex-col items-stretch gap-1" data-person-header-controls="true">
            {actionsRow}
            <DrawerHeaderAttentionBlock overviewData={overviewData} />
        </div>
    );
}
