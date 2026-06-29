"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import OpportunityFocusPanelEmbeddedWorkspace from "@/components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import {
    deriveFocusPanelGridFromLayoutDoc,
    deriveFocusPanelInstanceMap,
} from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelCardsFromLayoutDoc";
import {
    buildCompositionOverrides,
    composeEffectiveCardModel,
    type FocusPanelCardConfig,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { buildOpportunityFocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { CompositionCardInput } from "@/lib/adminV2/runtime/focusPanel/composition/composeFocusPanelSurface";
import {
    isElevatedLevel,
    type FocusPanelActiveDepth,
    type FocusPanelCoordination,
    type FocusPanelDismissSignal,
    type FocusPanelFocusRequest,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordination";
import { usePublishedFocusPanelSummaryDoc } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";

/** Reverse-zoom dismiss window — matches CSS `--alloy-os-fp-depth-ms` (240ms). */
const FOCUS_PANEL_DEPTH_MS = 240;

type Props = {
    mode: FocusPanelMode;
    displayVm: OpportunityDrawerViewModel;
    drawerId: string;
    record: Record<string, unknown>;
    title: string;
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

    // Summary is the configurable surface: read the org's PUBLISHED LayoutDoc (or
    // the code-built default — visually identical) and resolve per-instance config.
    // The Household card is part of this canonical composition (no flag, no
    // reference-only override).
    const isSummary = mode === "summary";
    const publishedDoc = usePublishedFocusPanelSummaryDoc(isSummary);
    const activeDoc = isSummary ? publishedDoc ?? FOCUS_PANEL_SUMMARY_DEFAULT_DOC : null;
    const instanceMap = useMemo(
        () => (activeDoc ? deriveFocusPanelInstanceMap(activeDoc) : new Map()),
        [activeDoc],
    );
    const grid = useMemo(() => {
        if (!isSummary || !activeDoc) return defaultGrid;
        const derived = deriveFocusPanelGridFromLayoutDoc(activeDoc);
        return derived.rows.length > 0 ? derived : defaultGrid;
    }, [isSummary, activeDoc, defaultGrid]);

    // Adapter seam: composed subject payload → Operational Context. Cards consume
    // this boundary, never the drawer VM directly. Built once; observed by cards.
    const operationalContext = useMemo(
        () =>
            buildOperationalContext({
                subjectId: drawerId,
                title,
                subjectVm: displayVm,
                truth: record,
                perspective,
                statusLabel,
                canMutate,
            }),
        [drawerId, title, displayVm, record, perspective, statusLabel, canMutate],
    );

    // Cross-card handoff orchestration: a referencing card (e.g. Readiness) asks an
    // owner card (e.g. Children) to open a Perspective. We record the request with a
    // monotonic nonce, scroll the owner card into view, and let it apply the focus.
    // This is NOT a new primitive — it coordinates existing local perspective state.
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const [focusRequest, setFocusRequest] = useState<FocusPanelFocusRequest | null>(null);
    const focusNonceRef = useRef(0);
    const requestFocus = useCallback<FocusPanelCoordination["requestFocus"]>((card, focus) => {
        focusNonceRef.current += 1;
        setFocusRequest({ card, focus, nonce: focusNonceRef.current });
        if (typeof window !== "undefined") {
            window.requestAnimationFrame(() => {
                const target = gridContainerRef.current?.querySelector(
                    `[data-focus-panel-grid-cell="${card}"]`,
                );
                target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
        }
    }, []);
    // In-panel depth layer: a card reports when it opens deep (focused / edit). The
    // host raises that card and recedes the rest — no route, no drawer, no modal.
    const [activeDepth, setActiveDepth] = useState<FocusPanelActiveDepth | null>(null);
    const reportPerspective = useCallback<NonNullable<FocusPanelCoordination["reportPerspective"]>>(
        (card, level) => {
            setActiveDepth((prev) => {
                if (isElevatedLevel(level)) return { card, level };
                // Receding/leaving: only clear if this card owned the active layer.
                return prev?.card === card ? null : prev;
            });
        },
        [],
    );
    // Return-to-base: backdrop click / ESC asks the active card to collapse. To play
    // the reverse-zoom, we hold the card elevated for one depth duration (`closing`)
    // BEFORE resetting it — so the focused card flies back to its cell instead of
    // snapping. After the window the card resets → reports "base" → activeDepth clears.
    const [dismissed, setDismissed] = useState<FocusPanelDismissSignal | null>(null);
    const [closing, setClosing] = useState(false);
    const dismissNonceRef = useRef(0);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismiss = useCallback<NonNullable<FocusPanelCoordination["dismiss"]>>((card) => {
        if (closeTimerRef.current) return; // already closing — ignore repeat dismiss
        setClosing(true);
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            dismissNonceRef.current += 1;
            setDismissed({ card, nonce: dismissNonceRef.current });
            setClosing(false);
        }, FOCUS_PANEL_DEPTH_MS);
    }, []);
    useEffect(
        () => () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        },
        [],
    );
    const coordination = useMemo<FocusPanelCoordination>(
        () => ({ request: focusRequest, requestFocus, activeDepth, reportPerspective, dismissed, dismiss }),
        [focusRequest, requestFocus, activeDepth, reportPerspective, dismissed, dismiss],
    );
    const elevatedCellKey = activeDepth?.card ?? null;

    // Edit seam (Household V1): a separate injected save capability (NOT a write on
    // the read-only Operational Context). Persists via the existing person PATCH path
    // and broadcasts the existing record-patch events → VM merge → context recompose.
    const mutation = useMemo(
        () => buildOpportunityFocusPanelMutation({ canMutate, opportunityId: drawerId, truth: record }),
        [canMutate, drawerId, record],
    );

    // ESC returns the focused/edit card to its base Work surface. Captured before the
    // drawer's own ESC-to-close handler and stopped, so ESC dismisses the depth layer
    // FIRST and does not also close the whole record. Only active while a card is deep.
    useEffect(() => {
        if (!activeDepth) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            dismiss(activeDepth.card);
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [activeDepth, dismiss]);

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

    // Composition Engine input — Summary is COMPOSED from card semantics (lanes /
    // stack), not laid out as equal grid cells. Reading order + visibility stay
    // config-driven (gridRows); the engine owns grouping + width. Work and other
    // modes keep the legacy responsive grid.
    const composeCards = useMemo<CompositionCardInput[] | null>(() => {
        if (!isSummary) return null;
        return gridRows.flatMap((row) =>
            row.cells.map((cell) => ({
                key: cell.key,
                typeKey: (cellResolution.get(cell.key)?.typeKey ?? cell.key) as FocusPanelCardKey,
            })),
        );
    }, [isSummary, gridRows, cellResolution]);

    // Composition overrides (Experience Builder): per-card weight / row / depth the
    // published Surface Definition declared, fed to the engine so the operator surface
    // composes per config. Keyed by card type; platform defaults fill the rest.
    const compositionOverrides = useMemo(
        () =>
            isSummary
                ? buildCompositionOverrides(
                      Array.from(cellResolution.values()).map((r) => ({ typeKey: r.typeKey, config: r.config })),
                  )
                : undefined,
        [isSummary, cellResolution],
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
            ref={gridContainerRef}
            id={`focus-panel-mode-${mode}`}
            role="tabpanel"
            aria-labelledby={`focus-panel-mode-tab-${mode}`}
            data-focus-panel-mode={mode}
            data-focus-panel-work-state={mode === "work" && workflowActive ? "active" : undefined}
            {...alloySectionDomAttrs(mode === "work" ? "WU-10" : "WU-09")}
        >
            <FocusPanelCardGrid
                rows={gridRows}
                composeCards={composeCards}
                compositionOverrides={compositionOverrides}
                className={mode === "work" ? "alloy-os-focus-panel-grid--work" : undefined}
                dataFocusPanelSplitLayout={mode === "work" ? "true" : undefined}
                elevatedCellKey={elevatedCellKey}
                closing={closing}
                onBackdropClick={() => {
                    if (activeDepth) dismiss(activeDepth.card);
                }}
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
                            context={operationalContext}
                            focusPanelMode={mode}
                            onPrimaryAction={(key) => {
                                if (key === "primary_next_action" && displayVm.actions.header_menu[0]) {
                                    onHeaderAction?.(displayVm.actions.header_menu[0]);
                                }
                            }}
                            receded={receded}
                            coordination={coordination}
                            mutation={mutation}
                            compat={{ subjectVm: displayVm, onSelectTab }}
                        />
                    );
                }}
            />
        </div>
    );
}
