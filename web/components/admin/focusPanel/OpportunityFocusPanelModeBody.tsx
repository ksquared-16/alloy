"use client";

import { useMemo } from "react";

import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";
import { useActiveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { focusPanelWorkModeModelFromDrawerVm } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromDrawerVm";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
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
    onModeChange?: (mode: FocusPanelMode) => void;
};

/**
 * The ENRICHED Focus Panel body — projects the settled drawer VM onto the canonical
 * `FocusPanelWorkModeModel` and hands it to the ONE grid. Same grid, same card ids, same geometry as
 * the commit-critical body; only readiness (and thus content) differs.
 */
export default function OpportunityFocusPanelModeBody({
    mode,
    displayVm,
    record,
    drawerTitle,
    statusLabel,
    canMutate,
    onSelectTab,
    onHeaderAction,
    onModeChange,
}: Props) {
    const perspective = useActiveRuntimePerspective();
    const { drawer } = useAdminDrawer();
    const model = useMemo(
        () =>
            focusPanelWorkModeModelFromDrawerVm({
                mode,
                displayVm,
                record,
                title: drawerTitle,
                perspective,
                statusLabel,
                canMutate,
            }),
        [mode, displayVm, record, drawerTitle, perspective, statusLabel, canMutate],
    );

    return (
        <OpportunityFocusPanelModeGrid
            model={model}
            requestedCardFocus={
                // Bridge the SELECTION's card request into the source-agnostic grid.
                // This component already translates drawer VM → model, so it is the
                // right seam; the grid itself stays unaware of where selection lives.
                drawer.drawerSubjectContext?.card_focus
                    ? {
                          card_key: drawer.drawerSubjectContext.card_focus.card_key,
                          item_id: drawer.drawerSubjectContext.card_focus.item_id ?? null,
                          subject_key: `${drawer.type}:${drawer.id}`,
                      }
                    : null
            }
            onSelectTab={onSelectTab}
            onHeaderAction={onHeaderAction}
            onModeChange={onModeChange}
        />
    );
}
