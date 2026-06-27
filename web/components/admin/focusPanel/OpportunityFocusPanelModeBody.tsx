"use client";

import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";
import { useActiveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";

type Props = {
    mode: FocusPanelMode;
    displayVm: OpportunityDrawerViewModel;
    drawerId: string;
    record: Record<string, unknown>;
    drawerTitle: string;
    statusLabel: string | null;
    canMutate: boolean;
    onSelectTab: (tab: DrawerTabKey) => void;
    onHeaderAction?: (action: ResolvedActionForClient) => void;
};

export default function OpportunityFocusPanelModeBody({
    mode,
    displayVm,
    drawerId,
    record,
    drawerTitle,
    statusLabel,
    canMutate,
    onSelectTab,
    onHeaderAction,
}: Props) {
    const perspective = useActiveRuntimePerspective();

    return (
        <OpportunityFocusPanelModeGrid
            mode={mode}
            displayVm={displayVm}
            drawerId={drawerId}
            record={record}
            title={drawerTitle}
            perspective={perspective}
            statusLabel={statusLabel}
            canMutate={canMutate}
            onSelectTab={onSelectTab}
            onHeaderAction={onHeaderAction}
        />
    );
}
