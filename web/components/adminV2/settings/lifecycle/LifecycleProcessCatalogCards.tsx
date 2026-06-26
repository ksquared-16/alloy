"use client";

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import {
    BUSINESS_PROCESS_CATALOG_BACK,
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
    compactStrip = false,
    onBackToCatalog,
}: {
    items: LifecycleCatalogEntry[];
    selectedId: string | null;
    loading: boolean;
    onSelect: (entry: LifecycleCatalogEntry) => void;
    onCreateNew: () => void;
    /** Concept A — keep process cards visible as primary navigation while configuring a process. */
    compactStrip?: boolean;
    onBackToCatalog?: () => void;
}) {
    if (loading) {
        return (
            <p className="text-xs text-alloy-midnight/50" data-testid="lifecycle-catalog-loading">
                {BUSINESS_PROCESS_CATALOG_LOADING}
            </p>
        );
    }

    return (
        <div
            className={compactStrip ? "space-y-2" : "space-y-3"}
            data-testid="lifecycle-process-catalog"
            data-layout={compactStrip ? "compact-strip" : "hub"}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    {compactStrip && onBackToCatalog ?
                        <button
                            type="button"
                            className="text-[11px] font-medium text-alloy-pine hover:underline"
                            onClick={onBackToCatalog}
                            data-testid="lifecycle-catalog-back"
                        >
                            {BUSINESS_PROCESS_CATALOG_BACK}
                        </button>
                    :   null}
                    <p className="text-xs font-medium text-alloy-midnight/55">
                        {compactStrip ? "Process" : "Select a process to configure"}
                    </p>
                </div>
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
            ) : compactStrip ? (
                <div className="flex gap-2 overflow-x-auto pb-1" role="list">
                    {items.map((entry) => {
                        const selected = entry.id === selectedId;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                role="listitem"
                                className={`min-w-[10.5rem] shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                                    selected
                                        ? "border-alloy-pine/40 bg-alloy-pine/[0.06] ring-1 ring-alloy-pine/25"
                                        : "border-alloy-forge/12 bg-white/90 hover:border-alloy-forge/25 hover:bg-white"
                                }`}
                                onClick={() => onSelect(entry)}
                                data-testid={`lifecycle-process-card-${entry.process_key}`}
                                aria-pressed={selected}
                            >
                                <p className="truncate text-sm font-semibold text-alloy-midnight">{entry.lifecycle_name}</p>
                                <p className="mt-0.5 truncate text-[10px] text-alloy-midnight/55">{formatProcessSummary(entry)}</p>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="list">
                    {items.map((entry) => {
                        const selected = entry.id === selectedId;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                role="listitem"
                                className={`config-runtime-nav-card text-left shadow-sm ${
                                    selected ? "config-runtime-nav-card--active" : ""
                                }`}
                                onClick={() => onSelect(entry)}
                                data-testid={`lifecycle-process-card-${entry.process_key}`}
                                aria-pressed={selected}
                            >
                                <p className="text-base font-semibold text-alloy-midnight">{entry.lifecycle_name}</p>
                                <p className="mt-1 text-[11px] text-alloy-midnight/55">{formatProcessSummary(entry)}</p>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
