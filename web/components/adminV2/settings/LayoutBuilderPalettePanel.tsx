"use client";

import { useMemo, useState } from "react";
import LayoutBuilderAddCardDialog, {
    type LayoutBuilderAddCardDialogSubmit,
} from "@/components/adminV2/settings/LayoutBuilderAddCardDialog";
import OpportunityDrawerLayoutFieldPicker from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldPicker";
import {
    layoutBuilderWidgetOptionsForSurface,
} from "@/lib/layout/layoutBuilderPaletteModel";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    addSectionFieldItem,
    addSectionRow,
    addSectionTextItem,
    addSectionWidgetItem,
} from "@/lib/layout/layoutEditorSectionComposition";
import { readSectionType } from "@/lib/layout/layoutEditorSectionLayout";
import { listSectionWidgetItems, sectionIsKpiTile } from "@/lib/layout/layoutBuilderWidgetStrip";
import {
    buildAddSuccessMessage,
    resolvePaletteTargetSectionId,
    sectionZoneLabel,
    type LayoutBuilderPaletteItemKind,
} from "@/lib/layout/layoutBuilderStudioUx";

export type LayoutBuilderStudioNotice = {
    tone: "success" | "error" | "info";
    message: string;
};

type Props = {
    doc: LayoutDoc;
    selectedSectionId: string | null;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    studioNotice: LayoutBuilderStudioNotice | null;
    applyDoc: (next: LayoutDoc) => void;
    onSelectSection: (sectionKey: string | null) => void;
    onSelectItem: (sectionKey: string, itemId: string) => void;
    onStudioNotice: (notice: LayoutBuilderStudioNotice | null) => void;
    onScrollToSection: (sectionKey: string) => void;
    surfaceKey?: DrawerLayoutEditorSurfaceKey;
};

function NoticeBanner({ notice }: { notice: LayoutBuilderStudioNotice }) {
    const toneClass =
        notice.tone === "error" ? "border-red-200 bg-red-50 text-red-800"
        : notice.tone === "success" ? "border-alloy-pine/25 bg-alloy-pine/[0.08] text-alloy-midnight"
        : "border-alloy-blue/20 bg-alloy-blue/[0.06] text-alloy-midnight/75";
    return (
        <p className={`rounded-lg border px-3 py-2 text-xs leading-snug ${toneClass}`} data-testid="layout-builder-palette-notice">
            {notice.message}
        </p>
    );
}

export default function LayoutBuilderPalettePanel({
    doc,
    selectedSectionId,
    fieldPickerGroups,
    validationOk,
    studioNotice,
    applyDoc,
    onSelectSection,
    onSelectItem,
    onStudioNotice,
    onScrollToSection,
    surfaceKey = "opportunity_drawer",
}: Props) {
    const [addCardOpen, setAddCardOpen] = useState(false);
    const [showMore, setShowMore] = useState(false);

    const selectedSection = selectedSectionId ? doc.sections.find((s) => s.key === selectedSectionId) : null;
    const selectedSectionLabel = useMemo(() => {
        if (!selectedSection) return null;
        if (sectionIsKpiTile(selectedSection)) {
            const widget = listSectionWidgetItems(doc, selectedSection.key)[0];
            return widget?.title || "KPI tile";
        }
        return selectedSection.title;
    }, [doc, selectedSection]);
    const selectedSectionType = selectedSection ? readSectionType(selectedSection) : null;
    const canAddFieldsToSelection =
        selectedSection && selectedSectionType !== "widget" && selectedSectionType !== "related_list";

    const focusCreatedCard = (nextDoc: LayoutDoc, sectionKey: string, itemId?: string, message?: string) => {
        applyDoc(nextDoc);
        onSelectSection(sectionKey);
        onScrollToSection(sectionKey);
        if (itemId) onSelectItem(sectionKey, itemId);
        if (message) onStudioNotice({ tone: "success", message });
        else onStudioNotice(null);
    };

    const handleAddCard = (input: LayoutBuilderAddCardDialogSubmit) => {
        setAddCardOpen(false);
        const result = createExperienceBuilderCard(doc, {
            ...input,
            afterSectionKey: selectedSectionId,
            surfaceKey,
        });
        const title =
            input.cardType === "widget" ? input.title
            : result.doc.sections.find((s) => s.key === result.sectionKey)?.title ?? input.title;
        focusCreatedCard(
            result.doc,
            result.sectionKey,
            result.itemId,
            `Added "${title}" to the canvas.`,
        );
    };

    const ensureSectionRow = (baseDoc: LayoutDoc, sectionKey: string): LayoutDoc => {
        const section = baseDoc.sections.find((s) => s.key === sectionKey);
        if (!section || section.rows.length > 0) return baseDoc;
        return addSectionRow(baseDoc, sectionKey, 1);
    };

    const addItemToTarget = (
        itemKind: LayoutBuilderPaletteItemKind,
        addFn: (doc: LayoutDoc, sectionKey: string, rowIndex: number, colIndex: number) => { ok: boolean; error?: string; itemId?: string; doc?: LayoutDoc },
        itemLabel: string,
        options?: { widgetKey?: string; forceNewCard?: boolean },
    ) => {
        if (itemKind === "widget" && options?.forceNewCard) {
            if (options.widgetKey === "activity_timeline") {
                const result = createExperienceBuilderCard(doc, {
                    title: itemLabel,
                    widthKey: "full",
                    cardType: "fields",
                    placementIntent: "after_selected",
                    afterSectionKey: selectedSectionId,
                    surfaceKey,
                });
                const added = addSectionWidgetItem(
                    result.doc,
                    result.sectionKey,
                    0,
                    0,
                    "activity_timeline",
                    surfaceKey,
                );
                if (!added.ok) {
                    onStudioNotice({ tone: "error", message: added.error ?? `Unable to add ${itemLabel}.` });
                    return;
                }
                focusCreatedCard(
                    added.doc ?? result.doc,
                    result.sectionKey,
                    added.itemId,
                    `Added full-width "${itemLabel}".`,
                );
                return;
            }
            const result = createExperienceBuilderCard(doc, {
                title: itemLabel,
                widthKey: "third",
                cardType: "widget",
                widgetKey: options.widgetKey,
                placementIntent: "after_selected",
                afterSectionKey: selectedSectionId,
                surfaceKey,
            });
            focusCreatedCard(
                result.doc,
                result.sectionKey,
                result.itemId,
            `Added KPI tile "${itemLabel}".`,
            );
            return;
        }

        let workingDoc = doc;
        let sectionId: string | null = null;
        const target = resolvePaletteTargetSectionId(workingDoc, selectedSectionId, itemKind);

        if (target.sectionId) {
            sectionId = target.sectionId;
        } else if (itemKind === "field" || itemKind === "text") {
            const created = createExperienceBuilderCard(workingDoc, {
                title: "New card",
                widthKey: "full",
                cardType: itemKind === "text" ? "text" : "fields",
                placementIntent: "after_selected",
                afterSectionKey: selectedSectionId,
                surfaceKey,
            });
            workingDoc = created.doc;
            sectionId = created.sectionKey;
            if (itemKind === "text" && created.itemId) {
                focusCreatedCard(workingDoc, sectionId, created.itemId, `Added text block to "${created.doc.sections.find((s) => s.key === sectionId)?.title}".`);
                return;
            }
        } else {
            onStudioNotice({ tone: "error", message: "Select a card on the canvas first, or use + Add." });
            return;
        }

        const preparedDoc = ensureSectionRow(workingDoc, sectionId);
        const section = preparedDoc.sections.find((s) => s.key === sectionId);
        const rowIndex = Math.max(0, (section?.rows.length ?? 1) - 1);
        const result = addFn(preparedDoc, sectionId, rowIndex, 0);
        if (!result.ok) {
            onStudioNotice({ tone: "error", message: result.error ?? `Unable to add ${itemLabel}.` });
            return;
        }
        const nextDoc = result.doc ?? preparedDoc;
        const sectionTitle = nextDoc.sections.find((s) => s.key === sectionId)?.title ?? "card";
        applyDoc(nextDoc);
        onSelectSection(sectionId);
        onScrollToSection(sectionId);
        if (result.itemId) onSelectItem(sectionId, result.itemId);
        onStudioNotice({
            tone: "success",
            message: buildAddSuccessMessage({
                itemLabel,
                sectionTitle,
                zoneLabel: sectionZoneLabel(nextDoc, sectionId),
            }),
        });
    };

    const quickWidgets = useMemo(
        () => layoutBuilderWidgetOptionsForSurface(surfaceKey).slice(0, 6),
        [surfaceKey],
    );

    return (
        <div className="contents" data-testid="layout-builder-palette-root">
            <aside
                className="flex max-h-full flex-col overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-sm"
                data-testid="layout-builder-palette-panel"
            >
                <div className="border-b border-alloy-forge/8 bg-gradient-to-b from-white to-alloy-stone/[0.03] px-4 py-4">
                    <button
                        type="button"
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-alloy-pine px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-alloy-pine/90"
                        onClick={() => setAddCardOpen(true)}
                        data-testid="layout-builder-add-card-primary"
                    >
                        <span className="text-lg leading-none">+</span>
                        Add
                    </button>
                    {selectedSection ?
                        <p className="mt-3 text-xs text-alloy-midnight/55" data-testid="layout-builder-palette-target">
                            Selected: <strong className="text-alloy-midnight">{selectedSectionLabel}</strong>
                        </p>
                    :   <p className="mt-3 text-xs leading-relaxed text-alloy-midnight/45" data-testid="layout-builder-palette-target-hint">
                            Click a card on the canvas to add fields inside it.
                        </p>
                    }
                    {studioNotice ?
                        <div className="mt-3">
                            <NoticeBanner notice={studioNotice} />
                        </div>
                    :   null}
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
                    <section data-testid="layout-builder-palette-group-fields">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">Add field</h4>
                        <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/45">
                            {canAddFieldsToSelection ?
                                `Adds to "${selectedSection!.title}".`
                            :   "Select a Fields card first, or we create one for you."}
                        </p>
                        <div className="mt-2">
                            <OpportunityDrawerLayoutFieldPicker
                                groups={fieldPickerGroups}
                                disabled={!validationOk}
                                onPickField={(field) =>
                                    addItemToTarget(
                                        "field",
                                        (d, sk, ri, ci) => addSectionFieldItem(d, sk, ri, ci, field),
                                        field.fieldLabel,
                                    )
                                }
                            />
                        </div>
                    </section>

                    <section data-testid="layout-builder-palette-group-widgets">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">Add KPI tile</h4>
                        <p className="mt-1 text-[11px] text-alloy-midnight/45">Each tile is its own block — they pack into rows by width.</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            {quickWidgets.map((widget) => (
                                <button
                                    key={widget.key}
                                    type="button"
                                    className="rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-2 text-left text-xs font-medium text-alloy-midnight/75 transition hover:border-alloy-pine/30 hover:bg-alloy-pine/[0.04]"
                                    data-testid={`layout-builder-palette-widget-${widget.key}`}
                                    onClick={() =>
                                        addItemToTarget(
                                            "widget",
                                            (d, sk, ri, ci) => addSectionWidgetItem(d, sk, ri, ci, widget.key, surfaceKey),
                                            widget.label,
                                            { widgetKey: widget.key, forceNewCard: true },
                                        )
                                    }
                                >
                                    {widget.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section>
                        <button
                            type="button"
                            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45"
                            onClick={() => setShowMore((v) => !v)}
                            data-testid="layout-builder-palette-more-toggle"
                        >
                            More
                            <span>{showMore ? "−" : "+"}</span>
                        </button>
                        {showMore ?
                            <div className="mt-2 space-y-2">
                                <button
                                    type="button"
                                    className="w-full rounded-lg border border-alloy-forge/12 px-3 py-2 text-left text-xs font-medium text-alloy-midnight/70 hover:border-alloy-pine/25"
                                    data-testid="layout-builder-palette-add-text"
                                    onClick={() => addItemToTarget("text", addSectionTextItem, "text block")}
                                >
                                    Text / Notes block
                                </button>
                            </div>
                        :   null}
                    </section>
                </div>
            </aside>

            <LayoutBuilderAddCardDialog
                open={addCardOpen}
                onClose={() => setAddCardOpen(false)}
                onSubmit={handleAddCard}
                surfaceKey={surfaceKey}
            />
        </div>
    );
}
