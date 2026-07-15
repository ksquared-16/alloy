"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from "lucide-react";

import {
    addFieldToNestedGroup,
    availableFieldsForNestedGroup,
    fieldVisibilityForNestedGroup,
    moveFieldInNestedGroup,
    namespacesForNestedGroupPicker,
    removeFieldFromNestedGroup,
    selectedFieldKeys,
    setFieldVisibilityInNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import {
    SURFACE_FIELD_VISIBILITY_LABELS,
    type SurfaceFieldVisibility,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import { availableFieldsForNamespaces, type AvailableField } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";

type Props = {
    surfaceId: string;
    groupKey: string;
    config: NestedSurfaceConfig;
    onConfigChange: (next: NestedSurfaceConfig) => void;
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
    label: string;
    domainLocked?: boolean;
    children: React.ReactNode;
};

function labelForKey(
    surfaceId: string,
    groupKey: string,
    fieldKey: string,
    tenantDefs: readonly TenantFieldDefinitionRow[] | undefined,
): string {
    const namespaces = namespacesForNestedGroupPicker(surfaceId, groupKey);
    const all = namespaces.length > 0 ? availableFieldsForNamespaces(namespaces, tenantDefs) : [];
    return all.find((f) => f.key === fieldKey)?.label
        ?? fieldKey.replace(/^[a-z_]+\./, "").replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Runtime-shaped region wrapper — click region or field to compose inside fixed structure.
 */
export default function DrillInRegionComposer({
    surfaceId,
    groupKey,
    config,
    onConfigChange,
    tenantFieldDefinitions,
    label,
    domainLocked = false,
    children,
}: Props) {
    const [regionSelected, setRegionSelected] = useState(false);
    const [selectedField, setSelectedField] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);

    const fieldKeys = selectedFieldKeys(config, groupKey);
    const available: AvailableField[] = useMemo(
        () => (domainLocked ? [] : availableFieldsForNestedGroup(surfaceId, groupKey, config, tenantFieldDefinitions)),
        [surfaceId, groupKey, config, tenantFieldDefinitions, domainLocked],
    );

    const mutate = useCallback(
        (next: NestedSurfaceConfig) => onConfigChange(next),
        [onConfigChange],
    );

    const visibility = selectedField
        ? fieldVisibilityForNestedGroup(config, groupKey, selectedField)
        : null;

    return (
        <section
            className={[
                "drill-in-region",
                regionSelected || selectedField ? "is-selected" : "",
                domainLocked ? "is-domain-locked" : "",
            ].join(" ")}
            data-drill-in-region={groupKey}
            onClick={(e) => {
                e.stopPropagation();
                setRegionSelected(true);
                setSelectedField(null);
            }}
        >
            <header className="drill-in-region__header">
                <span className="drill-in-region__title">{label}</span>
                {domainLocked ? (
                    <span className="drill-in-region__lock" data-domain-locked="true">
                        Domain-locked
                    </span>
                ) : (
                    <button
                        type="button"
                        className="drill-in-region__add"
                        data-canvas-add-field={groupKey}
                        onClick={(e) => {
                            e.stopPropagation();
                            setAddOpen((v) => !v);
                            setRegionSelected(true);
                        }}
                    >
                        <Plus className="h-3 w-3" aria-hidden />
                        Add field
                    </button>
                )}
            </header>

            <div className="drill-in-region__body" data-drill-in-region-body={groupKey}>
                {children}

                {!domainLocked && fieldKeys.length > 0 ? (
                    <div className="drill-in-region__field-list" data-inspector-field-list={groupKey}>
                        {fieldKeys.map((fieldKey, index) => (
                            <div
                                key={fieldKey}
                                className={[
                                    "drill-in-region__field",
                                    selectedField === fieldKey ? "is-selected" : "",
                                ].join(" ")}
                                data-canvas-field={fieldKey}
                                data-canvas-field-selected={selectedField === fieldKey ? "true" : undefined}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedField(fieldKey);
                                    setRegionSelected(false);
                                }}
                            >
                                <GripVertical className="drill-in-region__grip h-3 w-3" aria-hidden />
                                <span className="flex-1 truncate text-[11px]">
                                    {labelForKey(surfaceId, groupKey, fieldKey, tenantFieldDefinitions)}
                                </span>
                                <div className="flex items-center gap-0.5">
                                    <button
                                        type="button"
                                        className="drill-in-region__nudge"
                                        aria-label="Move up"
                                        disabled={index === 0}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            mutate(moveFieldInNestedGroup(config, groupKey, fieldKey, -1));
                                        }}
                                    >
                                        <ChevronUp className="h-3 w-3" />
                                    </button>
                                    <button
                                        type="button"
                                        className="drill-in-region__nudge"
                                        aria-label="Move down"
                                        disabled={index === fieldKeys.length - 1}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            mutate(moveFieldInNestedGroup(config, groupKey, fieldKey, 1));
                                        }}
                                    >
                                        <ChevronDown className="h-3 w-3" />
                                    </button>
                                    <button
                                        type="button"
                                        className="drill-in-region__remove"
                                        aria-label="Remove field"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            mutate(removeFieldFromNestedGroup(config, groupKey, fieldKey));
                                            if (selectedField === fieldKey) setSelectedField(null);
                                        }}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            {addOpen && !domainLocked ? (
                <div className="drill-in-region__library" data-drill-in-field-library={groupKey}>
                    {available.length === 0 ? (
                        <p className="text-[11px] text-alloy-midnight/45">No compatible fields to add.</p>
                    ) : (
                        available.map((f) => (
                            <button
                                key={f.key}
                                type="button"
                                className="drill-in-region__library-item"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    mutate(addFieldToNestedGroup(config, groupKey, f.key));
                                    setAddOpen(false);
                                }}
                            >
                                {f.label}
                            </button>
                        ))
                    )}
                </div>
            ) : null}

            {selectedField && visibility ? (
                <div
                    className="drill-in-region__inspector"
                    data-surface-field-inspector="true"
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                        Field policy
                    </p>
                    <p className="text-xs font-medium text-alloy-midnight">
                        {labelForKey(surfaceId, groupKey, selectedField, tenantFieldDefinitions)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {(["displayed", "read-only", "editable"] as SurfaceFieldVisibility[]).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                className={[
                                    "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                    visibility === mode
                                        ? "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine"
                                        : "border-alloy-stone/20 text-alloy-midnight/55 hover:border-alloy-pine/30",
                                ].join(" ")}
                                data-field-visibility={mode}
                                onClick={() =>
                                    mutate(setFieldVisibilityInNestedGroup(config, groupKey, selectedField, mode))
                                }
                            >
                                {SURFACE_FIELD_VISIBILITY_LABELS[mode]}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
