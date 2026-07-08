"use client";

import type { EntityRelationshipDefinition } from "@/lib/fields/entityRelationshipCatalog";
import {
    CONFIG_WORKSPACE_GHOST_ACTION_CLASS,
    CONFIG_WORKSPACE_ROW_CLASS,
    CONFIG_WORKSPACE_ROW_EXPANDED_CLASS,
} from "@/lib/fields/dataModelWorkspaceOperatorUi";
import { DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import { Link2 } from "lucide-react";

type Props = {
    relationship: EntityRelationshipDefinition;
    expanded: boolean;
    onExpand: () => void;
    onCollapse: () => void;
};

export default function DataModelRelationshipRow({ relationship, expanded, onExpand, onCollapse }: Props) {
    return (
        <div
            className={[CONFIG_WORKSPACE_ROW_CLASS, expanded ? CONFIG_WORKSPACE_ROW_EXPANDED_CLASS : ""].join(" ")}
            data-testid="data-model-relationship-row"
            data-relationship-id={relationship.id}
            data-relationship-kind="platform"
            data-expanded={expanded ? "true" : "false"}
        >
            <div className="flex items-center gap-2 px-2.5 py-2">
                <Link2 size={14} strokeWidth={DATA_MODEL_ICON_STROKE} className="shrink-0 text-alloy-bend-pine" aria-hidden />
                <button type="button" onClick={onExpand} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px] font-semibold text-alloy-midnight">
                        {relationship.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-alloy-midnight/45">
                        {relationship.connection_label}
                    </span>
                </button>
                <span className="hidden shrink-0 rounded-full border border-alloy-forge/12 bg-alloy-stone/[0.35] px-1.5 py-0.5 text-[9px] font-medium text-alloy-midnight/50 sm:inline">
                    Platform
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
                    className={[CONFIG_WORKSPACE_GHOST_ACTION_CLASS, expanded ? "opacity-100" : ""].join(" ")}
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
                    <p className="text-[12px] leading-snug text-alloy-midnight/65">{relationship.meaning}</p>
                    {relationship.role_note ? (
                        <p className="rounded-md border border-alloy-bend-pine/15 bg-alloy-bend-pine/[0.04] px-2.5 py-2 text-[11px] leading-snug text-alloy-midnight/55">
                            {relationship.role_note}
                        </p>
                    ) : null}
                    <p className="text-[11px] text-alloy-midnight/40">
                        Used in: {relationship.where_used.join(" · ")}
                    </p>
                    <p className="text-[11px] text-alloy-midnight/40">
                        Platform relationships describe how Alloy models your organization. They are view-only here.
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
