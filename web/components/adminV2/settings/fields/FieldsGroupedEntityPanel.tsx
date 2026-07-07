"use client";

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import { ConfigurationDetailCard } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import FieldSurfaceAvailabilityBadges from "@/components/adminV2/settings/fields/FieldSurfaceAvailabilityBadges";
import type { FieldsSectionGroup } from "@/lib/fields/fieldsConfigurationModel";
import { operatorFieldRegistryRefKey } from "@/lib/fields/fieldsConfigurationModel";
import {
    isGenderFieldDefinition,
    resolveFieldSurfaceAvailability,
} from "@/lib/fields/fieldSurfaceAvailability";
import { operatorFieldDisplayLabel } from "@/lib/fields/fieldSettingsOperatorUi";

function fieldTypeLabel(fieldType: string): string {
    const t = fieldType.trim().toLowerCase();
    if (t === "multiselect") return "Multi-select";
    return t.charAt(0).toUpperCase() + t.slice(1);
}

export type FieldsGroupedEntityPanelProps = {
    entityLabel: string;
    entityDescription: string;
    sections: readonly FieldsSectionGroup[];
    canMutate: boolean;
    onEdit: (row: FieldDef) => void;
    onDelete?: (row: FieldDef) => void;
    deleteSavingId?: string | null;
};

export default function FieldsGroupedEntityPanel({
    entityLabel,
    entityDescription,
    sections,
    canMutate,
    onEdit,
    onDelete,
    deleteSavingId,
}: FieldsGroupedEntityPanelProps) {
    const totalFields = sections.reduce((count, section) => count + section.rows.length, 0);

    return (
        <div className="space-y-4" data-testid="fields-grouped-entity-panel">
            <ConfigurationDetailCard testId="fields-entity-header">
                <div className="space-y-1">
                    <h2 className="config-typo-workspace-title">{entityLabel} fields</h2>
                    <p className="config-typo-sublabel max-w-3xl">{entityDescription}</p>
                    <p className="text-[11px] text-alloy-midnight/45">
                        {totalFields} field{totalFields === 1 ? "" : "s"} in {sections.length} section
                        {sections.length === 1 ? "" : "s"}
                    </p>
                </div>
            </ConfigurationDetailCard>

            {sections.length === 0 ? (
                <ConfigurationDetailCard testId="fields-grouped-empty">
                    <p className="text-sm text-alloy-midnight/55">No fields match this filter.</p>
                </ConfigurationDetailCard>
            ) : (
                sections.map((section) => (
                    <ConfigurationDetailCard
                        key={section.sectionKey}
                        title={section.label}
                        testId={`fields-section-${section.sectionKey}`}
                    >
                        <ul className="space-y-2">
                            {section.rows.map(({ field, storageEntityType }) => {
                                const displayLabel = operatorFieldDisplayLabel(storageEntityType, field);
                                const refKey = operatorFieldRegistryRefKey(storageEntityType, field.field_key);
                                const badges = resolveFieldSurfaceAvailability(storageEntityType, field);
                                const queueBadge = badges.find((badge) => badge.surface === "queue_rows");
                                return (
                                    <li
                                        key={`${storageEntityType}:${field.id}`}
                                        className="rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.02] px-3 py-3"
                                        data-testid={`fields-card-${field.field_key}`}
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-alloy-midnight">{displayLabel}</p>
                                                <p className="mt-0.5 font-mono text-[10px] text-alloy-midnight/40">{refKey}</p>
                                                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                                                    {fieldTypeLabel(field.field_type)}
                                                </p>
                                                {isGenderFieldDefinition(storageEntityType, field.field_key) &&
                                                queueBadge?.status === "available" ? (
                                                    <p
                                                        className="mt-1.5 text-[10px] leading-snug text-alloy-midnight/55"
                                                        data-testid="gender-queue-row-available-note"
                                                    >
                                                        Available in the{" "}
                                                        <span className="font-medium">Children</span> collection on queue
                                                        rows when configured in Settings → Surfaces.
                                                    </p>
                                                ) : null}
                                                {isGenderFieldDefinition(storageEntityType, field.field_key) &&
                                                queueBadge?.status === "unavailable" ? (
                                                    <p
                                                        className="mt-1.5 text-[10px] leading-snug text-alloy-midnight/55"
                                                        data-testid="gender-queue-row-unavailable-note"
                                                    >
                                                        {queueBadge.reason}
                                                    </p>
                                                ) : null}
                                            </div>
                                            {canMutate ? (
                                                <div className="flex shrink-0 flex-wrap gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => onEdit(field)}
                                                        className="rounded border border-alloy-stone/50 px-2.5 py-1 text-xs font-medium hover:bg-alloy-stone/20"
                                                    >
                                                        Configure
                                                    </button>
                                                    {!field.is_system && onDelete ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => onDelete(field)}
                                                            disabled={deleteSavingId === field.id}
                                                            className="rounded border border-alloy-ember/40 px-2.5 py-1 text-xs font-medium text-alloy-ember hover:bg-alloy-ember/10 disabled:opacity-50"
                                                        >
                                                            {deleteSavingId === field.id ? "…" : "Delete"}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                        <div className="mt-2.5">
                                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                                Surface availability
                                            </p>
                                            <FieldSurfaceAvailabilityBadges
                                                badges={badges}
                                                compact
                                                testId={`field-surface-badges-${field.field_key}`}
                                            />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </ConfigurationDetailCard>
                ))
            )}
        </div>
    );
}
