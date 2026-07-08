"use client";

import { useEffect, useRef, useState } from "react";
import type { DataModelEntityStats } from "@/lib/fields/dataModelWorkspaceModel";
import { HUB_ENTITY_SYSTEM_GRAIN_LABEL } from "@/lib/fields/entityRelationshipCatalog";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import {
    DATA_MODEL_ENTITY_ICONS,
    DATA_MODEL_ICON_STROKE,
} from "@/lib/fields/dataModelWorkspaceIcons";
import { ChevronDown } from "lucide-react";

type Props = {
    hubEntity: SettingsHubEntityKey;
    entityLabel: string;
    stats: DataModelEntityStats;
    explanation: string;
    onViewUsage?: () => void;
    onAddField?: () => void;
    onAddRelationship?: () => void;
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
    const Icon = DATA_MODEL_ENTITY_ICONS[hubEntity];
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onDoc = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [menuOpen]);

    return (
        <header
            className="process-config-setup-card rounded-xl border border-alloy-forge/12 bg-white px-3.5 py-3 shadow-[0_1px_3px_rgba(24,39,58,0.04)]"
            data-testid="data-model-entity-header"
            data-entity-type={hubEntity}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/[0.1] text-alloy-bend-pine"
                        aria-hidden
                    >
                        <Icon size={18} strokeWidth={DATA_MODEL_ICON_STROKE} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-medium tracking-wide text-alloy-midnight/40">
                            Data Model <span className="mx-0.5 text-alloy-midnight/25">/</span> {displayLabel}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <h1 className="config-typo-workspace-title text-lg font-semibold leading-tight text-alloy-midnight">
                                {displayLabel}
                            </h1>
                            {grain ? (
                                <span className="rounded-full border border-alloy-forge/12 bg-alloy-stone/[0.45] px-2 py-px text-[10px] font-medium text-alloy-midnight/40">
                                    {grain}
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-1 max-w-2xl text-[11px] leading-snug text-alloy-midnight/55">{explanation}</p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {onViewUsage ? (
                        <button
                            type="button"
                            onClick={onViewUsage}
                            className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2.5 py-1.5 text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.35]"
                            data-testid="data-model-view-usage"
                        >
                            View Usage
                        </button>
                    ) : null}
                    <div className="relative" ref={menuRef}>
                        <button
                            type="button"
                            onClick={() => setMenuOpen((open) => !open)}
                            className="config-primary-btn inline-flex items-center gap-1 rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-alloy-bend-pine/90"
                            data-testid="data-model-add-menu"
                            aria-expanded={menuOpen}
                        >
                            Add
                            <ChevronDown size={13} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                        </button>
                        {menuOpen ? (
                            <div className="absolute right-0 z-20 mt-1 min-w-[168px] overflow-hidden rounded-lg border border-alloy-forge/12 bg-white py-1 shadow-lg">
                                {onAddField ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMenuOpen(false);
                                            onAddField();
                                        }}
                                        className="block w-full px-3 py-1.5 text-left text-xs text-alloy-midnight hover:bg-alloy-bend-pine/[0.06]"
                                        data-testid="data-model-add-field"
                                    >
                                        Add Field
                                    </button>
                                ) : null}
                                {onAddRelationship ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMenuOpen(false);
                                            onAddRelationship();
                                        }}
                                        className="block w-full px-3 py-1.5 text-left text-xs text-alloy-midnight hover:bg-alloy-bend-pine/[0.06]"
                                        data-testid="data-model-add-relationship"
                                    >
                                        Add Relationship
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    disabled
                                    className="block w-full px-3 py-1.5 text-left text-xs text-alloy-midnight/35"
                                    title="Computed signals are platform-defined today."
                                >
                                    Add Computed Signal
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {[
                    { label: "Fields", value: stats.fields },
                    { label: "Relationships", value: stats.relationships },
                    { label: "Surfaces", value: stats.surfaces },
                    { label: "Processes", value: stats.processes },
                ].map((stat) => (
                    <div
                        key={stat.label}
                        className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.28] px-2 py-1.5 text-center"
                        data-testid={`data-model-stat-${stat.label.toLowerCase()}`}
                    >
                        <p className="text-sm font-semibold leading-none text-alloy-midnight">{stat.value}</p>
                        <p className="mt-1 text-[9px] font-medium uppercase tracking-wide text-alloy-midnight/40">
                            {stat.label}
                        </p>
                    </div>
                ))}
            </div>
        </header>
    );
}
