"use client";

import type { ReactNode } from "react";
import type { SettingsFieldCatalogEntry, SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import {
    computedSignalPreviewGroups,
    previewFieldSections,
    usageSurfaceCountHint,
    DATA_MODEL_BUILDER_AVAILABILITY,
    DATA_MODEL_USAGE_SURFACES,
} from "@/lib/fields/dataModelWorkspaceModel";
import { relationshipsForHubEntity } from "@/lib/fields/entityRelationshipCatalog";
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
    onViewAllComputed: () => void;
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
            className={[
                "process-config-setup-card rounded-xl border border-alloy-forge/12 bg-white p-3.5 shadow-[0_1px_3px_rgba(24,39,58,0.04)] transition-shadow hover:shadow-[0_4px_14px_rgba(24,39,58,0.06)]",
                className,
            ].join(" ")}
            data-testid={testId}
        >
            <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <Icon size={14} strokeWidth={DATA_MODEL_ICON_STROKE} className="text-alloy-bend-pine" aria-hidden />
                    <h2 className="text-[13px] font-semibold text-alloy-midnight">{title}</h2>
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
            className="text-[11px] font-medium text-alloy-bend-pine hover:underline"
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
    onViewAllComputed,
    onAddField,
    onAddRelationship,
    onSelectField,
}: Props) {
    const relationships = relationshipsForHubEntity(hubEntity).slice(0, 5);
    const fieldSections = previewFieldSections(entries, 3, 4);
    const computedGroups = computedSignalPreviewGroups(entries, 3);

    return (
        <div className="grid gap-3 xl:grid-cols-2" data-testid="data-model-overview-tab">
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
                <ul className="space-y-1.5">
                    {relationships.map((rel) => (
                        <li
                            key={rel.id}
                            className="flex items-center justify-between gap-3 rounded-lg px-1.5 py-1.5 hover:bg-alloy-stone/[0.28]"
                            data-testid="overview-relationship-row"
                        >
                            <span className="min-w-0">
                                <span className="block text-[13px] font-semibold text-alloy-midnight">{rel.label}</span>
                                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-alloy-midnight/45">
                                    <ArrowRight size={10} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                                    {rel.target_label}
                                    <span className="text-alloy-midnight/25">·</span>
                                    {rel.cardinality}
                                </span>
                            </span>
                            {rel.required ? (
                                <span className="shrink-0 rounded-full bg-alloy-bend-pine/[0.08] px-1.5 py-0.5 text-[9px] font-medium text-alloy-bend-pine">
                                    Required
                                </span>
                            ) : (
                                <span className="shrink-0 text-[9px] font-medium text-alloy-midnight/35">Optional</span>
                            )}
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    onClick={onViewAllRelationships}
                    className="mt-2.5 text-[11px] font-medium text-alloy-bend-pine hover:underline"
                >
                    View all relationships
                </button>
            </OverviewCard>

            <OverviewCard
                title="Fields"
                icon={DATA_MODEL_SECTION_ICONS.fields}
                testId="overview-fields-card"
                action={onAddField ? <TextAction label="+ Add" onClick={onAddField} testId="overview-add-field" /> : null}
            >
                <div className="space-y-3">
                    {fieldSections.map((section) => (
                        <div key={section.sectionKey} data-testid={`overview-field-section-${section.sectionKey}`}>
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                                {section.label}
                            </p>
                            <ul className="space-y-0.5">
                                {section.shown.map((entry) => (
                                    <li key={entry.id}>
                                        <button
                                            type="button"
                                            onClick={() => onSelectField?.(entry)}
                                            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] text-alloy-midnight hover:bg-alloy-bend-pine/[0.06]"
                                        >
                                            <span className="text-alloy-bend-pine/70">•</span>
                                            <span className="truncate">{entry.label}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {section.remaining > 0 ? (
                                <button
                                    type="button"
                                    onClick={onViewAllFields}
                                    className="mt-0.5 px-1.5 text-[10px] font-medium text-alloy-midnight/40 hover:text-alloy-bend-pine"
                                >
                                    +{section.remaining} more
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={onViewAllFields}
                    className="mt-2.5 text-[11px] font-medium text-alloy-bend-pine hover:underline"
                >
                    View all fields
                </button>
            </OverviewCard>

            <OverviewCard
                title="Used Throughout Alloy"
                icon={DATA_MODEL_SECTION_ICONS.usage}
                testId="overview-usage-card"
            >
                <ul className="grid gap-1.5 sm:grid-cols-2">
                    {DATA_MODEL_USAGE_SURFACES.map((surface) => {
                        const Icon = DATA_MODEL_USAGE_ICONS[surface.id as DataModelUsageSurfaceId];
                        const hint = usageSurfaceCountHint(surface.id, hubEntity);
                        return (
                            <li
                                key={surface.id}
                                className="flex items-center gap-2 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.22] px-2.5 py-2"
                                data-testid={`overview-usage-${surface.id}`}
                            >
                                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-alloy-bend-pine shadow-sm">
                                    <Icon size={14} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12px] font-medium text-alloy-midnight">
                                        {surface.label}
                                    </span>
                                    {hint ? (
                                        <span className="text-[10px] text-alloy-midnight/40">{hint}</span>
                                    ) : (
                                        <span className="text-[10px] text-alloy-midnight/30">Context-dependent</span>
                                    )}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </OverviewCard>

            <OverviewCard
                title="Computed Signals"
                icon={DATA_MODEL_SECTION_ICONS.computed}
                testId="overview-computed-card"
            >
                {computedGroups.length === 0 ? (
                    <p className="text-[12px] text-alloy-midnight/45">No computed signals for this entity.</p>
                ) : (
                    <div className="space-y-3">
                        {computedGroups.map((group) => (
                            <div key={group.status}>
                                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                                    <span
                                        className={[
                                            "inline-block h-1.5 w-1.5 rounded-full",
                                            group.status === "now" ? "bg-alloy-bend-pine" : "bg-alloy-forge/30",
                                        ].join(" ")}
                                    />
                                    {group.label}
                                </p>
                                <ul className="space-y-0.5">
                                    {group.entries.map((entry) => (
                                        <li key={entry.id}>
                                            <button
                                                type="button"
                                                onClick={() => onSelectField?.(entry)}
                                                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-alloy-bend-pine/[0.06]"
                                            >
                                                <span className="font-medium text-alloy-midnight">{entry.label}</span>
                                                <span
                                                    className={[
                                                        "rounded-full px-1.5 py-px text-[9px] font-medium",
                                                        group.status === "now"
                                                            ? "bg-alloy-bend-pine/[0.1] text-alloy-bend-pine"
                                                            : "bg-alloy-stone text-alloy-midnight/40",
                                                    ].join(" ")}
                                                >
                                                    {group.label}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    onClick={onViewAllComputed}
                    className="mt-2.5 text-[11px] font-medium text-alloy-bend-pine hover:underline"
                >
                    View all
                </button>
            </OverviewCard>

            <OverviewCard
                title="Available In"
                icon={DATA_MODEL_SECTION_ICONS.available}
                className="xl:col-span-2"
                testId="overview-available-in-card"
            >
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {DATA_MODEL_BUILDER_AVAILABILITY.map((builder) => {
                        const Icon = DATA_MODEL_BUILDER_ICONS[builder.id as DataModelBuilderId];
                        const state = builder.available ? "Available" : "Future";
                        return (
                            <div
                                key={builder.id}
                                className="rounded-xl border border-alloy-forge/10 bg-alloy-stone/[0.18] px-3 py-2.5"
                                data-testid={`overview-builder-${builder.id}`}
                                title={"reason" in builder ? builder.reason : undefined}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-alloy-bend-pine shadow-sm">
                                        <Icon size={14} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-alloy-midnight">
                                        {builder.label}
                                    </span>
                                </div>
                                <span
                                    className={[
                                        "mt-2 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                                        builder.available
                                            ? "bg-alloy-bend-pine/[0.1] text-alloy-bend-pine"
                                            : "bg-alloy-forge/[0.06] text-alloy-midnight/40",
                                    ].join(" ")}
                                >
                                    {state}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </OverviewCard>
        </div>
    );
}
