"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import FocusPanelCardInspector from "@/components/admin/focusPanel/FocusPanelCardInspector";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
import FocusPanelGridCanvasBuilder from "@/components/admin/focusPanel/FocusPanelGridCanvasBuilder";
import { gridFromPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import {
    readFocusPanelPublishedLayout,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import {
    cardsInLayout,
    defaultRowLayoutFromCards,
    withPublishedLayoutMetadata,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import FocusPanelSummaryEditBar from "@/components/admin/focusPanel/FocusPanelSummaryEditBar";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import {
    buildSummaryDocFromOrder,
    entryInstanceId,
    readSummaryCardOrder,
    updateSummaryCardConfig,
    type SummaryCardOrderEntry,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";
import type { FocusPanelCardConfig } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
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

    // Preview canvas observes the same Operational Context boundary the runtime uses.
    const previewContext = useMemo(
        () =>
            buildOperationalContext({
                subjectId: String(vm.entity.id),
                title: vm.header.title,
                subjectVm: vm,
                truth: record,
                perspective: null,
                statusLabel: "Tour scheduled",
                canMutate: false,
            }),
        [vm, record],
    );

    const defaultOrder = useMemo(() => readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC), []);

    const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
    const [order, setOrder] = useState<SummaryCardOrderEntry[]>(defaultOrder);
    const [past, setPast] = useState<SummaryCardOrderEntry[][]>([]);

    // Publish loop state (configure → publish → operate).
    const [layoutState, setLayoutState] = useState<FocusPanelSummaryLayoutState>({ draft: null, published: null });
    const [loaded, setLoaded] = useState(false);
    const [dirty, setDirty] = useState(false);
    // Published row/width layout (Composition V2). Null → runtime keeps its auto
    // composition default; once authored, the runtime renders exactly this.
    const [rowLayout, setRowLayout] = useState<FocusPanelPublishedLayout | null>(null);
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
                    setRowLayout(readFocusPanelPublishedLayout(seedDoc)); // existing layout, or null
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

    // The summary doc carries the card instances/config (from order) AND, when the
    // operator has composed one, the published row/width layout in metadata that the
    // runtime renders exactly. No authored layout → no metadata → auto fallback.
    const buildDocWithLayout = useCallback(() => {
        const doc = buildSummaryDocFromOrder(order);
        return rowLayout ? { ...doc, metadata: withPublishedLayoutMetadata(doc.metadata, rowLayout) } : doc;
    }, [order, rowLayout]);

    // The CANVAS is the single source of truth for which cards exist + their composition.
    // Keep the doc SECTIONS (order) in sync with the cards placed on the canvas: a newly
    // dropped card gets a default section (so its per-card config + the Inspector exist),
    // and a card removed from the canvas drops its section. Existing config is preserved.
    const reconcileOrderToLayout = useCallback(
        (layout: FocusPanelPublishedLayout) => {
            const keys = cardsInLayout(layout);
            setOrder((prev) => {
                const byKey = new Map(prev.map((e) => [e.key, e]));
                const next = keys
                    .map((key) => {
                        const k = key as FocusPanelCardKey;
                        const existing = byKey.get(k);
                        if (existing) return existing;
                        const model = cards.get(k);
                        return model
                            ? ({ key: k, span: model.span, density: model.density, tier: model.tier, gridRow: 0, instanceId: k } as SummaryCardOrderEntry)
                            : null;
                    })
                    .filter((e): e is SummaryCardOrderEntry => e !== null);
                return next;
            });
        },
        [cards],
    );

    const handleSaveDraft = useCallback(async () => {
        setSaving(true);
        setStatusNote(null);
        try {
            const saved = await saveFocusPanelSummaryDraft(layoutState, buildDocWithLayout());
            setLayoutState((s) => ({ ...s, draft: { id: saved.id, version: saved.version, doc: saved.doc } }));
            setDirty(false);
            setStatusNote("Draft saved");
        } catch (e) {
            setStatusNote((e as Error).message);
        } finally {
            setSaving(false);
        }
    }, [layoutState, buildDocWithLayout]);

    const handlePublish = useCallback(async () => {
        setPublishing(true);
        setStatusNote(null);
        try {
            const draft = await saveFocusPanelSummaryDraft(layoutState, buildDocWithLayout());
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
    }, [layoutState, buildDocWithLayout]);

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

    const handleConfigChange = useCallback(
        (instanceId: string, config: FocusPanelCardConfig) => {
            commit(updateSummaryCardConfig(order, instanceId, config));
        },
        [commit, order],
    );

    const selectedEntry = selectedInstanceId ? byInstance.get(selectedInstanceId) ?? null : null;
    const selectedBaseModel = selectedEntry ? cards.get(selectedEntry.key) ?? null : null;


    // Row-based composition builder (Composition V2): catalog from the catalog'd cards,
    // seeded from the loaded layout or a default arrangement of the present cards.
    const builderCatalog = useMemo(
        () =>
            FOCUS_PANEL_CARD_CATALOG.filter((e) => e.cardKey).map((e) => ({
                key: e.cardKey as FocusPanelCardKey,
                label: e.label,
            })),
        [],
    );
    const builderInitial = useMemo(
        () => rowLayout ?? defaultRowLayoutFromCards(order.map((o) => o.key)),
        // Seeded once on load; the builder is uncontrolled after mount (gated on `loaded`).
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loaded],
    );
    // EB V5: the canvas authors a responsive GRID. Seed it from the loaded layout's grid,
    // or convert its rows → grid placement (so an existing row layout opens cleanly).
    const builderInitialGrid = useMemo(
        () => gridFromPublishedLayout(builderInitial),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loaded],
    );
    const renderBuilderCard = useCallback(
        (key: FocusPanelCardKey) => {
            const model = cards.get(key);
            return model ? (
                <FocusPanelCardRenderer
                    model={model}
                    context={previewContext}
                    focusPanelMode="summary"
                    compat={{ subjectVm: vm, onSelectTab: () => {} }}
                />
            ) : null;
        },
        [cards, previewContext, vm],
    );

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

            {/* Row-based composition (Composition V2): compose the Focus Panel with rows
                and columns. This published layout drives the runtime exactly; the card
                catalog + per-card config below remain for which cards exist + their
                content. Save draft / Publish (toolbar) persist this layout in metadata. */}
            {loaded ? (
                <div className="flex min-h-0 flex-1 gap-4">
                    {/* CANVAS owns composition: position · width · height · stacking · row. */}
                    <div className="process-config-setup-card min-w-0 flex-1 overflow-auto p-3" data-surface-canvas-builder="true">
                        <FocusPanelGridCanvasBuilder
                            initialGrid={builderInitialGrid}
                            catalog={builderCatalog}
                            renderCard={renderBuilderCard}
                            selectedCard={selectedEntry?.key ?? null}
                            onSelectCard={(key) => {
                                const entry = order.find((o) => o.key === key);
                                if (entry) setSelectedInstanceId(entry.instanceId);
                            }}
                            onChange={(l) => {
                                setRowLayout(l); // l carries grid (source of truth) + derived rows
                                reconcileOrderToLayout(l); // keep sections (order) in sync — one source of truth
                                setDirty(true);
                            }}
                        />
                    </div>

                    {/* INSPECTOR owns behavior — adjacent to the canvas, updates on select. */}
                    <div className="w-[360px] shrink-0 overflow-y-auto" data-surface-inspector="true">
                        {selectedEntry && selectedBaseModel ? (
                            <FocusPanelCardInspector
                                baseModel={selectedBaseModel}
                                instanceId={selectedInstanceId!}
                                config={selectedEntry.config ?? {}}
                                onChange={(config) => handleConfigChange(selectedInstanceId!, config)}
                                onClose={() => setSelectedInstanceId(null)}
                                history={{
                                    publishedVersion: layoutState.published?.version ?? null,
                                    hasDraft: Boolean(layoutState.draft),
                                    dirty,
                                }}
                            />
                        ) : (
                            <div className="process-config-setup-card flex h-full items-center justify-center p-6 text-center" data-surface-inspector-empty="true">
                                <p className="config-typo-sublabel">
                                    Select a card on the canvas to configure its behavior — question, evidence groups, editing, expanded, related views.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

        </div>
    );
}
