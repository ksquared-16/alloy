"use client";

import type { DataModelEntityStats } from "@/lib/fields/dataModelWorkspaceModel";
import { HUB_ENTITY_SYSTEM_GRAIN_LABEL } from "@/lib/fields/entityRelationshipCatalog";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

type Props = {
    hubEntity: SettingsHubEntityKey;
    entityLabel: string;
    stats: DataModelEntityStats;
    explanation: string;
    onViewUsage?: () => void;
    onAddField?: () => void;
    onAddRelationship?: () => void;
};

const ENTITY_ICONS: Record<SettingsHubEntityKey, string> = {
    inquiry_child: "👶",
    person: "👤",
    customer: "🏠",
    opportunity: "📋",
    location: "📍",
};

export default function DataModelEntityHeader({
    hubEntity,
    entityLabel,
    stats,
    explanation,
    onViewUsage,
    onAddField,
    onAddRelationship,
}: Props) {
    const grain = HUB_ENTITY_SYSTEM_GRAIN_LABEL[hubEntity];
    const displayLabel = hubEntity === "opportunity" ? "Lead / Enrollment" : entityLabel;

    return (
        <header
            className="rounded-2xl border border-alloy-forge/12 bg-white p-4 shadow-sm"
            data-testid="data-model-entity-header"
            data-entity-type={hubEntity}
        >
            <p className="text-[11px] text-alloy-midnight/45">
                Data Model <span className="mx-1">›</span> {displayLabel}
            </p>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-alloy-pine/[0.12] text-xl"
                        aria-hidden
                    >
                        {ENTITY_ICONS[hubEntity]}
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-xl font-semibold text-alloy-midnight">{displayLabel}</h1>
                            {grain ? (
                                <span className="rounded-full border border-alloy-forge/15 bg-alloy-stone/[0.04] px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/45">
                                    {grain}
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-alloy-midnight/60">{explanation}</p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {onViewUsage ? (
                        <button
                            type="button"
                            onClick={onViewUsage}
                            className="rounded-lg border border-alloy-forge/15 px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                            data-testid="data-model-view-usage"
                        >
                            View Usage
                        </button>
                    ) : null}
                    <div className="relative group">
                        <button
                            type="button"
                            className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                            data-testid="data-model-add-menu"
                        >
                            + Add ▾
                        </button>
                        <div className="absolute right-0 z-10 mt-1 hidden min-w-[160px] rounded-lg border border-alloy-forge/15 bg-white py-1 shadow-lg group-focus-within:block group-hover:block">
                            {onAddField ? (
                                <button
                                    type="button"
                                    onClick={onAddField}
                                    className="block w-full px-3 py-1.5 text-left text-xs text-alloy-midnight hover:bg-alloy-stone/10"
                                    data-testid="data-model-add-field"
                                >
                                    Add Field
                                </button>
                            ) : null}
                            {onAddRelationship ? (
                                <button
                                    type="button"
                                    onClick={onAddRelationship}
                                    className="block w-full px-3 py-1.5 text-left text-xs text-alloy-midnight hover:bg-alloy-stone/10"
                                    data-testid="data-model-add-relationship"
                                >
                                    Add Relationship
                                </button>
                            ) : null}
                            <button
                                type="button"
                                disabled
                                className="block w-full px-3 py-1.5 text-left text-xs text-alloy-midnight/40"
                                title="Computed signals are platform-defined today."
                            >
                                Add Computed Signal
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                    { label: "Fields", value: stats.fields },
                    { label: "Relationships", value: stats.relationships },
                    { label: "Surfaces", value: stats.surfaces },
                    { label: "Processes", value: stats.processes },
                ].map((stat) => (
                    <div
                        key={stat.label}
                        className="rounded-xl border border-alloy-forge/10 bg-alloy-pine/[0.03] px-3 py-2 text-center"
                        data-testid={`data-model-stat-${stat.label.toLowerCase()}`}
                    >
                        <p className="text-lg font-semibold text-alloy-midnight">{stat.value}</p>
                        <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/45">{stat.label}</p>
                    </div>
                ))}
            </div>
        </header>
    );
}
