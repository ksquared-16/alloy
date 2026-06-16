"use client";

import { useEffect, useMemo, useState } from "react";
import {
    catalogGroupDisplayLabel,
    type LayoutCatalogField,
    type LayoutCatalogGroup,
} from "@/lib/layout/fieldCatalog";
import { partitionCatalogFieldsForPicker } from "@/lib/layout/layoutFieldPickerHelpers";

type Props = {
    groups: LayoutCatalogGroup[];
    onPickField: (field: LayoutCatalogField) => void;
    disabled?: boolean;
};

export default function OpportunityDrawerLayoutFieldPicker({ groups, onPickField, disabled }: Props) {
    const [entityKey, setEntityKey] = useState(groups[0]?.entityKey ?? "");
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (!groups.some((g) => g.entityKey === entityKey)) {
            setEntityKey(groups[0]?.entityKey ?? "");
        }
    }, [groups, entityKey]);

    const activeGroup = groups.find((g) => g.entityKey === entityKey) ?? groups[0];
    const usedRefKeys = useMemo(() => new Set<string>(), []);

    const { available } = useMemo(
        () => partitionCatalogFieldsForPicker(activeGroup?.fields ?? [], usedRefKeys, query),
        [activeGroup?.fields, query, usedRefKeys],
    );

    return (
        <div className="space-y-2 rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.02] p-2" data-testid="visual-editor-field-picker">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Add field</p>

            <div className="flex flex-wrap gap-1" data-testid="visual-editor-field-picker-entities">
                {groups.map((group) => {
                    const active = group.entityKey === activeGroup?.entityKey;
                    return (
                        <button
                            key={group.entityKey}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                                setEntityKey(group.entityKey);
                                setQuery("");
                            }}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                                active ?
                                    "bg-alloy-pine text-white"
                                :   "border border-alloy-forge/15 bg-white text-alloy-midnight/65 hover:border-alloy-pine/25"
                            }`}
                            data-testid={`visual-editor-field-picker-entity-${group.entityKey}`}
                        >
                            {group.entityLabel}
                        </button>
                    );
                })}
            </div>

            {activeGroup ?
                <p className="text-[11px] text-alloy-midnight/50">{catalogGroupDisplayLabel(activeGroup)}</p>
            :   null}

            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={activeGroup ? `Search ${activeGroup.entityLabel} fields…` : "Search fields…"}
                disabled={disabled || !activeGroup}
                className="w-full rounded-md border border-alloy-forge/20 px-2 py-1.5 text-xs"
                data-testid="visual-editor-field-picker-search"
            />

            <div className="max-h-40 space-y-1 overflow-y-auto" data-testid="visual-editor-field-picker-fields">
                {available.length === 0 ?
                    <p className="py-3 text-center text-[11px] text-alloy-midnight/45">
                        {query.trim() ? "No matching fields." : "No fields in this category."}
                    </p>
                :   available.map((field) => (
                        <button
                            key={field.refKey}
                            type="button"
                            disabled={disabled}
                            onClick={() => onPickField(field)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border border-alloy-forge/10 bg-white px-2 py-1.5 text-left text-xs hover:border-alloy-pine/30 hover:bg-alloy-pine/[0.03] disabled:opacity-40"
                            data-testid={`visual-editor-field-option-${field.refKey}`}
                        >
                            <span className="font-medium text-alloy-midnight">{field.fieldLabel}</span>
                            <span className="shrink-0 text-[10px] text-alloy-midnight/40">{activeGroup?.entityLabel}</span>
                        </button>
                    ))
                }
            </div>
        </div>
    );
}
