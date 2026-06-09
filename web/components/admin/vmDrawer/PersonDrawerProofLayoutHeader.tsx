"use client";

/**
 * Live person/child drawer header — composes VM controls into the layout runtime shell.
 */

import { X } from "lucide-react";
import ProofRecordModalHeaderShell, {
    type ProofHeaderTab,
} from "@/components/layout/proofShell/ProofRecordModalHeaderShell";
import PersonDrawerCommandHeader from "@/components/layout/person/PersonDrawerCommandHeader";
import { PersonDrawerHeaderControls } from "@/components/admin/entity/PersonDrawerHeaderControls";
import VmPersonStatusControl from "@/components/admin/vmDrawer/VmPersonStatusControl";
import type { DrawerTabKey } from "@/lib/entityPresentation";

export type PersonDrawerProofLayoutHeaderProps = {
    title: string;
    personId: string;
    record: Record<string, unknown>;
    entityLabel: string;
    statusLabel: string | null;
    canMutate: boolean;
    tabs: readonly DrawerTabKey[];
    activeTab: DrawerTabKey;
    onTabSelect: (tab: DrawerTabKey) => void;
    lifecycleRail: React.ReactNode | null;
    onClose: () => void;
    tabLabels: Partial<Record<DrawerTabKey, string>>;
    backLink?: { label: string; onClick: () => void } | null;
    dataAttribute?: string;
    personCompositionActive?: boolean;
};

export default function PersonDrawerProofLayoutHeader({
    title,
    personId,
    record,
    entityLabel,
    statusLabel,
    canMutate,
    tabs,
    activeTab,
    onTabSelect,
    lifecycleRail,
    onClose,
    tabLabels,
    backLink,
    dataAttribute = "person-drawer-runtime",
    personCompositionActive = false,
}: PersonDrawerProofLayoutHeaderProps) {
    const proofTabs: ProofHeaderTab[] = tabs.map((key) => ({
        key,
        label: tabLabels[key] ?? key,
    }));

    const headerControlsRow = (
        <div
            className="flex shrink-0 flex-nowrap items-center justify-end gap-2 overflow-visible"
            data-proof-layout-header-controls-row="true"
        >
            <PersonDrawerHeaderControls
                personId={personId}
                overviewData={record}
                opportunitySingular={entityLabel}
                proofLayoutActions
                showRegistryActions
                menuActions={[]}
                canMutate={canMutate}
                actionsDisabledReason="Person drawer actions are not configured yet."
            />
            <div className="shrink-0" data-drawer-vm-status-rail="true">
                <VmPersonStatusControl statusLabel={statusLabel} entityLabel={`${entityLabel} status`} />
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

    const titleNode =
        backLink ?
            <div className="min-w-0">
                <span className="break-words text-xl font-bold leading-snug text-[#273F52]">{title}</span>
                <div className="mt-0.5" data-person-drawer-proof-back-link="true">
                    <button
                        type="button"
                        onClick={backLink.onClick}
                        className="text-[12px] font-medium text-alloy-blue hover:underline"
                        data-record-drawer-back-link="true"
                    >
                        {backLink.label}
                    </button>
                </div>
            </div>
        :   title;

    if (personCompositionActive) {
        return (
            <PersonDrawerCommandHeader
                title={titleNode}
                record={record}
                tabs={proofTabs}
                activeTab={activeTab}
                onTabSelect={(tab) => onTabSelect(tab as DrawerTabKey)}
                actionsControl={headerControlsRow}
                closeButton={closeButton}
            />
        );
    }

    return (
        <ProofRecordModalHeaderShell
            title={titleNode}
            showLocationChip={false}
            statusControl={null}
            actionsControl={headerControlsRow}
            closeButton={closeButton}
            attention={null}
            tabs={proofTabs}
            activeTab={activeTab}
            onTabSelect={(tab) => onTabSelect(tab as DrawerTabKey)}
            lifecycleRail={lifecycleRail}
            dataAttribute={dataAttribute}
        />
    );
}
