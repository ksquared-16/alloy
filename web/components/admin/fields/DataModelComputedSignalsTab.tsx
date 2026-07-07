"use client";

import FieldCatalogCard from "@/components/admin/fields/FieldCatalogCard";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import type { SettingsFieldCatalogEntry } from "@/lib/fields/fieldCatalogForSettings";

type Props = {
    hubEntity: SettingsHubEntityKey;
    entries: readonly SettingsFieldCatalogEntry[];
    selectedRefKey?: string | null;
    onSelectEntry: (entry: SettingsFieldCatalogEntry) => void;
};

export default function DataModelComputedSignalsTab({ hubEntity, entries, selectedRefKey, onSelectEntry }: Props) {
    const computed = entries.filter((e) => e.ownership === "computed");

    if (computed.length === 0) {
        return <p className="text-sm text-alloy-midnight/55">No computed signals for this entity.</p>;
    }

    return (
        <div className="grid gap-3" data-testid="data-model-computed-signals-tab">
            <p className="text-xs text-alloy-midnight/60">
                Runtime projections calculated at read time. These are view-only — not stored directly and not editable
                as form inputs.
            </p>
            {computed.map((entry) => (
                                        <FieldCatalogCard
                                            key={entry.id}
                                            entry={entry}
                                            hubEntity={hubEntity}
                    selected={selectedRefKey === entry.refKey}
                    onSelect={() => onSelectEntry(entry)}
                />
            ))}
        </div>
    );
}
