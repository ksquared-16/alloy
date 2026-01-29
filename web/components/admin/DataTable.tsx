"use client";

import { useState, useMemo } from "react";

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
}

export default function DataTable<T extends Record<string, any>>({
    data,
    columns,
    filters = [],
    searchable = true,
    onRowClick,
    loading = false,
}: DataTableProps<T>) {
    const [search, setSearch] = useState("");
    const [sortColumn, setSortColumn] = useState<keyof T | string | null>(null);
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const pageSize = 20;

    // Helper to get value from row by key (supports nested keys with dot notation)
    const getValue = (row: T, key: keyof T | string): any => {
        const keyStr = String(key);
        if (keyStr.includes(".")) {
            return keyStr.split(".").reduce((obj: any, k: string) => obj?.[k], row);
        }
        return row[key as keyof T];
    };

    // Filter and search
    const filteredData = useMemo(() => {
        let result = [...data];

        // Apply search
        if (search && searchable) {
            const searchLower = search.toLowerCase();
            result = result.filter((row) =>
                columns.some((col) => {
                    const value = getValue(row, col.key);
                    return String(value || "").toLowerCase().includes(searchLower);
                })
            );
        }

        // Apply filters
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

    // Sort
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

    // Paginate
    const paginatedData = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sortedData.slice(start, start + pageSize);
    }, [sortedData, page]);

    const totalPages = Math.ceil(sortedData.length / pageSize);

    const handleSort = (column: keyof T | string) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortColumn(column);
            setSortDirection("asc");
        }
    };

    if (loading) {
        return (
            <div className="bg-white rounded-lg border border-alloy-stone/30 p-8">
                <div className="text-center text-alloy-midnight/60">Loading...</div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg border border-alloy-stone/30">
            {/* Search and Filters */}
            <div className="p-4 border-b border-alloy-stone/30 space-y-4">
                {searchable && (
                    <div>
                        <input
                            type="text"
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            className="w-full px-4 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-alloy-blue"
                        />
                    </div>
                )}

                {filters.length > 0 && (
                    <div className="flex gap-4 flex-wrap">
                        {filters.map((filter) => (
                            <select
                                key={filter.key}
                                value={activeFilters[filter.key] || ""}
                                onChange={(e) => {
                                    setActiveFilters({
                                        ...activeFilters,
                                        [filter.key]: e.target.value,
                                    });
                                    setPage(1);
                                }}
                                className="px-3 py-2 border border-alloy-stone/80 rounded-md focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-alloy-blue"
                            >
                                <option value="">All {filter.label}</option>
                                {filter.options.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        ))}
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-alloy-stone/50">
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={String(column.key)}
                                    className={`
                    px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-alloy-midnight/70
                    ${column.sortable ? "cursor-pointer hover:bg-alloy-stone/70" : ""}
                  `}
                                    onClick={() => column.sortable && handleSort(column.key)}
                                >
                                    <div className="flex items-center gap-2">
                                        {column.label}
                                        {column.sortable && sortColumn === column.key && (
                                            <span className="text-alloy-blue">
                                                {sortDirection === "asc" ? "↑" : "↓"}
                                            </span>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-alloy-stone/30">
                        {paginatedData.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-4 py-8 text-center text-alloy-midnight/60"
                                >
                                    No data found
                                </td>
                            </tr>
                        ) : (
                            paginatedData.map((row, idx) => (
                                <tr
                                    key={idx}
                                    className={`
                    hover:bg-alloy-stone/30 transition-colors
                    ${onRowClick ? "cursor-pointer" : ""}
                  `}
                                    onClick={() => onRowClick?.(row)}
                                >
                                    {columns.map((column) => (
                                        <td key={String(column.key)} className="px-4 py-3 text-sm">
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

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="p-4 border-t border-alloy-stone/30 flex items-center justify-between">
                    <div className="text-sm text-alloy-midnight/60">
                        Showing {(page - 1) * pageSize + 1} to{" "}
                        {Math.min(page * pageSize, sortedData.length)} of {sortedData.length}{" "}
                        results
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className="px-3 py-1 text-sm border border-alloy-stone/80 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-alloy-stone"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setPage(Math.min(totalPages, page + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1 text-sm border border-alloy-stone/80 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-alloy-stone"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

