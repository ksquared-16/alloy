"use client";

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import {
    BUSINESS_PROCESS_CATALOG_CREATE,
    BUSINESS_PROCESS_CATALOG_EMPTY,
    BUSINESS_PROCESS_CATALOG_LOADING,
} from "@/lib/lifecycle/businessProcessUiLabels";

function formatProcessSummary(entry: LifecycleCatalogEntry): string {
    const parts: string[] = [];
    if (entry.track_count > 0) {
        parts.push(`${entry.track_count} Track${entry.track_count === 1 ? "" : "s"}`);
    }
    if (entry.stage_count > 0) {
        parts.push(`${entry.stage_count} Stage${entry.stage_count === 1 ? "" : "s"}`);
    }
    if (entry.work_unit_count > 0) {
        parts.push(`${entry.work_unit_count} Queue${entry.work_unit_count === 1 ? "" : "s"}`);
    }
    return parts.length ? parts.join(" · ") : "No stages configured";
}

export default function LifecycleProcessCatalogCards({
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
                {BUSINESS_PROCESS_CATALOG_LOADING}
            </p>
        );
    }

    return (
        <div className="space-y-3" data-testid="lifecycle-process-catalog">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-alloy-midnight/55">Select a process to configure</p>
                <button
                    type="button"
                    className="shrink-0 rounded-md border border-alloy-forge/20 bg-white px-2.5 py-1.5 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10"
                    onClick={onCreateNew}
                    data-testid="lifecycle-catalog-create-new"
                >
                    {BUSINESS_PROCESS_CATALOG_CREATE}
                </button>
            </div>

            {!items.length ? (
                <div
                    className="rounded-xl border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.04] px-4 py-6 text-center"
                    data-testid="lifecycle-catalog-empty"
                >
                    <p className="text-sm text-alloy-midnight/60">{BUSINESS_PROCESS_CATALOG_EMPTY}</p>
                    <button
                        type="button"
                        className="mt-3 rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white"
                        onClick={onCreateNew}
                    >
                        {BUSINESS_PROCESS_CATALOG_CREATE}
                    </button>
                </div>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2" role="list">
                    {items.map((entry) => {
                        const selected = entry.id === selectedId;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                role="listitem"
                                className={`rounded-xl border px-4 py-3 text-left shadow-sm transition-colors ${
                                    selected
                                        ? "border-alloy-pine/40 bg-alloy-pine/[0.06] ring-1 ring-alloy-pine/25"
                                        : "border-alloy-forge/12 bg-white/90 hover:border-alloy-forge/25 hover:bg-white"
                                }`}
                                onClick={() => onSelect(entry)}
                                data-testid={`lifecycle-process-card-${entry.process_key}`}
                                aria-pressed={selected}
                            >
                                <p className="text-sm font-semibold text-alloy-midnight">{entry.lifecycle_name}</p>
                                <p className="mt-1 text-[11px] text-alloy-midnight/55">{formatProcessSummary(entry)}</p>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
