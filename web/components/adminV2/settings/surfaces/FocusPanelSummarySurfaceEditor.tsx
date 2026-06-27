"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";

import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import FocusPanelCardInspector from "@/components/admin/focusPanel/FocusPanelCardInspector";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import FocusPanelEditableCardFrame from "@/components/admin/focusPanel/FocusPanelEditableCardFrame";
import FocusPanelSummaryEditBar from "@/components/admin/focusPanel/FocusPanelSummaryEditBar";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import {
    buildSummaryDocFromOrder,
    cycleSummaryCardSpan,
    duplicateSummaryCard,
    entryInstanceId,
    insertSummaryCard,
    moveSummaryCard,
    moveSummaryCardToIndex,
    readSummaryCardOrder,
    removeSummaryCard,
    updateSummaryCardConfig,
    type SummaryCardOrderEntry,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";
import {
    composeEffectiveCardModel,
    type FocusPanelCardConfig,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { FOCUS_PANEL_CARD_CATALOG } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import {
    loadFocusPanelSummaryLayout,
    publishFocusPanelSummary,
    saveFocusPanelSummaryDraft,
    type FocusPanelSummaryLayoutState,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryLayoutService";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * Surfaces editor for the Enrollment Focus Panel (Experience Builder Alpha).
 *
 * The canvas renders the REAL runtime Focus Panel through the shared renderer, at
 * its real workspace footprint (capped width — it does not fill a full-page grid,
 * accounting for the condensed queue space beside it in the operator workspace).
 * Selecting a card opens the contextual Inspector beside the canvas; structure
 * controls and "+ line" insertion edit the working LayoutDoc, and the publish loop
 * carries config live.
 */
export default function FocusPanelSummarySurfaceEditor() {
    const { vm, record } = useMemo(() => buildDemoFocusPanelSummaryViewModel(), []);

    const cards = useMemo(
        () =>
            deriveOpportunityFocusPanelPresentation({
                mode: "summary",
                displayVm: vm,
                record,
                title: vm.header.title,
                perspective: null,
                statusLabel: "Tour scheduled",
            }).cards,
        [vm, record],
    );

    const defaultOrder = useMemo(() => readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC), []);

    const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
    const [order, setOrder] = useState<SummaryCardOrderEntry[]>(defaultOrder);
    const [past, setPast] = useState<SummaryCardOrderEntry[][]>([]);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    // "+ line" insertion: the index the card catalog will insert at (null = closed).
    const [insertIndex, setInsertIndex] = useState<number | null>(null);

    // Publish loop state (configure → publish → operate).
    const [layoutState, setLayoutState] = useState<FocusPanelSummaryLayoutState>({ draft: null, published: null });
    const [loaded, setLoaded] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [statusNote, setStatusNote] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        loadFocusPanelSummaryLayout()
            .then((state) => {
                if (!active) return;
                setLayoutState(state);
                const seedDoc = state.draft?.doc ?? state.published?.doc ?? null;
                if (seedDoc) {
                    const seeded = readSummaryCardOrder(seedDoc);
                    if (seeded.length > 0) setOrder(seeded);
                }
                setLoaded(true);
            })
            .catch((e: unknown) => {
                if (!active) return;
                setStatusNote((e as Error).message);
                setLoaded(true);
            });
        return () => {
            active = false;
        };
    }, []);

    const commit = useCallback(
        (next: SummaryCardOrderEntry[]) => {
            setPast((p) => [...p, order]);
            setOrder(next);
            setDirty(true);
        },
        [order],
    );

    const handleSaveDraft = useCallback(async () => {
        setSaving(true);
        setStatusNote(null);
        try {
            const saved = await saveFocusPanelSummaryDraft(layoutState, buildSummaryDocFromOrder(order));
            setLayoutState((s) => ({ ...s, draft: { id: saved.id, version: saved.version, doc: saved.doc } }));
            setDirty(false);
            setStatusNote("Draft saved");
        } catch (e) {
            setStatusNote((e as Error).message);
        } finally {
            setSaving(false);
        }
    }, [layoutState, order]);

    const handlePublish = useCallback(async () => {
        setPublishing(true);
        setStatusNote(null);
        try {
            const draft = await saveFocusPanelSummaryDraft(layoutState, buildSummaryDocFromOrder(order));
            const published = await publishFocusPanelSummary(draft.id);
            setLayoutState({
                draft: null,
                published: { id: published.id, version: published.version, doc: published.doc },
            });
            setDirty(false);
            setStatusNote(`Published v${published.version}`);
        } catch (e) {
            setStatusNote((e as Error).message);
        } finally {
            setPublishing(false);
        }
    }, [layoutState, order]);

    const statusLabel = !loaded
        ? "Loading…"
        : dirty
          ? layoutState.published
              ? `Unpublished changes · live v${layoutState.published.version}`
              : "Unpublished changes"
          : layoutState.published
            ? `Published v${layoutState.published.version}`
            : layoutState.draft
              ? "Draft saved"
              : "Not published";

    const undo = useCallback(() => {
        setPast((p) => {
            if (p.length === 0) return p;
            setOrder(p[p.length - 1]!);
            return p.slice(0, -1);
        });
        setDirty(true);
    }, []);

    const reset = useCallback(() => commit(defaultOrder), [commit, defaultOrder]);

    const byInstance = useMemo(() => {
        const map = new Map<string, SummaryCardOrderEntry>();
        order.forEach((entry) => map.set(entryInstanceId(entry), entry));
        return map;
    }, [order]);

    const presentTypeKeys = useMemo(() => new Set<string>(order.map((c) => c.key)), [order]);

    const rows = useMemo(
        () => [
            {
                cells: order
                    .filter((entry) => cards.get(entry.key)?.visible !== false)
                    .map((entry) => ({
                        key: entryInstanceId(entry),
                        span: entry.span,
                        density: entry.density,
                    })),
            },
        ],
        [order, cards],
    );

    const insertCard = useCallback(
        (key: FocusPanelCardKey, index: number) => {
            const model = cards.get(key);
            if (!model) return;
            commit(
                insertSummaryCard(
                    order,
                    { key: model.key, span: model.span, density: model.density, tier: model.tier, gridRow: 0 },
                    index,
                ),
            );
            setInsertIndex(null);
        },
        [cards, commit, order],
    );

    const handleDrop = useCallback(
        (targetId: string) => {
            if (draggingId && draggingId !== targetId) {
                const targetIndex = order.findIndex((c) => entryInstanceId(c) === targetId);
                if (targetIndex >= 0) commit(moveSummaryCardToIndex(order, draggingId, targetIndex));
            }
            setDraggingId(null);
            setDropTargetId(null);
        },
        [commit, draggingId, order],
    );

    const handleConfigChange = useCallback(
        (instanceId: string, config: FocusPanelCardConfig) => {
            commit(updateSummaryCardConfig(order, instanceId, config));
        },
        [commit, order],
    );

    const selectedEntry = selectedInstanceId ? byInstance.get(selectedInstanceId) ?? null : null;
    const selectedBaseModel = selectedEntry ? cards.get(selectedEntry.key) ?? null : null;

    const renderInsertLine = (index: number, label: string) => (
        <div
            data-testid="focus-panel-insert-line"
            data-focus-panel-insert-index={index}
            className="group relative my-1 flex items-center justify-center"
        >
            <span className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-alloy-forge/15 transition-colors group-hover:bg-alloy-pine/40" />
            <button
                type="button"
                data-focus-panel-insert-trigger={index}
                aria-label="Add a card here"
                onClick={() => setInsertIndex((cur) => (cur === index ? null : index))}
                className={[
                    "relative z-[1] inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    insertIndex === index
                        ? "border-alloy-pine bg-alloy-pine text-white"
                        : "border-alloy-forge/25 bg-white text-alloy-midnight/55 hover:border-alloy-pine/50 hover:text-alloy-pine",
                ].join(" ")}
            >
                <span aria-hidden>＋</span> {label}
            </button>
        </div>
    );

    const cardCatalogPicker = insertIndex !== null ? (
        <div
            className="process-config-setup-card mx-1 mb-1 p-3"
            data-testid="focus-panel-add-card-panel"
            data-focus-panel-insert-at={insertIndex}
        >
            <div className="mb-2 flex items-center justify-between">
                <p className="config-typo-field-label">Add a card</p>
                <button
                    type="button"
                    aria-label="Close card picker"
                    onClick={() => setInsertIndex(null)}
                    className="config-typo-meta rounded-md px-1 py-0.5 text-alloy-forge/70 hover:text-alloy-midnight"
                >
                    ✕
                </button>
            </div>
            <div className="flex flex-wrap gap-2">
                {FOCUS_PANEL_CARD_CATALOG.map((entry) => {
                    const model = entry.cardKey ? cards.get(entry.cardKey) : null;
                    const placed = entry.cardKey ? presentTypeKeys.has(entry.cardKey) : false;
                    const available = Boolean(entry.cardKey && model && model.visible !== false);
                    const disabled = !available || placed;
                    return (
                        <button
                            key={entry.label}
                            type="button"
                            data-focus-panel-catalog-entry={entry.label}
                            data-focus-panel-catalog-state={placed ? "placed" : available ? "addable" : "unavailable"}
                            disabled={disabled}
                            title={entry.note ?? (placed ? "Already on the surface" : undefined)}
                            onClick={() => {
                                if (!available || placed || !entry.cardKey) return;
                                insertCard(entry.cardKey, insertIndex);
                            }}
                            className="config-secondary-btn config-primary-btn--sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <span aria-hidden>{placed ? "✓" : "＋"}</span> {entry.label}
                        </button>
                    );
                })}
            </div>
        </div>
    ) : null;

    return (
        <div className="flex h-full min-h-0 flex-col gap-3" data-testid="focus-panel-summary-surface-editor">
            {/* Compact Configuration workspace toolbar — publish state + actions. */}
            <div
                className="process-config-workspace-toolbar flex flex-wrap items-center justify-between gap-3"
                data-testid="surface-publish-toolbar"
            >
                <div className="flex items-baseline gap-2">
                    <span className="config-typo-workspace-title">Enrollment Focus Panel</span>
                    <span
                        data-testid="surface-publish-status"
                        data-surface-dirty={dirty ? "true" : "false"}
                        className={[
                            "config-typo-sublabel",
                            dirty ? "text-amber-800" : layoutState.published ? "text-alloy-pine" : "",
                        ].join(" ")}
                    >
                        {statusLabel}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        data-testid="surface-save-draft"
                        onClick={handleSaveDraft}
                        disabled={saving || publishing}
                        className="config-secondary-btn"
                    >
                        {saving ? "Saving…" : "Save draft"}
                    </button>
                    <ConfigurationPrimaryButton
                        data-testid="surface-publish"
                        onClick={handlePublish}
                        disabled={saving || publishing}
                    >
                        {publishing ? "Publishing…" : "Publish"}
                    </ConfigurationPrimaryButton>
                </div>
            </div>

            {statusNote ?
                <p className="config-typo-sublabel" data-testid="surface-publish-note">
                    {statusNote}
                </p>
            :   null}

            <FocusPanelSummaryEditBar onUndo={undo} canUndo={past.length > 0} onReset={reset} />

            {/* Canvas + contextual Inspector. The canvas keeps the runtime Focus Panel
                proportions (capped, centered); the Inspector opens beside it. */}
            <div className="flex min-h-0 flex-1 gap-4">
                <div className="flex min-w-0 flex-1 justify-center overflow-y-auto">
                    <div
                        className="process-config-setup-card w-full max-w-[720px] overflow-hidden"
                        data-surface-editor-canvas="enrollment-focus-panel-summary"
                        data-focus-panel-canvas-footprint="focus-panel"
                    >
                        <div className="flex items-center justify-between border-b border-alloy-forge/10 px-4 py-2.5">
                            <span className="config-typo-field-label">Focus Panel</span>
                            <span className="config-typo-meta">Preview</span>
                        </div>
                        <div className="p-3" data-focus-panel-mode="summary" data-focus-panel-edit-mode="true">
                            {renderInsertLine(0, "Add card")}
                            <FocusPanelCardGrid
                                rows={rows}
                                renderCell={(instanceId) => {
                                    const entry = byInstance.get(instanceId);
                                    if (!entry) return null;
                                    const baseModel = cards.get(entry.key);
                                    if (!baseModel) return null;
                                    const model = composeEffectiveCardModel(baseModel, entry.config, record);
                                    const index = order.findIndex((c) => entryInstanceId(c) === instanceId);
                                    const card = (
                                        <FocusPanelCardRenderer
                                            model={model}
                                            displayVm={vm}
                                            drawerId={String(vm.entity.id)}
                                            record={record}
                                            opportunitySingular="Enrollment"
                                            canMutate={false}
                                            focusPanelMode="summary"
                                            onSelectTab={() => {}}
                                        />
                                    );
                                    return (
                                        <FocusPanelEditableCardFrame
                                            cardKey={instanceId}
                                            selected={selectedInstanceId === instanceId}
                                            onSelect={setSelectedInstanceId}
                                            structureControls={{
                                                span: entry.span,
                                                canMovePrev: index > 0,
                                                canMoveNext: index >= 0 && index < order.length - 1,
                                                onMovePrev: () => commit(moveSummaryCard(order, instanceId, -1)),
                                                onMoveNext: () => commit(moveSummaryCard(order, instanceId, 1)),
                                                onCycleSpan: () => commit(cycleSummaryCardSpan(order, instanceId)),
                                                onDuplicate: () => commit(duplicateSummaryCard(order, instanceId)),
                                                onRemove: () => {
                                                    commit(removeSummaryCard(order, instanceId));
                                                    setSelectedInstanceId((sel) => (sel === instanceId ? null : sel));
                                                },
                                            }}
                                            dragControls={{
                                                dragging: draggingId === instanceId,
                                                dropTarget: dropTargetId === instanceId && draggingId !== instanceId,
                                                onDragStart: () => setDraggingId(instanceId),
                                                onDragEnd: () => {
                                                    setDraggingId(null);
                                                    setDropTargetId(null);
                                                },
                                                onDragOver: (e: DragEvent<HTMLElement>) => {
                                                    e.preventDefault();
                                                    setDropTargetId(instanceId);
                                                },
                                                onDrop: (e: DragEvent<HTMLElement>) => {
                                                    e.preventDefault();
                                                    handleDrop(instanceId);
                                                },
                                            }}
                                        >
                                            {card}
                                        </FocusPanelEditableCardFrame>
                                    );
                                }}
                            />

                            {/* Trailing "+ line" doubles as the drag drop-to-end target. */}
                            <div
                                data-testid="focus-panel-empty-slot"
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDropTargetId("__end__");
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (draggingId) commit(moveSummaryCardToIndex(order, draggingId, order.length));
                                    setDraggingId(null);
                                    setDropTargetId(null);
                                }}
                                className={[
                                    "rounded-xl transition-colors",
                                    dropTargetId === "__end__" ? "bg-alloy-pine/5" : "",
                                ].join(" ")}
                            >
                                {renderInsertLine(order.length, order.length === 0 ? "Add the first card" : "Add card")}
                            </div>

                            {cardCatalogPicker}
                        </div>
                    </div>
                </div>

                {selectedEntry && selectedBaseModel ? (
                    <div className="w-[340px] shrink-0 overflow-y-auto">
                        <FocusPanelCardInspector
                            baseModel={selectedBaseModel}
                            instanceId={selectedInstanceId!}
                            config={selectedEntry.config ?? {}}
                            onChange={(config) => handleConfigChange(selectedInstanceId!, config)}
                            onClose={() => setSelectedInstanceId(null)}
                            onDuplicate={() => commit(duplicateSummaryCard(order, selectedInstanceId!))}
                            onRemove={() => {
                                commit(removeSummaryCard(order, selectedInstanceId!));
                                setSelectedInstanceId(null);
                            }}
                            history={{
                                publishedVersion: layoutState.published?.version ?? null,
                                hasDraft: Boolean(layoutState.draft),
                                dirty,
                            }}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
