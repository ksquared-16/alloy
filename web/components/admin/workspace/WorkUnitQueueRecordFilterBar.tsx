"use client";

import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import {
    resolveWorkUnitQueueRecordFilterFields,
    workUnitQueueRecordFilterIsActive,
} from "@/lib/workspace/workUnitQueueRecordFilterConfig";
import type {
    WorkUnitQueueRecordFilterContext,
    WorkUnitQueueRecordFilterFacets,
    WorkUnitQueueRecordFilterState,
} from "@/lib/workspace/workUnitQueueRecordFilterTypes";

type Props = {
    context: WorkUnitQueueRecordFilterContext;
    facets: WorkUnitQueueRecordFilterFacets;
    filters: WorkUnitQueueRecordFilterState;
    onChange: (next: WorkUnitQueueRecordFilterState) => void;
    onClear: () => void;
    filteredCount: number | null;
    totalLoaded: number | null;
    disabled?: boolean;
};

function patchFilters(
    filters: WorkUnitQueueRecordFilterState,
    patch: Partial<WorkUnitQueueRecordFilterState>
): WorkUnitQueueRecordFilterState {
    return { ...filters, ...patch };
}

function countAdvancedActiveFilters(filters: WorkUnitQueueRecordFilterState): number {
    let n = 0;
    if (filters.statusKey.trim()) n++;
    if (filters.dateFrom.trim() || filters.dateTo.trim()) n++;
    if (filters.siteKey.trim()) n++;
    if (filters.program.trim()) n++;
    if (filters.ownerKey.trim()) n++;
    if (filters.attentionReasonCode.trim()) n++;
    if (filters.sort !== "newest") n++;
    return n;
}

export function WorkUnitQueueRecordFilterBar({
    context,
    facets,
    filters,
    onChange,
    onClear,
    filteredCount,
    totalLoaded,
    disabled = false,
}: Props) {
    const fields = useMemo(() => resolveWorkUnitQueueRecordFilterFields(context), [context]);
    const fieldKinds = useMemo(() => new Set(fields.map((f) => f.kind)), [fields]);
    const active = workUnitQueueRecordFilterIsActive(filters);
    const advancedActiveCount = countAdvancedActiveFilters(filters);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const onSearch = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => onChange(patchFilters(filters, { search: e.target.value })),
        [filters, onChange]
    );

    const countCaption =
        filteredCount != null && totalLoaded != null && active
            ? `${filteredCount} of ${totalLoaded}`
            : null;

    const hasAdvancedFields =
        (fieldKinds.has("status") && facets.statusOptions.length > 0) ||
        fieldKinds.has("date_range") ||
        (fieldKinds.has("site") && facets.siteOptions.length > 0) ||
        (fieldKinds.has("program") && facets.programOptions.length > 0) ||
        (fieldKinds.has("owner") && facets.ownerOptions.length > 0) ||
        (fieldKinds.has("attention_reason") && facets.attentionReasonOptions.length > 0) ||
        fieldKinds.has("sort");

    return (
        <div
            className="adminv2-ws-wu-record-filter-bar adminv2-ws-wu-record-filter-bar--compact"
            data-testid="work-unit-queue-record-filter-bar"
            aria-label="Queue record filters"
        >
            <div className="adminv2-ws-wu-record-filter-bar__primary">
                {fieldKinds.has("search") ? (
                    <input
                        type="search"
                        value={filters.search}
                        onChange={onSearch}
                        disabled={disabled}
                        placeholder="Search…"
                        data-testid="wu-record-filter-search"
                        className="adminv2-ws-wu-record-filter-bar__search"
                        aria-label="Search records"
                    />
                ) : null}

                {hasAdvancedFields ? (
                    <button
                        type="button"
                        className="adminv2-ws-wu-record-filter-bar__toggle"
                        data-testid="wu-record-filter-more-toggle"
                        disabled={disabled}
                        aria-expanded={advancedOpen}
                        onClick={() => setAdvancedOpen((v) => !v)}
                    >
                        Filters
                        {advancedActiveCount > 0 ? (
                            <span className="adminv2-ws-wu-record-filter-bar__toggle-badge">{advancedActiveCount}</span>
                        ) : null}
                    </button>
                ) : null}

                {active && !advancedOpen ? (
                    <button
                        type="button"
                        className="adminv2-ws-wu-record-filter-bar__clear"
                        data-testid="wu-record-filter-clear"
                        disabled={disabled}
                        onClick={onClear}
                    >
                        Clear
                    </button>
                ) : null}
            </div>

            {advancedOpen && hasAdvancedFields ? (
                <div className="adminv2-ws-wu-record-filter-bar__advanced" data-testid="wu-record-filter-advanced">
                    <div className="adminv2-ws-wu-record-filter-bar__advanced-toolbar">
                        {active ? (
                            <button
                                type="button"
                                className="adminv2-ws-wu-record-filter-bar__clear"
                                data-testid="wu-record-filter-clear"
                                disabled={disabled}
                                onClick={onClear}
                            >
                                Clear
                            </button>
                        ) : (
                            <span className="adminv2-ws-wu-record-filter-bar__advanced-toolbar-spacer" aria-hidden />
                        )}
                        {countCaption ? (
                            <span
                                className="adminv2-ws-wu-record-filter-bar__caption"
                                data-testid="wu-record-filter-caption"
                            >
                                {countCaption}
                            </span>
                        ) : null}
                    </div>
                    <div className="adminv2-ws-wu-record-filter-bar__advanced-fields">
                    {fieldKinds.has("status") && facets.statusOptions.length > 0 ? (
                        <select
                            value={filters.statusKey}
                            disabled={disabled}
                            data-testid="wu-record-filter-status"
                            className="adminv2-ws-wu-record-filter-bar__select"
                            aria-label={fields.find((f) => f.kind === "status")?.label ?? "Status"}
                            onChange={(e) => onChange(patchFilters(filters, { statusKey: e.target.value }))}
                        >
                            <option value="">All statuses</option>
                            {facets.statusOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    ) : null}

                    {fieldKinds.has("date_range") ? (
                        <>
                            <input
                                type="date"
                                value={filters.dateFrom}
                                disabled={disabled}
                                data-testid="wu-record-filter-date-from"
                                className="adminv2-ws-wu-record-filter-bar__input"
                                aria-label="From date"
                                onChange={(e) => onChange(patchFilters(filters, { dateFrom: e.target.value }))}
                            />
                            <input
                                type="date"
                                value={filters.dateTo}
                                disabled={disabled}
                                data-testid="wu-record-filter-date-to"
                                className="adminv2-ws-wu-record-filter-bar__input"
                                aria-label="To date"
                                onChange={(e) => onChange(patchFilters(filters, { dateTo: e.target.value }))}
                            />
                        </>
                    ) : null}

                    {fieldKinds.has("site") && facets.siteOptions.length > 0 ? (
                        <select
                            value={filters.siteKey}
                            disabled={disabled}
                            data-testid="wu-record-filter-site"
                            className="adminv2-ws-wu-record-filter-bar__select"
                            aria-label="Site"
                            onChange={(e) => onChange(patchFilters(filters, { siteKey: e.target.value }))}
                        >
                            <option value="">All sites</option>
                            {facets.siteOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    ) : null}

                    {fieldKinds.has("program") && facets.programOptions.length > 0 ? (
                        <select
                            value={filters.program}
                            disabled={disabled}
                            data-testid="wu-record-filter-program"
                            className="adminv2-ws-wu-record-filter-bar__select"
                            aria-label="Program"
                            onChange={(e) => onChange(patchFilters(filters, { program: e.target.value }))}
                        >
                            <option value="">All programs</option>
                            {facets.programOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    ) : null}

                    {fieldKinds.has("owner") && facets.ownerOptions.length > 0 ? (
                        <select
                            value={filters.ownerKey}
                            disabled={disabled}
                            data-testid="wu-record-filter-owner"
                            className="adminv2-ws-wu-record-filter-bar__select"
                            aria-label="Owner"
                            onChange={(e) => onChange(patchFilters(filters, { ownerKey: e.target.value }))}
                        >
                            <option value="">All owners</option>
                            {facets.ownerOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    ) : null}

                    {fieldKinds.has("attention_reason") && facets.attentionReasonOptions.length > 0 ? (
                        <select
                            value={filters.attentionReasonCode}
                            disabled={disabled}
                            data-testid="wu-record-filter-attention-reason"
                            className="adminv2-ws-wu-record-filter-bar__select"
                            aria-label="Needs-attention reason"
                            onChange={(e) =>
                                onChange(patchFilters(filters, { attentionReasonCode: e.target.value }))
                            }
                        >
                            <option value="">All reasons</option>
                            {facets.attentionReasonOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    ) : null}

                    {fieldKinds.has("sort") ? (
                        <select
                            value={filters.sort}
                            disabled={disabled}
                            data-testid="wu-record-filter-sort"
                            className="adminv2-ws-wu-record-filter-bar__select"
                            aria-label="Sort"
                            onChange={(e) =>
                                onChange(
                                    patchFilters(filters, {
                                        sort: e.target.value as WorkUnitQueueRecordFilterState["sort"],
                                    })
                                )
                            }
                        >
                            {facets.sortOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
