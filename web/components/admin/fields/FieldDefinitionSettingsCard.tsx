"use client";

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import FieldSurfaceAvailabilityBadges from "@/components/admin/fields/FieldSurfaceAvailabilityBadges";
import {
    operatorLayoutRefKeyLabel,
    resolveFieldSurfaceAvailability,
} from "@/lib/fields/fieldSurfaceAvailability";
import { operatorFieldDisplayLabel } from "@/lib/fields/fieldSettingsOperatorUi";

export type FieldDefinitionSettingsCardProps = {
    entityType: string;
    row: FieldDef;
    sectionLabel?: string;
    onEdit?: () => void;
    onDelete?: () => void;
    deleteDisabled?: boolean;
    deleteSaving?: boolean;
    canMutate?: boolean;
};

function layoutRefKey(entityType: string, fieldKey: string): string {
    const et = entityType.trim().toLowerCase();
    if (et === "customer_member") return `child.${fieldKey}`;
    return `${et}.${fieldKey}`;
}

export default function FieldDefinitionSettingsCard({
    entityType,
    row,
    sectionLabel,
    onEdit,
    onDelete,
    deleteDisabled,
    deleteSaving,
    canMutate = false,
}: FieldDefinitionSettingsCardProps) {
    const displayLabel = operatorFieldDisplayLabel(entityType, {
        field_key: row.field_key,
        is_system: row.is_system,
        label: row.label,
        config: row.config,
    });
    const refKey = layoutRefKey(entityType, row.field_key);
    const refLabel = operatorLayoutRefKeyLabel(refKey);
    const availability = resolveFieldSurfaceAvailability({
        entity_type: entityType,
        field_key: row.field_key,
        field_type: row.field_type,
        label: row.label,
        is_system: row.is_system,
        is_active: row.is_active,
        is_visible_in_form: row.is_visible_in_form,
        is_visible_in_drawer: row.is_visible_in_drawer,
        is_visible_in_table: row.is_visible_in_table,
        config: row.config,
    });

    return (
        <article
            className="rounded-xl border border-alloy-stone/35 bg-white p-4 shadow-sm"
            data-testid="field-definition-card"
            data-field-key={row.field_key}
            data-entity-type={entityType}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-alloy-midnight">{displayLabel}</h3>
                        {row.is_system ? (
                            <span className="rounded-full border border-alloy-stone/30 bg-alloy-stone/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/55">
                                System
                            </span>
                        ) : (
                            <span className="rounded-full border border-alloy-pine/25 bg-alloy-pine/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-alloy-pine">
                                Custom
                            </span>
                        )}
                    </div>
                    <p className="font-mono text-[11px] text-alloy-midnight/50" data-testid="field-card-ref-key">
                        {refKey}
                        {refLabel !== refKey ? ` · ${refLabel}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-alloy-midnight/60">
                        <span>
                            <span className="font-medium text-alloy-midnight/75">Type:</span> {row.field_type}
                        </span>
                        {sectionLabel ? (
                            <span>
                                <span className="font-medium text-alloy-midnight/75">Section:</span> {sectionLabel}
                            </span>
                        ) : row.section_key ? (
                            <span>
                                <span className="font-medium text-alloy-midnight/75">Section:</span> {row.section_key}
                            </span>
                        ) : null}
                    </div>
                    {row.description || row.help_text ? (
                        <p className="text-xs leading-relaxed text-alloy-midnight/55">{row.description ?? row.help_text}</p>
                    ) : null}
                </div>
                {canMutate ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                        {onEdit ? (
                            <button
                                type="button"
                                onClick={onEdit}
                                className="rounded-md border border-alloy-stone/40 bg-white px-2.5 py-1 text-xs font-medium text-alloy-midnight hover:bg-alloy-stone/10"
                                data-testid="field-card-edit"
                            >
                                Configure
                            </button>
                        ) : null}
                        {onDelete && !row.is_system ? (
                            <button
                                type="button"
                                onClick={onDelete}
                                disabled={deleteDisabled || deleteSaving}
                                className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                data-testid="field-card-delete"
                            >
                                {deleteSaving ? "Deleting…" : "Delete"}
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <div className="mt-3 border-t border-alloy-stone/25 pt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Surface availability
                </p>
                <FieldSurfaceAvailabilityBadges rows={availability} />
            </div>
        </article>
    );
}
