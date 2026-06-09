"use client";

import BosDrawerAssistCta from "@/components/admin/drawer/BosDrawerAssistCta";
import { DrawerHeaderAttentionBlock } from "@/components/admin/drawer/DrawerHeaderAttentionBlock";
import type { OpportunityQueuePreviewSeed } from "@/lib/adminV2/bos/activeOperationalContext";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { OpportunityDrawerHeaderActionsMenu } from "@/components/admin/opportunity/OpportunityDrawerHeaderActionsMenu";
import { ActionPreflightBlockedPanel } from "@/components/admin/opportunity/ActionPreflightBlockedPanel";
import { OpportunityDrawerRegistryActionFeedbackBanner } from "@/components/admin/opportunity/OpportunityDrawerRegistryActionFeedbackBanner";
import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import type { OpportunityDrawerRegistryActionFeedback } from "@/lib/admin/actions/useOpportunityDrawerRegistryActionFeedback";
import { DRAWER_HEADER_ATTENTION_CENTER_COLUMN_CLASS } from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";

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
    registryActionFeedback?: OpportunityDrawerRegistryActionFeedback | null;
    /** Explains why the Actions menu is disabled (read-only record, loading, etc.). */
    actionsDisabledReason?: string | null;
    /**
     * `composed` — legacy sidebar: attention + actions in one shrink-0 right column.
     * `modal-attention` / `modal-actions` — AdminV2 center modal three-column header.
     */
    layout?: "composed" | "modal-attention" | "modal-actions";
    proofLayoutActions?: boolean;
    bosActionVariant?: "default" | "juniper";
};

function OpportunityDrawerHeaderActionsRow({
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
    disabledReason = null,
    proofLayoutActions = false,
    bosActionVariant = "default",
}: Pick<
    Props,
    | "opportunityId"
    | "overviewData"
    | "opportunitySingular"
    | "queuePreviewSeed"
    | "inquiryWorkflow"
    | "menuActions"
    | "showRegistryActions"
    | "canMutate"
    | "actionLoadingKey"
    | "onActionSelect"
    | "proofLayoutActions"
    | "bosActionVariant"
> & { disabledReason?: string | null }) {
    return (
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
                proofLayoutActions={proofLayoutActions}
                actionVariant={bosActionVariant}
            />
            {showRegistryActions ?
                <OpportunityDrawerHeaderActionsMenu
                    actions={menuActions}
                    inquiryWorkflow={inquiryWorkflow}
                    proofLayoutActions={proofLayoutActions}
                    disabled={!canMutate || !!actionLoadingKey}
                    disabledReason={
                        disabledReason ??
                        (!canMutate ? "You don't have permission to run actions on this record." : null)
                    }
                    busyKey={actionLoadingKey}
                    onSelect={onActionSelect}
                />
            :   null}
        </div>
    );
}

/** Title rail: modal uses three columns; sidebar keeps composed attention + actions block. */
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
    registryActionFeedback = null,
    actionsDisabledReason = null,
    layout = "composed",
    proofLayoutActions = false,
    bosActionVariant = "default",
}: Props) {
    if (layout === "modal-attention") {
        return (
            <div
                className={DRAWER_HEADER_ATTENTION_CENTER_COLUMN_CLASS}
                data-opportunity-header-controls="true"
                data-opportunity-header-controls-layout="modal-attention"
            >
                <DrawerHeaderAttentionBlock overviewData={overviewData} />
            </div>
        );
    }

    if (layout === "modal-actions") {
        return (
            <div
                className="flex w-auto min-w-0 shrink-0 flex-col items-stretch gap-0.5"
                data-opportunity-header-controls="true"
                data-opportunity-header-controls-layout="modal-actions"
            >
                <OpportunityDrawerHeaderActionsRow
                    opportunityId={opportunityId}
                    overviewData={overviewData}
                    opportunitySingular={opportunitySingular}
                    queuePreviewSeed={queuePreviewSeed}
                    inquiryWorkflow={inquiryWorkflow}
                    menuActions={menuActions}
                    showRegistryActions={showRegistryActions}
                    canMutate={canMutate}
                    actionLoadingKey={actionLoadingKey}
                    onActionSelect={onActionSelect}
                    disabledReason={actionsDisabledReason}
                    proofLayoutActions={proofLayoutActions}
                    bosActionVariant={bosActionVariant}
                />
                {actionPreflightBlocked ?
                    <ActionPreflightBlockedPanel
                        opportunityId={opportunityId}
                        preflight={actionPreflightBlocked}
                        onDismiss={onDismissActionPreflightBlocked}
                    />
                :   null}
                {registryActionFeedback ?
                    <OpportunityDrawerRegistryActionFeedbackBanner feedback={registryActionFeedback} />
                :   null}
            </div>
        );
    }

    return (
        <div
            className="flex w-full min-w-0 max-w-full flex-col items-stretch gap-0.5"
            data-opportunity-header-controls="true"
            data-opportunity-header-controls-layout="composed"
        >
            <div
                className="flex w-full min-w-0 items-start gap-2.5"
                data-opportunity-header-controls-row="composed"
            >
                <div className="min-w-0 flex-1 self-center" data-opportunity-header-controls-row="attention">
                    <DrawerHeaderAttentionBlock overviewData={overviewData} />
                </div>
                <OpportunityDrawerHeaderActionsRow
                    opportunityId={opportunityId}
                    overviewData={overviewData}
                    opportunitySingular={opportunitySingular}
                    queuePreviewSeed={queuePreviewSeed}
                    inquiryWorkflow={inquiryWorkflow}
                    menuActions={menuActions}
                    showRegistryActions={showRegistryActions}
                    canMutate={canMutate}
                    actionLoadingKey={actionLoadingKey}
                    onActionSelect={onActionSelect}
                    disabledReason={actionsDisabledReason}
                    proofLayoutActions={proofLayoutActions}
                    bosActionVariant={bosActionVariant}
                />
            </div>
            {actionPreflightBlocked ?
                <ActionPreflightBlockedPanel
                    opportunityId={opportunityId}
                    preflight={actionPreflightBlocked}
                    onDismiss={onDismissActionPreflightBlocked}
                />
            :   null}
            {registryActionFeedback ?
                <OpportunityDrawerRegistryActionFeedbackBanner feedback={registryActionFeedback} />
            :   null}
        </div>
    );
}
