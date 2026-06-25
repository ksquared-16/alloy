"use client";

import { useMemo } from "react";

import FocusPanelCompactHeader from "@/components/admin/focusPanel/FocusPanelCompactHeader";
import { OpportunityDrawerHeaderControls } from "@/components/admin/opportunity/OpportunityDrawerHeaderControls";
import VmProgressiveStatusDropdown from "@/components/admin/vmDrawer/VmProgressiveStatusDropdown";
import { useActiveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { OpportunityDrawerRegistryActionFeedback } from "@/lib/admin/actions/useOpportunityDrawerRegistryActionFeedback";
import type { RecordManageMenuActionKey, RecordManageMenuItem } from "@/lib/admin/recordManage/types";
import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import type { OpportunityQueuePreviewSeed } from "@/lib/adminV2/bos/activeOperationalContext";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

export type OpportunityFocusPanelHeaderProps = {
    title: string;
    opportunityId: string;
    record: Record<string, unknown>;
    displayVm: OpportunityDrawerViewModel;
    queuePreviewSeed?: OpportunityQueuePreviewSeed | null;
    opportunitySingular: string;
    statusLabel: string | null;
    currentStatusKey: string;
    statusControl: StatusControlVm;
    statusCanMutate: boolean;
    manageCanMutate: boolean;
    activeMode: FocusPanelMode;
    onModeChange: (mode: FocusPanelMode) => void;
    onClose: () => void;
    manageMenuItems: RecordManageMenuItem[];
    onManageSelect: (key: RecordManageMenuActionKey) => void;
    manageBusyKey?: RecordManageMenuActionKey | null;
    actionPreflightBlocked: ActionPreflightUiPayload | null;
    onDismissActionPreflightBlocked: () => void;
    registryActionFeedback: OpportunityDrawerRegistryActionFeedback | null;
    primaryHeaderAction?: ResolvedActionForClient | null;
    onPrimaryHeaderAction?: (action: ResolvedActionForClient) => void;
    primaryActionLoading?: boolean;
};

export default function OpportunityFocusPanelHeader({
    title,
    opportunityId,
    record,
    displayVm,
    queuePreviewSeed,
    opportunitySingular,
    statusLabel,
    currentStatusKey,
    statusControl,
    statusCanMutate,
    manageCanMutate,
    activeMode,
    onModeChange,
    onClose,
    manageMenuItems,
    onManageSelect,
    manageBusyKey = null,
    actionPreflightBlocked,
    onDismissActionPreflightBlocked,
    registryActionFeedback,
    primaryHeaderAction,
    onPrimaryHeaderAction,
    primaryActionLoading = false,
}: OpportunityFocusPanelHeaderProps) {
    const perspective = useActiveRuntimePerspective();
    const stageRuntime = displayVm.workspace.stage_work_runtime;

    const missionLine = useMemo(() => {
        return (
            perspective?.defaultMission?.trim() ||
            perspective?.label?.trim() ||
            stageRuntime?.purpose?.trim() ||
            null
        );
    }, [perspective, stageRuntime?.purpose]);

    const primaryAction =
        primaryHeaderAction && onPrimaryHeaderAction ?
            <button
                type="button"
                className="alloy-os-fp-header-compact__primary-btn"
                disabled={primaryActionLoading}
                onClick={() => onPrimaryHeaderAction(primaryHeaderAction)}
            >
                {primaryHeaderAction.label}
            </button>
        :   null;

    const statusChip = (
        <VmProgressiveStatusDropdown
            opportunityId={opportunityId}
            firstPaintLabel={statusLabel ?? "—"}
            currentStatusKey={currentStatusKey}
            statusControl={statusControl}
            canMutate={statusCanMutate}
        />
    );

    const secondaryActions = (
        <OpportunityDrawerHeaderControls
            opportunityId={opportunityId}
            overviewData={record}
            queuePreviewSeed={queuePreviewSeed}
            inquiryWorkflow
            manageMenuItems={manageMenuItems}
            canMutate={manageCanMutate}
            manageBusyKey={manageBusyKey}
            onManageSelect={onManageSelect}
            layout="modal-actions"
            proofLayoutActions
            bosActionVariant="juniper"
            actionPreflightBlocked={actionPreflightBlocked}
            onDismissActionPreflightBlocked={onDismissActionPreflightBlocked}
            registryActionFeedback={registryActionFeedback}
            manageDisabledReason={
                manageBusyKey ? "A manage action is running — wait for it to finish."
                : !manageCanMutate ? "You don't have permission to manage this record."
                :   null
            }
        />
    );

    return (
        <FocusPanelCompactHeader
            subjectTitle={title}
            missionLine={missionLine}
            stageLabel={stageRuntime?.stage_label ?? statusLabel}
            statusChip={statusChip}
            primaryAction={primaryAction}
            secondaryActions={secondaryActions}
            activeMode={activeMode}
            onModeChange={onModeChange}
            onClose={onClose}
        />
    );
}
