"use client";

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    DEFAULT_CHILDREN_RELATED_LIST_CONFIG,
    LAYOUT_EDITOR_RELATED_LIST_ENTITY_LABELS,
    LAYOUT_EDITOR_RELATED_LIST_ENTITY_TYPES,
    patchLayoutEditorRelatedListConfig,
    readLayoutEditorRelatedListConfig,
    relatedListEntityTypeRuntimeSupported,
    type LayoutEditorRelatedListEntityType,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { useMemo } from "react";

type Props = {
    doc: LayoutDoc;
    sectionKey: string;
    applyDoc: (next: LayoutDoc) => void;
};

const ROW_LABELS = ["Primary row", "Secondary row", "Tertiary row"] as const;

function rowKey(index: number): "primaryRow" | "secondaryRow" | "tertiaryRow" {
    if (index === 0) return "primaryRow";
    if (index === 1) return "secondaryRow";
    return "tertiaryRow";
}

export default function OpportunityDrawerLayoutRelatedListSettings({ doc, sectionKey, applyDoc }: Props) {
    const section = doc.sections.find((s) => s.key === sectionKey);
    const config = section ? readLayoutEditorRelatedListConfig(section) : DEFAULT_CHILDREN_RELATED_LIST_CONFIG;
    const fieldOptions = useMemo(
        () =>
            buildOpportunityDrawerEditorFieldPickerGroups()
                .flatMap((g) => g.fields)
                .filter((f) => f.fieldType !== "action"),
        [],
    );

    const rows = [config.primaryRow, config.secondaryRow, config.tertiaryRow];

    return (
        <div className="mt-3 space-y-3 rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.04] p-2" data-testid="visual-editor-related-list-settings">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-blue">Related list</p>

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
                                <select
                                    value={fields[slot] ?? ""}
                                    onChange={(e) => {
                                        const nextFields = [...fields];
                                        const value = e.target.value;
                                        if (value) nextFields[slot] = value;
                                        else nextFields.splice(slot, 1);
                                        applyDoc(
                                            patchLayoutEditorRelatedListConfig(doc, sectionKey, {
                                                [key]: { fields: nextFields.filter(Boolean) },
                                            }),
                                        );
                                    }}
                                    className="mt-0.5 w-full rounded-md border border-alloy-forge/15 px-2 py-1 text-xs"
                                    data-testid={`visual-editor-related-list-${key}-${slot}`}
                                >
                                    <option value="">—</option>
                                    {fieldOptions.map((field) => (
                                        <option key={field.refKey} value={field.refKey}>
                                            {field.fieldLabel}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ))}
                    </fieldset>
                );
            })}
        </div>
    );
}
