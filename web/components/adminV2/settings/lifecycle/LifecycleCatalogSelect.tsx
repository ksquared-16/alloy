"use client";

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";

/** Lifecycle selector row — dropdown + compact create control. */
export default function LifecycleCatalogSelect({
    items,
    selectedId,
    loading,
    onSelect,
    onCreateNew,
}: {
    items: LifecycleCatalogEntry[];
    selectedId: string | null;
    loading: boolean;
    onSelect: (entry: LifecycleCatalogEntry) => void;
    onCreateNew: () => void;
}) {
    if (loading) {
        return (
            <p className="text-xs text-alloy-midnight/50" data-testid="lifecycle-catalog-loading">
                Loading lifecycles…
            </p>
        );
    }

    const selectedEntry = items.find((e) => e.id === selectedId) ?? null;

    return (
        <div
            className="flex flex-wrap items-center gap-2"
            data-testid="lifecycle-catalog-select"
        >
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-alloy-midnight/70 sm:max-w-md">
                <span className="shrink-0 font-medium text-alloy-midnight/50">Lifecycle</span>
                <select
                    className="min-w-0 flex-1 rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-xs font-medium text-alloy-midnight"
                    value={selectedEntry?.id ?? ""}
                    disabled={!items.length}
                    onChange={(e) => {
                        const entry = items.find((x) => x.id === e.target.value);
                        if (entry) onSelect(entry);
                    }}
                    data-testid="lifecycle-catalog-dropdown"
                    aria-label="Select lifecycle"
                >
                    <option value="" disabled data-testid="lifecycle-catalog-empty">
                        {items.length ? "Choose lifecycle…" : "No lifecycles"}
                    </option>
                    {items.map((entry) => (
                        <option
                            key={entry.id}
                            value={entry.id}
                            data-testid={`lifecycle-option-${entry.process_key}`}
                        >
                            {entry.lifecycle_name}
                        </option>
                    ))}
                </select>
            </label>
            <button
                type="button"
                className="shrink-0 rounded-md border border-alloy-forge/20 bg-white px-2.5 py-1.5 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10"
                onClick={onCreateNew}
                data-testid="lifecycle-catalog-create-new"
            >
                Create Lifecycle
            </button>
        </div>
    );
}
