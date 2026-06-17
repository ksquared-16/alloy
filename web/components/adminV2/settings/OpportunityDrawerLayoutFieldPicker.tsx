"use client";

import { useEffect, useMemo, useState } from "react";
import {
    catalogGroupDisplayLabel,
    type LayoutCatalogField,
    type LayoutCatalogGroup,
} from "@/lib/layout/fieldCatalog";
import { EXPERIENCE_BUILDER_COMMON_FIELD_REF_KEYS } from "@/lib/layout/layoutBuilderFieldAuthoring";
import { partitionCatalogFieldsForPicker } from "@/lib/layout/layoutFieldPickerHelpers";

type Props = {
    groups: LayoutCatalogGroup[];
    onPickField: (field: LayoutCatalogField) => void;
    disabled?: boolean;
    usedRefKeys?: ReadonlySet<string>;
    /** Keep picker open after adding a field (inspector flow). */
    stayOpen?: boolean;
    /** Larger layout for inspector panel. */
    variant?: "default" | "inspector";
};

export default function OpportunityDrawerLayoutFieldPicker({
    groups,
    onPickField,
    disabled,
    usedRefKeys,
    stayOpen = false,
    variant = "default",
}: Props) {
    const [entityKey, setEntityKey] = useState(groups[0]?.entityKey ?? "");
    const [query, setQuery] = useState("");
    const isInspector = variant === "inspector";

    useEffect(() => {
        if (!groups.some((g) => g.entityKey === entityKey)) {
            setEntityKey(groups[0]?.entityKey ?? "");
        }
    }, [groups, entityKey]);

    const activeGroup = groups.find((g) => g.entityKey === entityKey) ?? groups[0];
    const used = usedRefKeys ?? new Set<string>();

    const allFields = useMemo(() => groups.flatMap((g) => g.fields), [groups]);

    const commonFields = useMemo(() => {
        const byRef = new Map(allFields.map((f) => [f.refKey, f]));
        return EXPERIENCE_BUILDER_COMMON_FIELD_REF_KEYS.map((refKey) => byRef.get(refKey)).filter(
            (f): f is LayoutCatalogField => Boolean(f) && !used.has(f.refKey),
        );
    }, [allFields, used]);

    const { available } = useMemo(
        () => partitionCatalogFieldsForPicker(activeGroup?.fields ?? [], used, query),
        [activeGroup?.fields, query, used],
    );

    const pick = (field: LayoutCatalogField) => {
        onPickField(field);
        if (!stayOpen) setQuery("");
    };

    return (
        <div
            className={`space-y-3 rounded-xl border border-alloy-forge/12 bg-white p-3 shadow-sm ${
                isInspector ? "border-alloy-pine/20" : "bg-alloy-stone/[0.02] p-2"
            }`}
            data-testid="visual-editor-field-picker"
            data-visual-editor-field-picker-variant={variant}
        >
            <p className={`font-semibold uppercase tracking-wide text-alloy-midnight/45 ${isInspector ? "text-xs" : "text-[10px]"}`}>
                Add field
            </p>

            {commonFields.length > 0 && !query.trim() ?
                <div className="space-y-1.5" data-testid="visual-editor-field-picker-common">
                    <p className="text-[10px] font-medium text-alloy-midnight/50">Common fields</p>
                    <div className="flex flex-wrap gap-1.5">
                        {commonFields.map((field) => (
                            <button
                                key={field.refKey}
                                type="button"
                                disabled={disabled}
                                onClick={() => pick(field)}
                                className="rounded-full border border-alloy-forge/12 bg-alloy-pine/[0.06] px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/75 hover:border-alloy-pine/30 hover:bg-alloy-pine/10 disabled:opacity-40"
                                data-testid={`visual-editor-field-common-${field.refKey}`}
                            >
                                {field.fieldLabel}
                            </button>
                        ))}
                    </div>
                </div>
            :   null}

            <div className="flex flex-wrap gap-1.5" data-testid="visual-editor-field-picker-entities">
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
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
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
                <p className="text-xs text-alloy-midnight/50">{catalogGroupDisplayLabel(activeGroup)}</p>
            :   null}

            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={activeGroup ? `Search ${activeGroup.entityLabel} fields…` : "Search fields…"}
                disabled={disabled || !activeGroup}
                className={`w-full rounded-lg border border-alloy-forge/20 px-3 text-sm ${
                    isInspector ? "py-2" : "py-1.5 text-xs"
                }`}
                data-testid="visual-editor-field-picker-search"
            />

            <div
                className={`space-y-1 overflow-y-auto ${isInspector ? "max-h-56" : "max-h-40"}`}
                data-testid="visual-editor-field-picker-fields"
            >
                {available.length === 0 ?
                    <p className="py-4 text-center text-xs text-alloy-midnight/45">
                        {query.trim() ? "No matching fields." : "No fields in this category."}
                    </p>
                :   available.map((field) => (
                        <button
                            key={field.refKey}
                            type="button"
                            disabled={disabled}
                            onClick={() => pick(field)}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg border border-alloy-forge/10 bg-white text-left hover:border-alloy-pine/30 hover:bg-alloy-pine/[0.03] disabled:opacity-40 ${
                                isInspector ? "px-3 py-2 text-sm" : "px-2 py-1.5 text-xs"
                            }`}
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
