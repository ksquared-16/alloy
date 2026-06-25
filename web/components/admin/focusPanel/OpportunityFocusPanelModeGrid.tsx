"use client";

import { useMemo } from "react";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";

type Props = {
    mode: FocusPanelMode;
    displayVm: OpportunityDrawerViewModel;
    drawerId: string;
    record: Record<string, unknown>;
    title: string;
    opportunitySingular: string;
    perspective: RuntimePerspective | null;
    statusLabel: string | null;
    canMutate: boolean;
    onSelectTab: (tab: DrawerTabKey) => void;
    onHeaderAction?: (action: ResolvedActionForClient) => void;
};

/** Renders a mode grid from derived Universal Card models — never from layout sections. */
export default function OpportunityFocusPanelModeGrid({
    mode,
    displayVm,
    drawerId,
    record,
    title,
    opportunitySingular,
    perspective,
    statusLabel,
    canMutate,
    onSelectTab,
    onHeaderAction,
}: Props) {
    const { grid, cards } = useMemo(
        () =>
            deriveOpportunityFocusPanelPresentation({
                mode,
                displayVm,
                record,
                title,
                perspective,
                statusLabel,
            }),
        [mode, displayVm, record, title, perspective, statusLabel],
    );

    const workflowActive = Boolean(
        displayVm.workspace.work_intent_runtime?.state === "open" ||
            displayVm.workspace.stage_work_runtime?.primary?.state === "open",
    );

    const gridRows = useMemo(
        () =>
            grid.rows.map((row) => ({
                cells: row.cells
                    .filter((cell) => {
                        const model = cards.get(cell.key);
                        return model?.visible !== false;
                    })
                    .map((cell) => ({
                        key: cell.key,
                        span: cell.span,
                        density: cell.density,
                    })),
            })).filter((row) => row.cells.length > 0),
        [grid, cards],
    );

    return (
        <div
            id={`focus-panel-mode-${mode}`}
            role="tabpanel"
            aria-labelledby={`focus-panel-mode-tab-${mode}`}
            data-focus-panel-mode={mode}
            data-focus-panel-work-state={mode === "work" && workflowActive ? "active" : undefined}
        >
            <FocusPanelCardGrid
                rows={gridRows}
                renderCell={(key) => {
                    const model = cards.get(key as FocusPanelCardKey);
                    if (!model) return null;
                    const receded = mode === "work" && workflowActive && key === "work_launcher";
                    return (
                        <FocusPanelCardRenderer
                            model={model}
                            displayVm={displayVm}
                            drawerId={drawerId}
                            record={record}
                            opportunitySingular={opportunitySingular}
                            canMutate={canMutate}
                            onSelectTab={onSelectTab}
                            onPrimaryAction={(key) => {
                                if (key === "primary_next_action" && displayVm.actions.header_menu[0]) {
                                    onHeaderAction?.(displayVm.actions.header_menu[0]);
                                }
                            }}
                            receded={receded}
                        />
                    );
                }}
            />
        </div>
    );
}
