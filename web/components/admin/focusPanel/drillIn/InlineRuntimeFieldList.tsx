"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from "lucide-react";

import {
    addFieldToNestedGroup,
    availableFieldsForNestedGroup,
    fieldLayoutWidthForNestedGroup,
    fieldPresentationLabel,
    fieldVisibilityForNestedGroup,
    groupDefsFor,
    moveFieldInNestedGroup,
    removeFieldFromNestedGroup,
    selectedFieldKeys,
    setFieldPresentationLabel,
    setFieldLayoutWidthInNestedGroup,
    setFieldVisibilityInNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { NestedSurfaceFieldLayoutWidth } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import {
    SURFACE_FIELD_VISIBILITY_LABELS,
    type SurfaceFieldVisibility,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";
import { availableFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";

function catalogLabelFor(
    surfaceId: string,
    groupKey: string,
    fieldKey: string,
    tenantDefs: ReturnType<typeof useTenantFieldDefinitions>["tenantFieldDefinitions"],
): string {
    const def = groupDefsFor(surfaceId).find((g) => g.key === groupKey);
    const all = def ? availableFieldsForNamespaces(def.acceptedNamespaces, tenantDefs) : [];
    return all.find((f) => f.key === fieldKey)?.label
        ?? fieldKey.replace(/^[a-z_]+\./, "").replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type Props = {
    surfaceId: string;
    groupKey: string;
    /** Optional preview value shown after the label (runtime sample data). */
    previewByFieldKey?: Record<string, string | null | undefined>;
    className?: string;
    /** When true, hide preview values — runtime rows already show them. */
    suppressPreview?: boolean;
    /** When true, render only while this region (or a field within it) is selected. */
    whenRegionSelectedOnly?: boolean;
};

/**
 * Surface Composer V3 — inline runtime field editor.
 * Fields are configured exactly where they render: grip, label, behavior, remove, + add field.
 */
export default function InlineRuntimeFieldList({
    surfaceId,
    groupKey,
    previewByFieldKey = {},
    className = "",
    suppressPreview = false,
    whenRegionSelectedOnly = false,
}: Props) {
    const composer = useFocusPanelComposer();
    const { tenantFieldDefinitions } = useTenantFieldDefinitions("opportunities");
    const [addOpen, setAddOpen] = useState(false);
    const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);

    const composing = composer?.isComposingSurface(surfaceId) ?? false;
    const config = composer?.configFor(surfaceId);
    const regionActive =
        composer?.selection?.kind === "region" &&
        composer.selection.surfaceId === surfaceId &&
        composer.selection.groupKey === groupKey
        || (
            composer?.selection?.kind === "field" &&
            composer.selection.surfaceId === surfaceId &&
            composer.selection.groupKey === groupKey
        );

    const fieldKeys = config ? selectedFieldKeys(config, groupKey) : [];
    const available = useMemo(
        () =>
            config && composing
                ? availableFieldsForNestedGroup(surfaceId, groupKey, config, tenantFieldDefinitions)
                : [],
        [config, composing, surfaceId, groupKey, tenantFieldDefinitions],
    );

    const mutate = useCallback(
        (next: NestedSurfaceConfig) => composer?.updateConfig(surfaceId, next),
        [composer, surfaceId],
    );

    if (!composing || !composer || !config) return null;
    if (whenRegionSelectedOnly && !regionActive) return null;

    return (
        <div
            className={[
                "fp-inline-field-list",
                suppressPreview ? "fp-inline-field-list--edit-layer" : "",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            data-inline-field-list={groupKey}
            onClick={(e) => {
                e.stopPropagation();
                composer.select({ kind: "region", surfaceId, groupKey });
            }}
        >
            {fieldKeys.map((fieldKey, index) => {
                const catalog = catalogLabelFor(surfaceId, groupKey, fieldKey, tenantFieldDefinitions);
                const label = fieldPresentationLabel(config, groupKey, fieldKey, catalog);
                const visibility = fieldVisibilityForNestedGroup(config, groupKey, fieldKey);
                const layoutWidth = fieldLayoutWidthForNestedGroup(config, groupKey, fieldKey);
                const preview = previewByFieldKey[fieldKey];
                const editingLabel = editingLabelKey === fieldKey;
                const selected =
                    composer.selection?.kind === "field" &&
                    composer.selection.surfaceId === surfaceId &&
                    composer.selection.groupKey === groupKey &&
                    composer.selection.fieldKey === fieldKey;

                return (
                    <div
                        key={fieldKey}
                        className={["fp-inline-field-row", selected ? "is-selected" : ""].join(" ")}
                        data-canvas-field={fieldKey}
                        onClick={(e) => {
                            e.stopPropagation();
                            composer.select({ kind: "field", surfaceId, groupKey, fieldKey });
                        }}
                    >
                        <GripVertical className="fp-inline-field-row__grip" aria-hidden />
                        <div className="fp-inline-field-row__main min-w-0 flex-1">
                            {editingLabel ? (
                                <input
                                    className="fp-inline-field-row__label-input"
                                    autoFocus
                                    defaultValue={label}
                                    onBlur={(e) => {
                                        mutate(setFieldPresentationLabel(config, groupKey, fieldKey, e.target.value));
                                        setEditingLabelKey(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                        if (e.key === "Escape") setEditingLabelKey(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <button
                                    type="button"
                                    className="fp-inline-field-row__label"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingLabelKey(fieldKey);
                                    }}
                                >
                                    {label}
                                </button>
                            )}
                            {preview && !suppressPreview && visibility !== "hidden" ? (
                                <span className="fp-inline-field-row__preview">{preview}</span>
                            ) : null}
                        </div>
                        <select
                            className="fp-inline-field-row__layout"
                            value={layoutWidth}
                            aria-label={`Row width for ${label}`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                                mutate(
                                    setFieldLayoutWidthInNestedGroup(
                                        config,
                                        groupKey,
                                        fieldKey,
                                        e.target.value as NestedSurfaceFieldLayoutWidth,
                                    ),
                                )
                            }
                        >
                            <option value="full">Full row</option>
                            <option value="half">Half row</option>
                        </select>
                        <select
                            className="fp-inline-field-row__behavior"
                            value={visibility}
                            aria-label={`Behavior for ${label}`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                                mutate(
                                    setFieldVisibilityInNestedGroup(
                                        config,
                                        groupKey,
                                        fieldKey,
                                        e.target.value as SurfaceFieldVisibility,
                                    ),
                                )
                            }
                        >
                            {(Object.keys(SURFACE_FIELD_VISIBILITY_LABELS) as SurfaceFieldVisibility[]).map((mode) => (
                                <option key={mode} value={mode}>
                                    {SURFACE_FIELD_VISIBILITY_LABELS[mode]}
                                </option>
                            ))}
                        </select>
                        <div className="fp-inline-field-row__nudges">
                            <button
                                type="button"
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
                                aria-label="Remove field"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    mutate(removeFieldFromNestedGroup(config, groupKey, fieldKey));
                                }}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                );
            })}

            <div className="fp-inline-field-list__add-wrap">
                <button
                    type="button"
                    className="fp-inline-field-list__add"
                    data-canvas-add-field={groupKey}
                    onClick={(e) => {
                        e.stopPropagation();
                        setAddOpen((v) => !v);
                    }}
                >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add field
                </button>
                {addOpen && available.length > 0 ? (
                    <div className="fp-inline-field-library" data-drill-in-field-library={groupKey}>
                        {available.map((f) => (
                            <button
                                key={f.key}
                                type="button"
                                className="fp-inline-field-library__item"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    mutate(addFieldToNestedGroup(config, groupKey, f.key));
                                    setAddOpen(false);
                                }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
