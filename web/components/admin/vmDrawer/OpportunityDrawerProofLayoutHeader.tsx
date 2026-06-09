"use client";

/**
 * Live opportunity drawer header — composes VM controls into the layout runtime shell.
 */

import { useMemo, type ReactNode } from "react";
import { X } from "lucide-react";
import LeadDrawerCommandHeader from "@/components/layout/lead/LeadDrawerCommandHeader";
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
import { resolveLeadDrawerHeaderContext } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";

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
    /** When true, render Lead command-center header anatomy (Patch 8). */
    leadCompositionActive?: boolean;
    /** Queue prev/next — above tabs, below header actions/status. */
    queueNavigation?: ReactNode | null;
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
    leadCompositionActive = false,
    queueNavigation = null,
}: OpportunityDrawerProofLayoutHeaderProps) {
    const proofTabs: ProofHeaderTab[] = tabs.map((key) => ({
        key,
        label: tabLabels[key] ?? key,
    }));

    const titleContext = useMemo(() => {
        const ctx = resolveLeadDrawerHeaderContext(record);
        const parts: ReactNode[] = [];
        if (ctx.primaryContactLabel) {
            parts.push(
                <span key="contact" className="font-medium text-alloy-midnight/75">
                    {ctx.primaryContactLabel}
                </span>,
            );
        }
        if (ctx.contactLine) {
            parts.push(
                <span key="line" className="text-alloy-midnight/45">
                    {ctx.contactLine}
                </span>,
            );
        }
        if (ctx.householdLabel && ctx.householdLabel !== ctx.primaryContactLabel) {
            parts.push(
                <span key="household" className="text-alloy-midnight/45">
                    {ctx.householdLabel}
                </span>,
            );
        }
        if (parts.length === 0) return null;
        return parts.reduce<ReactNode[]>((acc, node, index) => {
            if (index > 0) acc.push(<span key={`sep-${index}`} className="text-alloy-midnight/25" aria-hidden>·</span>);
            acc.push(node);
            return acc;
        }, []);
    }, [record]);

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
                bosActionVariant={leadCompositionActive ? "juniper" : "default"}
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

    return leadCompositionActive ?
            <LeadDrawerCommandHeader
                title={title}
                record={record}
                locationLabel={locationLabel}
                tabs={proofTabs}
                activeTab={activeTab}
                onTabSelect={(tab) => onTabSelect(tab as DrawerTabKey)}
                lifecycleRail={lifecycleRail}
                actionsControl={headerControlsRow}
                closeButton={closeButton}
                queueNavigation={queueNavigation}
            />
        :   <ProofRecordModalHeaderShell
            title={title}
            locationLabel={locationLabel}
            titleContext={titleContext}
            showLocationChip
            statusControl={null}
            actionsControl={headerControlsRow}
            closeButton={closeButton}
            attention={null}
            tabs={proofTabs}
            activeTab={activeTab}
            onTabSelect={(tab) => onTabSelect(tab as DrawerTabKey)}
            lifecycleRail={lifecycleRail}
            dataAttribute="opportunity-drawer-runtime"
            queueNavigation={queueNavigation}
        />;
}
