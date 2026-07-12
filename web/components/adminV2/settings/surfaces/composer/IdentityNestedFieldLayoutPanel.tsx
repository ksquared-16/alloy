"use client";

import { useMemo, useState, type DragEvent } from "react";
import clsx from "clsx";
import { GripVertical, X } from "lucide-react";

import {
    applyNestedSurfaceFieldDrop,
    fieldLayoutWidthForNestedGroup,
    fieldPresentationLabel,
    groupDefsFor,
    identityConfigurationFieldKeys,
    removeFieldFromNestedGroup,
    setFieldLayoutWidthInNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { IdentityFieldTier } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import type { NestedSurfaceFieldDropZone } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import { chunkNestedSurfaceFieldsForHalfRowLayout } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import { availableFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";

type Props = {
    surfaceId: string;
    groupKey: string;
    config: NestedSurfaceConfig;
    purpose: Exclude<IdentityConfigurationPurpose, "evidence">;
    onChange: (next: NestedSurfaceConfig) => void;
    onSelectField?: (fieldKey: string) => void;
    onOpenLibrary?: () => void;
    className?: string;
};

function purposeToTier(purpose: Exclude<IdentityConfigurationPurpose, "evidence">): IdentityFieldTier {
    if (purpose === "context_facts") return "context_fact";
    return purpose;
}

/**
 * Shared identity Builder layout surface for Summary / Context Facts / Detail Fields.
 * Tier-aware drag-and-drop — same nested identity editor model for all identity surfaces.
 */
export default function IdentityNestedFieldLayoutPanel({
    surfaceId,
    groupKey,
    config,
    purpose,
    onChange,
    onSelectField,
    onOpenLibrary,
    className,
}: Props) {
    const { tenantFieldDefinitions } = useTenantFieldDefinitions("opportunities");
    const tier = purposeToTier(purpose);
    const [draggingKey, setDraggingKey] = useState<string | null>(null);
    const [dropHint, setDropHint] = useState<{ targetKey: string; zone: NestedSurfaceFieldDropZone } | null>(null);

    const keys = identityConfigurationFieldKeys(config, groupKey, purpose);

    const labels = useMemo(() => {
        const def = groupDefsFor(surfaceId).find((g) => g.key === groupKey);
        const all = def ? availableFieldsForNamespaces(def.acceptedNamespaces, tenantFieldDefinitions) : [];
        return new Map(all.map((f) => [f.key, f.label]));
    }, [surfaceId, groupKey, tenantFieldDefinitions]);

    const rowChunks = useMemo(
        () =>
            chunkNestedSurfaceFieldsForHalfRowLayout(keys, (fieldKey) =>
                fieldLayoutWidthForNestedGroup(config, groupKey, fieldKey),
            ),
        [keys, config, groupKey],
    );

    return (
        <div
            className={clsx("identity-nested-field-layout space-y-2", className)}
            data-identity-nested-field-layout={purpose}
            data-identity-layout-tier={tier}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="config-typo-sublabel">Drag to reorder or pair half-width fields on one row.</p>
                {onOpenLibrary ? (
                    <button
                        type="button"
                        className="text-[11px] font-medium text-alloy-pine hover:underline"
                        onClick={onOpenLibrary}
                        data-identity-layout-add={purpose}
                    >
                        + Add field
                    </button>
                ) : null}
            </div>

            {keys.length === 0 ? (
                <p className="config-typo-sublabel rounded-lg border border-dashed border-alloy-stone/20 bg-alloy-stone/5 p-3">
                    No fields in this layer yet.
                </p>
            ) : (
                <div className="space-y-2">
                    {rowChunks.map((chunk, rowIndex) => (
                        <div
                            key={`${chunk.join("-")}-${rowIndex}`}
                            className={clsx("grid gap-2", chunk.length === 2 ? "grid-cols-2" : "grid-cols-1")}
                            data-identity-layout-row={chunk.length === 2 ? "pair" : "single"}
                        >
                            {chunk.map((fieldKey) => {
                                const catalog =
                                    labels.get(fieldKey) ??
                                    fieldKey.replace(/^[a-z_]+\./, "").replace(/_/g, " ");
                                const label = fieldPresentationLabel(config, groupKey, fieldKey, catalog);
                                const width = fieldLayoutWidthForNestedGroup(config, groupKey, fieldKey);
                                return (
                                    <div
                                        key={fieldKey}
                                        className={clsx(
                                            "rounded-lg border border-alloy-stone/15 bg-white p-2",
                                            draggingKey === fieldKey && "opacity-60",
                                            dropHint?.targetKey === fieldKey && "ring-1 ring-alloy-pine/40",
                                        )}
                                        draggable
                                        data-identity-layout-field={fieldKey}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData("text/plain", fieldKey);
                                            e.dataTransfer.effectAllowed = "move";
                                            setDraggingKey(fieldKey);
                                        }}
                                        onDragEnd={() => {
                                            setDraggingKey(null);
                                            setDropHint(null);
                                        }}
                                        onClick={() => onSelectField?.(fieldKey)}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="mt-0.5 text-alloy-midnight/35" aria-hidden>
                                                <GripVertical className="h-3.5 w-3.5" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[12px] font-medium text-alloy-midnight">
                                                    {label}
                                                </p>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    <button
                                                        type="button"
                                                        className={clsx(
                                                            "rounded border px-1.5 py-0.5 text-[10px]",
                                                            width !== "half"
                                                                ? "border-alloy-pine/30 bg-alloy-pine/10 text-alloy-pine"
                                                                : "border-alloy-stone/20 text-alloy-midnight/55",
                                                        )}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onChange(
                                                                setFieldLayoutWidthInNestedGroup(
                                                                    config,
                                                                    groupKey,
                                                                    fieldKey,
                                                                    "full",
                                                                ),
                                                            );
                                                        }}
                                                    >
                                                        Full
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={clsx(
                                                            "rounded border px-1.5 py-0.5 text-[10px]",
                                                            width === "half"
                                                                ? "border-alloy-pine/30 bg-alloy-pine/10 text-alloy-pine"
                                                                : "border-alloy-stone/20 text-alloy-midnight/55",
                                                        )}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onChange(
                                                                setFieldLayoutWidthInNestedGroup(
                                                                    config,
                                                                    groupKey,
                                                                    fieldKey,
                                                                    "half",
                                                                ),
                                                            );
                                                        }}
                                                    >
                                                        Half
                                                    </button>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="rounded p-0.5 text-alloy-ember hover:bg-alloy-ember/5"
                                                aria-label={`Remove ${label}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onChange(
                                                        removeFieldFromNestedGroup(config, groupKey, fieldKey, {
                                                            tier,
                                                        }),
                                                    );
                                                }}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        <div
                                            className={clsx(
                                                "mt-2 rounded border border-dashed px-2 py-1 text-center text-[10px]",
                                                dropHint?.targetKey === fieldKey && dropHint.zone === "beside"
                                                    ? "border-alloy-pine/40 bg-alloy-pine/5 text-alloy-pine"
                                                    : "border-alloy-stone/15 text-alloy-midnight/35",
                                            )}
                                            data-drop-zone="beside"
                                            onDragOver={(e: DragEvent) => {
                                                e.preventDefault();
                                                setDropHint({ targetKey: fieldKey, zone: "beside" });
                                            }}
                                            onDragLeave={() => setDropHint(null)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (!draggingKey || draggingKey === fieldKey) return;
                                                onChange(
                                                    applyNestedSurfaceFieldDrop(
                                                        config,
                                                        groupKey,
                                                        draggingKey,
                                                        fieldKey,
                                                        "beside",
                                                        { tier },
                                                    ),
                                                );
                                                setDraggingKey(null);
                                                setDropHint(null);
                                            }}
                                        >
                                            Place beside
                                        </div>
                                        <div
                                            className={clsx(
                                                "mt-1 rounded border border-dashed px-2 py-1 text-center text-[10px]",
                                                dropHint?.targetKey === fieldKey && dropHint.zone === "below"
                                                    ? "border-alloy-pine/40 bg-alloy-pine/5 text-alloy-pine"
                                                    : "border-alloy-stone/15 text-alloy-midnight/35",
                                            )}
                                            data-drop-zone="below"
                                            onDragOver={(e: DragEvent) => {
                                                e.preventDefault();
                                                setDropHint({ targetKey: fieldKey, zone: "below" });
                                            }}
                                            onDragLeave={() => setDropHint(null)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (!draggingKey || draggingKey === fieldKey) return;
                                                onChange(
                                                    applyNestedSurfaceFieldDrop(
                                                        config,
                                                        groupKey,
                                                        draggingKey,
                                                        fieldKey,
                                                        "below",
                                                        { tier },
                                                    ),
                                                );
                                                setDraggingKey(null);
                                                setDropHint(null);
                                            }}
                                        >
                                            Place below
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
