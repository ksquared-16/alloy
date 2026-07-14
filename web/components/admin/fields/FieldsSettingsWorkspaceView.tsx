"use client";

import FieldCatalogCard from "@/components/admin/fields/FieldCatalogCard";
import FieldOwnershipFilterTabs, { type FieldOwnershipFilter } from "@/components/admin/fields/FieldOwnershipFilterTabs";
import FieldSettingsEntityHeader from "@/components/admin/fields/FieldSettingsEntityHeader";
import {
    CHILD_HUB_OWNERSHIP_GRAIN_LABELS,
    CHILD_HUB_OWNERSHIP_GRAIN_ORDER,
    groupCatalogEntriesByChildOwnershipGrain,
    groupCatalogEntriesBySection,
    orderedSectionKeys,
    sectionDisplayLabel,
    type SettingsFieldCatalogEntry,
    type SettingsHubEntityKey,
} from "@/lib/fields/fieldCatalogForSettings";
import { countFieldsByConcept, filterCatalogByConcept } from "@/lib/fields/fieldConceptModel";
import {
    SETTINGS_ENTITY_FIELD_EXPLANATIONS,
    SETTINGS_ENTITY_SURFACES,
} from "@/lib/fields/computedFieldCatalog";

type Props = {
    hubEntity: SettingsHubEntityKey;
    entityLabel: string;
    entries: readonly SettingsFieldCatalogEntry[];
    ownershipFilter: FieldOwnershipFilter;
    onOwnershipFilterChange: (next: FieldOwnershipFilter) => void;
    selectedRefKey?: string | null;
    onSelectEntry: (entry: SettingsFieldCatalogEntry) => void;
    onConfigure?: (entry: SettingsFieldCatalogEntry) => void;
    onDelete?: (entry: SettingsFieldCatalogEntry) => void;
    deleteSavingId?: string | null;
    canMutate?: boolean;
    headerActions?: React.ReactNode;
};

export default function FieldsSettingsWorkspaceView({
    hubEntity,
    entityLabel,
    entries,
    ownershipFilter,
    onOwnershipFilterChange,
    selectedRefKey,
    onSelectEntry,
    onConfigure,
    onDelete,
    deleteSavingId,
    canMutate,
    headerActions,
}: Props) {
    const allCounts = countFieldsByConcept(entries);
    const filtered = filterCatalogByConcept(entries, ownershipFilter);
    const filteredCounts = countFieldsByConcept(filtered);
    const useChildOwnershipGrains = hubEntity === "inquiry_child";
    const sectionGroups = groupCatalogEntriesBySection(filtered);
    const grainGroups = useChildOwnershipGrains ? groupCatalogEntriesByChildOwnershipGrain(filtered) : null;
    const sectionKeys = orderedSectionKeys(sectionGroups);

    const tabCounts = {
        all: allCounts.all,
        platform: allCounts.platform,
        custom: allCounts.custom,
        runtime_signals: allCounts.runtime_signals,
        calculated_fields: allCounts.calculated_fields,
    };

    return (
        <div className="min-w-0 flex-1 space-y-4" data-testid="fields-settings-workspace-view">
            <FieldSettingsEntityHeader
                entityType={hubEntity}
                entityLabel={entityLabel}
                fieldCount={filteredCounts.all}
                platformCount={allCounts.platform}
                customCount={allCounts.custom}
                computedCount={allCounts.computed}
                explanation={SETTINGS_ENTITY_FIELD_EXPLANATIONS[hubEntity]}
                surfacesNote={SETTINGS_ENTITY_SURFACES[hubEntity]}
                actions={headerActions}
            />

            <FieldOwnershipFilterTabs
                value={ownershipFilter}
                onChange={onOwnershipFilterChange}
                counts={tabCounts}
            />

            {filtered.length === 0 ? (
                <p className="text-sm text-alloy-midnight/55">No fields match this filter.</p>
            ) : useChildOwnershipGrains && grainGroups ? (
                <div className="space-y-6">
                    {CHILD_HUB_OWNERSHIP_GRAIN_ORDER.map((grain) => {
                        const sectionEntries = grainGroups.get(grain) ?? [];
                        if (sectionEntries.length === 0) return null;
                        const label = CHILD_HUB_OWNERSHIP_GRAIN_LABELS[grain];
                        return (
                            <section key={grain} data-testid={`field-ownership-grain-${grain}`}>
                                <h2 className="mb-3 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                    <span>{label}</span>
                                    <span className="font-normal normal-case tracking-normal text-alloy-midnight/40">
                                        {sectionEntries.length} field{sectionEntries.length === 1 ? "" : "s"}
                                    </span>
                                </h2>
                                <div className="grid gap-3">
                                    {sectionEntries.map((entry) => (
                                        <FieldCatalogCard
                                            key={entry.id}
                                            entry={entry}
                                            hubEntity={hubEntity}
                                            sectionLabel={label}
                                            showOwnerGrainBadge
                                            selected={selectedRefKey === entry.refKey}
                                            onSelect={() => onSelectEntry(entry)}
                                            onConfigure={
                                                onConfigure && entry.ownership === "custom"
                                                    ? () => onConfigure(entry)
                                                    : undefined
                                            }
                                            onDelete={
                                                onDelete && entry.ownership === "custom" && entry.fieldDef
                                                    ? () => onDelete(entry)
                                                    : undefined
                                            }
                                            deleteSaving={deleteSavingId === entry.fieldDef?.id}
                                            deleteDisabled={Boolean(
                                                deleteSavingId && deleteSavingId !== entry.fieldDef?.id,
                                            )}
                                            canMutate={canMutate}
                                        />
                                    ))}
                                </div>
                            </section>
                        );
                    })}
                </div>
            ) : (
                <div className="space-y-6">
                    {sectionKeys.map((sectionKey) => {
                        const sectionEntries = sectionGroups.get(sectionKey) ?? [];
                        if (sectionEntries.length === 0) return null;
                        const label = sectionDisplayLabel(sectionKey);
                        return (
                            <section key={sectionKey} data-testid={`field-section-group-${sectionKey}`}>
                                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                    {label}
                                </h2>
                                <div className="grid gap-3">
                                    {sectionEntries.map((entry) => (
                                        <FieldCatalogCard
                                            key={entry.id}
                                            entry={entry}
                                            hubEntity={hubEntity}
                                            sectionLabel={label}
                                            selected={selectedRefKey === entry.refKey}
                                            onSelect={() => onSelectEntry(entry)}
                                            onConfigure={
                                                onConfigure && entry.ownership === "custom"
                                                    ? () => onConfigure(entry)
                                                    : undefined
                                            }
                                            onDelete={
                                                onDelete && entry.ownership === "custom" && entry.fieldDef
                                                    ? () => onDelete(entry)
                                                    : undefined
                                            }
                                            deleteSaving={deleteSavingId === entry.fieldDef?.id}
                                            deleteDisabled={Boolean(
                                                deleteSavingId && deleteSavingId !== entry.fieldDef?.id,
                                            )}
                                            canMutate={canMutate}
                                        />
                                    ))}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
