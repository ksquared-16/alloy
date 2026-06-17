"use client";

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    DEFAULT_CHILDREN_RELATED_LIST_CONFIG,
    LAYOUT_EDITOR_RELATED_LIST_ENTITY_LABELS,
    LAYOUT_EDITOR_RELATED_LIST_ENTITY_TYPES,
    LAYOUT_EDITOR_RELATED_LIST_PRESENTATION_LABELS,
    LAYOUT_EDITOR_RELATED_LIST_PRESENTATION_MODES,
    patchLayoutEditorRelatedListConfig,
    readLayoutEditorRelatedListConfig,
    relatedListEntityTypeRuntimeSupported,
    type LayoutEditorRelatedListEntityType,
    type LayoutEditorRelatedListPresentationMode,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { buildRelatedListFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { useMemo, useState } from "react";

type Props = {
    doc: LayoutDoc;
    sectionKey: string;
    applyDoc: (next: LayoutDoc) => void;
};

const ROW_LABELS = ["Row 1", "Row 2", "Row 3"] as const;

function rowKey(index: number): "primaryRow" | "secondaryRow" | "tertiaryRow" {
    if (index === 0) return "primaryRow";
    if (index === 1) return "secondaryRow";
    return "tertiaryRow";
}

function RelatedListFieldSelect({
    value,
    groups,
    testId,
    onChange,
}: {
    value: string;
    groups: ReturnType<typeof buildRelatedListFieldPickerGroups>;
    testId: string;
    onChange: (refKey: string) => void;
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="mt-0.5 w-full min-w-0 rounded-md border border-alloy-forge/15 px-2 py-1 text-xs"
            data-testid={testId}
        >
            <option value="">—</option>
            {groups.map((group) => (
                <optgroup key={group.entityKey} label={group.entityLabel}>
                    {group.fields.map((field) => (
                        <option key={field.refKey} value={field.refKey}>
                            {field.fieldLabel}
                        </option>
                    ))}
                </optgroup>
            ))}
        </select>
    );
}

export default function OpportunityDrawerLayoutRelatedListSettings({ doc, sectionKey, applyDoc }: Props) {
    const section = doc.sections.find((s) => s.key === sectionKey);
    const config = section ? readLayoutEditorRelatedListConfig(section) : DEFAULT_CHILDREN_RELATED_LIST_CONFIG;
    const [showAllFields, setShowAllFields] = useState(false);

    const fieldGroups = useMemo(
        () => buildRelatedListFieldPickerGroups(config.entityType, { includeAllEntities: showAllFields }),
        [config.entityType, showAllFields],
    );

    const rows = [config.primaryRow, config.secondaryRow, config.tertiaryRow];
    const presentationMode = config.presentationMode ?? "table";

    return (
        <div className="mt-3 space-y-3 rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.04] p-2" data-testid="visual-editor-related-list-settings">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-blue">Related list</p>

            <label className="block text-[11px] text-alloy-midnight/60">
                Presentation
                <select
                    value={presentationMode}
                    onChange={(e) =>
                        applyDoc(
                            patchLayoutEditorRelatedListConfig(doc, sectionKey, {
                                presentationMode: e.target.value as LayoutEditorRelatedListPresentationMode,
                            }),
                        )
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
                <span className="mt-1 block text-[10px] text-alloy-midnight/45">
                    {presentationMode === "table" ?
                        "Full table with columns — best for scanning many fields."
                    : presentationMode === "cards" ?
                        "Card per record with labeled rows — best for child or contact summaries."
                    :   "Single-line summary per record — best for dense drawers."}
                </span>
            </label>

            <label className="block text-[11px] text-alloy-midnight/60">
                Entity type
                <select
                    value={config.entityType}
                    onChange={(e) =>
                        applyDoc(
                            patchLayoutEditorRelatedListConfig(doc, sectionKey, {
                                entityType: e.target.value as LayoutEditorRelatedListEntityType,
                            }),
                        )
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
                <p className="text-[10px] text-alloy-midnight/50">Fields grouped by entity</p>
                <button
                    type="button"
                    className="shrink-0 text-[10px] font-medium text-alloy-pine hover:underline"
                    onClick={() => setShowAllFields((v) => !v)}
                    data-testid="visual-editor-related-list-toggle-all-fields"
                >
                    {showAllFields ? "Entity fields only" : "All fields"}
                </button>
            </div>

            {ROW_LABELS.map((label, index) => {
                const key = rowKey(index);
                const row = rows[index];
                const fields = row?.fields ?? [];
                return (
                    <fieldset key={key} className="space-y-1 rounded border border-alloy-forge/10 bg-white/80 p-2">
                        <legend className="px-1 text-[10px] font-semibold text-alloy-midnight/55">{label}</legend>
                        {[0, 1, 2].map((slot) => (
                            <label key={slot} className="block text-[10px] text-alloy-midnight/50">
                                Field {slot + 1}
                                <RelatedListFieldSelect
                                    value={fields[slot] ?? ""}
                                    groups={fieldGroups}
                                    testId={`visual-editor-related-list-${key}-${slot}`}
                                    onChange={(value) => {
                                        const nextFields = [...fields];
                                        if (value) nextFields[slot] = value;
                                        else nextFields.splice(slot, 1);
                                        applyDoc(
                                            patchLayoutEditorRelatedListConfig(doc, sectionKey, {
                                                [key]: { fields: nextFields.filter(Boolean) },
                                            }),
                                        );
                                    }}
                                />
                            </label>
                        ))}
                    </fieldset>
                );
            })}
        </div>
    );
}
