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
import { ArrowRight } from "lucide-react";

type Props = {
    hubEntity: SettingsHubEntityKey;
    entries: readonly SettingsFieldCatalogEntry[];
    onViewAllFields: () => void;
    onViewAllRelationships: () => void;
    onViewComputedFields?: () => void;
    onAddField?: () => void;
    onAddRelationship?: () => void;
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
    icon: typeof ArrowRight;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    testId?: string;
}) {
    return (
        <section
            className={["rounded-lg border border-alloy-forge/10 bg-white px-2.5 py-2", className].join(" ")}
            data-testid={testId}
        >
            <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <Icon size={12} strokeWidth={DATA_MODEL_ICON_STROKE} className="text-alloy-bend-pine" aria-hidden />
                    <h2 className="text-[11px] font-semibold text-alloy-midnight">{title}</h2>
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
            className="text-[10px] font-medium text-alloy-bend-pine hover:underline"
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
    onViewComputedFields,
    onAddField,
    onAddRelationship,
    onSelectField,
}: Props) {
    const relationships = relationshipsForHubEntity(hubEntity).slice(0, 4);
    const fieldSections = previewFieldSections(entries, 2, 3);
    const counts = countFieldsByOwnership(entries);

    return (
        <div className="grid gap-2 xl:grid-cols-2" data-testid="data-model-overview-tab">
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
                <ul className="space-y-0.5">
                    {relationships.map((rel) => (
                        <li
                            key={rel.id}
                            className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-alloy-stone/[0.28]"
                            data-testid="overview-relationship-row"
                        >
                            <span className="min-w-0 truncate text-[12px] font-medium text-alloy-midnight">
                                {rel.label}
                            </span>
                            <span className="shrink-0 text-[9px] text-alloy-midnight/35">
                                {rel.required ? "Required" : "Optional"}
                            </span>
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    onClick={onViewAllRelationships}
                    className="mt-1.5 text-[10px] font-medium text-alloy-bend-pine hover:underline"
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
                <p className="mb-1 text-[10px] text-alloy-midnight/40">
                    {counts.platform} platform · {counts.custom} custom
                    {counts.computed > 0 ? ` · ${counts.computed} computed` : ""}
                </p>
                <div className="space-y-2">
                    {fieldSections.map((section) => (
                        <div key={section.sectionKey} data-testid={`overview-field-section-${section.sectionKey}`}>
                            <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                                {section.label}
                            </p>
                            <ul className="space-y-0">
                                {section.shown.map((entry) => (
                                    <li key={entry.id}>
                                        <button
                                            type="button"
                                            onClick={() => onSelectField?.(entry)}
                                            className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-alloy-midnight hover:bg-alloy-bend-pine/[0.06]"
                                        >
                                            <span className="truncate">{entry.label}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {section.remaining > 0 ? (
                                <button
                                    type="button"
                                    onClick={onViewAllFields}
                                    className="mt-0.5 px-1 text-[9px] font-medium text-alloy-midnight/40 hover:text-alloy-bend-pine"
                                >
                                    +{section.remaining} more
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={onViewAllFields}
                        className="text-[10px] font-medium text-alloy-bend-pine hover:underline"
                    >
                        View all fields
                    </button>
                    {counts.computed > 0 && onViewComputedFields ? (
                        <button
                            type="button"
                            onClick={onViewComputedFields}
                            className="text-[10px] font-medium text-alloy-midnight/45 hover:text-alloy-bend-pine"
                            data-testid="overview-view-computed"
                        >
                            View computed ({counts.computed})
                        </button>
                    ) : null}
                </div>
            </OverviewCard>

            <OverviewCard
                title="Used Throughout Alloy"
                icon={DATA_MODEL_SECTION_ICONS.usage}
                testId="overview-usage-card"
            >
                <ul className="grid gap-1 sm:grid-cols-2">
                    {DATA_MODEL_USAGE_SURFACES.map((surface) => {
                        const Icon = DATA_MODEL_USAGE_ICONS[surface.id as DataModelUsageSurfaceId];
                        const hint = usageSurfaceCountHint(surface.id, hubEntity);
                        return (
                            <li
                                key={surface.id}
                                className="flex items-center gap-1.5 rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.18] px-2 py-1.5"
                                data-testid={`overview-usage-${surface.id}`}
                            >
                                <Icon size={12} strokeWidth={DATA_MODEL_ICON_STROKE} className="shrink-0 text-alloy-bend-pine" aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-alloy-midnight">
                                    {surface.label}
                                </span>
                                {hint ? <span className="shrink-0 text-[9px] text-alloy-midnight/35">{hint}</span> : null}
                            </li>
                        );
                    })}
                </ul>
            </OverviewCard>

            <OverviewCard
                title="Available In"
                icon={DATA_MODEL_SECTION_ICONS.available}
                className="xl:col-span-2"
                testId="overview-available-in-card"
            >
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {DATA_MODEL_BUILDER_AVAILABILITY.map((builder) => {
                        const Icon = DATA_MODEL_BUILDER_ICONS[builder.id as DataModelBuilderId];
                        return (
                            <div
                                key={builder.id}
                                className="flex items-center gap-1.5 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.15] px-2 py-1.5"
                                data-testid={`overview-builder-${builder.id}`}
                                title={"reason" in builder ? builder.reason : undefined}
                            >
                                <Icon size={12} strokeWidth={DATA_MODEL_ICON_STROKE} className="shrink-0 text-alloy-bend-pine" aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-[11px] text-alloy-midnight">{builder.label}</span>
                                <span
                                    className={[
                                        "shrink-0 rounded-full px-1 py-px text-[8px] font-semibold uppercase",
                                        builder.available
                                            ? "bg-alloy-bend-pine/[0.1] text-alloy-bend-pine"
                                            : "bg-alloy-forge/[0.06] text-alloy-midnight/40",
                                    ].join(" ")}
                                >
                                    {builder.available ? "Yes" : "Future"}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </OverviewCard>
        </div>
    );
}
