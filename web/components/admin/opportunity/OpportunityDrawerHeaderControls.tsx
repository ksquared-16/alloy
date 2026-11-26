"use client";

import BosDrawerAssistCta from "@/components/admin/drawer/BosDrawerAssistCta";
import { DrawerHeaderAttentionBlock } from "@/components/admin/drawer/DrawerHeaderAttentionBlock";
import { RecordDrawerManageMenu } from "@/components/admin/drawer/record/RecordDrawerManageMenu";
import type { OpportunityQueuePreviewSeed } from "@/lib/adminV2/bos/activeOperationalContext";
import { ActionPreflightBlockedPanel } from "@/components/admin/opportunity/ActionPreflightBlockedPanel";
import { OpportunityDrawerRegistryActionFeedbackBanner } from "@/components/admin/opportunity/OpportunityDrawerRegistryActionFeedbackBanner";
import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { OpportunityDrawerRegistryActionFeedback } from "@/lib/admin/actions/useOpportunityDrawerRegistryActionFeedback";
import { DRAWER_HEADER_ATTENTION_CENTER_COLUMN_CLASS } from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";
import type { RecordManageMenuActionKey, RecordManageMenuItem } from "@/lib/admin/recordManage/types";

type Props = {
    opportunityId: string;
    overviewData: Record<string, unknown>;
    opportunitySingular?: string;
    queuePreviewSeed?: OpportunityQueuePreviewSeed | null;
    inquiryWorkflow?: boolean;
    /** Registry-backed subject actions — same source as command rail header_menu. */
    subjectManageActions?: ResolvedActionForClient[];
    onSubjectManageActionSelect?: (action: ResolvedActionForClient) => void;
    subjectManageActionLoadingKey?: string | null;
    /** Legacy entity admin stubs — non-opportunity drawers only. */
    manageMenuItems?: RecordManageMenuItem[];
    canMutate: boolean;
    manageBusyKey?: RecordManageMenuActionKey | null;
    onManageSelect?: (key: RecordManageMenuActionKey) => void;
    actionPreflightBlocked?: ActionPreflightUiPayload | null;
    onDismissActionPreflightBlocked?: () => void;
    registryActionFeedback?: OpportunityDrawerRegistryActionFeedback | null;
    /** Explains why the Manage menu is disabled (read-only record, loading, etc.). */
    manageDisabledReason?: string | null;
    /**
     * `composed` — legacy sidebar: attention + actions in one shrink-0 right column.
     * `modal-attention` / `modal-actions` — AdminV2 center modal three-column header.
     */
    layout?: "composed" | "modal-attention" | "modal-actions";
    proofLayoutActions?: boolean;
    bosActionVariant?: "default" | "juniper";
    /** Focus Panel header uses short "BOS" label; drawer default remains Work with BOS. */
    bosAssistLabel?: string;
    /** Focus Panel: BOS lives in the floating chat — omit header BOS CTA. */
    hideBos?: boolean;
};

function OpportunityDrawerHeaderManageRow({
    opportunityId,
    overviewData,
    opportunitySingular = "Inquiry",
    queuePreviewSeed = null,
    inquiryWorkflow = false,
    subjectManageActions,
    onSubjectManageActionSelect,
    subjectManageActionLoadingKey = null,
    manageMenuItems = [],
    canMutate,
    manageBusyKey = null,
    onManageSelect,
    disabledReason = null,
    proofLayoutActions = false,
    bosActionVariant = "default",
    bosAssistLabel,
    hideBos = false,
}: Pick<
    Props,
    | "opportunityId"
    | "overviewData"
    | "opportunitySingular"
    | "queuePreviewSeed"
    | "inquiryWorkflow"
    | "subjectManageActions"
    | "onSubjectManageActionSelect"
    | "subjectManageActionLoadingKey"
    | "manageMenuItems"
    | "canMutate"
    | "manageBusyKey"
    | "onManageSelect"
    | "proofLayoutActions"
    | "bosActionVariant"
    | "bosAssistLabel"
    | "hideBos"
> & { disabledReason?: string | null }) {
    const registryMode = subjectManageActions !== undefined;
    const actionBusy = registryMode
        ? Boolean(subjectManageActionLoadingKey)
        : Boolean(manageBusyKey);

    return (
        <div
            className="flex shrink-0 flex-nowrap items-center justify-end gap-2 self-start"
            data-opportunity-header-controls-row="actions"
        >
            {hideBos ? null : (
                <BosDrawerAssistCta
                    bare
                    entityId={opportunityId}
                    overviewData={overviewData}
                    opportunitySingular={opportunitySingular}
                    queuePreviewSeed={queuePreviewSeed}
                    inquiryWorkflow={inquiryWorkflow}
                    proofLayoutActions={proofLayoutActions}
                    actionVariant={bosActionVariant}
                    label={bosAssistLabel}
                />
            )}
            <RecordDrawerManageMenu
                registryActions={registryMode ? subjectManageActions : undefined}
                items={registryMode ? undefined : manageMenuItems}
                inquiryWorkflow={inquiryWorkflow}
                proofLayoutActions={proofLayoutActions}
                disabled={!canMutate || actionBusy}
                disabledReason={
                    disabledReason ??
                    (!canMutate ? "You don't have permission to manage this record." : null)
                }
                busyKey={manageBusyKey}
                onSelect={onManageSelect}
                onRegistryActionSelect={onSubjectManageActionSelect}
                registryActionLoadingKey={subjectManageActionLoadingKey}
            />
        </div>
    );
}

/** Title rail: modal uses three columns; sidebar keeps composed attention + manage block. */
export function OpportunityDrawerHeaderControls({
    opportunityId,
    overviewData,
    opportunitySingular = "Inquiry",
    queuePreviewSeed = null,
    inquiryWorkflow = false,
    subjectManageActions,
    onSubjectManageActionSelect,
    subjectManageActionLoadingKey = null,
    manageMenuItems = [],
    canMutate,
    manageBusyKey = null,
    onManageSelect,
    actionPreflightBlocked = null,
    onDismissActionPreflightBlocked,
    registryActionFeedback = null,
    manageDisabledReason = null,
    layout = "composed",
    proofLayoutActions = false,
    bosActionVariant = "default",
    bosAssistLabel,
    hideBos = false,
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
                <OpportunityDrawerHeaderManageRow
                    opportunityId={opportunityId}
                    overviewData={overviewData}
                    opportunitySingular={opportunitySingular}
                    queuePreviewSeed={queuePreviewSeed}
                    inquiryWorkflow={inquiryWorkflow}
                    subjectManageActions={subjectManageActions}
                    onSubjectManageActionSelect={onSubjectManageActionSelect}
                    subjectManageActionLoadingKey={subjectManageActionLoadingKey}
                    manageMenuItems={manageMenuItems}
                    canMutate={canMutate}
                    manageBusyKey={manageBusyKey}
                    onManageSelect={onManageSelect}
                    disabledReason={manageDisabledReason}
                    proofLayoutActions={proofLayoutActions}
                    bosActionVariant={bosActionVariant}
                    bosAssistLabel={bosAssistLabel}
                    hideBos={hideBos}
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
                <OpportunityDrawerHeaderManageRow
                    opportunityId={opportunityId}
                    overviewData={overviewData}
                    opportunitySingular={opportunitySingular}
                    queuePreviewSeed={queuePreviewSeed}
                    inquiryWorkflow={inquiryWorkflow}
                    subjectManageActions={subjectManageActions}
                    onSubjectManageActionSelect={onSubjectManageActionSelect}
                    subjectManageActionLoadingKey={subjectManageActionLoadingKey}
                    manageMenuItems={manageMenuItems}
                    canMutate={canMutate}
                    manageBusyKey={manageBusyKey}
                    onManageSelect={onManageSelect}
                    disabledReason={manageDisabledReason}
                    proofLayoutActions={proofLayoutActions}
                    bosActionVariant={bosActionVariant}
                    bosAssistLabel={bosAssistLabel}
                    hideBos={hideBos}
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
