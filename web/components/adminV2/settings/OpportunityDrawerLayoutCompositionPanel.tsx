"use client";

import { useMemo, useState } from "react";
import OpportunityDrawerLayoutBlockSettings from "@/components/adminV2/settings/OpportunityDrawerLayoutBlockSettings";
import OpportunityDrawerLayoutFieldPicker from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldPicker";
import OpportunityDrawerLayoutFieldSettings from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldSettings";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import {
    addLayoutBlockToSection,
    findLayoutBlockLocation,
    isLayoutEditorBlockTemplateKey,
    listLayoutEditorBlockTemplatesForSection,
    patchLayoutBlockContactRole,
    patchLayoutBlockRowTemplateConfig,
} from "@/lib/layout/layoutEditorBlockRegistry";
import { readLayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import {
    findBlockNodeByItemId,
    listSectionLayoutBlocks,
    moveLayoutEditorBlock,
    moveLayoutEditorField,
    patchLayoutEditorFieldDisplay,
    patchLayoutEditorFieldVisibility,
    removeLayoutEditorBlock,
    removeLayoutEditorField,
    serializeLayoutEditorNodePath,
    tryAddFieldAtLayoutBlock,
    type LayoutEditorFieldNode,
} from "@/lib/layout/layoutEditorCompositionModel";
import { readLayoutEditorRowTemplateConfig } from "@/lib/layout/layoutEditorRowTemplateConfig";
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
}: Props) {
    const [addFieldBlockId, setAddFieldBlockId] = useState<string | null>(null);
    const [showAddBlock, setShowAddBlock] = useState(false);
    const blocks = useMemo(() => listSectionLayoutBlocks(doc, section.key), [doc, section.key]);
    const selectedBlock = selectedBlockId ? findBlockNodeByItemId(blocks, selectedBlockId) : null;
    const blockTemplates = useMemo(() => listLayoutEditorBlockTemplatesForSection(section.key), [section.key]);

    const selectedBlockItem =
        selectedBlock?.itemId ?
            doc.sections
                .find((s) => s.key === section.key)
                ?.rows.flatMap((r) => r.columns.flatMap((c) => c.items))
                .find((it) => it.id === selectedBlock.itemId)
        :   null;

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
                    onClick={() => setShowAddBlock((v) => !v)}
                    data-testid="visual-editor-add-block-toggle"
                >
                    Add block
                </button>
            </div>

            {showAddBlock ?
                <div className="mt-2 rounded-lg border border-alloy-forge/12 bg-white p-2" data-testid="visual-editor-add-block-menu">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Registry blocks</p>
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

            <div className="mt-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Layout blocks</p>
                {blocks.map((block) => (
                    <div
                        key={block.id}
                        className={`rounded-lg border bg-white/90 p-2 ${
                            selectedBlockId === block.itemId && block.itemId ?
                                "border-alloy-blue/30 ring-1 ring-alloy-blue/15"
                            :   "border-alloy-forge/12"
                        }`}
                        data-testid={`visual-editor-block-${block.itemId || block.id}`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <button
                                type="button"
                                className="text-left text-xs font-semibold text-alloy-midnight hover:text-alloy-pine"
                                onClick={() => {
                                    if (!block.itemId || block.kind === "card") return;
                                    onSelectBlockId(selectedBlockId === block.itemId ? null : block.itemId);
                                    onSelectFieldPath(null);
                                }}
                            >
                                {block.title}
                            </button>
                            <span className="flex shrink-0 items-center gap-1">
                                {!block.locked && block.itemId && block.kind !== "card" ?
                                    <>
                                        <button
                                            type="button"
                                            className="px-1 text-alloy-midnight/50 hover:text-alloy-pine"
                                            onClick={() => applyDoc(moveLayoutEditorBlock(doc, section.key, block.itemId, -1))}
                                            aria-label="Move block up"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="px-1 text-alloy-midnight/50 hover:text-alloy-pine"
                                            onClick={() => applyDoc(moveLayoutEditorBlock(doc, section.key, block.itemId, 1))}
                                            aria-label="Move block down"
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="px-1 text-red-500/70 hover:text-red-600"
                                            onClick={() => {
                                                applyDoc(removeLayoutEditorBlock(doc, section.key, block.itemId));
                                                if (selectedBlockId === block.itemId) onSelectBlockId(null);
                                            }}
                                            aria-label="Remove block"
                                        >
                                            ✕
                                        </button>
                                    </>
                                :   null}
                                {!block.locked && (block.kind === "field_group" || block.kind === "related_list") ?
                                    <button
                                        type="button"
                                        className="text-[10px] font-medium text-alloy-pine hover:underline"
                                        onClick={() => {
                                            onSelectBlockId(block.itemId);
                                            setAddFieldBlockId(addFieldBlockId === block.itemId ? null : block.itemId);
                                        }}
                                    >
                                        Add field
                                    </button>
                                :   null}
                            </span>
                        </div>

                        {selectedBlockId === block.itemId && block.itemId && selectedBlockItem ?
                            <OpportunityDrawerLayoutBlockSettings
                                block={block}
                                showContactRole={selectedBlockItem.refKey === "contact_block"}
                                contactRole={
                                    selectedBlockItem.refKey === "contact_block" ?
                                        readLayoutEditorContactRole(selectedBlockItem.metadata)
                                    :   undefined
                                }
                                rowTemplateConfig={readLayoutEditorRowTemplateConfig(selectedBlockItem.metadata)}
                                onContactRoleChange={
                                    selectedBlockItem.refKey === "contact_block" ?
                                        (role) => {
                                            applyDoc(patchLayoutBlockContactRole(doc, section.key, block.itemId, role));
                                        }
                                    :   undefined
                                }
                                onRowTemplateChange={(patch) => {
                                    const loc = findLayoutBlockLocation(doc, block.itemId);
                                    if (!loc) return;
                                    applyDoc(patchLayoutBlockRowTemplateConfig(doc, loc, patch));
                                }}
                                onClose={() => onSelectBlockId(null)}
                            />
                        :   null}

                        {addFieldBlockId === block.itemId ?
                            <div className="mt-2">
                                <OpportunityDrawerLayoutFieldPicker
                                    groups={fieldPickerGroups}
                                    disabled={!validationOk}
                                    onPickField={(field) => {
                                        const result = tryAddFieldAtLayoutBlock(doc, section.key, block.itemId, field);
                                        if (!result.ok) {
                                            onFieldAddError(result.error);
                                            return;
                                        }
                                        applyDoc(result.doc);
                                        onFieldAddError(null);
                                        setAddFieldBlockId(null);
                                    }}
                                />
                            </div>
                        :   null}

                        <ul className="mt-2 space-y-1">
                            {block.children.map((child) => (
                                <FieldRow
                                    key={serializeLayoutEditorNodePath(child.path)}
                                    node={child}
                                    selected={selectedFieldPath === serializeLayoutEditorNodePath(child.path)}
                                    onSelect={() => {
                                        const path = serializeLayoutEditorNodePath(child.path);
                                        onSelectFieldPath(path);
                                        onSelectBlockId(null);
                                    }}
                                    onDeselect={() => onSelectFieldPath(null)}
                                    onChange={(patch) => {
                                        let next = doc;
                                        if (patch.label !== undefined || patch.display) {
                                            next = patchLayoutEditorFieldDisplay(
                                                next,
                                                child.path,
                                                patch.display ?? {},
                                                patch.label,
                                            );
                                        }
                                        if (patch.visibility) {
                                            next = patchLayoutEditorFieldVisibility(
                                                next,
                                                child.path,
                                                patch.visibility,
                                                child.refKey,
                                            );
                                        }
                                        applyDoc(next);
                                    }}
                                    onMove={(dir) => applyDoc(moveLayoutEditorField(doc, child.path, dir))}
                                    onRemove={() => applyDoc(removeLayoutEditorField(doc, child.path))}
                                />
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
}

function FieldRow({
    node,
    selected,
    onSelect,
    onDeselect,
    onChange,
    onMove,
    onRemove,
}: {
    node: LayoutEditorFieldNode;
    selected: boolean;
    onSelect: () => void;
    onDeselect: () => void;
    onChange: (patch: Parameters<typeof OpportunityDrawerLayoutFieldSettings>[0]["onChange"] extends (p: infer P) => void ? P : never) => void;
    onMove: (dir: -1 | 1) => void;
    onRemove: () => void;
}) {
    return (
        <li
            className={`rounded border px-2 py-1.5 text-xs ${
                selected ? "border-alloy-pine/30 bg-alloy-pine/[0.05]" : "border-alloy-forge/10 bg-alloy-stone/[0.02]"
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
                    <span className="block truncate font-medium text-alloy-midnight">{node.title}</span>
                    <span className="text-[10px] text-alloy-midnight/45">{node.visibilityRule.replace(/_/g, " ")}</span>
                </button>
                <span className="flex shrink-0 gap-0.5">
                    <button type="button" className="px-1 text-alloy-midnight/50 hover:text-alloy-pine" onClick={() => onMove(-1)} aria-label="Move up">
                        ↑
                    </button>
                    <button type="button" className="px-1 text-alloy-midnight/50 hover:text-alloy-pine" onClick={() => onMove(1)} aria-label="Move down">
                        ↓
                    </button>
                    <button type="button" className="px-1 text-red-500/70 hover:text-red-600" onClick={onRemove} aria-label="Remove">
                        ✕
                    </button>
                </span>
            </div>

            {selected ?
                <OpportunityDrawerLayoutFieldSettings
                    inline
                    node={node}
                    onClose={onDeselect}
                    onChange={onChange}
                />
            :   null}
        </li>
    );
}
