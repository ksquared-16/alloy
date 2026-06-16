"use client";

import { useMemo, useState } from "react";
import OpportunityDrawerLayoutFieldPicker from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldPicker";
import OpportunityDrawerLayoutFieldSettings from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldSettings";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import {
    findFieldNodeByPath,
    listSectionLayoutBlocks,
    moveLayoutEditorField,
    patchLayoutEditorFieldDisplay,
    patchLayoutEditorFieldVisibility,
    removeLayoutEditorField,
    serializeLayoutEditorNodePath,
    tryAddFieldAtLayoutBlock,
    type LayoutEditorFieldNode,
} from "@/lib/layout/layoutEditorCompositionModel";
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
    onSelectFieldPath: (path: string | null) => void;
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
    onSelectFieldPath,
    onFieldAddError,
    applyDoc,
    onClose,
}: Props) {
    const [addFieldBlockId, setAddFieldBlockId] = useState<string | null>(null);
    const blocks = useMemo(() => listSectionLayoutBlocks(doc, section.key), [doc, section.key]);
    const selectedNode = selectedFieldPath ? findFieldNodeByPath(blocks, selectedFieldPath) : null;

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

            <div className="mt-3 flex gap-2">
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
            </div>

            <div className="mt-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Layout blocks</p>
                {blocks.map((block) => (
                    <div key={block.id} className="rounded-lg border border-alloy-forge/12 bg-white/90 p-2" data-testid={`visual-editor-block-${block.itemId || block.id}`}>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-alloy-midnight">{block.title}</p>
                            {!block.locked && (block.kind === "field_group" || block.kind === "related_list") ?
                                <button
                                    type="button"
                                    className="text-[10px] font-medium text-alloy-pine hover:underline"
                                    onClick={() => setAddFieldBlockId(addFieldBlockId === block.itemId ? null : block.itemId)}
                                >
                                    Add field
                                </button>
                            :   null}
                        </div>

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
                                    onSelect={() =>
                                        onSelectFieldPath(
                                            selectedFieldPath === serializeLayoutEditorNodePath(child.path) ?
                                                null
                                            :   serializeLayoutEditorNodePath(child.path),
                                        )
                                    }
                                    onMove={(dir) => applyDoc(moveLayoutEditorField(doc, child.path, dir))}
                                    onRemove={() => applyDoc(removeLayoutEditorField(doc, child.path))}
                                />
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {selectedNode ?
                <div className="mt-3">
                    <OpportunityDrawerLayoutFieldSettings
                        node={selectedNode}
                        onClose={() => onSelectFieldPath(null)}
                        onChange={(patch) => {
                            let next = doc;
                            if (patch.label !== undefined || patch.display) {
                                next = patchLayoutEditorFieldDisplay(next, selectedNode.path, patch.display ?? {}, patch.label);
                            }
                            if (patch.visibility) {
                                next = patchLayoutEditorFieldVisibility(next, selectedNode.path, patch.visibility, selectedNode.refKey);
                            }
                            applyDoc(next);
                        }}
                    />
                </div>
            :   null}
        </div>
    );
}

function FieldRow({
    node,
    selected,
    onSelect,
    onMove,
    onRemove,
}: {
    node: LayoutEditorFieldNode;
    selected: boolean;
    onSelect: () => void;
    onMove: (dir: -1 | 1) => void;
    onRemove: () => void;
}) {
    return (
        <li
            className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs ${
                selected ? "border-alloy-pine/30 bg-alloy-pine/[0.05]" : "border-alloy-forge/10 bg-alloy-stone/[0.02]"
            }`}
        >
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
        </li>
    );
}
