"use client";

import type { ReactNode } from "react";
import {
    previewFieldSections,
    usageSurfaceCountHint,
    DATA_MODEL_BUILDER_AVAILABILITY,
    DATA_MODEL_USAGE_SURFACES,
} from "@/lib/fields/dataModelWorkspaceModel";
import { relationshipsForHubEntity } from "@/lib/fields/entityRelationshipCatalog";
import { countFieldsByOwnership, type SettingsFieldCatalogEntry, type SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import {
    DATA_MODEL_BUILDER_ICONS,
    DATA_MODEL_ICON_STROKE,
    DATA_MODEL_SECTION_ICONS,
    DATA_MODEL_USAGE_ICONS,
    type DataModelBuilderId,
    type DataModelUsageSurfaceId,
} from "@/lib/fields/dataModelWorkspaceIcons";

type Props = {
    hubEntity: SettingsHubEntityKey;
    entries: readonly SettingsFieldCatalogEntry[];
    onViewAllFields: () => void;
    onViewAllRelationships: () => void;
    onViewAllCategories?: () => void;
    onViewComputedFields?: () => void;
    onAddField?: () => void;
    onAddRelationship?: () => void;
    onAddCategory?: () => void;
    onSelectField?: (entry: SettingsFieldCatalogEntry) => void;
};

function OverviewCard({
    title,
    icon: Icon,
    action,
    children,
    className = "",
    testId,
}: {
    title: string;
    icon: typeof DATA_MODEL_SECTION_ICONS.fields;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    testId?: string;
}) {
    return (
        <section
            className={["rounded-lg border border-alloy-forge/10 bg-white px-2 py-1.5", className].join(" ")}
            data-testid={testId}
        >
            <div className="mb-0.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <Icon size={11} strokeWidth={DATA_MODEL_ICON_STROKE} className="text-alloy-bend-pine" aria-hidden />
                    <h2 className="text-[10px] font-semibold text-alloy-midnight">{title}</h2>
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

function TextAction({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-[9px] font-medium text-alloy-bend-pine hover:underline"
            data-testid={testId}
        >
            {label}
        </button>
    );
}

export default function DataModelOverviewTab({
    hubEntity,
    entries,
    onViewAllFields,
    onViewAllRelationships,
    onViewAllCategories,
    onViewComputedFields,
    onAddField,
    onAddRelationship,
    onSelectField,
}: Props) {
    const relationships = relationshipsForHubEntity(hubEntity).slice(0, 3);
    const fieldPreview = previewFieldSections(entries, 6, 2).flatMap((s) => s.shown).slice(0, 6);
    const counts = countFieldsByOwnership(entries);

    return (
        <div className="grid gap-1.5 xl:grid-cols-2" data-testid="data-model-overview-tab">
            <OverviewCard
                title="Relationships"
                icon={DATA_MODEL_SECTION_ICONS.relationships}
                testId="overview-relationships-card"
                action={
                    onAddRelationship ? (
                        <TextAction label="+ Add" onClick={onAddRelationship} testId="overview-add-relationship" />
                    ) : null
                }
            >
                <ul className="space-y-0">
                    {relationships.map((rel) => (
                        <li
                            key={rel.id}
                            className="truncate px-0.5 py-0.5 text-[11px] text-alloy-midnight"
                            data-testid="overview-relationship-row"
                        >
                            {rel.label}
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    onClick={onViewAllRelationships}
                    className="mt-1 text-[9px] font-medium text-alloy-bend-pine hover:underline"
                >
                    View all
                </button>
            </OverviewCard>

            <OverviewCard
                title="Fields"
                icon={DATA_MODEL_SECTION_ICONS.fields}
                testId="overview-fields-card"
                action={onAddField ? <TextAction label="+ Add" onClick={onAddField} testId="overview-add-field" /> : null}
            >
                <p className="mb-0.5 text-[9px] text-alloy-midnight/40">
                    {counts.platform} platform · {counts.custom} custom
                    {counts.computed > 0 ? ` · ${counts.computed} computed` : ""}
                </p>
                <ul className="space-y-0">
                    {fieldPreview.map((entry) => (
                        <li key={entry.id}>
                            <button
                                type="button"
                                onClick={() => onSelectField?.(entry)}
                                className="block w-full truncate px-0.5 py-0.5 text-left text-[11px] text-alloy-midnight hover:text-alloy-bend-pine"
                            >
                                {entry.label}
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="mt-1 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onViewAllFields}
                        className="text-[9px] font-medium text-alloy-bend-pine hover:underline"
                    >
                        View all fields
                    </button>
                    {onViewAllCategories ? (
                        <button
                            type="button"
                            onClick={onViewAllCategories}
                            className="text-[9px] font-medium text-alloy-midnight/45 hover:text-alloy-bend-pine"
                        >
                            Categories
                        </button>
                    ) : null}
                    {counts.computed > 0 && onViewComputedFields ? (
                        <button
                            type="button"
                            onClick={onViewComputedFields}
                            className="text-[9px] font-medium text-alloy-midnight/45 hover:text-alloy-bend-pine"
                            data-testid="overview-view-computed"
                        >
                            {counts.computed} computed
                        </button>
                    ) : null}
                </div>
            </OverviewCard>

            <OverviewCard
                title="Used Throughout Alloy"
                icon={DATA_MODEL_SECTION_ICONS.usage}
                testId="overview-usage-card"
            >
                <ul className="flex flex-wrap gap-1">
                    {DATA_MODEL_USAGE_SURFACES.slice(0, 4).map((surface) => {
                        const hint = usageSurfaceCountHint(surface.id, hubEntity);
                        return (
                            <li
                                key={surface.id}
                                className="rounded border border-alloy-forge/10 bg-alloy-stone/[0.15] px-1.5 py-0.5 text-[10px] text-alloy-midnight/70"
                                data-testid={`overview-usage-${surface.id}`}
                            >
                                {surface.label}
                                {hint ? <span className="text-alloy-midnight/35"> · {hint}</span> : null}
                            </li>
                        );
                    })}
                </ul>
            </OverviewCard>

            <OverviewCard
                title="Available In"
                icon={DATA_MODEL_SECTION_ICONS.available}
                testId="overview-available-in-card"
            >
                <ul className="flex flex-wrap gap-1">
                    {DATA_MODEL_BUILDER_AVAILABILITY.map((builder) => (
                        <li
                            key={builder.id}
                            className="rounded border border-alloy-forge/10 px-1.5 py-0.5 text-[10px] text-alloy-midnight/65"
                            data-testid={`overview-builder-${builder.id}`}
                        >
                            {builder.label}
                            <span className={builder.available ? " text-alloy-bend-pine" : " text-alloy-midnight/35"}>
                                {" "}
                                · {builder.available ? "Yes" : "Future"}
                            </span>
                        </li>
                    ))}
                </ul>
            </OverviewCard>
        </div>
    );
}
