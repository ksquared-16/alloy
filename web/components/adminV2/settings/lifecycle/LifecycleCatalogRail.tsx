"use client";

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";

/** Compact lifecycle selector — no legacy badges or large cards. */
export default function LifecycleCatalogRail({
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
        return <p className="text-xs text-alloy-midnight/50">Loading lifecycles…</p>;
    }

    return (
        <nav
            className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4"
            aria-label="Lifecycle"
            data-testid="lifecycle-catalog-rail"
        >
            <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50 sm:pt-1.5">
                Lifecycle
            </p>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {items.map((entry) => {
                    const selected = selectedId === entry.id;
                    return (
                        <button
                            key={entry.id}
                            type="button"
                            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                selected
                                    ? "bg-alloy-pine text-white"
                                    : "bg-alloy-stone/15 text-alloy-midnight/75 hover:bg-alloy-stone/25"
                            }`}
                            onClick={() => onSelect(entry)}
                            data-testid={`lifecycle-rail-${entry.process_key}`}
                        >
                            {entry.lifecycle_name}
                        </button>
                    );
                })}
                <button
                    type="button"
                    className="rounded-md border border-dashed border-alloy-pine/40 px-2.5 py-1.5 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/5"
                    onClick={onCreateNew}
                    data-testid="lifecycle-catalog-create-new"
                >
                    + New Lifecycle
                </button>
            </div>
            {!items.length ? (
                <p className="w-full text-xs text-alloy-midnight/55 sm:pl-0">
                    No lifecycles yet. Create one to begin.
                </p>
            ) : null}
        </nav>
    );
}
