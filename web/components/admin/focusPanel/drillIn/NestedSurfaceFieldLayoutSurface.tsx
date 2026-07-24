"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import clsx from "clsx";
import { GripVertical, X, type LucideIcon } from "lucide-react";

import { namespacesForNestedGroupPicker, 
    applyNestedSurfaceFieldDrop,
    fieldLayoutWidthForNestedGroup,
    fieldPresentationLabel,
    fieldShowIconForNestedGroup,
    fieldShowLabelForNestedGroup,
    fieldVisibilityForNestedGroup,
    groupDefsFor,
    identityConfigurationFieldKeys,
    removeFieldFromNestedGroup,
    selectedFieldKeys,
    setFieldPresentationLabel,
    setFieldPresentationModeInNestedGroup,
    setFieldVisibilityInNestedGroup,
    setFieldLinkTargetInNestedGroup,
    fieldLinkTargetForNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { IdentityFieldTier } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import { configurationPurposeFromTierArg } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import type { NestedSurfaceFieldDropZone } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import { chunkNestedSurfaceFieldsForHalfRowLayout } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import {
    SURFACE_FIELD_VISIBILITY_LABELS,
    type SurfaceFieldVisibility,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import { identityFieldVisibilityOptionsForBuilder } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldEditContract";
import {
    IDENTITY_LINK_CARD_OPTIONS,
    IDENTITY_LINK_OPEN_OPTIONS,
    IDENTITY_LINK_SUBJECT_OPTIONS,
    isIdentityFieldLinkTargetComplete,
    summarizeIdentityFieldLinkTarget,
    type IdentityFieldLinkTarget,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";
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
    /** Active disclosure tier — Summary / Context Facts / Details. */
    tier?: IdentityFieldTier;
};

function humanizeFieldKey(fieldKey: string): string {
    const leaf = fieldKey.includes(".") ? fieldKey.slice(fieldKey.lastIndexOf(".") + 1) : fieldKey;
    return leaf.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Never return raw canonical refs in Builder UI. */
function catalogLabelFor(
    surfaceId: string,
    groupKey: string,
    fieldKey: string,
    tenantDefs: ReturnType<typeof useTenantFieldDefinitions>["tenantFieldDefinitions"],
): string {
    const namespaces = namespacesForNestedGroupPicker(surfaceId, groupKey);
    const all = namespaces.length > 0 ? availableFieldsForNamespaces(namespaces, tenantDefs) : [];
    const fromCatalog = all.find((f) => f.key === fieldKey)?.label?.trim();
    if (fromCatalog && fromCatalog !== fieldKey && !/^[a-z_]+\./i.test(fromCatalog)) return fromCatalog;
    if (fromCatalog && fromCatalog !== fieldKey) return humanizeFieldKey(fieldKey);
    return humanizeFieldKey(fieldKey) || "Unavailable field";
}

function displayLabelLooksLikeRawRef(label: string): boolean {
    return /^[a-z_]+\.[a-z0-9_.]+$/i.test(label.trim());
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
    tier,
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
        if (!config) return composing ? [] : fields.map((f) => f.fieldKey);
        const configured = tier
            ? identityConfigurationFieldKeys(config, groupKey, configurationPurposeFromTierArg(tier))
            : selectedFieldKeys(config, groupKey);
        if (composing) return configured;
        const visible = configured.filter((key) => fieldMetaByKey.has(key));
        if (visible.length > 0) return visible;
        if (configured.length > 0) return configured;
        return fields.map((f) => f.fieldKey);
    }, [composing, config, groupKey, fields, fieldMetaByKey, tier]);

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
            mutate(applyNestedSurfaceFieldDrop(config, groupKey, draggingKey, targetKey, zone, { tier }));
            setDraggingKey(null);
            setDropHint(null);
        },
        [config, draggingKey, groupKey, mutate, tier],
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
            className={clsx(
                "fp-layout-surface",
                composing && "fp-layout-surface--composing",
                draggingKey && "fp-layout-surface--dragging",
                className,
            )}
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
                        const meta =
                            fieldMetaByKey.get(fieldKey)
                            ?? (composing && config
                                ? {
                                      fieldKey,
                                      label: fieldPresentationLabel(
                                          config,
                                          groupKey,
                                          fieldKey,
                                          catalogLabelFor(
                                              surfaceId,
                                              groupKey,
                                              fieldKey,
                                              tenantFieldDefinitions,
                                          ),
                                      ),
                                      value: null,
                                  }
                                : undefined);
                        if (!meta) return null;

                        const catalogLabel = catalogLabelFor(
                            surfaceId,
                            groupKey,
                            fieldKey,
                            tenantFieldDefinitions,
                        );

                        if (meta.renderBlock) {
                            return (
                                <FieldInstance
                                    key={fieldKey}
                                    surfaceId={surfaceId}
                                    groupKey={groupKey}
                                    fieldKey={fieldKey}
                                    catalogLabel={catalogLabel}
                                    label={fieldPresentationLabel(
                                        config!,
                                        groupKey,
                                        fieldKey,
                                        catalogLabel,
                                    )}
                                    config={config!}
                                    composing={composing}
                                    blockComposerHint="Schedule block"
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
                                    onAfterRemove={() =>
                                        composer?.select({ kind: "region", surfaceId, groupKey })
                                    }
                                    tier={tier}
                                    className="fp-layout-field--block"
                                />
                            );
                        }

                        const showLabel = fieldShowLabelForNestedGroup(config!, groupKey, fieldKey);
                        const showIcon = fieldShowIconForNestedGroup(config!, groupKey, fieldKey);
                        const resolvedLabel = fieldPresentationLabel(config!, groupKey, fieldKey, catalogLabel);
                        const label =
                            displayLabelLooksLikeRawRef(resolvedLabel) || displayLabelLooksLikeRawRef(meta.label)
                                ? catalogLabel
                                : resolvedLabel;

                        return (
                            <FieldInstance
                                key={fieldKey}
                                surfaceId={surfaceId}
                                groupKey={groupKey}
                                fieldKey={fieldKey}
                                catalogLabel={catalogLabel}
                                label={label}
                                icon={meta.icon}
                                showLabel={showLabel}
                                showIcon={showIcon}
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
                                onAfterRemove={() =>
                                    composer?.select({ kind: "region", surfaceId, groupKey })
                                }
                                tier={tier}
                            >
                                {!composing ? (
                                    <RuntimeFieldRow
                                        field={{ ...meta, label }}
                                        showLabel={showLabel}
                                        showIcon={showIcon}
                                    />
                                ) : null}
                            </FieldInstance>
                        );
                    })}
                </div>
            ))}

            {composing && showAddField ? (
                <NestedSurfaceAddField surfaceId={surfaceId} groupKey={groupKey} tier={tier} />
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

/** Builder-only row — field identity without runtime preview values. */
function BuilderFieldIdentityRow({
    catalogLabel,
    showLabel,
    showIcon,
    icon: Icon,
    blockHint,
}: {
    catalogLabel: string;
    showLabel: boolean;
    showIcon: boolean;
    icon?: LucideIcon;
    blockHint?: string;
}) {
    return (
        <div className="fp-builder-field-row" data-builder-field-row="true">
            {showIcon && Icon ? (
                <span className="alloy-os-child-truth__icon" aria-hidden>
                    <Icon size={15} strokeWidth={1.75} />
                </span>
            ) : (
                <span className="alloy-os-child-truth__icon" aria-hidden />
            )}
            {showLabel ? <span className="fp-builder-field-row__label">{catalogLabel}</span> : null}
            {blockHint ? <span className="fp-builder-field-row__hint">{blockHint}</span> : null}
        </div>
    );
}

function FieldInstance({
    surfaceId,
    groupKey,
    fieldKey,
    catalogLabel,
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
    onAfterRemove,
    tier,
    className = "",
    icon,
    showLabel: showLabelProp,
    showIcon: showIconProp,
    blockComposerHint,
    children,
}: {
    surfaceId: string;
    groupKey: string;
    fieldKey: string;
    catalogLabel: string;
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
    onAfterRemove: () => void;
    tier?: IdentityFieldTier;
    className?: string;
    icon?: LucideIcon;
    showLabel?: boolean;
    showIcon?: boolean;
    blockComposerHint?: string;
    children?: React.ReactNode;
}) {
    const visibility = fieldVisibilityForNestedGroup(config, groupKey, fieldKey, tier ? { tier } : undefined);
    const showLabel = showLabelProp ?? fieldShowLabelForNestedGroup(config, groupKey, fieldKey);
    const showIcon = showIconProp ?? fieldShowIconForNestedGroup(config, groupKey, fieldKey);
    const editingLabel = editingLabelKey === fieldKey;
    const hasCustomLabel = label.trim() !== catalogLabel.trim();
    /** Expand Linked authoring when the operator just chose Linked (not on load of a valid setup). */
    const [linkConfigPreferExpanded, setLinkConfigPreferExpanded] = useState(false);

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
            {composing ? (
                <BuilderFieldIdentityRow
                    catalogLabel={catalogLabel}
                    showLabel={showLabel}
                    showIcon={showIcon}
                    icon={icon}
                    blockHint={blockComposerHint}
                />
            ) : (
                children
            )}
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
                            aria-label={`Drag ${catalogLabel}`}
                            tabIndex={-1}
                        >
                            <GripVertical className="h-3 w-3" aria-hidden />
                        </button>
                        <div className="fp-field-instance__controls">
                            <div className="fp-field-instance__identity">
                                {editingLabel ? (
                                    <input
                                        className="fp-inline-field-row__label-input"
                                        autoFocus
                                        defaultValue={label}
                                        aria-label={`Rename ${catalogLabel}`}
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
                                    <>
                                        <span className="fp-field-instance__name">{catalogLabel}</span>
                                        {hasCustomLabel ? (
                                            <span className="fp-field-instance__alias">as {label}</span>
                                        ) : null}
                                        <button
                                            type="button"
                                            className="fp-layout-field__control fp-layout-field__control--secondary"
                                            onClick={() => onEditLabel(fieldKey)}
                                        >
                                            Rename
                                        </button>
                                    </>
                                )}
                            </div>
                            <select
                                className="fp-inline-field-row__behavior"
                                value={
                                    identityFieldVisibilityOptionsForBuilder(fieldKey).includes(visibility)
                                        ? visibility
                                        : "read-only"
                                }
                                aria-label={`Display policy for ${catalogLabel}`}
                                onChange={(e) => {
                                    const next = e.target.value as SurfaceFieldVisibility;
                                    if (next === "linked") setLinkConfigPreferExpanded(true);
                                    else setLinkConfigPreferExpanded(false);
                                    onMutate(
                                        setFieldVisibilityInNestedGroup(
                                            config,
                                            groupKey,
                                            fieldKey,
                                            next,
                                            tier ? { tier } : undefined,
                                        ),
                                    );
                                }}
                            >
                                {identityFieldVisibilityOptionsForBuilder(fieldKey).map((mode) => (
                                    <option key={mode} value={mode}>
                                        {SURFACE_FIELD_VISIBILITY_LABELS[mode]}
                                    </option>
                                ))}
                            </select>
                            {visibility === "linked" ? (
                                <LinkedTargetControls
                                    fieldKey={fieldKey}
                                    catalogLabel={catalogLabel}
                                    linkTarget={
                                        fieldLinkTargetForNestedGroup(config, groupKey, fieldKey, tier ? { tier } : undefined)
                                    }
                                    preferExpanded={linkConfigPreferExpanded}
                                    onPreferExpandedChange={setLinkConfigPreferExpanded}
                                    onChange={(nextTarget) =>
                                        onMutate(
                                            setFieldLinkTargetInNestedGroup(
                                                config,
                                                groupKey,
                                                fieldKey,
                                                nextTarget,
                                                tier ? { tier } : undefined,
                                            ),
                                        )
                                    }
                                />
                            ) : null}
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
                            aria-label={`Remove ${catalogLabel}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onMutate(removeFieldFromNestedGroup(config, groupKey, fieldKey, { tier }));
                                onAfterRemove();
                            }}
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

function LinkedTargetControls({
    fieldKey,
    catalogLabel,
    linkTarget,
    preferExpanded,
    onPreferExpandedChange,
    onChange,
}: {
    fieldKey: string;
    catalogLabel: string;
    linkTarget: IdentityFieldLinkTarget | null;
    preferExpanded: boolean;
    onPreferExpandedChange: (next: boolean) => void;
    onChange: (next: IdentityFieldLinkTarget) => void;
}) {
    const complete = isIdentityFieldLinkTargetComplete(linkTarget);
    const summary = summarizeIdentityFieldLinkTarget(linkTarget);
    const [expanded, setExpanded] = useState(() => !complete || preferExpanded);

    useEffect(() => {
        if (!complete || preferExpanded) setExpanded(true);
    }, [complete, preferExpanded, linkTarget?.toCard, linkTarget?.open, linkTarget?.subject]);

    if (!linkTarget) return null;

    const collapse = () => {
        setExpanded(false);
        onPreferExpandedChange(false);
    };

    if (!expanded && complete && summary) {
        return (
            <div
                className="fp-linked-target-controls fp-linked-target-controls--collapsed"
                data-linked-target-controls={fieldKey}
                data-linked-target-collapsed="true"
                onClick={(e) => e.stopPropagation()}
            >
                <span className="fp-linked-target-controls__summary" title={summary}>
                    {catalogLabel} · {summary}
                </span>
                <button
                    type="button"
                    className="fp-linked-target-controls__edit"
                    data-linked-target-edit={fieldKey}
                    onClick={() => {
                        setExpanded(true);
                        onPreferExpandedChange(true);
                    }}
                >
                    Edit
                </button>
            </div>
        );
    }

    return (
        <div
            className="fp-linked-target-controls"
            data-linked-target-controls={fieldKey}
            data-linked-target-collapsed="false"
            onClick={(e) => e.stopPropagation()}
        >
            {!complete ? (
                <p className="fp-linked-target-controls__warn" data-linked-target-incomplete="true">
                    Finish Link to card, Open, and Subject.
                </p>
            ) : null}
            <label className="fp-linked-target-controls__row">
                <span>Link to card</span>
                <select
                    aria-label={`Link ${catalogLabel} to card`}
                    value={linkTarget.toCard}
                    onChange={(e) =>
                        onChange({
                            ...linkTarget,
                            toCard: e.target.value as IdentityFieldLinkTarget["toCard"],
                        })
                    }
                >
                    {IDENTITY_LINK_CARD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </label>
            <label className="fp-linked-target-controls__row">
                <span>Open</span>
                <select
                    aria-label={`Open mode for ${catalogLabel}`}
                    value={linkTarget.open}
                    onChange={(e) =>
                        onChange({
                            ...linkTarget,
                            open: e.target.value as IdentityFieldLinkTarget["open"],
                        })
                    }
                >
                    {IDENTITY_LINK_OPEN_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </label>
            <label className="fp-linked-target-controls__row">
                <span>Subject</span>
                <select
                    aria-label={`Subject for ${catalogLabel}`}
                    value={linkTarget.subject}
                    onChange={(e) =>
                        onChange({
                            ...linkTarget,
                            subject: e.target.value as IdentityFieldLinkTarget["subject"],
                        })
                    }
                >
                    {IDENTITY_LINK_SUBJECT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </label>
            {complete ? (
                <div className="fp-linked-target-controls__done-row">
                    <button
                        type="button"
                        className="fp-linked-target-controls__edit"
                        data-linked-target-done={fieldKey}
                        onClick={collapse}
                    >
                        Done
                    </button>
                </div>
            ) : null}
        </div>
    );
}
