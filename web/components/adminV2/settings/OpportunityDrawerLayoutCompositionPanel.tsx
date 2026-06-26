"use client";

import { useMemo, useState } from "react";
import { OpportunityDrawerLayoutCreateBlockForm } from "@/components/adminV2/settings/OpportunityDrawerLayoutBlockSettings";
import OpportunityDrawerLayoutSectionRowEditor from "@/components/adminV2/settings/OpportunityDrawerLayoutSectionRowEditor";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import {
    addLayoutBlockToSection,
    isLayoutEditorBlockTemplateKey,
    listLayoutEditorBlockTemplatesForSection,
} from "@/lib/layout/layoutEditorBlockRegistry";
import { createCustomBlockInSection } from "@/lib/layout/layoutEditorFreeformBlocks";
import {
    isSectionEditorHidden,
    renameSectionTitle,
    reorderSectionInZone,
    setSectionEditorHidden,
    deleteOpportunityDrawerSection,
    canDeleteOpportunityDrawerSection,
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
import OpportunityDrawerLayoutRelatedListSettings from "@/components/adminV2/settings/OpportunityDrawerLayoutRelatedListSettings";
import { layoutBuilderEditableInputProps } from "@/lib/layout/layoutBuilderEditableInput";

type Props = {
    doc: LayoutDoc;
    section: LayoutSection;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    selectedFieldPath: string | null;
    selectedBlockId: string | null;
    onSelectFieldPath: (path: string | null) => void;
    onSelectBlockId: (blockId: string | null) => void;
    onFieldAddError: (message: string | null) => void;
    applyDoc: (next: LayoutDoc) => void;
    onClose: () => void;
    layoutRecordId?: string | null;
    layoutVersion?: number | null;
};

export default function OpportunityDrawerLayoutCompositionPanel({
    doc,
    section,
    fieldPickerGroups,
    validationOk,
    selectedFieldPath,
    selectedBlockId,
    onSelectFieldPath,
    onSelectBlockId,
    onFieldAddError,
    applyDoc,
    onClose,
    layoutRecordId,
    layoutVersion,
}: Props) {
    const [showAddBlock, setShowAddBlock] = useState(false);
    const [showCreateBlock, setShowCreateBlock] = useState(false);
    const blockTemplates = useMemo(() => listLayoutEditorBlockTemplatesForSection(section.key), [section.key]);
    const sectionType = readSectionType(section);
    const deleteGate = canDeleteOpportunityDrawerSection(section);

    const selectedItemId =
        selectedBlockId
        ?? (selectedFieldPath?.startsWith(`field:${section.key}:`) ?
            selectedFieldPath.slice(`field:${section.key}:`.length)
        :   null);

    return (
        <div
            className="border-t border-alloy-pine/20 bg-gradient-to-b from-alloy-pine/[0.04] to-white px-3 py-3"
            data-testid="visual-editor-composition-panel"
        >
            <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Configure section</p>
                <button type="button" className="text-[11px] font-medium text-alloy-midnight/55 hover:text-alloy-pine" onClick={onClose}>
                    Done
                </button>
            </div>

            <label className="block text-xs text-alloy-midnight/60">
                Section label
                <input
                    type="text"
                    value={section.title}
                    {...layoutBuilderEditableInputProps}
                    onChange={(e) => applyDoc(renameSectionTitle(doc, section.key, e.target.value))}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-sm"
                    data-testid="visual-editor-section-title"
                />
            </label>

            <label className="mt-2 flex items-start gap-2 text-xs text-alloy-midnight/70">
                <input
                    type="checkbox"
                    checked={isSectionEditorHidden(section)}
                    onChange={(e) => applyDoc(setSectionEditorHidden(doc, section.key, e.target.checked))}
                    data-testid="visual-editor-section-hidden"
                    className="mt-0.5"
                />
                Hide section after publish
            </label>

            <label className="mt-3 block text-xs text-alloy-midnight/60">
                Section type
                <select
                    value={sectionType}
                    onChange={(e) => applyDoc(setSectionType(doc, section.key, e.target.value as LayoutEditorSectionType))}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-sm"
                    data-testid="visual-editor-section-type"
                >
                    {LAYOUT_EDITOR_SECTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                            {LAYOUT_EDITOR_SECTION_TYPE_LABELS[type]}
                        </option>
                    ))}
                </select>
            </label>

            <label className="mt-2 block text-xs text-alloy-midnight/60">
                Section row layout
                <select
                    defaultValue="full_width"
                    onChange={(e) =>
                        applyDoc(applySectionRowLayout(doc, section.key, e.target.value as SectionRowWidthPresetKey))
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-sm"
                    data-testid="visual-editor-section-row-layout"
                >
                    {SECTION_ROW_WIDTH_PRESET_KEYS.map((key) => (
                        <option key={key} value={key}>
                            {SECTION_ROW_WIDTH_PRESETS[key].label}
                        </option>
                    ))}
                </select>
                <span className="mt-1 block text-[10px] text-alloy-midnight/45">
                    Groups this section with the next sections in the same zone using the selected widths.
                </span>
            </label>

            {sectionType === "related_list" ?
                <OpportunityDrawerLayoutRelatedListSettings doc={doc} sectionKey={section.key} applyDoc={applyDoc} />
            :   null}

            <div className="mt-3">
                <button
                    type="button"
                    className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!deleteGate.ok}
                    title={deleteGate.ok ? undefined : deleteGate.reason}
                    onClick={() => {
                        if (!deleteGate.ok) return;
                        applyDoc(deleteOpportunityDrawerSection(doc, section.key));
                        onClose();
                    }}
                    data-testid="visual-editor-delete-section"
                >
                    Delete section
                </button>
                {!deleteGate.ok ?
                    <p className="mt-1 text-[10px] text-alloy-midnight/45">{deleteGate.reason}</p>
                :   null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    className="rounded border border-alloy-forge/20 bg-white px-2 py-1 text-[10px] font-medium"
                    onClick={() => applyDoc(reorderSectionInZone(doc, section.key, -1))}
                    data-testid="visual-editor-section-move-up"
                >
                    Move up
                </button>
                <button
                    type="button"
                    className="rounded border border-alloy-forge/20 bg-white px-2 py-1 text-[10px] font-medium"
                    onClick={() => applyDoc(reorderSectionInZone(doc, section.key, 1))}
                    data-testid="visual-editor-section-move-down"
                >
                    Move down
                </button>
                <button
                    type="button"
                    className="rounded border border-alloy-pine/30 bg-alloy-pine/[0.06] px-2 py-1 text-[10px] font-semibold text-alloy-pine"
                    onClick={() => {
                        setShowAddBlock((v) => !v);
                        setShowCreateBlock(false);
                    }}
                    data-testid="visual-editor-add-block-toggle"
                >
                    Starter templates
                </button>
                <button
                    type="button"
                    className="rounded border border-alloy-pine/30 bg-alloy-pine/[0.06] px-2 py-1 text-[10px] font-semibold text-alloy-pine"
                    onClick={() => {
                        setShowCreateBlock((v) => !v);
                        setShowAddBlock(false);
                    }}
                    data-testid="visual-editor-create-block-toggle"
                >
                    Create block
                </button>
            </div>

            {sectionType !== "widget" && showCreateBlock ?
                <OpportunityDrawerLayoutCreateBlockForm
                    sectionKey={section.key}
                    onCancel={() => setShowCreateBlock(false)}
                    onCreate={(input) => {
                        const result = createCustomBlockInSection(doc, section.key, {
                            title: input.title,
                            blockType: input.blockType,
                            dataContext: input.dataContext,
                            contactRole: input.blockType === "contact_card" ? input.contactRole : undefined,
                            editMode: input.editMode,
                            showTitle: input.showTitle,
                        });
                        if (!result.ok) {
                            onFieldAddError(result.error);
                            return;
                        }
                        applyDoc(result.doc);
                        onFieldAddError(null);
                        onSelectBlockId(result.blockItemId);
                        onSelectFieldPath(null);
                        setShowCreateBlock(false);
                    }}
                />
            :   null}

            {sectionType !== "widget" && showAddBlock ?
                <div className="mt-2 rounded-lg border border-alloy-forge/12 bg-white p-2" data-testid="visual-editor-add-block-menu">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Starter templates</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {blockTemplates.map((template) => (
                            <button
                                key={template.key}
                                type="button"
                                className="rounded border border-alloy-forge/15 px-2 py-1 text-[10px] font-medium text-alloy-midnight/70 hover:border-alloy-pine/30"
                                title={template.description}
                                onClick={() => {
                                    if (!isLayoutEditorBlockTemplateKey(template.key)) return;
                                    const result = addLayoutBlockToSection(doc, section.key, template.key);
                                    if (!result.ok) {
                                        onFieldAddError(result.error);
                                        return;
                                    }
                                    applyDoc(result.doc);
                                    onFieldAddError(null);
                                    onSelectBlockId(result.blockItemId);
                                    onSelectFieldPath(null);
                                    setShowAddBlock(false);
                                }}
                                data-testid={`visual-editor-add-block-${template.key}`}
                            >
                                + {template.label}
                                {!template.runtimeEffective ?
                                    <span className="ml-1 text-alloy-midnight/40">(preview only)</span>
                                :   null}
                            </button>
                        ))}
                    </div>
                </div>
            :   null}

            <OpportunityDrawerLayoutSectionRowEditor
                doc={doc}
                sectionKey={section.key}
                fieldPickerGroups={fieldPickerGroups}
                validationOk={validationOk}
                selectedItemId={selectedItemId}
                onSelectItemId={(itemId) => {
                    onSelectBlockId(null);
                    onSelectFieldPath(itemId ? `field:${section.key}:${itemId}` : null);
                }}
                onFieldAddError={onFieldAddError}
                applyDoc={applyDoc}
                layoutRecordId={layoutRecordId}
                layoutVersion={layoutVersion}
            />
        </div>
    );
}
