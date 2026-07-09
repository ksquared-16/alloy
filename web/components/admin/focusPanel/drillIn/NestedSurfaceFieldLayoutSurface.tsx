"use client";

import { useCallback, useMemo, useState, type DragEvent } from "react";
import clsx from "clsx";
import { GripVertical, X, type LucideIcon } from "lucide-react";

import {
    applyNestedSurfaceFieldDrop,
    fieldLayoutWidthForNestedGroup,
    fieldPresentationLabel,
    fieldShowIconForNestedGroup,
    fieldShowLabelForNestedGroup,
    fieldVisibilityForNestedGroup,
    groupDefsFor,
    removeFieldFromNestedGroup,
    selectedFieldKeys,
    setFieldPresentationLabel,
    setFieldPresentationModeInNestedGroup,
    setFieldVisibilityInNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { NestedSurfaceFieldDropZone } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import { chunkNestedSurfaceFieldsForHalfRowLayout } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import {
    SURFACE_FIELD_VISIBILITY_LABELS,
    type SurfaceFieldVisibility,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";
import { availableFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import NestedSurfaceAddField from "@/components/admin/focusPanel/drillIn/NestedSurfaceAddField";

export type LayoutSurfaceFieldMeta = {
    fieldKey: string;
    label: string;
    icon?: LucideIcon;
    value: string | null;
    /** Composite blocks (schedule) render outside the truth row grid. */
    renderBlock?: () => React.ReactNode;
};

type Props = {
    surfaceId: string;
    groupKey: string;
    fields: LayoutSurfaceFieldMeta[];
    className?: string;
    /** When false, parent region owns the single Add field affordance. */
    showAddField?: boolean;
};

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

/**
 * Visual layout surface — each field instance IS the editor.
 * Drag beside to pair; drag below for a full row. Controls appear on hover/selection only.
 */
export default function NestedSurfaceFieldLayoutSurface({
    surfaceId,
    groupKey,
    fields,
    className = "",
    showAddField = true,
}: Props) {
    const composer = useFocusPanelComposer();
    const { tenantFieldDefinitions } = useTenantFieldDefinitions("opportunities");
    const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);
    const [draggingKey, setDraggingKey] = useState<string | null>(null);
    const [dropHint, setDropHint] = useState<{ targetKey: string; zone: NestedSurfaceFieldDropZone } | null>(null);

    const composing = composer?.isComposingSurface(surfaceId) ?? false;
    const config = composer?.configFor(surfaceId);

    const fieldMetaByKey = useMemo(
        () => new Map(fields.map((field) => [field.fieldKey, field])),
        [fields],
    );

    const orderedKeys = useMemo(() => {
        if (!config) return fields.map((f) => f.fieldKey);
        const configured = selectedFieldKeys(config, groupKey);
        const visible = configured.filter((key) => fieldMetaByKey.has(key));
        return visible.length > 0 ? visible : fields.map((f) => f.fieldKey);
    }, [config, groupKey, fields, fieldMetaByKey]);

    const rowChunks = useMemo(() => {
        if (!config) return orderedKeys.map((key) => [key]);
        return chunkNestedSurfaceFieldsForHalfRowLayout(orderedKeys, (fieldKey) =>
            fieldLayoutWidthForNestedGroup(config, groupKey, fieldKey),
        );
    }, [config, groupKey, orderedKeys]);

    const mutate = useCallback(
        (next: NestedSurfaceConfig) => composer?.updateConfig(surfaceId, next),
        [composer, surfaceId],
    );

    const handleDrop = useCallback(
        (targetKey: string, zone: NestedSurfaceFieldDropZone) => {
            if (!config || !draggingKey || draggingKey === targetKey) return;
            mutate(applyNestedSurfaceFieldDrop(config, groupKey, draggingKey, targetKey, zone));
            setDraggingKey(null);
            setDropHint(null);
        },
        [config, draggingKey, groupKey, mutate],
    );

    if (!config && !composing) {
        return (
            <div className={clsx("alloy-os-child-edit", className)} data-nested-layout-surface={groupKey}>
                {fields.map((field) => (
                    <RuntimeFieldRow key={field.fieldKey} field={field} showLabel showIcon />
                ))}
            </div>
        );
    }

    return (
        <div
            className={clsx("fp-layout-surface", composing && "fp-layout-surface--composing", className)}
            data-nested-layout-surface={groupKey}
            onClick={(e) => {
                e.stopPropagation();
                composer?.select({ kind: "region", surfaceId, groupKey });
            }}
        >
            {rowChunks.map((chunk, rowIndex) => (
                <div
                    key={`${chunk.join("-")}-${rowIndex}`}
                    className={clsx(
                        "alloy-os-child-truth__inline-row",
                        chunk.length === 2 && "alloy-os-child-truth__inline-row--pair",
                    )}
                    data-children-inline-row={chunk.length === 2 ? "pair" : "single"}
                >
                    {chunk.map((fieldKey) => {
                        const meta = fieldMetaByKey.get(fieldKey);
                        if (!meta) return null;

                        if (meta.renderBlock) {
                            return (
                                <FieldInstance
                                    key={fieldKey}
                                    surfaceId={surfaceId}
                                    groupKey={groupKey}
                                    fieldKey={fieldKey}
                                    label={fieldPresentationLabel(
                                        config!,
                                        groupKey,
                                        fieldKey,
                                        catalogLabelFor(surfaceId, groupKey, fieldKey, tenantFieldDefinitions),
                                    )}
                                    config={config!}
                                    composing={composing}
                                    selected={
                                        composer?.selection?.kind === "field" &&
                                        composer.selection.surfaceId === surfaceId &&
                                        composer.selection.groupKey === groupKey &&
                                        composer.selection.fieldKey === fieldKey
                                    }
                                    editingLabelKey={editingLabelKey}
                                    draggingKey={draggingKey}
                                    dropHint={dropHint?.targetKey === fieldKey ? dropHint.zone : null}
                                    canPairBeside={chunk.length < 2}
                                    onSelect={() =>
                                        composer?.select({ kind: "field", surfaceId, groupKey, fieldKey })
                                    }
                                    onMutate={mutate}
                                    onEditLabel={setEditingLabelKey}
                                    onDragStart={setDraggingKey}
                                    onDragEnd={() => {
                                        setDraggingKey(null);
                                        setDropHint(null);
                                    }}
                                    onDropZone={(zone) => handleDrop(fieldKey, zone)}
                                    onDropHint={(zone) => setDropHint(zone ? { targetKey: fieldKey, zone } : null)}
                                    className="fp-layout-field--block"
                                >
                                    {meta.renderBlock()}
                                </FieldInstance>
                            );
                        }

                        const showLabel = fieldShowLabelForNestedGroup(config!, groupKey, fieldKey);
                        const showIcon = fieldShowIconForNestedGroup(config!, groupKey, fieldKey);
                        const label = fieldPresentationLabel(config!, groupKey, fieldKey, meta.label);

                        return (
                            <FieldInstance
                                key={fieldKey}
                                surfaceId={surfaceId}
                                groupKey={groupKey}
                                fieldKey={fieldKey}
                                label={label}
                                config={config!}
                                composing={composing}
                                selected={
                                    composer?.selection?.kind === "field" &&
                                    composer.selection.surfaceId === surfaceId &&
                                    composer.selection.groupKey === groupKey &&
                                    composer.selection.fieldKey === fieldKey
                                }
                                editingLabelKey={editingLabelKey}
                                draggingKey={draggingKey}
                                dropHint={dropHint?.targetKey === fieldKey ? dropHint.zone : null}
                                canPairBeside={chunk.length < 2}
                                onSelect={() =>
                                    composer?.select({ kind: "field", surfaceId, groupKey, fieldKey })
                                }
                                onMutate={mutate}
                                onEditLabel={setEditingLabelKey}
                                onDragStart={setDraggingKey}
                                onDragEnd={() => {
                                    setDraggingKey(null);
                                    setDropHint(null);
                                }}
                                onDropZone={(zone) => handleDrop(fieldKey, zone)}
                                onDropHint={(zone) => setDropHint(zone ? { targetKey: fieldKey, zone } : null)}
                            >
                                <RuntimeFieldRow
                                    field={{ ...meta, label }}
                                    showLabel={showLabel}
                                    showIcon={showIcon}
                                />
                            </FieldInstance>
                        );
                    })}
                </div>
            ))}

            {composing && showAddField ? (
                <NestedSurfaceAddField surfaceId={surfaceId} groupKey={groupKey} />
            ) : null}
        </div>
    );
}

function RuntimeFieldRow({
    field,
    showLabel,
    showIcon,
}: {
    field: LayoutSurfaceFieldMeta;
    showLabel: boolean;
    showIcon: boolean;
}) {
    const Icon = field.icon;
    return (
        <div className="alloy-os-child-truth__row" data-child-truth={field.label}>
            {showIcon && Icon ? (
                <span className="alloy-os-child-truth__icon" aria-hidden>
                    <Icon size={15} strokeWidth={1.75} />
                </span>
            ) : (
                <span className="alloy-os-child-truth__icon" aria-hidden />
            )}
            {showLabel ? <span className="alloy-os-child-truth__label">{field.label}</span> : null}
            <span className={clsx("alloy-os-child-truth__value", !field.value && "alloy-os-child-truth__value--empty")}>
                {field.value ?? "Not set"}
            </span>
        </div>
    );
}

function FieldInstance({
    surfaceId,
    groupKey,
    fieldKey,
    label,
    config,
    composing,
    selected,
    editingLabelKey,
    draggingKey,
    dropHint,
    canPairBeside,
    onSelect,
    onMutate,
    onEditLabel,
    onDragStart,
    onDragEnd,
    onDropZone,
    onDropHint,
    className = "",
    children,
}: {
    surfaceId: string;
    groupKey: string;
    fieldKey: string;
    label: string;
    config: NestedSurfaceConfig;
    composing: boolean;
    selected: boolean;
    editingLabelKey: string | null;
    draggingKey: string | null;
    dropHint: NestedSurfaceFieldDropZone | null;
    canPairBeside: boolean;
    onSelect: () => void;
    onMutate: (next: NestedSurfaceConfig) => void;
    onEditLabel: (key: string | null) => void;
    onDragStart: (key: string) => void;
    onDragEnd: () => void;
    onDropZone: (zone: NestedSurfaceFieldDropZone) => void;
    onDropHint: (zone: NestedSurfaceFieldDropZone | null) => void;
    className?: string;
    children: React.ReactNode;
}) {
    const visibility = fieldVisibilityForNestedGroup(config, groupKey, fieldKey);
    const showLabel = fieldShowLabelForNestedGroup(config, groupKey, fieldKey);
    const showIcon = fieldShowIconForNestedGroup(config, groupKey, fieldKey);
    const editingLabel = editingLabelKey === fieldKey;

    const onDragOver = (e: DragEvent, zone: NestedSurfaceFieldDropZone) => {
        if (!composing) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDropHint(zone);
    };

    const onDrop = (e: DragEvent, zone: NestedSurfaceFieldDropZone) => {
        e.preventDefault();
        e.stopPropagation();
        onDropZone(zone);
        onDropHint(null);
    };

    return (
        <div
            className={clsx(
                "fp-layout-field",
                className,
                composing && "fp-layout-field--composing",
                draggingKey === fieldKey && "is-dragging",
                selected && "is-selected",
            )}
            data-canvas-field={fieldKey}
            draggable={composing}
            onDragStart={(e) => {
                if (!composing) return;
                e.dataTransfer.setData("text/plain", fieldKey);
                e.dataTransfer.effectAllowed = "move";
                onDragStart(fieldKey);
            }}
            onDragEnd={onDragEnd}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
        >
            {children}
            {composing ? (
                <>
                    {canPairBeside ? (
                        <div
                            className={clsx(
                                "fp-layout-drop-zone fp-layout-drop-zone--beside",
                                dropHint === "beside" && "is-active",
                            )}
                            data-drop-zone="beside"
                            onDragOver={(e) => onDragOver(e, "beside")}
                            onDragLeave={() => onDropHint(null)}
                            onDrop={(e) => onDrop(e, "beside")}
                        >
                            <span className="fp-layout-drop-hint">Place beside</span>
                        </div>
                    ) : null}
                    <div
                        className={clsx(
                            "fp-layout-drop-zone fp-layout-drop-zone--below",
                            dropHint === "below" && "is-active",
                        )}
                        data-drop-zone="below"
                        onDragOver={(e) => onDragOver(e, "below")}
                        onDragLeave={() => onDropHint(null)}
                        onDrop={(e) => onDrop(e, "below")}
                    >
                        <span className="fp-layout-drop-hint">Place below</span>
                    </div>
                    <div className="fp-field-instance__chrome" onClick={(e) => e.stopPropagation()}>
                        <div className="fp-field-instance__toolbar">
                        <button
                            type="button"
                            className="fp-layout-field__grip"
                            aria-label={`Drag ${label}`}
                            tabIndex={-1}
                        >
                            <GripVertical className="h-3 w-3" aria-hidden />
                        </button>
                        <div className="fp-field-instance__controls">
                            {editingLabel ? (
                                <input
                                    className="fp-inline-field-row__label-input"
                                    autoFocus
                                    defaultValue={label}
                                    onBlur={(e) => {
                                        onMutate(setFieldPresentationLabel(config, groupKey, fieldKey, e.target.value));
                                        onEditLabel(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                        if (e.key === "Escape") onEditLabel(null);
                                    }}
                                />
                            ) : (
                                <button
                                    type="button"
                                    className="fp-layout-field__control"
                                    onClick={() => onEditLabel(fieldKey)}
                                >
                                    Rename
                                </button>
                            )}
                            <select
                                className="fp-inline-field-row__behavior"
                                value={visibility}
                                aria-label={`Display policy for ${label}`}
                                onChange={(e) =>
                                    onMutate(
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
                            <button
                                type="button"
                                className={clsx("fp-layout-field__toggle", showLabel && "is-on")}
                                aria-pressed={showLabel}
                                onClick={() =>
                                    onMutate(
                                        setFieldPresentationModeInNestedGroup(config, groupKey, fieldKey, {
                                            showLabel: !showLabel,
                                        }),
                                    )
                                }
                            >
                                Label
                            </button>
                            <button
                                type="button"
                                className={clsx("fp-layout-field__toggle", showIcon && "is-on")}
                                aria-pressed={showIcon}
                                onClick={() =>
                                    onMutate(
                                        setFieldPresentationModeInNestedGroup(config, groupKey, fieldKey, {
                                            showIcon: !showIcon,
                                        }),
                                    )
                                }
                            >
                                Icon
                            </button>
                        </div>
                        <button
                            type="button"
                            className="fp-field-instance__remove"
                            aria-label={`Remove ${label}`}
                            onClick={() => onMutate(removeFieldFromNestedGroup(config, groupKey, fieldKey))}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
                </>
            ) : null}
        </div>
    );
}
