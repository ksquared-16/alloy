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
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";

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
                    className="rounded border border-alloy-blue/30 bg-alloy-blue/[0.06] px-2 py-1 text-[10px] font-semibold text-alloy-blue"
                    onClick={() => {
                        setShowCreateBlock((v) => !v);
                        setShowAddBlock(false);
                    }}
                    data-testid="visual-editor-create-block-toggle"
                >
                    Create block
                </button>
            </div>

            {showCreateBlock ?
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

            {showAddBlock ?
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
