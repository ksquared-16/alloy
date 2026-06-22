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
import { layoutBuilderEditableInputProps } from "@/lib/layout/layoutBuilderEditableInput";
import {
    applySectionRowLayout,
    LAYOUT_EDITOR_SECTION_TYPES,
    readSectionType,
    SECTION_ROW_WIDTH_PRESET_KEYS,
    SECTION_ROW_WIDTH_PRESETS,
    setSectionType,
    type LayoutEditorSectionType,
    type SectionRowWidthPresetKey,
} from "@/lib/layout/layoutEditorSectionLayout";
import {
    CARD_WIDTH_FRACTION_KEYS,
    CARD_WIDTH_FRACTIONS,
    readCardWidthFraction,
    type CardWidthFractionKey,
} from "@/lib/layout/layoutBuilderCardWidth";
import { EXPERIENCE_BUILDER_PEER_BLOCK_LABELS } from "@/lib/layout/layoutBuilderCardAuthoring";
import { listSectionCompositionRows, removeSectionItem } from "@/lib/layout/layoutEditorSectionComposition";
import { addSectionFieldItem, addSectionRow } from "@/lib/layout/layoutEditorSectionComposition";
import OpportunityDrawerLayoutFieldPicker from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldPicker";
import { sectionZoneLabel } from "@/lib/layout/layoutBuilderStudioUx";
import {
    applyPeerCardWidth,
    packPeerCardsInZone,
    repackPeerCardsAfterZoneReorder,
} from "@/lib/layout/layoutBuilderPeerCardRows";
import { applyKpiTileWidth } from "@/lib/layout/layoutBuilderKpiTileRows";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { listSectionWidgetItems, sectionIsKpiTile, sectionIsWidgetStrip, WIDGET_STRIP_WIDTH_PRESETS } from "@/lib/layout/layoutBuilderWidgetStrip";
import { setRowColumnCount } from "@/lib/layout/builderOps";
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

function collectSectionFieldRefKeys(doc: LayoutDoc, sectionKey: string): Set<string> {
    const rows = listSectionCompositionRows(doc, sectionKey);
    const keys = new Set<string>();
    for (const row of rows) {
        for (const col of row.columns) {
            for (const entry of col.items) {
                if (entry.kind === "field" && entry.item.refKey) keys.add(entry.item.refKey);
            }
        }
    }
    return keys;
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
    const [showAddField, setShowAddField] = useState(true);
    const section = selectedSectionId ? doc.sections.find((s) => s.key === selectedSectionId) : null;
    const selectedItemId = resolveSelectedItemId(selectedSectionId, selectedFieldPath, selectedBlockId);
    const sectionType = section ? readSectionType(section) : null;
    const kpiTile = section ? sectionIsKpiTile(section) : false;
    const widgetStrip = section ? sectionIsWidgetStrip(section) : false;

    const kpiWidgetItem = useMemo(() => {
        if (!section || !kpiTile) return null;
        return listSectionWidgetItems(doc, section.key)[0] ?? null;
    }, [doc, section, kpiTile]);

    const selectedItem = useMemo(() => {
        if (!selectedSectionId || !selectedItemId) return null;
        const rows = listSectionCompositionRows(doc, selectedSectionId);
        return rows.flatMap((r) => r.columns.flatMap((c) => c.items)).find((it) => it.itemId === selectedItemId) ?? null;
    }, [doc, selectedSectionId, selectedItemId]);

    const inspectorItem = selectedItem ?? kpiWidgetItem;

    const deleteGate = section ? canDeleteOpportunityDrawerSection(section) : { ok: false, reason: "" };

    const usedFieldRefKeys = useMemo(
        () => (section ? collectSectionFieldRefKeys(doc, section.key) : new Set<string>()),
        [doc, section],
    );

    const selectionTitle =
        inspectorItem ? inspectorItem.title
        : section && !kpiTile ? section.title
        : null;

    const applyWidthChange = (widthKey: CardWidthFractionKey) => {
        if (!section) return;
        if (kpiTile) applyDoc(applyKpiTileWidth(doc, section.key, widthKey));
        else applyDoc(applyPeerCardWidth(doc, section.key, widthKey));
    };

    const applyReorder = (direction: -1 | 1) => {
        if (!section) return;
        let next = reorderSectionInZone(doc, section.key, direction);
        next = repackPeerCardsAfterZoneReorder(next, section.key);
        applyDoc(next);
    };

    const applyDeleteBlock = () => {
        if (!section || !deleteGate.ok) return;
        const zone = resolveOpportunityDrawerSectionZone(section);
        let next = deleteOpportunityDrawerSection(doc, section.key);
        next = packPeerCardsInZone(next, zone);
        applyDoc(next);
        onClearSelection();
    };

    return (
        <aside
            className="flex max-h-full min-w-0 flex-col overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-sm"
            data-testid="layout-builder-inspector-panel"
        >
            <div className="sticky top-0 z-10 border-b border-alloy-forge/8 bg-white/95 px-4 py-3 backdrop-blur-sm">
                <h3 className={opSectionTitle}>Properties</h3>
                {selectionTitle ?
                    <p className="mt-1 truncate text-sm font-semibold text-alloy-midnight" data-testid="layout-builder-inspector-selection-title">
                        {selectionTitle}
                    </p>
                :   <p className={opSectionSupport}>Click a card, field, or tile on the canvas.</p>}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-3">
                {!section ?
                    <div
                        className="rounded-xl border border-dashed border-alloy-forge/12 bg-alloy-stone/[0.02] px-4 py-8 text-center"
                        data-testid="layout-builder-inspector-empty"
                    >
                        <p className="text-sm font-medium text-alloy-midnight/60">Nothing selected</p>
                        <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/45">
                            Click any card on the canvas, or add a component from the palette.
                        </p>
                    </div>
                : inspectorItem ?
                    <div className="rounded-xl border border-alloy-forge/10 bg-alloy-stone/[0.02] p-3" data-testid="visual-editor-item-settings">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            {inspectorItem.kind === "widget" ? "KPI tile"
                            : inspectorItem.kind === "field" ? "Field"
                            : "Item"}
                        </p>
                        <p className="mb-3 text-[10px] text-alloy-midnight/45">Changes preview instantly. Publish to update the live drawer.</p>

                        {kpiTile ?
                            <div className="mb-3">
                                <InspectorField label="Width" helper="Tiles on the same row pack left-to-right when widths fit.">
                                    <select
                                        value={readCardWidthFraction(section)}
                                        onChange={(e) => applyWidthChange(e.target.value as CardWidthFractionKey)}
                                        className="w-full rounded-lg border border-alloy-forge/15 px-2.5 py-1.5 text-sm"
                                        data-testid="visual-editor-kpi-tile-width"
                                    >
                                        {CARD_WIDTH_FRACTION_KEYS.map((key) => (
                                            <option key={key} value={key}>
                                                {CARD_WIDTH_FRACTIONS[key].label}
                                            </option>
                                        ))}
                                    </select>
                                </InspectorField>
                            </div>
                        :   null}

                        <LayoutBuilderItemInspector
                            doc={doc}
                            sectionKey={section.key}
                            entry={inspectorItem}
                            fieldPickerGroups={fieldPickerGroups}
                            validationOk={validationOk}
                            applyDoc={applyDoc}
                            onFieldAddError={onFieldAddError}
                            onClose={onClearItemSelection}
                        />
                        <button
                            type="button"
                            className="mt-3 w-full rounded-lg border border-red-200/80 bg-red-50/80 px-3 py-2 text-left text-[11px] font-semibold text-red-700 hover:bg-red-100/80"
                            onClick={() => {
                                if (kpiTile) {
                                    applyDeleteBlock();
                                    return;
                                }
                                applyDoc(removeSectionItem(doc, section.key, inspectorItem.itemId));
                                onClearItemSelection();
                            }}
                            data-testid="layout-builder-inspector-delete-item"
                        >
                            {kpiTile ? "Delete tile" : "Delete"}
                        </button>
                    </div>
                :   <div className="space-y-4" data-testid="visual-editor-section-settings-panel">
                        <p className="text-[10px] text-alloy-midnight/45">
                            In <strong>{sectionZoneLabel(doc, section.key)}</strong> · live after publish
                        </p>

                        <InspectorField label="Card title" helper="Shown at the top of this card in the drawer.">
                            <input
                                type="text"
                                value={section.title}
                                {...layoutBuilderEditableInputProps}
                                onChange={(e) => applyDoc(renameSectionTitle(doc, section.key, e.target.value))}
                                className="w-full rounded-lg border border-alloy-forge/15 px-2.5 py-1.5 text-sm"
                                data-testid="visual-editor-section-title"
                            />
                        </InspectorField>

                        {sectionType === "content" && !inspectorItem ?
                            <div className="space-y-2" data-testid="layout-builder-inspector-add-field">
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between rounded-lg border border-alloy-pine/25 bg-alloy-pine/[0.05] px-3 py-2 text-left text-xs font-semibold text-alloy-midnight hover:bg-alloy-pine/[0.08]"
                                    onClick={() => setShowAddField((v) => !v)}
                                >
                                    + Add field
                                    <span className="text-alloy-midnight/35">{showAddField ? "−" : "+"}</span>
                                </button>
                                {showAddField ?
                                    <OpportunityDrawerLayoutFieldPicker
                                        groups={fieldPickerGroups}
                                        disabled={!validationOk}
                                        variant="inspector"
                                        stayOpen
                                        usedRefKeys={usedFieldRefKeys}
                                        onPickField={(field) => {
                                            if (!section) return;
                                            let next = doc;
                                            if (section.rows.length === 0) {
                                                next = addSectionRow(next, section.key, 1);
                                            }
                                            const result = addSectionFieldItem(next, section.key, 0, 0, field);
                                            if (!result.ok) {
                                                onFieldAddError(result.error);
                                                return;
                                            }
                                            applyDoc(result.doc);
                                            onSelectItem(result.itemId);
                                            onFieldAddError(null);
                                        }}
                                    />
                                :   null}
                            </div>
                        :   null}

                        <InspectorField label="Width" helper="How wide this block appears on the canvas.">
                            <select
                                value={readCardWidthFraction(section)}
                                onChange={(e) => applyWidthChange(e.target.value as CardWidthFractionKey)}
                                className="w-full rounded-lg border border-alloy-forge/15 px-2.5 py-1.5 text-sm"
                                data-testid="visual-editor-section-row-layout"
                            >
                                {CARD_WIDTH_FRACTION_KEYS.map((key) => (
                                    <option key={key} value={key}>
                                        {CARD_WIDTH_FRACTIONS[key].label}
                                    </option>
                                ))}
                            </select>
                        </InspectorField>

                        <InspectorField label="Card type" helper="What this card is for.">
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
                                        {type === "content" ? EXPERIENCE_BUILDER_PEER_BLOCK_LABELS.fields
                                        : type === "widget" ? EXPERIENCE_BUILDER_PEER_BLOCK_LABELS.widget
                                        : EXPERIENCE_BUILDER_PEER_BLOCK_LABELS.related_list}
                                    </option>
                                ))}
                            </select>
                        </InspectorField>

                        {widgetStrip ?
                            <InspectorField label="Tile row layout" helper="When multiple KPI tiles share one card row.">
                                <select
                                    defaultValue={String(WIDGET_STRIP_WIDTH_PRESETS.find((p) => p.count === (section?.rows[0]?.columns.length ?? 4))?.count ?? 4)}
                                    onChange={(e) => {
                                        const count = Number(e.target.value);
                                        if (!section) return;
                                        const sIdx = doc.sections.findIndex((s) => s.key === section.key);
                                        if (sIdx < 0) return;
                                        applyDoc(setRowColumnCount(doc, sIdx, 0, count));
                                    }}
                                    className="w-full rounded-lg border border-alloy-forge/15 px-2.5 py-1.5 text-sm"
                                    data-testid="visual-editor-widget-strip-width"
                                >
                                    {WIDGET_STRIP_WIDTH_PRESETS.map((preset) => (
                                        <option key={preset.key} value={preset.count}>
                                            {preset.label}
                                        </option>
                                    ))}
                                </select>
                            </InspectorField>
                        :   null}

                        {widgetStrip ?
                            <InspectorField label="Side-by-side cards" helper="Advanced: split this row with neighboring cards.">
                                <select
                                    defaultValue="full_width"
                                    onChange={(e) =>
                                        applyDoc(
                                            applySectionRowLayout(doc, section.key, e.target.value as SectionRowWidthPresetKey),
                                        )
                                    }
                                    className="w-full rounded-lg border border-alloy-forge/15 px-2.5 py-1.5 text-sm"
                                    data-testid="visual-editor-section-row-group-layout"
                                >
                                    {SECTION_ROW_WIDTH_PRESET_KEYS.map((key) => (
                                        <option key={key} value={key}>
                                            {SECTION_ROW_WIDTH_PRESETS[key].label}
                                        </option>
                                    ))}
                                </select>
                            </InspectorField>
                        :   null}

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
                                onClick={() => applyReorder(-1)}
                                data-testid="visual-editor-section-move-up"
                            >
                                Move up
                            </button>
                            <button
                                type="button"
                                className="rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:border-alloy-pine/25"
                                onClick={() => applyReorder(1)}
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
                                    applyDeleteBlock();
                                }}
                                data-testid="visual-editor-delete-section"
                            >
                                {kpiTile ? "Delete tile" : "Delete this card"}
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
                                Layout inside this card
                                <span className="text-alloy-midnight/35">{showStructure ? "−" : "+"}</span>
                            </button>
                            <p className="mt-0.5 px-1 text-[10px] text-alloy-midnight/40">
                                Add, reorder, or remove fields inside this card.
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
