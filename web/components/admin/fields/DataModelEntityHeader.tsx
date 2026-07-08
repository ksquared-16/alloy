"use client";

import { useEffect, useRef, useState } from "react";
import type { DataModelEntityStats } from "@/lib/fields/dataModelWorkspaceModel";
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
            className="flex flex-wrap items-start justify-between gap-2 border-b border-alloy-forge/10 pb-2"
            data-testid="data-model-entity-header"
            data-entity-type={hubEntity}
        >
            <div className="flex min-w-0 flex-1 items-start gap-2">
                <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-alloy-bend-pine/[0.1] text-alloy-bend-pine"
                    aria-hidden
                >
                    <Icon size={15} strokeWidth={DATA_MODEL_ICON_STROKE} />
                </div>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <h1 className="config-typo-workspace-title text-[15px] font-semibold leading-tight text-alloy-midnight">
                            {displayLabel}
                        </h1>
                        <p
                            className="text-[10px] text-alloy-midnight/40"
                            data-testid="data-model-entity-metrics"
                        >
                            {stats.fields} fields · {stats.relationships} relationships · {stats.surfaces}{" "}
                            surfaces
                        </p>
                    </div>
                    <p className="mt-0.5 max-w-2xl text-[11px] leading-snug text-alloy-midnight/50 line-clamp-1">
                        {explanation}
                    </p>
                </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {onViewUsage ? (
                    <button
                        type="button"
                        onClick={onViewUsage}
                        className="config-ghost-btn px-2 py-1 text-[11px] font-medium text-alloy-midnight/60 hover:text-alloy-midnight"
                        data-testid="data-model-view-usage"
                    >
                        View Usage
                    </button>
                ) : null}
                <div className="relative" ref={menuRef}>
                    <button
                        type="button"
                        onClick={() => setMenuOpen((open) => !open)}
                        className="config-primary-btn inline-flex items-center gap-1 rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-bend-pine/90"
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
                        </div>
                    ) : null}
                </div>
            </div>
        </header>
    );
}
