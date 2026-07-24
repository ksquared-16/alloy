"use client";

import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import type { EntityWorkspaceVm } from "@/lib/dataModel/dataModelWorkspaceVm";

/** Entities → Usage. Where this entity's data surfaces across Alloy, and where it can be built into. */
export function EntityUsageTab({
    entity,
    testId = "entity-usage-tab",
}: {
    entity: EntityWorkspaceVm;
    testId?: string;
}) {
    return (
        <div className="space-y-3" data-testid={testId}>
            <ConfigWorkspaceCard title="Used across Alloy" compact testId="entity-usage-surfaces">
                <ul className="space-y-1.5" data-testid="entity-usage-surfaces-list">
                    {entity.usageSurfaces.map((surface) => (
                        <li key={surface.id} className="flex items-baseline justify-between gap-2 text-[12px]">
                            <span className="text-alloy-midnight">{surface.label}</span>
                            <span className="text-right text-[11px] text-alloy-midnight/45">
                                {surface.description}
                                {surface.hint ? ` · ${surface.hint}` : ""}
                            </span>
                        </li>
                    ))}
                </ul>
            </ConfigWorkspaceCard>
            <ConfigWorkspaceCard title="Available in builders" compact testId="entity-usage-builders">
                <ul className="flex flex-wrap gap-1.5" data-testid="entity-usage-builders-list">
                    {entity.builderAvailability.map((builder) => (
                        <li
                            key={builder.id}
                            className="rounded border border-alloy-forge/10 px-1.5 py-0.5 text-[10px] text-alloy-midnight/65"
                            title={builder.reason}
                        >
                            {builder.label}
                            <span className={builder.available ? " text-alloy-bend-pine" : " text-alloy-midnight/35"}>
                                {" "}
                                · {builder.available ? "Yes" : "Future"}
                            </span>
                        </li>
                    ))}
                </ul>
            </ConfigWorkspaceCard>
        </div>
    );
}
