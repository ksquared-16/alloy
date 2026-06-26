"use client";

import { useMemo, useState } from "react";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import {
    BUSINESS_PROCESS_CATALOG_CREATE,
    BUSINESS_PROCESS_CATALOG_EMPTY,
    BUSINESS_PROCESS_CATALOG_LOADING,
} from "@/lib/lifecycle/businessProcessUiLabels";

const VISIBLE_CHIP_LIMIT = 5;

function formatProcessSummary(entry: LifecycleCatalogEntry): string {
    const parts: string[] = [];
    if (entry.stage_count > 0) {
        parts.push(`${entry.stage_count} Stage${entry.stage_count === 1 ? "" : "s"}`);
    }
    if (entry.work_unit_count > 0) {
        parts.push(`${entry.work_unit_count} Queue${entry.work_unit_count === 1 ? "" : "s"}`);
    }
    return parts.length ? parts.join(" · ") : "Not configured";
}

export default function BusinessProcessProcessSelectorStrip({
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
    const [query, setQuery] = useState("");
    const selectedEntry = useMemo(
        () => items.find((entry) => entry.id === selectedId) ?? null,
        [items, selectedId],
    );

    const filteredItems = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (entry) =>
                entry.lifecycle_name.toLowerCase().includes(q) || entry.process_key.toLowerCase().includes(q),
        );
    }, [items, query]);

    if (loading) {
        return (
            <p className="text-sm text-alloy-midnight/50" data-testid="lifecycle-process-catalog-loading">
                {BUSINESS_PROCESS_CATALOG_LOADING}
            </p>
        );
    }

    if (!items.length) {
        return (
            <div
                className="process-config-selector-row flex items-center justify-between gap-3 rounded-xl border border-dashed border-alloy-forge/20 bg-white px-4 py-3"
                data-testid="lifecycle-catalog-empty"
            >
                <p className="text-sm text-alloy-midnight/60">{BUSINESS_PROCESS_CATALOG_EMPTY}</p>
                <button
                    type="button"
                    className="rounded-lg bg-alloy-pine px-3 py-1.5 text-sm font-semibold text-white hover:bg-alloy-pine/90"
                    onClick={onCreateNew}
                    data-testid="lifecycle-catalog-create-new"
                >
                    {BUSINESS_PROCESS_CATALOG_CREATE}
                </button>
            </div>
        );
    }

    const useDropdown = items.length > VISIBLE_CHIP_LIMIT;

    return (
        <div className="space-y-2" data-testid="lifecycle-process-catalog">
            <div className="process-config-selector-row">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {useDropdown ?
                        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center">
                            <label className="sr-only" htmlFor="process-config-selector">
                                Process
                            </label>
                            <select
                                id="process-config-selector"
                                value={selectedId ?? ""}
                                onChange={(e) => {
                                    const entry = items.find((item) => item.id === e.target.value);
                                    if (entry) onSelect(entry);
                                }}
                                className="config-runtime-select max-w-md min-w-[12rem] font-semibold text-alloy-midnight"
                                data-testid="process-config-selector-dropdown"
                            >
                                {filteredItems.map((entry) => (
                                    <option key={entry.id} value={entry.id}>
                                        {entry.lifecycle_name}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search processes…"
                                className="config-runtime-input max-w-xs text-sm"
                                data-testid="process-config-selector-search"
                            />
                        </div>
                    :   <div className="process-config-selector-cards" role="list">
                            {items.map((entry) => {
                                const selected = entry.id === selectedId;
                                return (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        role="listitem"
                                        className={`process-config-process-card ${selected ? "process-config-process-card--active" : ""}`}
                                        onClick={() => onSelect(entry)}
                                        data-testid={`lifecycle-process-card-${entry.process_key}`}
                                        aria-pressed={selected}
                                    >
                                        <p className="truncate text-sm font-semibold text-alloy-midnight">
                                            {entry.lifecycle_name}
                                        </p>
                                        <p className="mt-0.5 truncate text-[10px] text-alloy-midnight/55">
                                            {formatProcessSummary(entry)}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    }
                    {selectedEntry && useDropdown ?
                        <p className="text-[11px] text-alloy-midnight/50">{formatProcessSummary(selectedEntry)}</p>
                    :   null}
                </div>
                <button
                    type="button"
                    className="shrink-0 rounded-lg bg-alloy-pine px-3.5 py-2 text-sm font-semibold text-white hover:bg-alloy-pine/90"
                    onClick={onCreateNew}
                    data-testid="lifecycle-catalog-create-new"
                >
                    {BUSINESS_PROCESS_CATALOG_CREATE}
                </button>
            </div>
        </div>
    );
}
