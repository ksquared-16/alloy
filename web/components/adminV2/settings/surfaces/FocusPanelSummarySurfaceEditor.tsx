"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import FocusPanelCardInspector from "@/components/admin/focusPanel/FocusPanelCardInspector";
import FocusPanelRuntimeComposerCanvas from "@/components/admin/focusPanel/FocusPanelRuntimeComposerCanvas";
import FocusPanelVisibilityZones from "@/components/adminV2/settings/surfaces/FocusPanelVisibilityZones";
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
import {
    filterPublishedLayoutToVisibleCards,
    visibilityMapFromSummaryOrder,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility";
import { SurfaceBuilderInspectorRail } from "@/components/adminV2/settings/surfaces/SurfaceBuilderInspectorRail";
import { useRegisterSurfaceBuilderChrome } from "@/components/adminV2/settings/surfaces/SurfaceBuilderChromeContext";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import {
    entryInstanceId,
    mergeFocusPanelSummaryWorkingDoc,
    readSummaryCardOrder,
    updateSummaryCardConfig,
    type SummaryCardOrderEntry,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";
import type { FocusPanelCardConfig } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { authorableFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardAuthoring";
import {
    loadFocusPanelSummaryLayout,
    publishFocusPanelSummary,
    saveFocusPanelSummaryDraft,
    FOCUS_PANEL_SUMMARY_NESTED_SAVED_EVENT,
    type FocusPanelSummaryLayoutState,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryLayoutService";
import { validateNestedSurfacesForPublish } from "@/lib/adminV2/settings/surfaces/nestedSurfaceConfigService";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCardDensity } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import FocusPanelDrillInInspector from "@/components/admin/focusPanel/drillIn/FocusPanelDrillInInspector";
import { FocusPanelComposerProvider, useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { focusPanelNestedSurfaceByCardKey } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import {
    reconcileIdentityNestedConfigsFromMetadata,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import { serializeIdentityNestedSurfacesForPublish } from "@/lib/adminV2/runtime/focusPanel/identity/resolvePublishedIdentitySurfaceConfig";
import {
    reconcileNestedSurfaceConfig,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

/**
 * Surfaces editor for the Enrollment Focus Panel (Experience Builder Alpha).
 *
 * Opens as a full-bleed builder stage (studio shell). The canvas is the REAL runtime
 * Focus Panel through FocusPanelRuntimeComposerCanvas — same header, grid, cards, and
 * drill-in coordination as /work-unit — with subtle composer affordances layered on top.
 */
type Props = {
    onBack?: () => void;
    /** Legacy shell — drill-in now opens in-place on the runtime canvas. */
    onOpenNestedSurface?: (surfaceId: string, cardLabel?: string) => void;
};

function readNestedSurfacesFromDoc(doc: { metadata?: Record<string, unknown> } | null): Record<string, NestedSurfaceConfig> {
    const raw = doc?.metadata?.nestedSurfaces;
    if (!raw || typeof raw !== "object") return {};
    const identityNormalized = reconcileIdentityNestedConfigsFromMetadata({
        nestedSurfaces: raw as Record<string, NestedSurfaceConfig | undefined>,
    });
    const stored = raw as Record<string, NestedSurfaceConfig>;
    const passthrough = Object.fromEntries(
        Object.entries(stored)
            .filter(([surfaceId]) => !(surfaceId in identityNormalized))
            .map(([surfaceId, config]) => [
                surfaceId,
                reconcileNestedSurfaceConfig(surfaceId, config ?? null),
            ]),
    );
    return { ...passthrough, ...identityNormalized };
}

function reconcileNestedConfigsForPublish(
    configs: Record<string, NestedSurfaceConfig>,
): Record<string, NestedSurfaceConfig> {
    return serializeIdentityNestedSurfacesForPublish(configs);
}

function FocusPanelComposerInspectorSlot({
    selectedEntry,
    selectedBaseModel,
    selectedInstanceId,
    onConfigChange,
    onClose,
    history,
    order,
    cards,
}: {
    selectedEntry: SummaryCardOrderEntry | null;
    selectedBaseModel: FocusPanelCardModel | null;
    selectedInstanceId: string | null;
    onConfigChange: (instanceId: string, config: FocusPanelCardConfig) => void;
    onClose: () => void;
    history: { publishedVersion: number | null; hasDraft: boolean; dirty: boolean };
    order: SummaryCardOrderEntry[];
    cards: Map<FocusPanelCardKey, FocusPanelCardModel>;
}) {
    const composer = useFocusPanelComposer();
    if (composer?.drillIn) {
        const drillEntry = order.find((e) => e.key === composer.drillIn!.cardKey) ?? null;
        const drillModel = cards.get(composer.drillIn.cardKey) ?? null;
        if (drillEntry && drillModel) {
            return (
                <FocusPanelDrillInInspector
                    drillCardKey={composer.drillIn.cardKey}
                    drillEntry={drillEntry}
                    drillModel={drillModel}
                    onConfigChange={onConfigChange}
                    history={history}
                />
            );
        }
    }
    if (selectedEntry && selectedBaseModel) {
        return (
            <FocusPanelCardInspector
                baseModel={selectedBaseModel}
                instanceId={selectedInstanceId!}
                config={selectedEntry.config ?? {}}
                onChange={(config) => onConfigChange(selectedInstanceId!, config)}
                onClose={onClose}
                history={history}
            />
        );
    }
    return (
        <div className="flex h-full items-center justify-center p-6 text-center" data-surface-inspector-empty="true">
            <p className="config-typo-sublabel">
                Select a card on the canvas, or click Configure on a card to compose its drill-in surface in place.
            </p>
        </div>
    );
}

function FocusPanelInspectorColumn(props: Parameters<typeof FocusPanelComposerInspectorSlot>[0]) {
    const composer = useFocusPanelComposer();
    const drillIn = composer?.drillIn;
    const identityBuilderDrillIn =
        Boolean(drillIn)
        && (drillIn!.surfaceId === "household_surface" || drillIn!.surfaceId === "children_surface");
    const widthClassName = identityBuilderDrillIn ? "w-[360px]" : drillIn ? "w-[300px]" : "w-[380px]";
    return (
        <SurfaceBuilderInspectorRail
            widthClassName={widthClassName}
            testId="focus-panel-inspector-rail"
            aria-label="Focus Panel configuration"
        >
            <div
                className="h-full"
                data-surface-inspector="true"
                data-surface-inspector-mode={
                    identityBuilderDrillIn ? "identity-builder" : drillIn ? "drill-in-metadata" : "card"
                }
            >
                <FocusPanelComposerInspectorSlot {...props} />
            </div>
        </SurfaceBuilderInspectorRail>
    );
}

export default function FocusPanelSummarySurfaceEditor({ onBack: _onBack, onOpenNestedSurface }: Props) {
    void onOpenNestedSurface;
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
    /** Latest canonical doc — mutations merge onto this rather than rebuilding from a partial projection. */
    const [baseDoc, setBaseDoc] = useState(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
    const [loaded, setLoaded] = useState(false);
    const [dirty, setDirty] = useState(false);
    // Published row/width layout (Composition V2). Null → runtime keeps its auto
    // composition default; once authored, the runtime renders exactly this.
    const [rowLayout, setRowLayout] = useState<FocusPanelPublishedLayout | null>(null);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [statusNote, setStatusNote] = useState<string | null>(null);
    const [nestedConfigs, setNestedConfigs] = useState<Record<string, NestedSurfaceConfig>>({});
    const [nestedConfigsSeed, setNestedConfigsSeed] = useState<Record<string, NestedSurfaceConfig>>({});

    useEffect(() => {
        let active = true;
        const hydrate = (state: FocusPanelSummaryLayoutState) => {
            if (!active) return;
            setLayoutState(state);
            const seedDoc = state.draft?.doc ?? state.published?.doc ?? FOCUS_PANEL_SUMMARY_DEFAULT_DOC;
            setBaseDoc(seedDoc);
            const seeded = readSummaryCardOrder(seedDoc);
            if (seeded.length > 0) setOrder(seeded);
            // Prefer authored layout; only fall back to defaults when the surface has none.
            setRowLayout(
                readFocusPanelPublishedLayout(seedDoc)
                    ?? (state.draft || state.published
                        ? null
                        : readFocusPanelPublishedLayout(FOCUS_PANEL_SUMMARY_DEFAULT_DOC)),
            );
            const nested = readNestedSurfacesFromDoc(seedDoc);
            setNestedConfigs(nested);
            setNestedConfigsSeed(nested);
            setLoaded(true);
        };
        loadFocusPanelSummaryLayout()
            .then(hydrate)
            .catch((e: unknown) => {
                if (!active) return;
                setStatusNote((e as Error).message);
                setLoaded(true);
            });
        const onNestedSaved = () => {
            loadFocusPanelSummaryLayout()
                .then((state) => {
                    if (!active) return;
                    setLayoutState(state);
                    const seedDoc = state.draft?.doc ?? state.published?.doc ?? FOCUS_PANEL_SUMMARY_DEFAULT_DOC;
                    setBaseDoc(seedDoc);
                    const nested = readNestedSurfacesFromDoc(seedDoc);
                    setNestedConfigs(nested);
                    setNestedConfigsSeed(nested);
                    // Do not reset order/rowLayout here — parent may have unsaved composition edits.
                })
                .catch(() => {
                    /* keep local state if refresh fails */
                });
        };
        window.addEventListener(FOCUS_PANEL_SUMMARY_NESTED_SAVED_EVENT, onNestedSaved);
        return () => {
            active = false;
            window.removeEventListener(FOCUS_PANEL_SUMMARY_NESTED_SAVED_EVENT, onNestedSaved);
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

    // Merge typed working edits onto the loaded canonical doc (lossless for untouched metadata).
    const buildDocWithLayout = useCallback(() => {
        const publishedLayoutMetadata = rowLayout
            ? withPublishedLayoutMetadata({}, rowLayout)
            : null;
        return mergeFocusPanelSummaryWorkingDoc({
            base: baseDoc,
            order,
            publishedLayoutMetadata,
            nestedSurfaces: reconcileNestedConfigsForPublish(nestedConfigs),
        });
    }, [baseDoc, order, rowLayout, nestedConfigs]);

    const handleNestedConfigsChange = useCallback((configs: Record<string, NestedSurfaceConfig>) => {
        setNestedConfigs(configs);
        setDirty(true);
    }, []);

    // The CANVAS is the single source of truth for which cards exist + their composition.
    // Keep the doc SECTIONS (order) in sync with the cards placed on the canvas: a newly
    // dropped card gets a default section (so its per-card config + the Inspector exist),
    // and a card removed from the canvas drops its section. Existing config is preserved.
    const reconcileOrderToLayout = useCallback(
        (layout: FocusPanelPublishedLayout) => {
            const keys = cardsInLayout(layout);
            setOrder((prev) => {
                const byKey = new Map(prev.map((e) => [e.key, e]));
                // Visible composition follows the canvas; preserve Linked/Hidden entries
                // so moving a card out of the grid does not destroy its config identity.
                const preserved = prev.filter((e) => e.visibility === "linked" || e.visibility === "hidden");
                const preservedKeys = new Set(preserved.map((e) => e.key));
                const visible = keys
                    .filter((key) => !preservedKeys.has(key as FocusPanelCardKey))
                    .map((key) => {
                        const k = key as FocusPanelCardKey;
                        const existing = byKey.get(k);
                        if (existing) return { ...existing, visibility: "visible" as const };
                        const model = cards.get(k);
                        return model
                            ? ({
                                  key: k,
                                  span: model.span,
                                  density: model.density,
                                  tier: model.tier,
                                  gridRow: 0,
                                  instanceId: k,
                                  visibility: "visible" as const,
                              } as SummaryCardOrderEntry)
                            : null;
                    })
                    .filter((e): e is SummaryCardOrderEntry => e !== null);
                return [...visible, ...preserved];
            });
        },
        [cards],
    );

    const handleSaveDraft = useCallback(async () => {
        setSaving(true);
        setStatusNote(null);
        try {
            const nextDoc = buildDocWithLayout();
            const saved = await saveFocusPanelSummaryDraft(layoutState, nextDoc);
            setBaseDoc(saved.doc);
            setLayoutState((s) => ({
                ...s,
                draft: {
                    id: saved.id,
                    version: saved.version,
                    doc: saved.doc,
                    updatedAt: saved.updatedAt ?? null,
                },
            }));
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
            const nextDoc = buildDocWithLayout();
            const nestedError = validateNestedSurfacesForPublish(nextDoc);
            if (nestedError) {
                setStatusNote(nestedError);
                return;
            }
            const draft = await saveFocusPanelSummaryDraft(layoutState, nextDoc);
            const published = await publishFocusPanelSummary(draft.id);
            setBaseDoc(published.doc);
            setLayoutState({
                draft: null,
                published: {
                    id: published.id,
                    version: published.version,
                    doc: published.doc,
                    updatedAt: published.updatedAt ?? null,
                },
            });
            setDirty(false);
            setStatusNote(`Published v${published.version}`);
        } catch (e) {
            setStatusNote((e as Error).message);
        } finally {
            setPublishing(false);
        }
    }, [layoutState, buildDocWithLayout]);

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

    /*
     * A PLACEMENT VARIANT IS A DENSITY, and it has to persist.
     *
     * Choosing "Financials — Compact" that then published as the Summary presentation would make
     * the variant decorative. The density travels through the SAME per-card config path the
     * inspector writes (`appearance.density`, applied by `composeEffectiveCardModel`), so the
     * builder is not inventing a second place to store it.
     */
    const handleVariantDensity = useCallback(
        (cardKey: FocusPanelCardKey, density: FocusPanelCardDensity) => {
            setOrder((prev) => {
                const entry = prev.find((e) => e.key === cardKey);
                if (!entry) return prev;
                return updateSummaryCardConfig(prev, entry.instanceId, {
                    ...(entry.config ?? {}),
                    appearance: { ...(entry.config?.appearance ?? {}), density },
                } as FocusPanelCardConfig);
            });
        },
        [],
    );

    const selectedEntry = selectedInstanceId ? byInstance.get(selectedInstanceId) ?? null : null;
    const selectedBaseModel = selectedEntry ? cards.get(selectedEntry.key) ?? null : null;


    // Row-based composition builder (Composition V2): catalog from the catalog'd cards,
    // seeded from the loaded layout or a default arrangement of the present cards.
    /*
     * THE AUTHORABLE LIBRARY, DERIVED — not a hand-kept list beside the registry.
     *
     * `FOCUS_PANEL_CARD_CATALOG` was a parallel array that had drifted in every direction: it
     * offered `billing_preview` beside Financials as a peer, listed cards under their PREDECESSOR's
     * name, carried keys with no registered card behind them, and omitted Staff. Deriving from
     * `authorableFocusPanelCards()` means the builder and the renderer read the same registry and
     * the same supersession contract, so they cannot disagree about what a card is.
     *
     * Entries carry their PLACEMENT too, so Financials offers Summary (8/12) and Compact (4/12) as
     * two visibly different choices that store one canonical `cardKey`.
     */
    const builderCatalog = useMemo(
        () =>
            authorableFocusPanelCards().map((option) => ({
                key: option.cardKey,
                label: option.label,
                variantLabel: option.variantLabel,
                density: option.density,
                columns: option.columns,
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
    const nestedSurfaceByCard = useMemo(() => focusPanelNestedSurfaceByCardKey(), []);

    const publicationLabel = layoutState.published
        ? `Published v${layoutState.published.version}`
        : layoutState.draft
          ? "Draft"
          : null;

    useRegisterSurfaceBuilderChrome({
        surfaceId: "enrollment-focus-panel-summary",
        publicationLabel,
        dirty,
        saving,
        publishing,
        canUndo: past.length > 0,
        showSaveDraft: true,
        showHistoryControls: true,
        onSaveDraft: () => void handleSaveDraft(),
        onPublish: () => void handlePublish(),
        onUndo: undo,
        onReset: reset,
        saveDisabled: !loaded,
        publishDisabled: !loaded,
    });

    return (
        <FocusPanelComposerProvider
            initialNestedConfigs={nestedConfigsSeed}
            onNestedConfigsChange={handleNestedConfigsChange}
        >
        <div
            className="flex h-full min-h-0 flex-1 flex-col gap-3 bg-white p-4"
            data-testid="focus-panel-summary-surface-editor"
            data-focus-panel-builder-wide="true"
        >
            {statusNote ?
                <p className="config-typo-sublabel" data-testid="surface-publish-note">
                    {statusNote}
                </p>
            :   null}

            {loaded ? (
                <div className="flex min-h-0 flex-1 gap-4">
                    {/* Wide builder stage — runtime-shaped Focus Panel sits in the full canvas. */}
                    <div className="process-config-setup-card flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-4">
                        <FocusPanelVisibilityZones
                            order={order}
                            onChange={(next) => {
                                commit(next);
                                const visMap = visibilityMapFromSummaryOrder(next);
                                setRowLayout((prev) => {
                                    const base =
                                        prev
                                        ?? defaultRowLayoutFromCards(
                                            next
                                                .filter((e) => (e.visibility ?? "visible") === "visible")
                                                .map((e) => e.key),
                                        );
                                    return filterPublishedLayoutToVisibleCards(base, visMap);
                                });
                            }}
                        />
                        <FocusPanelRuntimeComposerCanvas
                            initialGrid={builderInitialGrid}
                            catalog={builderCatalog}
                            onCardDensityChange={handleVariantDensity}
                            order={order}
                            cards={cards}
                            vm={vm}
                            record={record}
                            previewContext={previewContext}
                            title={vm.header.title}
                            statusLabel="Tour scheduled"
                            selectedCard={selectedEntry?.key ?? null}
                            nestedSurfaceByCard={nestedSurfaceByCard}
                            onSelectCard={(key) => {
                                const entry = order.find((o) => o.key === key);
                                if (entry) setSelectedInstanceId(entry.instanceId);
                            }}
                            onLayoutChange={(l) => {
                                setRowLayout(l);
                                reconcileOrderToLayout(l);
                                setDirty(true);
                            }}
                        />
                    </div>

                    <FocusPanelInspectorColumn
                        selectedEntry={selectedEntry}
                        selectedBaseModel={selectedBaseModel}
                        selectedInstanceId={selectedInstanceId}
                        onConfigChange={handleConfigChange}
                        onClose={() => setSelectedInstanceId(null)}
                        history={{
                            publishedVersion: layoutState.published?.version ?? null,
                            hasDraft: Boolean(layoutState.draft),
                            dirty,
                        }}
                        order={order}
                        cards={cards}
                    />
                </div>
            ) : null}
        </div>
        </FocusPanelComposerProvider>
    );
}
