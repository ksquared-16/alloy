"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import SurfaceFieldInspector from "@/components/adminV2/settings/surfaces/composer/SurfaceFieldInspector";
import SurfaceHeaderSummaryEditor, { addSurfaceHeaderRenderer } from "@/components/adminV2/settings/surfaces/composer/SurfaceHeaderSummaryEditor";
import SurfaceItemLibraryPanel from "@/components/adminV2/settings/surfaces/composer/SurfaceItemLibraryPanel";
import FocusPanelCardFieldComposer from "@/components/adminV2/settings/surfaces/FocusPanelCardFieldComposer";
import FocusPanelHeaderPreview from "@/components/adminV2/settings/surfaces/FocusPanelHeaderPreview";
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
import { focusPanelNestedSurfaceByCardKey } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import {
    SURFACE_COMPOSER_EMPTY_HINT,
    defaultSurfaceHeaderSummaryConfig,
    readSurfaceHeaderSummaryConfig,
    surfaceComposerInlineFromPlacementMode,
    withSurfaceHeaderSummaryMetadata,
    type SurfaceFieldSectionKey,
    type SurfaceHeaderSummaryConfig,
} from "@/lib/adminV2/settings/surfaces/surfaceComposer";
import {
    buildFocusPanelHeaderLibrary,
    buildFocusPanelLibraryForCard,
    focusPanelLibraryCategories,
    type FocusPanelLibraryItem,
} from "@/lib/adminV2/settings/surfaces/focusPanelBuilderLibrary";
import {
    addFocusPanelFieldFromLibrary,
    listPlacedFocusPanelFields,
    moveFocusPanelFieldToSection,
    moveFocusPanelPlacedField,
    patchFocusPanelFieldLabel,
    removeFocusPanelPlacedField,
    reorderFocusPanelPlacedField,
    resolveDefaultAppendPlacement,
    seedFocusPanelComposerConfig,
    toSurfaceComposerPlacedItemRef,
    type FocusPanelPlacedFieldRef,
} from "@/lib/adminV2/settings/surfaces/focusPanelComposerModel";
import { resolveSurfaceHeaderSummaryFromConfig } from "@/lib/adminV2/runtime/surfaceHeader/resolveSurfaceHeaderSummary";
import { evidenceGroupsFromConfig } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";

type LibraryTarget =
    | { kind: "identity" }
    | { kind: "card"; cardKey: FocusPanelCardKey; section: SurfaceFieldSectionKey; groupId: string };

type Props = {
    onOpenNestedSurface?: (surfaceId: string) => void;
};

export default function FocusPanelSummarySurfaceEditor({ onOpenNestedSurface }: Props) {
    const { vm, record } = useMemo(() => buildDemoFocusPanelSummaryViewModel(), []);

    const cards = useMemo(
        () =>
            deriveOpportunityFocusPanelPresentation({
                mode: "summary",
                displayVm: vm,
                record,
                title: vm.header.title,
                perspective: null,
                statusLabel: "Open",
            }).cards,
        [vm, record],
    );

    const previewContext = useMemo(
        () =>
            buildOperationalContext({
                subjectId: String(vm.entity.id),
                title: vm.header.title,
                subjectVm: vm,
                truth: record,
                perspective: null,
                statusLabel: "Open",
                canMutate: false,
            }),
        [vm, record],
    );

    const defaultOrder = useMemo(() => readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC), []);

    const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [headerSelected, setHeaderSelected] = useState(false);
    const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
    const [order, setOrder] = useState<SummaryCardOrderEntry[]>(defaultOrder);
    const [past, setPast] = useState<SummaryCardOrderEntry[][]>([]);
    const [identityConfig, setIdentityConfig] = useState<SurfaceHeaderSummaryConfig>(
        defaultSurfaceHeaderSummaryConfig(),
    );

    const [layoutState, setLayoutState] = useState<FocusPanelSummaryLayoutState>({ draft: null, published: null });
    const [loaded, setLoaded] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [rowLayout, setRowLayout] = useState<FocusPanelPublishedLayout | null>(null);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [statusNote, setStatusNote] = useState<string | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryTarget, setLibraryTarget] = useState<LibraryTarget | null>(null);

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
                    setRowLayout(readFocusPanelPublishedLayout(seedDoc));
                    const identity = readSurfaceHeaderSummaryConfig(seedDoc);
                    if (identity) setIdentityConfig(identity);
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

    const buildDocWithLayout = useCallback(() => {
        const doc = buildSummaryDocFromOrder(order);
        const withLayout = rowLayout ? { ...doc, metadata: withPublishedLayoutMetadata(doc.metadata, rowLayout) } : doc;
        return {
            ...withLayout,
            metadata: withSurfaceHeaderSummaryMetadata(withLayout.metadata, identityConfig),
        };
    }, [order, rowLayout, identityConfig]);

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
    const selectedCardConfig = useMemo(
        () => seedFocusPanelComposerConfig(selectedEntry?.key ?? "household", selectedEntry?.config ?? {}),
        [selectedEntry?.config, selectedEntry?.key],
    );

    const placedFields = useMemo(() => {
        if (!selectedEntry) return [];
        return listPlacedFocusPanelFields(selectedEntry.key, selectedCardConfig);
    }, [selectedCardConfig, selectedEntry]);

    const selectedPlacedField: FocusPanelPlacedFieldRef | null = useMemo(
        () => placedFields.find((f) => f.fieldId === selectedFieldId) ?? null,
        [placedFields, selectedFieldId],
    );

    const identityPreviewSegments = useMemo(
        () =>
            resolveSurfaceHeaderSummaryFromConfig(identityConfig, {
                record,
                statusLabel: "Open",
                processLabel: "Enrollment",
                locationLabel: "North Campus",
            }),
        [identityConfig, record],
    );

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loaded],
    );
    const builderInitialGrid = useMemo(
        () => gridFromPublishedLayout(builderInitial),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loaded],
    );
    const nestedSurfaceByCard = useMemo(() => focusPanelNestedSurfaceByCardKey(), []);

    const libraryItems: FocusPanelLibraryItem[] = useMemo(() => {
        if (!libraryTarget) return [];
        if (libraryTarget.kind === "identity") return buildFocusPanelHeaderLibrary();
        return buildFocusPanelLibraryForCard(libraryTarget.cardKey);
    }, [libraryTarget]);

    const libraryCategories = useMemo(
        () => focusPanelLibraryCategories(libraryItems),
        [libraryItems],
    );

    const openLibrary = useCallback((target: LibraryTarget) => {
        setLibraryTarget(target);
        setLibraryOpen(true);
    }, []);

    const handleLibraryPick = useCallback(
        (item: FocusPanelLibraryItem) => {
            if (!libraryTarget) return;
            if (libraryTarget.kind === "identity" && item.kind === "header_renderer") {
                setIdentityConfig((c) => addSurfaceHeaderRenderer(c, item.rendererKey));
                setDirty(true);
                setHeaderSelected(true);
                setSelectedInstanceId(null);
                setSelectedFieldId(null);
            } else if (libraryTarget.kind === "card" && item.kind === "field" && selectedInstanceId) {
                const placement = resolveDefaultAppendPlacement(placedFields, libraryTarget.section);
                const groups = evidenceGroupsFromConfig(selectedCardConfig);
                const groupId = groups.find((g) => g.id === libraryTarget.groupId)?.id ?? groups[0]?.id;
                if (!groupId) return;
                const next = addFocusPanelFieldFromLibrary(selectedCardConfig, selectedEntry!.key, {
                    groupId,
                    concept: item.concept,
                    label: item.label,
                    placement,
                });
                handleConfigChange(selectedInstanceId, next);
                setSelectedFieldId(next.fields?.slice(-1)[0]?.id ?? null);
            }
            setLibraryOpen(false);
            setLibraryTarget(null);
        },
        [
            handleConfigChange,
            libraryTarget,
            placedFields,
            selectedCardConfig,
            selectedEntry,
            selectedInstanceId,
        ],
    );

    const renderBuilderCard = useCallback(
        (key: FocusPanelCardKey) => {
            const model = cards.get(key);
            const entry = order.find((o) => o.key === key);
            const isSelected = selectedEntry?.key === key;
            const cardConfig = seedFocusPanelComposerConfig(key, entry?.config ?? {});
            const cardPlaced = listPlacedFocusPanelFields(key, cardConfig);
            return model ?
                <div className="relative h-full min-h-[4rem]">
                    <FocusPanelCardRenderer
                        model={model}
                        context={previewContext}
                        focusPanelMode="summary"
                        compat={{ subjectVm: vm, onSelectTab: () => {} }}
                    />
                    {isSelected ?
                        <FocusPanelCardFieldComposer
                            placed={cardPlaced}
                            selectedFieldId={selectedFieldId}
                            onSelectField={(fieldId) => {
                                setSelectedFieldId(fieldId);
                                setHeaderSelected(false);
                            }}
                            onAddToSection={(section) => {
                                const groups = evidenceGroupsFromConfig(cardConfig);
                                openLibrary({
                                    kind: "card",
                                    cardKey: key,
                                    section,
                                    groupId: groups[0]?.id ?? "details",
                                });
                            }}
                            onClickEmpty={() => {
                                const groups = evidenceGroupsFromConfig(cardConfig);
                                openLibrary({
                                    kind: "card",
                                    cardKey: key,
                                    section: "identity",
                                    groupId: groups[0]?.id ?? "details",
                                });
                            }}
                        />
                    :   null}
                </div>
            :   null;
        },
        [cards, openLibrary, order, previewContext, selectedEntry?.key, selectedFieldId, vm],
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-3" data-testid="focus-panel-summary-surface-editor">
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

            {loaded ?
                <div className="flex min-h-0 flex-1 gap-4">
                    <div className="process-config-setup-card min-w-0 flex-1 overflow-auto p-3" data-surface-canvas-builder="true">
                        <div className="mb-3 max-w-2xl">
                            <FocusPanelHeaderPreview
                                subjectTitle={vm.header.title}
                                identitySegments={identityPreviewSegments}
                                selected={headerSelected}
                                onClickHeader={() => {
                                    setHeaderSelected(true);
                                    setSelectedInstanceId(null);
                                    setSelectedFieldId(null);
                                }}
                            />
                        </div>

                        {!selectedInstanceId && !headerSelected ?
                            <p className="mb-2 text-[12px] text-alloy-midnight/45" data-focus-panel-composer-hint="true">
                                {SURFACE_COMPOSER_EMPTY_HINT}
                            </p>
                        :   null}

                        <FocusPanelGridCanvasBuilder
                            initialGrid={builderInitialGrid}
                            catalog={builderCatalog}
                            renderCard={renderBuilderCard}
                            selectedCard={selectedEntry?.key ?? null}
                            nestedSurfaceByCard={nestedSurfaceByCard}
                            onOpenNestedSurface={onOpenNestedSurface}
                            onSelectCard={(key) => {
                                const entry = order.find((o) => o.key === key);
                                if (entry) {
                                    setSelectedInstanceId(entry.instanceId);
                                    setHeaderSelected(false);
                                    setSelectedFieldId(null);
                                }
                            }}
                            onChange={(l) => {
                                setRowLayout(l);
                                reconcileOrderToLayout(l);
                                setDirty(true);
                            }}
                        />
                    </div>

                    <div className="w-[360px] shrink-0 overflow-y-auto" data-surface-inspector="true">
                        {headerSelected ?
                            <div className="process-config-setup-card p-4">
                                <SurfaceHeaderSummaryEditor
                                    config={identityConfig}
                                    selectedId={selectedIdentityId}
                                    sectionTitle="Identity Summary"
                                    onSelect={setSelectedIdentityId}
                                    onChange={(next) => {
                                        setIdentityConfig(next);
                                        setDirty(true);
                                    }}
                                    onOpenLibrary={() => openLibrary({ kind: "identity" })}
                                />
                            </div>
                        : selectedPlacedField && selectedInstanceId ?
                            <div className="process-config-setup-card p-4">
                                <p className="config-typo-workspace-title mb-3 text-sm">Field</p>
                                <SurfaceFieldInspector
                                    field={toSurfaceComposerPlacedItemRef(selectedPlacedField)}
                                    onChangeSection={(section) => {
                                        const next = moveFocusPanelFieldToSection(
                                            selectedCardConfig,
                                            selectedPlacedField.fieldId,
                                            section,
                                            placedFields,
                                        );
                                        handleConfigChange(selectedInstanceId, next);
                                    }}
                                    onChangePlacement={(mode) => {
                                        const next = moveFocusPanelPlacedField(selectedCardConfig, selectedPlacedField.fieldId, {
                                            inlineWithPrevious: surfaceComposerInlineFromPlacementMode(mode),
                                        });
                                        handleConfigChange(selectedInstanceId, next);
                                    }}
                                    onChangeLabel={(label) => {
                                        handleConfigChange(
                                            selectedInstanceId,
                                            patchFocusPanelFieldLabel(selectedCardConfig, selectedPlacedField.fieldId, label),
                                        );
                                    }}
                                    onMoveEarlier={() =>
                                        handleConfigChange(
                                            selectedInstanceId,
                                            reorderFocusPanelPlacedField(selectedCardConfig, selectedPlacedField.fieldId, "earlier"),
                                        )
                                    }
                                    onMoveLater={() =>
                                        handleConfigChange(
                                            selectedInstanceId,
                                            reorderFocusPanelPlacedField(selectedCardConfig, selectedPlacedField.fieldId, "later"),
                                        )
                                    }
                                    onRemove={() => {
                                        handleConfigChange(
                                            selectedInstanceId,
                                            removeFocusPanelPlacedField(selectedCardConfig, selectedPlacedField.fieldId),
                                        );
                                        setSelectedFieldId(null);
                                    }}
                                />
                            </div>
                        : selectedEntry && selectedBaseModel ?
                            <FocusPanelCardInspector
                                baseModel={selectedBaseModel}
                                instanceId={selectedInstanceId!}
                                config={selectedEntry.config ?? {}}
                                onChange={(config) => handleConfigChange(selectedInstanceId!, config)}
                                onClose={() => {
                                    setSelectedInstanceId(null);
                                    setSelectedFieldId(null);
                                }}
                                history={{
                                    publishedVersion: layoutState.published?.version ?? null,
                                    hasDraft: Boolean(layoutState.draft),
                                    dirty,
                                }}
                            />
                        :   <div className="process-config-setup-card flex h-full items-center justify-center p-6 text-center" data-surface-inspector-empty="true">
                                <p className="config-typo-sublabel">
                                    {SURFACE_COMPOSER_EMPTY_HINT} Select a placed field to edit Section and Placement.
                                </p>
                            </div>
                        }
                    </div>
                </div>
            :   null}

            <SurfaceItemLibraryPanel
                open={libraryOpen}
                categories={focusPanelLibraryCategories(libraryItems)}
                sectionLabel={
                    libraryTarget?.kind === "identity" ? "Add to Header Summary"
                    : libraryTarget?.kind === "card" ? "Add to card"
                    :   undefined
                }
                subtitle="Choose a component to place on the surface."
                itemKey={(item) =>
                    item.kind === "header_renderer" ? item.rendererKey : `${item.cardKey}:${item.concept}`
                }
                itemLabel={(item) => item.label}
                itemMeta={(item) => (item.kind === "field" ? item.groupLabel : null)}
                onPick={handleLibraryPick}
                onClose={() => {
                    setLibraryOpen(false);
                    setLibraryTarget(null);
                }}
            />
        </div>
    );
}
