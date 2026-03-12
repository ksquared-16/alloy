"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Filter, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface Column<T> {
    key: keyof T | string;
    label: string;
    sortable?: boolean;
    render?: (value: any, row: T) => React.ReactNode;
}

interface Filter {
    key: string;
    label: string;
    type: "select";
    options: { value: string; label: string }[];
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    filters?: Filter[];
    searchable?: boolean;
    onRowClick?: (row: T) => void;
    loading?: boolean;
    /** When true, do not render the search/filters bar (use with custom toolbar e.g. filter icon). */
    hideToolbar?: boolean;
}

const TABLE_BORDER = "border-admin-border";
const INPUT_CLASS = "w-full rounded-lg border border-admin-border bg-white px-3 py-2 text-sm text-alloy-forge placeholder:text-alloy-muted/70 focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/25";
const BTN_PRIMARY = "rounded-lg px-3 py-1.5 text-sm font-medium bg-alloy-blue text-white hover:bg-alloy-blue/90 focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:ring-offset-1";
const BTN_SECONDARY = "rounded-lg border border-admin-border px-3 py-1.5 text-sm font-medium text-alloy-forge/80 hover:bg-alloy-stone/50 focus:outline-none focus:ring-2 focus:ring-alloy-blue/20";

export default function DataTable<T extends Record<string, any>>({
    data,
    columns,
    filters = [],
    searchable = true,
    onRowClick,
    loading = false,
    hideToolbar = false,
}: DataTableProps<T>) {
    const [search, setSearch] = useState("");
    const [sortColumn, setSortColumn] = useState<keyof T | string | null>(null);
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [filterOpen, setFilterOpen] = useState(false);
    const [page, setPage] = useState(1);
    const filterRef = useRef<HTMLDivElement>(null);
    const pageSize = 20;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const getValue = (row: T, key: keyof T | string): any => {
        const keyStr = String(key);
        if (keyStr.includes(".")) {
            return keyStr.split(".").reduce((obj: any, k: string) => obj?.[k], row);
        }
        return row[key as keyof T];
    };

    const filteredData = useMemo(() => {
        let result = [...data];
        if (search && searchable) {
            const searchLower = search.toLowerCase();
            result = result.filter((row) =>
                columns.some((col) => {
                    const value = getValue(row, col.key);
                    return String(value || "").toLowerCase().includes(searchLower);
                })
            );
        }
        filters.forEach((filter) => {
            const filterValue = activeFilters[filter.key];
            if (filterValue) {
                result = result.filter((row) => {
                    const value = getValue(row, filter.key as keyof T | string);
                    return String(value) === filterValue;
                });
            }
        });
        return result;
    }, [data, search, activeFilters, columns, searchable, filters]);

    const sortedData = useMemo(() => {
        if (!sortColumn) return filteredData;
        return [...filteredData].sort((a, b) => {
            const aVal = getValue(a, sortColumn);
            const bVal = getValue(b, sortColumn);
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;
            const comparison =
                typeof aVal === "string"
                    ? aVal.localeCompare(String(bVal))
                    : Number(aVal) - Number(bVal);
            return sortDirection === "asc" ? comparison : -comparison;
        });
    }, [filteredData, sortColumn, sortDirection]);

    const paginatedData = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sortedData.slice(start, start + pageSize);
    }, [sortedData, page]);

    const totalPages = Math.ceil(sortedData.length / pageSize);
    const hasActiveFilters = Object.values(activeFilters).some(Boolean);

    const handleSort = (column: keyof T | string) => {
        if (sortColumn === column) {
            if (sortDirection === "asc") {
                setSortDirection("desc");
            } else {
                setSortColumn(null);
                setSortDirection("asc");
            }
        } else {
            setSortColumn(column);
            setSortDirection("asc");
        }
    };

    const handleClearFilters = () => {
        setActiveFilters({});
        setPage(1);
        setFilterOpen(false);
    };

    if (loading) {
        return (
            <div className={`rounded-xl border ${TABLE_BORDER} bg-admin-surface-card shadow-md p-10`}>
                <div className="text-center text-sm text-alloy-muted">Loading…</div>
            </div>
        );
    }

    return (
        <div className={`rounded-xl border ${TABLE_BORDER} border-l-4 border-l-alloy-blue bg-admin-surface-card shadow-md overflow-hidden`}>
            {!hideToolbar && (
                <div className="flex flex-wrap items-center gap-3 border-b border-admin-border px-4 py-3">
                    {searchable && (
                        <input
                            type="text"
                            placeholder="Search…"
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            className={`${INPUT_CLASS} max-w-xs`}
                        />
                    )}
                    {filters.length > 0 && (
                        <div className="relative flex items-center" ref={filterRef}>
                            <button
                                type="button"
                                onClick={() => setFilterOpen((o) => !o)}
                                className={`flex items-center gap-2 ${BTN_SECONDARY} ${filterOpen ? "border-alloy-pine bg-alloy-pine/10 ring-2 ring-alloy-pine/25 text-alloy-pine" : ""}`}
                                aria-expanded={filterOpen}
                                aria-haspopup="true"
                            >
                                <Filter className="h-4 w-4 text-alloy-muted" />
                                Filter
                                {hasActiveFilters && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-alloy-pine" aria-hidden />
                                )}
                            </button>
                            {filterOpen && (
                                <div className="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-lg border border-admin-border bg-admin-surface-card p-4 shadow-lg">
                                    <div className="space-y-3">
                                        {filters.map((filter) => (
                                            <div key={filter.key}>
                                                <label className="mb-1 block text-xs font-medium text-alloy-muted">
                                                    {filter.label}
                                                </label>
                                                <select
                                                    value={activeFilters[filter.key] || ""}
                                                    onChange={(e) =>
                                                        setActiveFilters((prev) => ({
                                                            ...prev,
                                                            [filter.key]: e.target.value,
                                                        }))
                                                    }
                                                    className={INPUT_CLASS}
                                                >
                                                    <option value="">All</option>
                                                    {filter.options.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                        <div className="flex gap-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => { setPage(1); setFilterOpen(false); }}
                                                className={BTN_PRIMARY}
                                            >
                                                Apply
                                            </button>
                                            {hasActiveFilters && (
                                                <button
                                                    type="button"
                                                    onClick={handleClearFilters}
                                                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-admin-border bg-alloy-stone/40">
                            {columns.map((column) => {
                                const isSorted = sortColumn === column.key;
                                return (
                                    <th
                                        key={String(column.key)}
                                        className={`
                                            px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-forge
                                            ${isSorted ? "text-alloy-pine" : ""}
                                            ${column.sortable ? "cursor-pointer select-none hover:bg-alloy-pine/5" : ""}
                                        `}
                                        onClick={() => column.sortable && handleSort(column.key)}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            {column.label}
                                            {column.sortable && (
                                                <span className={`inline-flex ${isSorted ? "text-alloy-pine" : "text-alloy-forge/60"}`} aria-hidden>
                                                    {isSorted ? (
                                                        sortDirection === "asc" ? (
                                                            <ChevronUp className="h-4 w-4" />
                                                        ) : (
                                                            <ChevronDown className="h-4 w-4" />
                                                        )
                                                    ) : (
                                                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-admin-border">
                        {paginatedData.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-5 py-14 text-center"
                                >
                                    <p className="text-sm font-medium text-alloy-forge">No data found</p>
                                    <p className="mt-1 text-xs text-alloy-muted">
                                        {hasActiveFilters || search ? "Try adjusting filters or search." : "There are no records to show."}
                                    </p>
                                </td>
                            </tr>
                        ) : (
                            paginatedData.map((row, idx) => (
                                <tr
                                    key={idx}
                                    className={`
                                        transition-colors duration-100
                                        ${onRowClick ? "cursor-pointer hover:bg-alloy-pine/5" : ""}
                                    `}
                                    onClick={() => onRowClick?.(row)}
                                >
                                    {columns.map((column) => (
                                        <td
                                            key={String(column.key)}
                                            className="max-w-[200px] px-5 py-3.5 text-sm text-alloy-forge/90 truncate align-middle"
                                            title={typeof getValue(row, column.key) === "string" ? String(getValue(row, column.key) ?? "") : undefined}
                                        >
                                            {column.render
                                                ? column.render(getValue(row, column.key), row)
                                                : String(getValue(row, column.key) ?? "")}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-admin-border px-4 py-3">
                    <div className="text-sm text-alloy-muted">
                        Showing {(page - 1) * pageSize + 1} to{" "}
                        {Math.min(page * pageSize, sortedData.length)} of {sortedData.length} results
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className={`${BTN_SECONDARY} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setPage(Math.min(totalPages, page + 1))}
                            disabled={page === totalPages}
                            className={`${BTN_SECONDARY} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
