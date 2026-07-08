"use client";

import type { EntityRelationshipDefinition } from "@/lib/fields/entityRelationshipCatalog";
import { DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import { ArrowRight, Link2 } from "lucide-react";

type Props = {
    relationship: EntityRelationshipDefinition;
    expanded: boolean;
    onExpand: () => void;
    onCollapse: () => void;
};

export default function DataModelRelationshipRow({ relationship, expanded, onExpand, onCollapse }: Props) {
    return (
        <div
            className={[
                "border-b border-alloy-forge/10 last:border-b-0",
                expanded ? "bg-alloy-bend-pine/[0.03]" : "hover:bg-alloy-stone/[0.22]",
            ].join(" ")}
            data-testid="data-model-relationship-row"
            data-relationship-id={relationship.id}
            data-expanded={expanded ? "true" : "false"}
        >
            <div className="flex items-center gap-2 px-2.5 py-2">
                <Link2 size={14} strokeWidth={DATA_MODEL_ICON_STROKE} className="shrink-0 text-alloy-bend-pine" aria-hidden />
                <button type="button" onClick={onExpand} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px] font-semibold text-alloy-midnight">
                        {relationship.label}
                    </span>
                </button>
                <span className="hidden shrink-0 text-[11px] text-alloy-midnight/50 sm:inline">
                    {relationship.target_label}
                </span>
                <span className="shrink-0 text-[10px] text-alloy-midnight/40">{relationship.cardinality}</span>
                <span
                    className={[
                        "shrink-0 text-[10px] font-medium",
                        relationship.required ? "text-alloy-bend-pine" : "text-alloy-midnight/35",
                    ].join(" ")}
                >
                    {relationship.required ? "Required" : "Optional"}
                </span>
                <button
                    type="button"
                    onClick={expanded ? onCollapse : onExpand}
                    className="config-ghost-btn shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-alloy-bend-pine hover:underline"
                    data-testid="data-model-relationship-edit"
                >
                    {expanded ? "Close" : "View"}
                </button>
            </div>
            {expanded ? (
                <div
                    className="space-y-2 border-t border-alloy-forge/8 px-3 pb-3 pt-2.5"
                    data-testid="data-model-relationship-detail"
                >
                    <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-alloy-midnight/60">
                        <ArrowRight size={12} strokeWidth={DATA_MODEL_ICON_STROKE} aria-hidden />
                        <span>{relationship.target_label}</span>
                        <span className="text-alloy-midnight/25">·</span>
                        <span>{relationship.cardinality}</span>
                        <span className="text-alloy-midnight/25">·</span>
                        <span>{relationship.required ? "Required" : "Optional"}</span>
                    </p>
                    {relationship.role_note ? (
                        <p className="text-[12px] leading-snug text-alloy-midnight/55">{relationship.role_note}</p>
                    ) : null}
                    <p className="text-[11px] text-alloy-midnight/40">
                        Used in: {relationship.where_used.join(" · ")}
                    </p>
                    <p className="text-[11px] text-alloy-midnight/40">
                        Platform relationship catalog entry. New vocabulary types are added with Add Relationship;
                        full vocabulary management lives under Settings → Relationships.
                    </p>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={onCollapse}
                            className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.35]"
                        >
                            Close
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
