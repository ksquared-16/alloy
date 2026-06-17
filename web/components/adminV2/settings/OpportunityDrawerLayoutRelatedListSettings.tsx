"use client";

import OpportunityDrawerLayoutFieldSettings from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldSettings";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    patchLayoutEditorFieldDisplay,
    patchLayoutEditorFieldEditable,
    patchLayoutEditorFieldVisibility,
    type LayoutEditorFieldNode,
} from "@/lib/layout/layoutEditorCompositionModel";
import { readLayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import { resolveVisibilityRuleKey } from "@/lib/layout/layoutEditorVisibilityRules";
import {
    DEFAULT_CHILDREN_RELATED_LIST_CONFIG,
    findRelatedListItemInSection,
    LAYOUT_EDITOR_RELATED_LIST_ENTITY_LABELS,
    LAYOUT_EDITOR_RELATED_LIST_ENTITY_TYPES,
    LAYOUT_EDITOR_RELATED_LIST_PRESENTATION_LABELS,
    LAYOUT_EDITOR_RELATED_LIST_PRESENTATION_MODES,
    patchLayoutEditorRelatedListConfig,
    readLayoutEditorRelatedListConfig,
    relatedListEntityTypeRuntimeSupported,
    type LayoutEditorRelatedListEntityType,
    type LayoutEditorRelatedListPresentationMode,
    type LayoutEditorRelatedListRowTemplate,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { buildRelatedListFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
    doc: LayoutDoc;
    sectionKey: string;
    applyDoc: (next: LayoutDoc) => void;
};

const ROW_LABELS = ["Row 1", "Row 2", "Row 3"] as const;
const COLUMN_COUNTS = [1, 2, 3] as const;

function rowKey(index: number): "primaryRow" | "secondaryRow" | "tertiaryRow" {
    if (index === 0) return "primaryRow";
    if (index === 1) return "secondaryRow";
    return "tertiaryRow";
}

function fieldLabel(groups: ReturnType<typeof buildRelatedListFieldPickerGroups>, refKey: string): string {
    for (const group of groups) {
        const match = group.fields.find((field) => field.refKey === refKey);
        if (match) return match.fieldLabel;
    }
    return refKey.split(".").pop()?.replace(/_/g, " ") ?? refKey;
}

function RelatedListRowEditor({
    label,
    rowKeyName,
    row,
    fieldGroups,
    onPatch,
    selectedRefKey,
    onSelectRefKey,
}: {
    label: string;
    rowKeyName: "primaryRow" | "secondaryRow" | "tertiaryRow";
    row?: LayoutEditorRelatedListRowTemplate;
    fieldGroups: ReturnType<typeof buildRelatedListFieldPickerGroups>;
    onPatch: (patch: Partial<{ primaryRow: LayoutEditorRelatedListRowTemplate; secondaryRow: LayoutEditorRelatedListRowTemplate; tertiaryRow: LayoutEditorRelatedListRowTemplate }>) => void;
    selectedRefKey: string | null;
    onSelectRefKey: (refKey: string | null) => void;
}) {
    const fields = row?.fields ?? [];
    const [columnCount, setColumnCount] = useState(Math.min(3, Math.max(1, fields.length || 1)));

    useEffect(() => {
        setColumnCount((prev) => Math.max(prev, Math.min(3, Math.max(1, fields.length || 1))));
    }, [fields.length]);

    const setColumnCountAndPad = (count: number) => {
        setColumnCount(count);
    };

    const setFieldAt = (index: number, refKey: string) => {
        const nextFields = [...fields];
        while (nextFields.length <= index) nextFields.push("");
        if (refKey) nextFields[index] = refKey;
        else nextFields.splice(index, 1);
        onPatch({ [rowKeyName]: { fields: nextFields.filter(Boolean) } });
    };

    const moveField = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= fields.length) return;
        const nextFields = [...fields];
        [nextFields[index], nextFields[target]] = [nextFields[target]!, nextFields[index]!];
        onPatch({ [rowKeyName]: { fields: nextFields } });
    };

    const removeField = (index: number) => {
        const nextFields = fields.filter((_, i) => i !== index);
        onPatch({ [rowKeyName]: { fields: nextFields } });
    };

    return (
        <div className="space-y-2 rounded-lg border border-alloy-forge/10 bg-white p-2.5" data-testid={`visual-editor-related-list-row-${rowKeyName}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-alloy-midnight/70">{label}</p>
                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-alloy-midnight/45">Columns</span>
                    {COLUMN_COUNTS.map((count) => (
                        <button
                            key={count}
                            type="button"
                            className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                                columnCount === count ?
                                    "bg-alloy-pine/10 text-alloy-pine"
                                :   "text-alloy-midnight/55 hover:bg-alloy-stone/30"
                            }`}
                            onClick={() => setColumnCountAndPad(count)}
                            data-testid={`visual-editor-related-list-${rowKeyName}-cols-${count}`}
                        >
                            {count}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                {Array.from({ length: columnCount }, (_, slot) => {
                    const refKey = fields[slot] ?? "";
                    return (
                        <div key={slot} className="flex min-w-0 items-start gap-2">
                            <div className="min-w-0 flex-1">
                                {refKey ?
                                    <button
                                        type="button"
                                        className={`flex min-w-0 w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left ${
                                            selectedRefKey === refKey ?
                                                "border-alloy-pine/40 bg-alloy-pine/[0.08]"
                                            :   "border-alloy-pine/20 bg-alloy-pine/[0.04] hover:border-alloy-pine/35"
                                        }`}
                                        onClick={() => onSelectRefKey(selectedRefKey === refKey ? null : refKey)}
                                        data-testid={`visual-editor-related-list-field-${refKey}`}
                                    >
                                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-alloy-midnight">
                                            {fieldLabel(fieldGroups, refKey)}
                                        </span>
                                    </button>
                                :   <select
                                        value=""
                                        onChange={(e) => setFieldAt(slot, e.target.value)}
                                        className="w-full rounded-md border border-alloy-forge/15 px-2 py-1.5 text-xs"
                                        data-testid={`visual-editor-related-list-${rowKeyName}-add-${slot}`}
                                    >
                                        <option value="">+ Add field</option>
                                        {fieldGroups.map((group) => (
                                            <optgroup key={group.entityKey} label={group.entityLabel}>
                                                {group.fields.map((field) => (
                                                    <option key={field.refKey} value={field.refKey}>
                                                        {field.fieldLabel}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                }
                            </div>
                            {refKey ?
                                <div className="flex shrink-0 flex-col gap-0.5">
                                    <button
                                        type="button"
                                        className="text-[10px] text-alloy-midnight/45 hover:text-red-600"
                                        onClick={() => {
                                            removeField(slot);
                                            if (selectedRefKey === refKey) onSelectRefKey(null);
                                        }}
                                        aria-label="Remove field"
                                    >
                                        Remove
                                    </button>
                                    <button
                                        type="button"
                                        className="text-[10px] text-alloy-midnight/45 hover:text-alloy-pine disabled:opacity-30"
                                        disabled={slot === 0}
                                        onClick={() => moveField(slot, -1)}
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        className="text-[10px] text-alloy-midnight/45 hover:text-alloy-pine disabled:opacity-30"
                                        disabled={slot >= fields.length - 1}
                                        onClick={() => moveField(slot, 1)}
                                    >
                                        ↓
                                    </button>
                                </div>
                            :   null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function OpportunityDrawerLayoutRelatedListSettings({ doc, sectionKey, applyDoc }: Props) {
    const section = doc.sections.find((s) => s.key === sectionKey);
    const config = section ? readLayoutEditorRelatedListConfig(section) : DEFAULT_CHILDREN_RELATED_LIST_CONFIG;
    const [showAllFields, setShowAllFields] = useState(false);
    const [selectedRefKey, setSelectedRefKey] = useState<string | null>(null);

    const relatedListItem = section ? findRelatedListItemInSection(section)?.item ?? null : null;

    const selectedFieldNode: LayoutEditorFieldNode | null = useMemo(() => {
        if (!selectedRefKey || !relatedListItem) return null;
        const colIdx = relatedListItem.columns?.findIndex((col) => col.refKey === selectedRefKey) ?? -1;
        if (colIdx < 0) return null;
        const col = relatedListItem.columns![colIdx]!;
        return {
            id: `${relatedListItem.id}-col-${colIdx}`,
            title: col.label?.trim() || selectedRefKey,
            refKey: col.refKey,
            path: { kind: "column", sectionKey, blockItemId: relatedListItem.id, colIdx },
            displayConfig: readLayoutEditorDisplayConfig(col),
            visibilityRule: resolveVisibilityRuleKey(col.visibleWhen, col.refKey),
            editable: col.editable === true,
        };
    }, [relatedListItem, sectionKey, selectedRefKey]);

    const fieldGroups = useMemo(
        () => buildRelatedListFieldPickerGroups(config.entityType, { includeAllEntities: showAllFields }),
        [config.entityType, showAllFields],
    );

    const rows = [config.primaryRow, config.secondaryRow, config.tertiaryRow];
    const presentationMode = config.presentationMode ?? "table";

    const patchRow = (patch: Parameters<typeof patchLayoutEditorRelatedListConfig>[2]) => {
        applyDoc(patchLayoutEditorRelatedListConfig(doc, sectionKey, patch));
    };

    return (
        <div className="mt-3 space-y-3 rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.04] p-2" data-testid="visual-editor-related-list-settings">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-blue">Related list</p>

            <label className="block text-[11px] text-alloy-midnight/60">
                Presentation
                <select
                    value={presentationMode}
                    onChange={(e) =>
                        patchRow({ presentationMode: e.target.value as LayoutEditorRelatedListPresentationMode })
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-related-list-presentation"
                >
                    {LAYOUT_EDITOR_RELATED_LIST_PRESENTATION_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                            {LAYOUT_EDITOR_RELATED_LIST_PRESENTATION_LABELS[mode]}
                        </option>
                    ))}
                </select>
            </label>

            <label className="block text-[11px] text-alloy-midnight/60">
                Entity type
                <select
                    value={config.entityType}
                    onChange={(e) =>
                        patchRow({ entityType: e.target.value as LayoutEditorRelatedListEntityType })
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-related-list-entity"
                >
                    {LAYOUT_EDITOR_RELATED_LIST_ENTITY_TYPES.map((entityType) => (
                        <option key={entityType} value={entityType}>
                            {LAYOUT_EDITOR_RELATED_LIST_ENTITY_LABELS[entityType]}
                            {!relatedListEntityTypeRuntimeSupported(entityType) ? " (preview only)" : ""}
                        </option>
                    ))}
                </select>
            </label>

            <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-alloy-midnight/50">Row layout</p>
                <button
                    type="button"
                    className="shrink-0 text-[10px] font-medium text-alloy-pine hover:underline"
                    onClick={() => setShowAllFields((v) => !v)}
                    data-testid="visual-editor-related-list-toggle-all-fields"
                >
                    {showAllFields ? "Entity fields only" : "All fields"}
                </button>
            </div>

            {ROW_LABELS.map((label, index) => (
                <RelatedListRowEditor
                    key={label}
                    label={label}
                    rowKeyName={rowKey(index)}
                    row={rows[index]}
                    fieldGroups={fieldGroups}
                    onPatch={patchRow}
                    selectedRefKey={selectedRefKey}
                    onSelectRefKey={setSelectedRefKey}
                />
            ))}

            {selectedFieldNode && typeof document !== "undefined" ?
                createPortal(
                    <div
                        className="fixed inset-0 z-[200] flex items-center justify-center bg-alloy-midnight/40 p-4"
                        data-testid="visual-editor-related-list-field-modal"
                        onClick={() => setSelectedRefKey(null)}
                    >
                        <div
                            className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-alloy-stone/15 bg-white p-4 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <OpportunityDrawerLayoutFieldSettings
                                node={selectedFieldNode}
                                onClose={() => setSelectedRefKey(null)}
                                onChange={(patch) => {
                                    let next = doc;
                                    if (patch.label !== undefined || patch.display) {
                                        next = patchLayoutEditorFieldDisplay(
                                            next,
                                            selectedFieldNode.path,
                                            patch.display ?? {},
                                            patch.label,
                                        );
                                    }
                                    if (patch.visibility) {
                                        next = patchLayoutEditorFieldVisibility(
                                            next,
                                            selectedFieldNode.path,
                                            patch.visibility,
                                            selectedFieldNode.refKey,
                                        );
                                    }
                                    if (patch.editable !== undefined) {
                                        next = patchLayoutEditorFieldEditable(next, selectedFieldNode.path, patch.editable);
                                    }
                                    applyDoc(next);
                                }}
                            />
                        </div>
                    </div>,
                    document.body,
                )
            :   null}
        </div>
    );
}
