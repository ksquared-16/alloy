"use client";

import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
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
};

/** Person/child subjects reuse opportunity card derivation until person VM card blueprints land. */
export default function PersonFocusPanelModeBody(props: Props) {
    return (
        <OpportunityFocusPanelModeGrid
            mode={props.mode}
            displayVm={props.displayVm as OpportunityDrawerViewModel}
            drawerId={props.drawerId}
            record={props.record}
            title={props.drawerTitle}
            opportunitySingular="Person"
            perspective={null}
            statusLabel={props.statusLabel}
            canMutate={props.canMutate}
            onSelectTab={props.onSelectTab}
        />
    );
}
