"use client";

import VmDrawerHeaderStatusSelect from "@/components/admin/vmDrawer/VmDrawerHeaderStatusSelect";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";
import type { PersonStatusProfileKey } from "@/lib/admin/person/personStatusApplicability";

type Props = {
    personId: string;
    entityLabel?: string;
    statusLabel: string | null | undefined;
    currentStatusKey: string;
    statusControl: StatusControlVm | null | undefined;
    canMutate: boolean;
    statusProfile?: PersonStatusProfileKey | null;
    childSurface?: boolean;
};

/** Person/child drawer header status — Alloy menu on first click when editable. */
export default function VmPersonStatusControl({
    personId,
    entityLabel = "Person",
    statusLabel,
    currentStatusKey,
    statusControl,
    canMutate,
    statusProfile = null,
    childSurface = false,
}: Props) {
    const displayLabel = statusLabel?.trim() || "—";

    return (
        <VmDrawerHeaderStatusSelect
            entityKind="persons"
            entityId={personId}
            entityLabel={entityLabel}
            currentStatusKey={currentStatusKey}
            displayLabel={displayLabel}
            statusControl={statusControl}
            canMutate={canMutate}
            statusProfile={statusProfile}
            rootMarker={
                childSurface ? "person-drawer-child-header-status" : "person-drawer-vm-status-control"
            }
        />
    );
}
