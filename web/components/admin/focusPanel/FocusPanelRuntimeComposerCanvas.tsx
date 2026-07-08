"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent,
    type ReactNode,
} from "react";
import { GripVertical, Plus, X } from "lucide-react";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import OpportunityFocusPanelHeader from "@/components/admin/focusPanel/OpportunityFocusPanelHeader";
import {
    FOCUS_PANEL_GRID_COLUMNS,
    type FocusPanelGridArea,
    type FocusPanelGridLayout,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import {
    addCardToGrid,
    buildPublishedLayoutFromGrid,
    cardsInGrid,
    clampArea,
    defaultRowSpanForCard,
    gridFromPublishedLayout,
    moveArea,
    removeArea,
    resizeArea,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import { composeEffectiveCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import {
    buildSummaryDocFromOrder,
    type SummaryCardOrderEntry,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";
import { withPublishedLayoutMetadata } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import { buildOpportunityFocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import {
    isElevatedLevel,
    type FocusPanelActiveDepth,
    type FocusPanelCoordination,
    type FocusPanelDepthEntry,
    type FocusPanelDismissSignal,
    type FocusPanelFocusRequest,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

/** Reverse-zoom dismiss window — matches runtime depth animation. */
const FOCUS_PANEL_DEPTH_MS = 240;

type NestedSurfaceTarget = {
    surfaceId: string;
    surfaceLabel: string;
};

type Props = {
    /** Seed grid from loaded published layout (converted once on mount). */
    initialGrid: FocusPanelGridLayout;
    catalog: { key: FocusPanelCardKey; label: string }[];
    order: SummaryCardOrderEntry[];
    cards: Map<FocusPanelCardKey, FocusPanelCardModel>;
    vm: OpportunityDrawerViewModel;
    record: Record<string, unknown>;
    previewContext: OperationalContext;
    title: string;
    statusLabel: string | null;
    /** Emits the full published layout on every layout edit. */
    onLayoutChange?: (layout: FocusPanelPublishedLayout) => void;
    onSelectCard?: (key: FocusPanelCardKey) => void;
    selectedCard?: FocusPanelCardKey | null;
    nestedSurfaceByCard?: Partial<Record<FocusPanelCardKey, NestedSurfaceTarget>>;
};

type Ghost = { colStart: number; colSpan: number; rowStart: number; rowSpan: number };

/**
 * Runtime-first Focus Panel composer canvas.
 *
 * Renders the same shell + card grid the operator sees on /work-unit, with subtle
 * composer affordances (selection outline, hover handles, add tray) layered on top.
 * Layout authoring still flows through the published grid model the runtime consumes.
 */
export default function FocusPanelRuntimeComposerCanvas({
    initialGrid,
    catalog,
    order,
    cards,
    vm,
    record,
    previewContext,
    title,
    statusLabel,
    onLayoutChange,
    onSelectCard,
    selectedCard,
    nestedSurfaceByCard,
}: Props) {
    const composer = useFocusPanelComposer();
    const [grid, setGrid] = useState<FocusPanelGridLayout>(initialGrid);
    const [activeMode, setActiveMode] = useState<FocusPanelMode>("summary");
    const [ghost, setGhost] = useState<Ghost | null>(null);
    const [arranging, setArranging] = useState(false);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const interacting = useRef(false);

    const cols = grid.columns || FOCUS_PANEL_GRID_COLUMNS;
    const placed = new Set(cardsInGrid(grid));
    const tray = catalog.filter((c) => !placed.has(c.key));

    const applyGrid = useCallback(
        (next: FocusPanelGridLayout) => {
            setGrid(next);
            onLayoutChange?.(buildPublishedLayoutFromGrid(next));
        },
        [onLayoutChange],
    );

    const publishedLayout = useMemo(() => buildPublishedLayoutFromGrid(grid), [grid]);

    const workingDoc = useMemo(() => {
        const doc = buildSummaryDocFromOrder(order);
        return { ...doc, metadata: withPublishedLayoutMetadata(doc.metadata, publishedLayout) };
    }, [order, publishedLayout]);

    const summaryInputs = useMemo(
        () => deriveFocusPanelSummaryCompositionInputs(workingDoc, { cards }),
        [workingDoc, cards],
    );

    const configByKey = useMemo(() => {
        const map = new Map<FocusPanelCardKey, SummaryCardOrderEntry["config"]>();
        order.forEach((entry) => map.set(entry.key, entry.config));
        return map;
    }, [order]);

    // ── In-panel drill-in coordination (same model as runtime) ───────────────
    const [focusRequest, setFocusRequest] = useState<FocusPanelFocusRequest | null>(null);
    const focusNonceRef = useRef(0);
    const depthHistoryRef = useRef<FocusPanelDepthEntry[]>([]);
    const [previousFocus, setPreviousFocus] = useState<FocusPanelDepthEntry | null>(null);
    const emitFocus = useCallback((card: FocusPanelCardKey, focus: string | null) => {
        focusNonceRef.current += 1;
        setFocusRequest({ card, focus, nonce: focusNonceRef.current });
    }, []);
    const requestFocus = useCallback<FocusPanelCoordination["requestFocus"]>(
        (card, focus, source) => {
            if (source) {
                depthHistoryRef.current = [...depthHistoryRef.current, source];
                setPreviousFocus(source);
            }
            emitFocus(card, focus);
        },
        [emitFocus],
    );
    const back = useCallback(() => {
        const stack = depthHistoryRef.current;
        const prev = stack[stack.length - 1];
        if (!prev) return;
        depthHistoryRef.current = stack.slice(0, -1);
        setPreviousFocus(depthHistoryRef.current[depthHistoryRef.current.length - 1] ?? null);
        emitFocus(prev.card, prev.focus);
    }, [emitFocus]);

    const [activeDepth, setActiveDepth] = useState<FocusPanelActiveDepth | null>(null);
    const reportPerspective = useCallback<NonNullable<FocusPanelCoordination["reportPerspective"]>>(
        (card, level) => {
            setActiveDepth((prev) => {
                if (isElevatedLevel(level)) return { card, level };
                return prev?.card === card ? null : prev;
            });
        },
        [],
    );

    const [dismissed, setDismissed] = useState<FocusPanelDismissSignal | null>(null);
    const [closing, setClosing] = useState(false);
    const dismissNonceRef = useRef(0);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismiss = useCallback<NonNullable<FocusPanelCoordination["dismiss"]>>((card) => {
        if (composer?.drillIn?.cardKey === card) composer.exitDrillIn();
        if (closeTimerRef.current) return;
        setClosing(true);
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            dismissNonceRef.current += 1;
            setDismissed({ card, nonce: dismissNonceRef.current });
            setClosing(false);
            depthHistoryRef.current = [];
            setPreviousFocus(null);
        }, FOCUS_PANEL_DEPTH_MS);
    }, [composer]);
    useEffect(
        () => () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        },
        [],
    );

    const coordination = useMemo<FocusPanelCoordination>(
        () => ({
            request: focusRequest,
            requestFocus,
            activeDepth,
            reportPerspective,
            dismissed,
            dismiss,
            previousFocus,
            back,
        }),
        [focusRequest, requestFocus, activeDepth, reportPerspective, dismissed, dismiss, previousFocus, back],
    );
    const elevatedCellKey = activeDepth?.card ?? null;

    useEffect(() => {
        if (!activeDepth) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            dismiss(activeDepth.card);
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [activeDepth, dismiss]);

    const mutation = useMemo(
        () =>
            buildOpportunityFocusPanelMutation({
                canMutate: false,
                opportunityId: String(vm.entity.id),
                truth: record,
            }),
        [vm.entity.id, record],
    );

    const cellFromPointer = useCallback(
        (clientX: number, clientY: number) => {
            const el = surfaceRef.current;
            if (!el) return { col: 1, row: 1 };
            const r = el.getBoundingClientRect();
            const colW = r.width / cols;
            const rowUnit = 76;
            const col = Math.min(cols, Math.max(1, Math.floor((clientX - r.left) / colW) + 1));
            const row = Math.max(1, Math.floor((clientY - r.top) / rowUnit) + 1);
            return { col, row };
        },
        [cols],
    );

    const startMove = (e: PointerEvent, area: FocusPanelGridArea) => {
        if (interacting.current) return;
        interacting.current = true;
        setArranging(true);
        e.preventDefault();
        e.stopPropagation();
        const move = (ev: globalThis.PointerEvent) => {
            const { col, row } = cellFromPointer(ev.clientX, ev.clientY);
            const colStart = Math.min(col, cols - area.colSpan + 1);
            const next = clampArea(grid, { ...area, colStart, rowStart: row });
            setGhost({ colStart: next.colStart, colSpan: next.colSpan, rowStart: next.rowStart, rowSpan: next.rowSpan });
        };
        const up = (ev: globalThis.PointerEvent) => {
            const { col, row } = cellFromPointer(ev.clientX, ev.clientY);
            applyGrid(moveArea(grid, area.card, Math.min(col, cols - area.colSpan + 1), row));
            setGhost(null);
            interacting.current = false;
            setArranging(false);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    const startResize = (e: PointerEvent, area: FocusPanelGridArea, axis: "w" | "h" | "wh") => {
        if (interacting.current) return;
        interacting.current = true;
        setArranging(true);
        e.preventDefault();
        e.stopPropagation();
        const el = surfaceRef.current;
        const move = (ev: globalThis.PointerEvent) => {
            if (!el) return;
            const r = el.getBoundingClientRect();
            const colW = r.width / cols;
            const rowUnit = 76;
            const colSpan =
                axis === "h" ? area.colSpan : Math.max(1, Math.round((ev.clientX - r.left) / colW) - area.colStart + 1);
            const rowSpan =
                axis === "w" ? area.rowSpan : Math.max(1, Math.round((ev.clientY - r.top) / rowUnit) - area.rowStart + 1);
            const next = clampArea(grid, { ...area, colSpan, rowSpan });
            setGhost({ colStart: next.colStart, colSpan: next.colSpan, rowStart: next.rowStart, rowSpan: next.rowSpan });
        };
        const up = (ev: globalThis.PointerEvent) => {
            if (el) {
                const r = el.getBoundingClientRect();
                const colW = r.width / cols;
                const rowUnit = 76;
                const colSpan =
                    axis === "h" ? area.colSpan : Math.max(1, Math.round((ev.clientX - r.left) / colW) - area.colStart + 1);
                const rowSpan =
                    axis === "w" ? area.rowSpan : Math.max(1, Math.round((ev.clientY - r.top) / rowUnit) - area.rowStart + 1);
                applyGrid(resizeArea(grid, area.card, colSpan, rowSpan));
            }
            setGhost(null);
            interacting.current = false;
            setArranging(false);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    const onAddCard = (card: FocusPanelCardKey) => {
        const span = Math.min(6, cols);
        const withCard = addCardToGrid(grid, card, { colSpan: span, rowSpan: defaultRowSpanForCard(card) });
        applyGrid(withCard);
    };

    const renderComposerCell = useCallback(
        (cellKey: string) => {
            const resolution = summaryInputs.cellResolution.get(cellKey);
            const typeKey = (resolution?.typeKey ?? cellKey) as FocusPanelCardKey;
            const baseModel = cards.get(typeKey);
            if (!baseModel) return null;

            const config = configByKey.get(typeKey) ?? resolution?.config ?? null;
            const model = composeEffectiveCardModel(baseModel, config, record);
            const area = findAreaForCard(grid, typeKey);
            const isSelected = selectedCard === typeKey;
            const nested = nestedSurfaceByCard?.[typeKey];

            return (
                <ComposerCellShell
                    cardKey={typeKey}
                    selected={isSelected}
                    arranging={arranging}
                    area={area}
                    onSelect={() => onSelectCard?.(typeKey)}
                    onRemove={area ? () => applyGrid(removeArea(grid, typeKey)) : undefined}
                    onStartMove={area ? (e) => startMove(e, area) : undefined}
                    onStartResize={
                        area ?
                            (e, axis) => startResize(e, area, axis)
                        :   undefined
                    }
                    nestedSurface={nested}
                    onEnterDrillIn={
                        nested && composer
                            ? () => {
                                  composer.enterDrillIn(typeKey, nested.surfaceId);
                                  requestFocus(typeKey, null);
                                  onSelectCard?.(typeKey);
                              }
                            : undefined
                    }
                >
                    <FocusPanelCardRenderer
                        model={model}
                        context={previewContext}
                        focusPanelMode="summary"
                        coordination={coordination}
                        mutation={mutation}
                        compat={{ subjectVm: vm, onSelectTab: () => {} }}
                    />
                </ComposerCellShell>
            );
        },
        [
            summaryInputs.cellResolution,
            cards,
            configByKey,
            record,
            grid,
            selectedCard,
            arranging,
            nestedSurfaceByCard,
            onSelectCard,
            applyGrid,
            previewContext,
            coordination,
            mutation,
            vm,
            composer,
            requestFocus,
        ],
    );

    const currentStatusKey = String(record.status_key ?? "").trim();

    return (
        <div
            className="alloy-os-fp-composer"
            data-focus-panel-runtime-composer="true"
            data-fp-composer-arranging={arranging ? "true" : undefined}
            data-fp-composer-edit-mode={composer?.drillIn ? "true" : undefined}
        >
            <section
                className="alloy-os-fp-composer__panel flex min-h-0 flex-col overflow-hidden rounded-xl border border-alloy-stone/12 bg-white shadow-sm"
                aria-label="Focus Panel composer preview"
            >
                <div
                    className="sticky top-0 z-10 shrink-0 border-b border-alloy-stone/12 bg-white"
                    style={{ minHeight: "5.25rem" }}
                >
                    <OpportunityFocusPanelHeader
                        title={title}
                        opportunityId={String(vm.entity.id)}
                        record={record}
                        displayVm={vm}
                        opportunitySingular="Opportunity"
                        statusLabel={statusLabel}
                        currentStatusKey={currentStatusKey}
                        statusControl={vm.header.status}
                        statusCanMutate={false}
                        manageCanMutate={false}
                        activeMode={activeMode}
                        onModeChange={setActiveMode}
                        hideClose
                        onClose={() => {}}
                        onSubjectManageActionSelect={() => {}}
                        actionPreflightBlocked={null}
                        onDismissActionPreflightBlocked={() => {}}
                        registryActionFeedback={null}
                    />
                </div>

                <div
                    ref={surfaceRef}
                    className="alloy-os-fp-composer__body min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]"
                    data-surface-canvas-builder="true"
                >
                    {activeMode === "summary" ?
                        <div ref={gridContainerRef} className="relative">
                            {ghost ?
                                <div
                                    className="alloy-os-fp-composer__ghost"
                                    aria-hidden
                                    style={{
                                        gridColumn: `${ghost.colStart} / span ${ghost.colSpan}`,
                                        gridRow: `${ghost.rowStart} / span ${ghost.rowSpan}`,
                                    }}
                                />
                            :   null}
                            <FocusPanelCardGrid
                                rows={summaryInputs.gridRows}
                                publishedLayout={publishedLayout}
                                composeCards={summaryInputs.composeCards}
                                compositionOverrides={summaryInputs.compositionOverrides}
                                elevatedCellKey={elevatedCellKey}
                                closing={closing}
                                onBackdropClick={() => {
                                    if (activeDepth) dismiss(activeDepth.card);
                                }}
                                renderCell={renderComposerCell}
                            />
                        </div>
                    :   <p className="config-typo-sublabel py-8 text-center">
                            Activity mode preview — switch to Work to compose the Focus Panel.
                        </p>
                    }
                </div>
            </section>

            {tray.length > 0 ?
                <div className="alloy-os-fp-composer__tray" data-fp-composer-tray="true">
                    <Plus className="h-3.5 w-3.5 text-alloy-midnight/35" aria-hidden />
                    <span className="alloy-os-fp-composer__tray-label">Add card</span>
                    {tray.map((c) => (
                        <button
                            key={c.key}
                            type="button"
                            className="alloy-os-fp-composer__chip"
                            data-fp-composer-add-card={c.key}
                            onClick={() => onAddCard(c.key)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            :   null}
        </div>
    );
}

function findAreaForCard(grid: FocusPanelGridLayout, card: FocusPanelCardKey): FocusPanelGridArea | undefined {
    return grid.areas.find((a) => a.card === card);
}

type ComposerCellShellProps = {
    cardKey: FocusPanelCardKey;
    selected: boolean;
    arranging: boolean;
    area?: FocusPanelGridArea;
    onSelect: () => void;
    onRemove?: () => void;
    onStartMove?: (e: PointerEvent) => void;
    onStartResize?: (e: PointerEvent, axis: "w" | "h" | "wh") => void;
    nestedSurface?: NestedSurfaceTarget;
    onEnterDrillIn?: () => void;
    children: ReactNode;
};

/** Subtle composer chrome layered over a runtime card — visible on hover/selection only. */
function ComposerCellShell({
    cardKey,
    selected,
    arranging,
    onSelect,
    onRemove,
    onStartMove,
    onStartResize,
    nestedSurface,
    onEnterDrillIn,
    children,
}: ComposerCellShellProps) {
    return (
        <div
            className={[
                "alloy-os-fp-composer-cell",
                selected ? "is-selected" : "",
                arranging ? "is-arranging" : "",
            ].join(" ")}
            data-fp-composer-cell={cardKey}
        >
            {children}
            <div className="alloy-os-fp-composer-cell__chrome" aria-hidden={!selected}>
                <button
                    type="button"
                    className="alloy-os-fp-composer-cell__configure"
                    aria-label={`Configure ${cardKey} card`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect();
                    }}
                >
                    Configure
                </button>
                {onStartMove ?
                    <button
                        type="button"
                        className="alloy-os-fp-composer-cell__grip"
                        aria-label={`Move ${cardKey} card`}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            onStartMove(e);
                        }}
                    >
                        <GripVertical className="h-3.5 w-3.5" aria-hidden />
                    </button>
                :   null}
                {onRemove ?
                    <button
                        type="button"
                        className="alloy-os-fp-composer-cell__remove"
                        aria-label={`Remove ${cardKey} card`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                    >
                        <X className="h-3 w-3" aria-hidden />
                    </button>
                :   null}
                {onStartResize ?
                    <>
                        <div
                            className="alloy-os-fp-composer-cell__handle alloy-os-fp-composer-cell__handle--w"
                            role="separator"
                            aria-label="Span columns"
                            onPointerDown={(e) => onStartResize(e, "w")}
                        />
                        <div
                            className="alloy-os-fp-composer-cell__handle alloy-os-fp-composer-cell__handle--h"
                            role="separator"
                            aria-label="Span rows"
                            onPointerDown={(e) => onStartResize(e, "h")}
                        />
                        <div
                            className="alloy-os-fp-composer-cell__handle alloy-os-fp-composer-cell__handle--corner"
                            role="separator"
                            aria-label="Span columns and rows"
                            onPointerDown={(e) => onStartResize(e, "wh")}
                        />
                    </>
                :   null}
            </div>
            {nestedSurface && onEnterDrillIn ?
                <button
                    type="button"
                    className="alloy-os-fp-composer-cell__expansion"
                    data-open-nested-surface={nestedSurface.surfaceId}
                    onClick={(e) => {
                        e.stopPropagation();
                        onEnterDrillIn();
                    }}
                >
                    Configure {nestedSurface.surfaceLabel} →
                </button>
            :   null}
        </div>
    );
}

/** Re-export for tests / editor seeding. */
export { gridFromPublishedLayout };
