"use client";

import type { EntityRelationshipDefinition } from "@/lib/fields/entityRelationshipCatalog";
import {
    CONFIG_WORKSPACE_GHOST_ACTION_CLASS,
    CONFIG_WORKSPACE_ROW_CLASS,
    CONFIG_WORKSPACE_ROW_EXPANDED_CLASS,
    CONFIG_WORKSPACE_ROW_INNER_CLASS,
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
            <div className={CONFIG_WORKSPACE_ROW_INNER_CLASS}>
                <Link2 size={13} strokeWidth={DATA_MODEL_ICON_STROKE} className="shrink-0 text-alloy-bend-pine" aria-hidden />
                <div className="flex min-w-0 max-w-xl flex-1 items-center gap-2">
                    <button type="button" onClick={onExpand} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-[13px] font-semibold text-alloy-midnight">
                            {relationship.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-alloy-midnight/45">
                            {relationship.connection_label}
                        </span>
                    </button>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <button
                        type="button"
                        onClick={expanded ? onCollapse : onExpand}
                        className={[CONFIG_WORKSPACE_GHOST_ACTION_CLASS, expanded ? "opacity-100" : ""].join(" ")}
                        data-testid="data-model-relationship-edit"
                    >
                        {expanded ? "Close" : "View"}
                    </button>
                </div>
            </div>
            {expanded ? (
                <div
                    className="mx-auto max-w-xl space-y-2 border-t border-alloy-forge/8 px-3 pb-2.5 pt-2"
                    data-testid="data-model-relationship-detail"
                >
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            What this is
                        </p>
                        <p className="text-[12px] leading-snug text-alloy-midnight/65">{relationship.meaning}</p>
                    </div>
                    {relationship.role_note ? (
                        <p className="rounded-md border border-alloy-bend-pine/15 bg-alloy-bend-pine/[0.04] px-2 py-1.5 text-[11px] leading-snug text-alloy-midnight/55">
                            {relationship.role_note}
                        </p>
                    ) : null}
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Why it exists
                        </p>
                        <p className="text-[12px] leading-snug text-alloy-midnight/60">
                            Alloy uses this connection so {relationship.connection_label.toLowerCase()} records stay
                            consistent across your organization.
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Where it&apos;s used
                        </p>
                        <p className="text-[11px] text-alloy-midnight/50">{relationship.where_used.join(" · ")}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-alloy-midnight/40">
                        <span className="rounded-full border border-alloy-forge/12 bg-alloy-stone/[0.35] px-1.5 py-0.5">
                            Platform
                        </span>
                        <span>{relationship.cardinality}</span>
                        <span>{relationship.required ? "Required" : "Optional"}</span>
                    </div>
                    <p className="text-[11px] text-alloy-midnight/40">View-only — part of Alloy&apos;s core model.</p>
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
