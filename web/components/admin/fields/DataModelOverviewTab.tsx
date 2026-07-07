"use client";

import type { SettingsFieldCatalogEntry, SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import { sectionDisplayLabel, orderedSectionKeys } from "@/lib/fields/fieldCatalogForSettings";
import {
    computedSignalPreview,
    previewFieldsBySection,
} from "@/lib/fields/dataModelWorkspaceModel";
import { relationshipsForHubEntity } from "@/lib/fields/entityRelationshipCatalog";
import {
    DATA_MODEL_BUILDER_AVAILABILITY,
    DATA_MODEL_USAGE_SURFACES,
} from "@/lib/fields/dataModelWorkspaceModel";

type Props = {
    hubEntity: SettingsHubEntityKey;
    entries: readonly SettingsFieldCatalogEntry[];
    onViewAllFields: () => void;
    onViewAllRelationships: () => void;
    onViewAllComputed: () => void;
    onAddField?: () => void;
    onAddRelationship?: () => void;
    onSelectField?: (entry: SettingsFieldCatalogEntry) => void;
};

function ownershipBadge(ownership: SettingsFieldCatalogEntry["ownership"]) {
    const short = ownership === "platform" ? "P" : ownership === "custom" ? "C" : "∑";
    return (
        <span className="rounded border border-alloy-forge/15 px-1 text-[9px] font-semibold uppercase text-alloy-midnight/50">
            {short}
        </span>
    );
}

export default function DataModelOverviewTab({
    hubEntity,
    entries,
    onViewAllFields,
    onViewAllRelationships,
    onViewAllComputed,
    onAddField,
    onAddRelationship,
    onSelectField,
}: Props) {
    const relationships = relationshipsForHubEntity(hubEntity).slice(0, 5);
    const fieldPreview = previewFieldsBySection(entries, 4);
    const previewSections = orderedSectionKeys(fieldPreview);
    const computedPreview = computedSignalPreview(entries, 4);

    return (
        <div className="grid gap-4 xl:grid-cols-2" data-testid="data-model-overview-tab">
            <section className="rounded-xl border border-alloy-forge/12 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-alloy-midnight">Relationships</h2>
                    {onAddRelationship ? (
                        <button
                            type="button"
                            onClick={onAddRelationship}
                            className="text-xs font-medium text-alloy-pine hover:underline"
                            data-testid="overview-add-relationship"
                        >
                            + Add Relationship
                        </button>
                    ) : null}
                </div>
                <ul className="space-y-2">
                    {relationships.map((rel) => (
                        <li key={rel.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-alloy-midnight">{rel.label}</span>
                            <span className="text-alloy-midnight/50">→ {rel.target_label}</span>
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    onClick={onViewAllRelationships}
                    className="mt-3 text-xs font-medium text-alloy-pine hover:underline"
                >
                    View all relationships
                </button>
            </section>

            <section className="rounded-xl border border-alloy-forge/12 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-alloy-midnight">Fields</h2>
                    {onAddField ? (
                        <button
                            type="button"
                            onClick={onAddField}
                            className="text-xs font-medium text-alloy-pine hover:underline"
                            data-testid="overview-add-field"
                        >
                            + Add Field
                        </button>
                    ) : null}
                </div>
                <div className="space-y-3">
                    {previewSections.slice(0, 3).map((sectionKey) => {
                        const sectionEntries = fieldPreview.get(sectionKey) ?? [];
                        return (
                            <div key={sectionKey}>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                    {sectionDisplayLabel(sectionKey)}
                                </p>
                                <ul className="space-y-1">
                                    {sectionEntries.map((entry) => (
                                        <li key={entry.id}>
                                            <button
                                                type="button"
                                                onClick={() => onSelectField?.(entry)}
                                                className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-alloy-stone/10"
                                            >
                                                <span className="text-alloy-midnight">{entry.label}</span>
                                                {ownershipBadge(entry.ownership)}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
                <button
                    type="button"
                    onClick={onViewAllFields}
                    className="mt-3 text-xs font-medium text-alloy-pine hover:underline"
                >
                    View all fields
                </button>
            </section>

            <section className="rounded-xl border border-alloy-forge/12 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-alloy-midnight">Used Throughout Alloy</h2>
                <ul className="space-y-2 text-xs text-alloy-midnight/70">
                    {DATA_MODEL_USAGE_SURFACES.map((surface) => (
                        <li key={surface.id} className="flex justify-between gap-2">
                            <span>{surface.label}</span>
                            <span className="text-alloy-midnight/40">—</span>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="rounded-xl border border-alloy-forge/12 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-alloy-midnight">Computed Signals</h2>
                <ul className="space-y-2">
                    {computedPreview.map((entry) => (
                        <li key={entry.id}>
                            <button
                                type="button"
                                onClick={() => onSelectField?.(entry)}
                                className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-alloy-stone/10"
                            >
                                <span className="font-medium text-alloy-midnight">{entry.label}</span>
                                <span className="text-alloy-midnight/45">Runtime</span>
                            </button>
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    onClick={onViewAllComputed}
                    className="mt-3 text-xs font-medium text-alloy-pine hover:underline"
                >
                    View all
                </button>
            </section>

            <section className="rounded-xl border border-alloy-forge/12 bg-white p-4 shadow-sm xl:col-span-2">
                <h2 className="mb-3 text-sm font-semibold text-alloy-midnight">Available In</h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {DATA_MODEL_BUILDER_AVAILABILITY.map((builder) => (
                        <div
                            key={builder.id}
                            className="flex items-center justify-between rounded-lg border border-alloy-forge/10 px-3 py-2 text-xs"
                        >
                            <span className="text-alloy-midnight/75">{builder.label}</span>
                            <span className={builder.available ? "text-alloy-pine" : "text-alloy-midnight/40"}>
                                {builder.available ? "✓ Available" : "Future"}
                            </span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
