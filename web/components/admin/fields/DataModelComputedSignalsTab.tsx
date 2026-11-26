"use client";

import { useEffect, useState } from "react";
import DataModelFieldRow from "@/components/admin/fields/DataModelFieldRow";
import type { SettingsHubEntityKey, SettingsFieldCatalogEntry } from "@/lib/fields/fieldCatalogForSettings";
import { computedSignalPreviewGroups } from "@/lib/fields/dataModelWorkspaceModel";

type Props = {
    hubEntity: SettingsHubEntityKey;
    entries: readonly SettingsFieldCatalogEntry[];
    focusRefKey?: string | null;
};

export default function DataModelComputedSignalsTab({ hubEntity, entries, focusRefKey = null }: Props) {
    const computed = entries.filter((e) => e.ownership === "computed");
    const groups = computedSignalPreviewGroups(computed, 99);
    const [expandedRefKey, setExpandedRefKey] = useState<string | null>(focusRefKey);

    useEffect(() => {
        if (focusRefKey) setExpandedRefKey(focusRefKey);
    }, [focusRefKey]);

    if (computed.length === 0) {
        return <p className="text-sm text-alloy-midnight/55">No computed signals for this entity.</p>;
    }

    return (
        <div className="space-y-4" data-testid="data-model-computed-signals-tab">
            <p className="text-[11px] leading-snug text-alloy-midnight/55">
                Runtime projections calculated at read time. View-only — not stored directly and not editable as form
                inputs.
            </p>
            {groups.map((group) => (
                <section key={group.status} className="space-y-1" data-testid={`computed-group-${group.status}`}>
                    <div className="flex items-center gap-2 px-0.5">
                        <span
                            className={[
                                "inline-block h-1.5 w-1.5 rounded-full",
                                group.status === "now" ? "bg-alloy-bend-pine" : "bg-alloy-forge/30",
                            ].join(" ")}
                        />
                        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                            {group.label}
                        </h3>
                        <span className="text-[10px] text-alloy-midnight/35">{group.entries.length}</span>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-alloy-forge/12 bg-white">
                        {group.entries.map((entry) => (
                            <DataModelFieldRow
                                key={entry.id}
                                entry={entry}
                                hubEntity={hubEntity}
                                expanded={expandedRefKey === entry.refKey}
                                onExpand={() => setExpandedRefKey(entry.refKey)}
                                onCollapse={() => setExpandedRefKey(null)}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
