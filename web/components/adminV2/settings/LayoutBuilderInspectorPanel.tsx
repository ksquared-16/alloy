"use client";

import { useMemo, useState } from "react";
import OpportunityDrawerLayoutRelatedListSettings from "@/components/adminV2/settings/OpportunityDrawerLayoutRelatedListSettings";
import OpportunityDrawerLayoutSectionRowEditor, {
    LayoutBuilderItemInspector,
} from "@/components/adminV2/settings/OpportunityDrawerLayoutSectionRowEditor";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    canDeleteOpportunityDrawerSection,
    deleteOpportunityDrawerSection,
    isSectionEditorHidden,
    renameSectionTitle,
    reorderSectionInZone,
    setSectionEditorHidden,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import {
    applySectionRowLayout,
    LAYOUT_EDITOR_SECTION_TYPE_LABELS,
    LAYOUT_EDITOR_SECTION_TYPES,
    readSectionType,
    SECTION_ROW_WIDTH_PRESET_KEYS,
    SECTION_ROW_WIDTH_PRESETS,
    setSectionType,
    type LayoutEditorSectionType,
    type SectionRowWidthPresetKey,
} from "@/lib/layout/layoutEditorSectionLayout";
import { listSectionCompositionRows } from "@/lib/layout/layoutEditorSectionComposition";
import { isPlatformOwnedDrawerSection, sectionZoneLabel } from "@/lib/layout/layoutBuilderStudioUx";
import { opSectionSupport, opSectionTitle } from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    doc: LayoutDoc;
    selectedSectionId: string | null;
    selectedFieldPath: string | null;
    selectedBlockId: string | null;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    applyDoc: (next: LayoutDoc) => void;
    onFieldAddError: (message: string | null) => void;
    onClearSelection: () => void;
    onClearItemSelection: () => void;
    onSelectItem: (itemId: string | null) => void;
    layoutRecordId?: string | null;
    layoutVersion?: number | null;
};

function resolveSelectedItemId(
    selectedSectionId: string | null,
    selectedFieldPath: string | null,
    selectedBlockId: string | null,
): string | null {
    if (selectedBlockId) return selectedBlockId;
    if (selectedSectionId && selectedFieldPath?.startsWith(`field:${selectedSectionId}:`)) {
        return selectedFieldPath.slice(`field:${selectedSectionId}:`.length);
    }
    return null;
}

function InspectorField({
    label,
    helper,
    children,
}: {
    label: string;
    helper?: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block text-xs text-alloy-midnight/70">
            <span className="font-medium text-alloy-midnight/80">{label}</span>
            {helper ?
                <span className="mt-0.5 block text-[10px] font-normal leading-snug text-alloy-midnight/45">{helper}</span>
            :   null}
            <div className="mt-1.5">{children}</div>
        </label>
    );
}

export default function LayoutBuilderInspectorPanel({
    doc,
    selectedSectionId,
    selectedFieldPath,
    selectedBlockId,
    fieldPickerGroups,
    validationOk,
    applyDoc,
    onFieldAddError,
    onClearSelection,
    onClearItemSelection,
    onSelectItem,
    layoutRecordId,
    layoutVersion,
}: Props) {
    const [showStructure, setShowStructure] = useState(false);
    const section = selectedSectionId ? doc.sections.find((s) => s.key === selectedSectionId) : null;
    const selectedItemId = resolveSelectedItemId(selectedSectionId, selectedFieldPath, selectedBlockId);
    const sectionType = section ? readSectionType(section) : null;
    const platformOwned = section ? isPlatformOwnedDrawerSection(section.key) : false;

    const selectedItem = useMemo(() => {
        if (!selectedSectionId || !selectedItemId) return null;
        const rows = listSectionCompositionRows(doc, selectedSectionId);
        return rows.flatMap((r) => r.columns.flatMap((c) => c.items)).find((it) => it.itemId === selectedItemId) ?? null;
    }, [doc, selectedSectionId, selectedItemId]);

    const deleteGate = section ? canDeleteOpportunityDrawerSection(section) : { ok: false, reason: "" };

    const selectionTitle =
        selectedItem ? selectedItem.title
        : section ? section.title
        : null;

    return (
        <aside
            className="flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-sm"
            data-testid="layout-builder-inspector-panel"
        >
            <div className="border-b border-alloy-forge/8 bg-gradient-to-r from-white to-alloy-stone/[0.03] px-4 py-3">
                <h3 className={opSectionTitle}>Properties</h3>
                {selectionTitle ?
                    <p className="mt-1 truncate text-sm font-semibold text-alloy-midnight" data-testid="layout-builder-inspector-selection-title">
                        {selectionTitle}
                    </p>
                :   <p className={opSectionSupport}>Select a drawer card, field, or widget on the canvas.</p>}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
                {!section ?
                    <div
                        className="rounded-xl border border-dashed border-alloy-forge/12 bg-alloy-stone/[0.02] px-4 py-8 text-center"
                        data-testid="layout-builder-inspector-empty"
                    >
                        <p className="text-sm font-medium text-alloy-midnight/60">Nothing selected</p>
                        <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/45">
                            Click any section on the canvas, or add a component from the palette.
                        </p>
                    </div>
                : selectedItem ?
                    <div className="rounded-xl border border-alloy-forge/10 bg-alloy-stone/[0.02] p-3" data-testid="visual-editor-item-settings">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            {selectedItem.kind === "widget" ? "Widget settings"
                            : selectedItem.kind === "field" ? "Field settings"
                            : "Component settings"}
                        </p>
                        <p className="mb-3 text-[10px] text-alloy-midnight/45">Changes preview instantly. Publish to update the live drawer.</p>
                        <LayoutBuilderItemInspector
                            doc={doc}
                            sectionKey={section.key}
                            entry={selectedItem}
                            fieldPickerGroups={fieldPickerGroups}
                            validationOk={validationOk}
                            applyDoc={applyDoc}
                            onFieldAddError={onFieldAddError}
                            onClose={onClearItemSelection}
                        />
                    </div>
                :   <div className="space-y-4" data-testid="visual-editor-section-settings-panel">
                        {platformOwned ?
                            <p className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.04] px-3 py-2 text-[11px] leading-relaxed text-alloy-midnight/55">
                                This section is platform-owned — its position in the drawer grid stays fixed. You can
                                customize the label, contents, and visibility.
                            </p>
                        :   null}

                        <p className="text-[10px] text-alloy-midnight/45">
                            In <strong>{sectionZoneLabel(doc, section.key)}</strong> · live after publish
                        </p>

                        <InspectorField label="Card title" helper="What operators see at the top of this drawer card.">
                            <input
                                type="text"
                                value={section.title}
                                onChange={(e) => applyDoc(renameSectionTitle(doc, section.key, e.target.value))}
                                className="w-full rounded-lg border border-alloy-forge/15 px-2.5 py-1.5 text-sm"
                                data-testid="visual-editor-section-title"
                            />
                        </InspectorField>

                        <InspectorField label="Card type" helper="How this section behaves in the drawer.">
                            <select
                                value={sectionType ?? "content"}
                                onChange={(e) =>
                                    applyDoc(setSectionType(doc, section.key, e.target.value as LayoutEditorSectionType))
                                }
                                className="w-full rounded-lg border border-alloy-forge/15 px-2.5 py-1.5 text-sm"
                                data-testid="visual-editor-section-type"
                            >
                                {LAYOUT_EDITOR_SECTION_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {LAYOUT_EDITOR_SECTION_TYPE_LABELS[type]}
                                    </option>
                                ))}
                            </select>
                        </InspectorField>

                        <InspectorField label="Width" helper="How much horizontal space this card shares with neighbors.">
                            <select
                                defaultValue="full_width"
                                onChange={(e) =>
                                    applyDoc(
                                        applySectionRowLayout(doc, section.key, e.target.value as SectionRowWidthPresetKey),
                                    )
                                }
                                className="w-full rounded-lg border border-alloy-forge/15 px-2.5 py-1.5 text-sm"
                                data-testid="visual-editor-section-row-layout"
                            >
                                {SECTION_ROW_WIDTH_PRESET_KEYS.map((key) => (
                                    <option key={key} value={key}>
                                        {SECTION_ROW_WIDTH_PRESETS[key].label}
                                    </option>
                                ))}
                            </select>
                        </InspectorField>

                        <label className="flex items-start gap-2.5 rounded-lg border border-alloy-forge/10 bg-white px-3 py-2.5 text-xs text-alloy-midnight/70">
                            <input
                                type="checkbox"
                                checked={isSectionEditorHidden(section)}
                                onChange={(e) => applyDoc(setSectionEditorHidden(doc, section.key, e.target.checked))}
                                data-testid="visual-editor-section-hidden"
                                className="mt-0.5"
                            />
                            <span>
                                <span className="font-medium text-alloy-midnight/80">Hide after publish</span>
                                <span className="mt-0.5 block text-[10px] text-alloy-midnight/45">
                                    Removes this card from the live drawer without deleting your configuration.
                                </span>
                            </span>
                        </label>

                        {sectionType === "related_list" ?
                            <div className="rounded-xl border border-alloy-blue/15 bg-alloy-blue/[0.03] p-3">
                                <OpportunityDrawerLayoutRelatedListSettings
                                    doc={doc}
                                    sectionKey={section.key}
                                    applyDoc={applyDoc}
                                />
                            </div>
                        :   null}

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:border-alloy-pine/25"
                                onClick={() => applyDoc(reorderSectionInZone(doc, section.key, -1))}
                                data-testid="visual-editor-section-move-up"
                            >
                                Move up
                            </button>
                            <button
                                type="button"
                                className="rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:border-alloy-pine/25"
                                onClick={() => applyDoc(reorderSectionInZone(doc, section.key, 1))}
                                data-testid="visual-editor-section-move-down"
                            >
                                Move down
                            </button>
                        </div>

                        <div className="border-t border-alloy-forge/8 pt-3">
                            <button
                                type="button"
                                className="w-full rounded-lg border border-red-200/80 bg-red-50/80 px-3 py-2 text-left text-[11px] font-semibold text-red-700 hover:bg-red-100/80 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={!deleteGate.ok}
                                title={deleteGate.ok ? undefined : deleteGate.reason}
                                onClick={() => {
                                    if (!deleteGate.ok) return;
                                    applyDoc(deleteOpportunityDrawerSection(doc, section.key));
                                    onClearSelection();
                                }}
                                data-testid="visual-editor-delete-section"
                            >
                                Delete this card
                            </button>
                            {!deleteGate.ok ?
                                <p className="mt-1.5 text-[10px] leading-relaxed text-alloy-midnight/45">{deleteGate.reason}</p>
                            :   null}
                        </div>

                        <div className="border-t border-alloy-forge/8 pt-3">
                            <button
                                type="button"
                                className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-xs font-medium text-alloy-midnight/65 hover:text-alloy-midnight"
                                onClick={() => setShowStructure((v) => !v)}
                                data-testid="layout-builder-inspector-structure-toggle"
                            >
                                Layout
                                <span className="text-alloy-midnight/35">{showStructure ? "−" : "+"}</span>
                            </button>
                            <p className="mt-0.5 px-1 text-[10px] text-alloy-midnight/40">
                                Adjust rows and columns inside this card.
                            </p>
                            {showStructure ?
                                <div className="mt-2 rounded-lg border border-alloy-forge/10 bg-white p-2" data-testid="visual-editor-composition-panel">
                                    <OpportunityDrawerLayoutSectionRowEditor
                                        doc={doc}
                                        sectionKey={section.key}
                                        fieldPickerGroups={fieldPickerGroups}
                                        validationOk={validationOk}
                                        selectedItemId={selectedItemId}
                                        onSelectItemId={(itemId) => {
                                            if (!selectedSectionId) return;
                                            if (itemId) onSelectItem(itemId);
                                            else onSelectItem(null);
                                        }}
                                        onFieldAddError={onFieldAddError}
                                        applyDoc={applyDoc}
                                        layoutRecordId={layoutRecordId}
                                        layoutVersion={layoutVersion}
                                        hideInlineItemSettings
                                        hideDiagnostics
                                        friendlyLabels
                                    />
                                </div>
                            :   null}
                        </div>
                    </div>
                }
            </div>
        </aside>
    );
}
