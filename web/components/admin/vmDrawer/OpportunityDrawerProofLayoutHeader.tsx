"use client";

/**
 * Live opportunity drawer header — composes VM controls into the layout runtime shell.
 */

import { X } from "lucide-react";
import ProofRecordModalHeaderShell, {
    type ProofHeaderTab,
} from "@/components/layout/proofShell/ProofRecordModalHeaderShell";
import { OpportunityDrawerHeaderControls } from "@/components/admin/opportunity/OpportunityDrawerHeaderControls";
import VmProgressiveStatusDropdown from "@/components/admin/vmDrawer/VmProgressiveStatusDropdown";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { OpportunityDrawerRegistryActionFeedback } from "@/lib/admin/actions/useOpportunityDrawerRegistryActionFeedback";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import type { OpportunityQueuePreviewSeed } from "@/lib/adminV2/bos/activeOperationalContext";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";

export type OpportunityDrawerProofLayoutHeaderProps = {
    title: string;
    locationLabel?: string | null;
    opportunityId: string;
    record: Record<string, unknown>;
    displayVm: OpportunityDrawerViewModel;
    queuePreviewSeed?: OpportunityQueuePreviewSeed | null;
    opportunitySingular: string;
    statusLabel: string | null;
    currentStatusKey: string;
    statusControl: StatusControlVm;
    statusCanMutate: boolean;
    tabs: readonly DrawerTabKey[];
    activeTab: DrawerTabKey;
    onTabSelect: (tab: DrawerTabKey) => void;
    lifecycleRail: React.ReactNode | null;
    onClose: () => void;
    onActionSelect: (action: ResolvedActionForClient) => void;
    actionLoadingKey: string | null;
    actionPreflightBlocked: ActionPreflightUiPayload | null;
    onDismissActionPreflightBlocked: () => void;
    registryActionFeedback: OpportunityDrawerRegistryActionFeedback | null;
    tabLabels: Partial<Record<DrawerTabKey, string>>;
};

export default function OpportunityDrawerProofLayoutHeader({
    title,
    locationLabel,
    opportunityId,
    record,
    displayVm,
    queuePreviewSeed,
    statusLabel,
    currentStatusKey,
    statusControl,
    statusCanMutate,
    tabs,
    activeTab,
    onTabSelect,
    lifecycleRail,
    onClose,
    onActionSelect,
    actionLoadingKey,
    actionPreflightBlocked,
    onDismissActionPreflightBlocked,
    registryActionFeedback,
    tabLabels,
}: OpportunityDrawerProofLayoutHeaderProps) {
    const proofTabs: ProofHeaderTab[] = tabs.map((key) => ({
        key,
        label: tabLabels[key] ?? key,
    }));

    const headerControlsRow = (
        <div
            className="flex shrink-0 flex-nowrap items-center justify-end gap-2 overflow-visible"
            data-proof-layout-header-controls-row="true"
        >
            <OpportunityDrawerHeaderControls
                opportunityId={opportunityId}
                overviewData={record}
                queuePreviewSeed={queuePreviewSeed}
                inquiryWorkflow
                menuActions={displayVm.actions.header_menu}
                showRegistryActions
                canMutate={statusCanMutate}
                actionLoadingKey={actionLoadingKey}
                onActionSelect={onActionSelect}
                layout="modal-actions"
                proofLayoutActions
                actionPreflightBlocked={actionPreflightBlocked}
                onDismissActionPreflightBlocked={onDismissActionPreflightBlocked}
                registryActionFeedback={registryActionFeedback}
                actionsDisabledReason={
                    actionLoadingKey ? "An action is running — wait for it to finish."
                    : !statusCanMutate ? "You don't have permission to run actions on this record."
                    :   null
                }
            />
            <div className="shrink-0" data-drawer-vm-status-rail="true">
                <VmProgressiveStatusDropdown
                    opportunityId={opportunityId}
                    firstPaintLabel={statusLabel ?? "—"}
                    currentStatusKey={currentStatusKey}
                    statusControl={statusControl}
                    canMutate={statusCanMutate}
                />
            </div>
        </div>
    );

    const closeButton = (
        <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-none p-1.5 text-[rgba(39,63,82,0.7)] hover:bg-[rgba(0,0,0,0.05)]"
            data-proof-layout-header-close="true"
        >
            <X className="h-4 w-4" aria-hidden />
        </button>
    );

    return (
        <ProofRecordModalHeaderShell
            title={title}
            locationLabel={locationLabel}
            statusControl={null}
            actionsControl={headerControlsRow}
            closeButton={closeButton}
            attention={null}
            tabs={proofTabs}
            activeTab={activeTab}
            onTabSelect={(tab) => onTabSelect(tab as DrawerTabKey)}
            lifecycleRail={lifecycleRail}
            dataAttribute="opportunity-drawer-runtime"
        />
    );
}
