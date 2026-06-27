"use client";

import { useMemo } from "react";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import OpportunityFocusPanelEmbeddedWorkspace from "@/components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace";
import {
    deriveOpportunityFocusPanelPresentation,
    HOUSEHOLD_REFERENCE_SUMMARY_GRID,
} from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { isFocusPanelHouseholdReferenceOnlyEnabledClient } from "@/lib/layout/featureFlag";
import {
    deriveFocusPanelGridFromLayoutDoc,
    deriveFocusPanelInstanceMap,
} from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelCardsFromLayoutDoc";
import {
    composeEffectiveCardModel,
    type FocusPanelCardConfig,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { usePublishedFocusPanelSummaryDoc } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";
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
    const { grid: defaultGrid, cards } = useMemo(
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

    // Household Card reference evaluation surface (Use Case 1): when the narrow
    // flag is on, Summary shows ONLY the operational Household card so it can be
    // evaluated cleanly. Bypasses the configurable LayoutDoc path entirely.
    const householdReferenceOnly =
        mode === "summary" && isFocusPanelHouseholdReferenceOnlyEnabledClient();

    // Summary is the configurable surface: read the org's PUBLISHED LayoutDoc (or
    // the code-built default — visually identical) and resolve per-instance config.
    const isSummary = mode === "summary" && !householdReferenceOnly;
    const publishedDoc = usePublishedFocusPanelSummaryDoc(isSummary);
    const activeDoc = isSummary ? publishedDoc ?? FOCUS_PANEL_SUMMARY_DEFAULT_DOC : null;
    const instanceMap = useMemo(
        () => (activeDoc ? deriveFocusPanelInstanceMap(activeDoc) : new Map()),
        [activeDoc],
    );
    const grid = useMemo(() => {
        if (householdReferenceOnly) return HOUSEHOLD_REFERENCE_SUMMARY_GRID;
        if (!isSummary || !activeDoc) return defaultGrid;
        const derived = deriveFocusPanelGridFromLayoutDoc(activeDoc);
        return derived.rows.length > 0 ? derived : defaultGrid;
    }, [householdReferenceOnly, isSummary, activeDoc, defaultGrid]);

    const workflowActive = Boolean(
        displayVm.workspace.work_intent_runtime?.state === "open" ||
            displayVm.workspace.stage_work_runtime?.primary?.state === "open",
    );

    /** cellKey (instance) → { typeKey, config } for model + config resolution. */
    const cellResolution = useMemo(() => {
        const map = new Map<string, { typeKey: FocusPanelCardKey; config: FocusPanelCardConfig | null }>();
        grid.rows.forEach((row) => {
            row.cells.forEach((cell) => {
                const cellKey = cell.instanceKey ?? cell.key;
                map.set(cellKey, {
                    typeKey: cell.key as FocusPanelCardKey,
                    config: instanceMap.get(cellKey)?.config ?? null,
                });
            });
        });
        return map;
    }, [grid, instanceMap]);

    const gridRows = useMemo(
        () =>
            grid.rows
                .map((row) => ({
                    cells: row.cells
                        .filter((cell) => cards.get(cell.key as FocusPanelCardKey)?.visible !== false)
                        .map((cell) => ({
                            key: cell.instanceKey ?? cell.key,
                            span: cell.span,
                            density: cell.density,
                        })),
                }))
                .filter((row) => row.cells.length > 0),
        [grid, cards],
    );

    if (mode === "activity") {
        return (
            <OpportunityFocusPanelEmbeddedWorkspace
                drawerId={drawerId}
                record={record}
                displayVm={displayVm}
                onSelectTab={onSelectTab}
            />
        );
    }

    return (
        <div
            id={`focus-panel-mode-${mode}`}
            role="tabpanel"
            aria-labelledby={`focus-panel-mode-tab-${mode}`}
            data-focus-panel-mode={mode}
            data-focus-panel-work-state={mode === "work" && workflowActive ? "active" : undefined}
            {...alloySectionDomAttrs(mode === "work" ? "WU-10" : "WU-09")}
        >
            <FocusPanelCardGrid
                rows={gridRows}
                className={mode === "work" ? "alloy-os-focus-panel-grid--work" : undefined}
                dataFocusPanelSplitLayout={mode === "work" ? "true" : undefined}
                renderCell={(key) => {
                    const resolution = cellResolution.get(key);
                    const typeKey = (resolution?.typeKey ?? key) as FocusPanelCardKey;
                    const baseModel = cards.get(typeKey);
                    if (!baseModel) return null;
                    const model = composeEffectiveCardModel(baseModel, resolution?.config ?? null, record);
                    const receded = mode === "work" && workflowActive && typeKey === "work_launcher";
                    return (
                        <FocusPanelCardRenderer
                            model={model}
                            displayVm={displayVm}
                            drawerId={drawerId}
                            record={record}
                            opportunitySingular={opportunitySingular}
                            canMutate={canMutate}
                            focusPanelMode={mode}
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
