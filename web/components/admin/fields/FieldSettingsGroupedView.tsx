"use client";

import type { ReactNode } from "react";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import FieldDefinitionSettingsCard from "@/components/admin/fields/FieldDefinitionSettingsCard";
import PlatformFieldSettingsCard from "@/components/admin/fields/PlatformFieldSettingsCard";
import type { FieldSectionRegistryRow } from "@/lib/admin/fieldSectionSelectOptions";
import type { PlatformFieldDefinition } from "@/lib/fields/platformFieldCatalog";

export type FieldSettingsGroupedViewProps = {
    entityType: string;
    items: readonly FieldDef[];
    platformFields?: readonly PlatformFieldDefinition[];
    sectionRegistry: readonly FieldSectionRegistryRow[];
    canMutate?: boolean;
    onEdit: (row: FieldDef) => void;
    onDelete?: (row: FieldDef) => void;
    deleteSavingId?: string | null;
    emptyMessage?: string;
    headerSlot?: ReactNode;
};

function sectionLabelForKey(
    sectionKey: string | null | undefined,
    registry: readonly FieldSectionRegistryRow[],
): string | undefined {
    const key = sectionKey?.trim();
    if (!key) return undefined;
    const row = registry.find((r) => r.section_key === key);
    return row?.label?.trim() || key.replace(/_/g, " ");
}

function groupPlatformFields(items: readonly PlatformFieldDefinition[]): Map<string, PlatformFieldDefinition[]> {
    const groups = new Map<string, PlatformFieldDefinition[]>();
    for (const item of items) {
        const key = item.section_key?.trim() || "general";
        const list = groups.get(key) ?? [];
        list.push(item);
        groups.set(key, list);
    }
    return groups;
}

function groupItems(items: readonly FieldDef[]): Map<string, FieldDef[]> {
    const groups = new Map<string, FieldDef[]>();
    for (const item of items) {
        const key = item.section_key?.trim() || "general";
        const list = groups.get(key) ?? [];
        list.push(item);
        groups.set(key, list);
    }
    return groups;
}

export default function FieldSettingsGroupedView({
    entityType,
    items,
    platformFields = [],
    sectionRegistry,
    canMutate,
    onEdit,
    onDelete,
    deleteSavingId,
    emptyMessage = "No fields match this filter.",
    headerSlot,
}: FieldSettingsGroupedViewProps) {
    const grouped = groupItems(items);
    const groupedPlatform = groupPlatformFields(platformFields);
    const orderedKeys = [...new Set([...grouped.keys(), ...groupedPlatform.keys()])].sort((a, b) => {
        const orderA = sectionRegistry.find((r) => r.section_key === a)?.sort_order ?? 999;
        const orderB = sectionRegistry.find((r) => r.section_key === b)?.sort_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
    });

    if (items.length === 0 && platformFields.length === 0) {
        return <p className="text-sm text-alloy-midnight/55">{emptyMessage}</p>;
    }

    return (
        <div className="space-y-6" data-testid="field-settings-grouped-view">
            {headerSlot}
            {orderedKeys.map((sectionKey) => {
                const sectionItems = grouped.get(sectionKey) ?? [];
                const platformSectionItems = groupedPlatform.get(sectionKey) ?? [];
                const label = sectionLabelForKey(sectionKey, sectionRegistry) ?? "General";
                if (sectionItems.length === 0 && platformSectionItems.length === 0) return null;
                return (
                    <section key={sectionKey} data-testid={`field-section-group-${sectionKey}`}>
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                            {label}
                        </h2>
                        <div className="grid gap-3">
                            {platformSectionItems.map((row) => (
                                <PlatformFieldSettingsCard key={`platform:${row.refKey}`} row={row} sectionLabel={label} />
                            ))}
                            {sectionItems.map((row) => (
                                <FieldDefinitionSettingsCard
                                    key={row.id}
                                    entityType={entityType}
                                    row={row}
                                    sectionLabel={label}
                                    canMutate={canMutate}
                                    onEdit={() => onEdit(row)}
                                    onDelete={onDelete ? () => onDelete(row) : undefined}
                                    deleteSaving={deleteSavingId === row.id}
                                    deleteDisabled={Boolean(deleteSavingId && deleteSavingId !== row.id)}
                                />
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
