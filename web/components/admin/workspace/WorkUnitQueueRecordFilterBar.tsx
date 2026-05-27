"use client";

import { useCallback, useMemo, type ChangeEvent } from "react";
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

    const onSearch = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => onChange(patchFilters(filters, { search: e.target.value })),
        [filters, onChange]
    );

    const countCaption =
        filteredCount != null && totalLoaded != null && active
            ? `${filteredCount} of ${totalLoaded} loaded`
            : null;

    return (
        <div
            className="adminv2-ws-wu-record-filter-bar"
            data-testid="work-unit-queue-record-filter-bar"
            aria-label="Queue record filters"
        >
            <div className="adminv2-ws-wu-record-filter-bar__row">
                {fieldKinds.has("search") ? (
                    <label className="adminv2-ws-wu-record-filter-bar__field adminv2-ws-wu-record-filter-bar__field--search">
                        <span className="adminv2-ws-wu-record-filter-bar__label">Search</span>
                        <input
                            type="search"
                            value={filters.search}
                            onChange={onSearch}
                            disabled={disabled}
                            placeholder="Name, contact, child, program…"
                            data-testid="wu-record-filter-search"
                            className="adminv2-ws-wu-record-filter-bar__input"
                        />
                    </label>
                ) : null}

                {fieldKinds.has("status") && facets.statusOptions.length > 0 ? (
                    <label className="adminv2-ws-wu-record-filter-bar__field">
                        <span className="adminv2-ws-wu-record-filter-bar__label">
                            {fields.find((f) => f.kind === "status")?.label ?? "Status"}
                        </span>
                        <select
                            value={filters.statusKey}
                            disabled={disabled}
                            data-testid="wu-record-filter-status"
                            className="adminv2-ws-wu-record-filter-bar__select"
                            onChange={(e) => onChange(patchFilters(filters, { statusKey: e.target.value }))}
                        >
                            <option value="">All</option>
                            {facets.statusOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}

                {fieldKinds.has("date_range") ? (
                    <>
                        <label className="adminv2-ws-wu-record-filter-bar__field">
                            <span className="adminv2-ws-wu-record-filter-bar__label">From</span>
                            <input
                                type="date"
                                value={filters.dateFrom}
                                disabled={disabled}
                                data-testid="wu-record-filter-date-from"
                                className="adminv2-ws-wu-record-filter-bar__input"
                                onChange={(e) => onChange(patchFilters(filters, { dateFrom: e.target.value }))}
                            />
                        </label>
                        <label className="adminv2-ws-wu-record-filter-bar__field">
                            <span className="adminv2-ws-wu-record-filter-bar__label">To</span>
                            <input
                                type="date"
                                value={filters.dateTo}
                                disabled={disabled}
                                data-testid="wu-record-filter-date-to"
                                className="adminv2-ws-wu-record-filter-bar__input"
                                onChange={(e) => onChange(patchFilters(filters, { dateTo: e.target.value }))}
                            />
                        </label>
                    </>
                ) : null}

                {fieldKinds.has("site") && facets.siteOptions.length > 0 ? (
                    <label className="adminv2-ws-wu-record-filter-bar__field">
                        <span className="adminv2-ws-wu-record-filter-bar__label">Site</span>
                        <select
                            value={filters.siteKey}
                            disabled={disabled}
                            data-testid="wu-record-filter-site"
                            className="adminv2-ws-wu-record-filter-bar__select"
                            onChange={(e) => onChange(patchFilters(filters, { siteKey: e.target.value }))}
                        >
                            <option value="">All sites</option>
                            {facets.siteOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}

                {fieldKinds.has("program") && facets.programOptions.length > 0 ? (
                    <label className="adminv2-ws-wu-record-filter-bar__field">
                        <span className="adminv2-ws-wu-record-filter-bar__label">Program</span>
                        <select
                            value={filters.program}
                            disabled={disabled}
                            data-testid="wu-record-filter-program"
                            className="adminv2-ws-wu-record-filter-bar__select"
                            onChange={(e) => onChange(patchFilters(filters, { program: e.target.value }))}
                        >
                            <option value="">All programs</option>
                            {facets.programOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}

                {fieldKinds.has("owner") && facets.ownerOptions.length > 0 ? (
                    <label className="adminv2-ws-wu-record-filter-bar__field">
                        <span className="adminv2-ws-wu-record-filter-bar__label">Owner</span>
                        <select
                            value={filters.ownerKey}
                            disabled={disabled}
                            data-testid="wu-record-filter-owner"
                            className="adminv2-ws-wu-record-filter-bar__select"
                            onChange={(e) => onChange(patchFilters(filters, { ownerKey: e.target.value }))}
                        >
                            <option value="">All owners</option>
                            {facets.ownerOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}

                {fieldKinds.has("attention_reason") && facets.attentionReasonOptions.length > 0 ? (
                    <label className="adminv2-ws-wu-record-filter-bar__field">
                        <span className="adminv2-ws-wu-record-filter-bar__label">Reason</span>
                        <select
                            value={filters.attentionReasonCode}
                            disabled={disabled}
                            data-testid="wu-record-filter-attention-reason"
                            className="adminv2-ws-wu-record-filter-bar__select"
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
                    </label>
                ) : null}

                {fieldKinds.has("sort") ? (
                    <label className="adminv2-ws-wu-record-filter-bar__field">
                        <span className="adminv2-ws-wu-record-filter-bar__label">Sort</span>
                        <select
                            value={filters.sort}
                            disabled={disabled}
                            data-testid="wu-record-filter-sort"
                            className="adminv2-ws-wu-record-filter-bar__select"
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
                    </label>
                ) : null}

                {active ? (
                    <button
                        type="button"
                        className="adminv2-ws-wu-record-filter-bar__clear"
                        data-testid="wu-record-filter-clear"
                        disabled={disabled}
                        onClick={onClear}
                    >
                        Clear filters
                    </button>
                ) : null}
            </div>
            {countCaption ? (
                <p className="adminv2-ws-wu-record-filter-bar__caption" data-testid="wu-record-filter-caption">
                    {countCaption}
                </p>
            ) : null}
        </div>
    );
}
