"use client";

/**
 * Presentation Runtime V2 — WU.QUEUE filter/control row.
 *
 * The interactive queue utility bar — Search + Filters only. Sits as the sole QueueRegion
 * header: no title, no record-count badge (the active Work View pill already names the queue).
 * Advanced filters open an inline panel (status / site / program / needs-attention / sort).
 * Presentation only — the pure filter/sort lives in `queueRowFilter.ts`.
 */

import { useState } from "react";
import {
    queueRowFilterAdvancedActiveCount,
    queueRowFilterIsActive,
    type QueueRowFilterFacets,
    type QueueRowFilterState,
    type QueueRowSort,
} from "@/lib/presentation/runtime/queueRowFilter";

const SORT_OPTIONS: { value: QueueRowSort; label: string }[] = [
    { value: "default", label: "Default order" },
    { value: "subject_az", label: "Subject A–Z" },
    { value: "attention_first", label: "Needs attention first" },
    { value: "status_az", label: "Status A–Z" },
];

const SELECT_CLASS =
    "rounded-md border border-alloy-stone/40 bg-white px-2 py-1 text-[12px] text-alloy-midnight/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-alloy-pine";

export function QueueFilterControls({
    facets,
    filters,
    onChange,
    onClear,
    matchedCount,
    loadedCount,
    disabled = false,
}: {
    facets: QueueRowFilterFacets;
    filters: QueueRowFilterState;
    onChange: (next: QueueRowFilterState) => void;
    onClear: () => void;
    matchedCount: number;
    loadedCount: number;
    disabled?: boolean;
}) {
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const active = queueRowFilterIsActive(filters);
    const advancedActiveCount = queueRowFilterAdvancedActiveCount(filters);
    const patch = (p: Partial<QueueRowFilterState>) => onChange({ ...filters, ...p });

    const hasAdvanced =
        facets.statusOptions.length > 0 ||
        facets.siteOptions.length > 0 ||
        facets.programOptions.length > 0 ||
        facets.attentionReasonOptions.length > 0;

    return (
        <div
            className="flex flex-col gap-1.5"
            data-testid="work-unit-queue-record-filter-bar"
            data-queue-filter-controls
            aria-label="Queue record filters"
        >
            <div className="flex items-center gap-2">
                <input
                    type="search"
                    value={filters.search}
                    onChange={(e) => patch({ search: e.target.value })}
                    disabled={disabled}
                    placeholder="Search this view…"
                    data-testid="wu-record-filter-search"
                    aria-label="Search records"
                    className="min-w-0 flex-1 rounded-md border border-alloy-stone/35 bg-white px-2.5 py-1 text-[12px] text-alloy-midnight placeholder:text-alloy-midnight/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-alloy-pine"
                />
                {hasAdvanced ? (
                    <button
                        type="button"
                        onClick={() => setAdvancedOpen((v) => !v)}
                        disabled={disabled}
                        aria-expanded={advancedOpen}
                        data-testid="wu-record-filter-more-toggle"
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                            advancedOpen || advancedActiveCount > 0
                                ? "border-alloy-pine/40 bg-alloy-pine/10 text-alloy-pine"
                                : "border-alloy-stone/40 bg-white text-alloy-midnight/70 hover:border-alloy-pine/40 hover:text-alloy-pine"
                        }`}
                    >
                        Filters
                        {advancedActiveCount > 0 ? (
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-alloy-pine px-1 text-[10px] font-bold text-white tabular-nums">
                                {advancedActiveCount}
                            </span>
                        ) : null}
                    </button>
                ) : null}
                {active ? (
                    <button
                        type="button"
                        onClick={onClear}
                        disabled={disabled}
                        data-testid="wu-record-filter-clear"
                        className="shrink-0 rounded-md px-2 py-1.5 text-[12px] font-semibold text-alloy-pine hover:bg-alloy-pine/10"
                    >
                        Clear
                    </button>
                ) : null}
                {active ? (
                    <span
                        data-testid="wu-record-filter-caption"
                        className="shrink-0 text-[11px] tabular-nums text-alloy-midnight/50"
                    >
                        {matchedCount} of {loadedCount}
                    </span>
                ) : null}
            </div>

            {advancedOpen && hasAdvanced ? (
                <div
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-alloy-stone/25 bg-alloy-stone/[0.04] px-2.5 py-2"
                    data-testid="wu-record-filter-advanced"
                >
                    {facets.statusOptions.length > 0 ? (
                        <select
                            value={filters.statusKey}
                            disabled={disabled}
                            onChange={(e) => patch({ statusKey: e.target.value })}
                            aria-label="Status"
                            data-testid="wu-record-filter-status"
                            className={SELECT_CLASS}
                        >
                            <option value="">All statuses</option>
                            {facets.statusOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    ) : null}
                    {facets.siteOptions.length > 0 ? (
                        <select
                            value={filters.siteLabel}
                            disabled={disabled}
                            onChange={(e) => patch({ siteLabel: e.target.value })}
                            aria-label="Site"
                            data-testid="wu-record-filter-site"
                            className={SELECT_CLASS}
                        >
                            <option value="">All sites</option>
                            {facets.siteOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    ) : null}
                    {facets.programOptions.length > 0 ? (
                        <select
                            value={filters.programLabel}
                            disabled={disabled}
                            onChange={(e) => patch({ programLabel: e.target.value })}
                            aria-label="Program"
                            data-testid="wu-record-filter-program"
                            className={SELECT_CLASS}
                        >
                            <option value="">All programs</option>
                            {facets.programOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    ) : null}
                    {facets.attentionReasonOptions.length > 0 ? (
                        <select
                            value={filters.attentionReason}
                            disabled={disabled}
                            onChange={(e) => patch({ attentionReason: e.target.value })}
                            aria-label="Needs-attention reason"
                            data-testid="wu-record-filter-attention-reason"
                            className={SELECT_CLASS}
                        >
                            <option value="">All records</option>
                            <option value="__needs__">Needs attention</option>
                            {facets.attentionReasonOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    ) : null}
                    <select
                        value={filters.sort}
                        disabled={disabled}
                        onChange={(e) => patch({ sort: e.target.value as QueueRowSort })}
                        aria-label="Sort"
                        data-testid="wu-record-filter-sort"
                        className={SELECT_CLASS}
                    >
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
            ) : null}
        </div>
    );
}
