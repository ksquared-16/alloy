"use client";

import VmDrawerHeaderStatusSelect from "@/components/admin/vmDrawer/VmDrawerHeaderStatusSelect";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";

type Props = {
    opportunityId: string;
    firstPaintLabel: string;
    currentStatusKey: string;
    statusControl: StatusControlVm | null | undefined;
    canMutate: boolean;
    onDebugModeChange?: (mode: "vm-readonly-pill" | "vm-dropdown") => void;
};

/** Opportunity drawer header status — first-click native select. */
export default function VmProgressiveStatusDropdown({
    opportunityId,
    firstPaintLabel,
    currentStatusKey,
    statusControl,
    canMutate,
    onDebugModeChange,
}: Props) {
    return (
        <VmDrawerHeaderStatusSelect
            entityKind="opportunities"
            entityId={opportunityId}
            entityLabel="Opportunity"
            currentStatusKey={currentStatusKey}
            displayLabel={firstPaintLabel}
            statusControl={statusControl}
            canMutate={canMutate}
            rootMarker="opportunity-drawer-vm-status-control"
            onDebugModeChange={onDebugModeChange}
        />
    );
}
