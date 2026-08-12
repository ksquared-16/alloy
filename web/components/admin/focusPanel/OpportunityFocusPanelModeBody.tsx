"use client";

import { useMemo } from "react";

import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";
import { useActiveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAttentionCardFocus } from "@/lib/runtime/kernel/useAttentionCardFocus";
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

    // ── THE CARD-FOCUS BRIDGE ──
    //
    // Card + item focus is ATTENTION, not drawer state: it is the kernel's ASPECT scope, finer than
    // the Operational Subject. This component already translates runtime state → model, so it is the
    // right seam; the grid stays source-agnostic and never learns where focus came from.
    //
    // Attention is preferred over the drawer's own `drawerSubjectContext` because the inline Focus
    // Panel is not a drawer. Routing a Search click through `openDrawer` mounted the modal overlay
    // this work removes — `AdminEntityDrawer` suppresses itself by testing `usePathname()`, which
    // cannot see the address the kernel projects with `replaceState`. The drawer path remains as the
    // fallback for surfaces that genuinely ARE the drawer product (person/child routes), which render
    // above the kernel and therefore have no attention to read.
    const attention = useAttentionCardFocus();
    const drawerCardFocus = drawer.drawerSubjectContext?.card_focus ?? null;
    const requestedCardFocus = useMemo(() => {
        if (attention.focus) {
            return {
                card_key: attention.focus.card_key,
                item_id: attention.focus.item_id,
                // Keyed on the Record of Attention, so a rapid subject switch re-applies the card
                // while an unrelated re-render does not fight an operator who has moved on.
                subject_key: attention.subject ?? "",
            };
        }
        if (drawerCardFocus) {
            return {
                card_key: drawerCardFocus.card_key,
                item_id: drawerCardFocus.item_id ?? null,
                subject_key: `${drawer.type}:${drawer.id}`,
            };
        }
        return null;
    }, [attention.focus, attention.subject, drawerCardFocus, drawer.type, drawer.id]);

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
            requestedCardFocus={requestedCardFocus}
            onSelectTab={onSelectTab}
            onHeaderAction={onHeaderAction}
            onModeChange={onModeChange}
        />
    );
}
