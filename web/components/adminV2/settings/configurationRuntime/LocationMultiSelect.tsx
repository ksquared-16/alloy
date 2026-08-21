"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export type LocationOption = {
    id: string;
    name: string;
    /** When false, shown only if already selected (historical reference). */
    isActive?: boolean;
};

export type LocationApplicabilityMode = "all" | "selected";

/**
 * Shared Financials / configuration multi-location checkbox selector.
 * Used by Catalog, Policies, and Tuition Plan create/edit flows.
 */
export function LocationMultiSelect({
    locations,
    mode,
    selectedIds,
    onModeChange,
    onSelectedIdsChange,
    disabled = false,
    testId = "location-multi-select",
    legend = "Locations",
    radioGroupAriaLabel = "Location applicability",
    allLabel = "All locations",
    selectedLabel = "Selected locations",
    emptyLabel = "No locations are configured for this organization yet.",
    searchPlaceholder = "Search locations…",
    allModeHint = "Available at every active location.",
}: {
    locations: LocationOption[];
    mode: LocationApplicabilityMode;
    selectedIds: string[];
    onModeChange: (mode: LocationApplicabilityMode) => void;
    onSelectedIdsChange: (ids: string[]) => void;
    disabled?: boolean;
    testId?: string;
    legend?: string;
    /** Override for non-location callers (e.g. Access → Departments) — same all/selected mechanics. */
    radioGroupAriaLabel?: string;
    allLabel?: string;
    selectedLabel?: string;
    emptyLabel?: string;
    searchPlaceholder?: string;
    allModeHint?: string;
}) {
    const [search, setSearch] = useState("");
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    const visible = useMemo(() => {
        const query = search.trim().toLowerCase();
        return locations
            .filter((row) => {
                const active = row.isActive !== false;
                if (!active && !selectedSet.has(row.id)) return false;
                if (!query) return true;
                return row.name.toLowerCase().includes(query);
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [locations, search, selectedSet]);

    const activeSelectable = useMemo(
        () => locations.filter((row) => row.isActive !== false),
        [locations],
    );

    const toggle = (id: string) => {
        if (disabled) return;
        if (selectedSet.has(id)) {
            onSelectedIdsChange(selectedIds.filter((row) => row !== id));
        } else {
            onSelectedIdsChange([...selectedIds, id]);
        }
    };

    const selectAll = () => {
        if (disabled) return;
        onSelectedIdsChange(activeSelectable.map((row) => row.id));
    };

    const clearAll = () => {
        if (disabled) return;
        onSelectedIdsChange([]);
    };

    return (
        <fieldset className="space-y-3" data-testid={testId} disabled={disabled}>
            <legend className="config-typo-field-label">{legend}</legend>

            <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label={radioGroupAriaLabel}>
                <label className="inline-flex items-center gap-2">
                    <input
                        type="radio"
                        name={`${testId}-mode`}
                        checked={mode === "all"}
                        onChange={() => onModeChange("all")}
                        data-testid={`${testId}-mode-all`}
                    />
                    {allLabel}
                </label>
                <label className="inline-flex items-center gap-2">
                    <input
                        type="radio"
                        name={`${testId}-mode`}
                        checked={mode === "selected"}
                        onChange={() => onModeChange("selected")}
                        data-testid={`${testId}-mode-selected`}
                    />
                    {selectedLabel}
                </label>
            </div>

            {mode === "selected" ?
                <div className="rounded-lg border border-alloy-stone/25 bg-white p-3">
                    {locations.length === 0 ?
                        <p className="text-sm text-alloy-midnight/55" data-testid={`${testId}-empty`}>
                            {emptyLabel}
                        </p>
                    :   <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="relative min-w-[12rem] flex-1">
                                    <Search
                                        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-alloy-midnight/40"
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder={searchPlaceholder}
                                        className="config-runtime-input config-runtime-input--with-leading-icon w-full"
                                        data-testid={`${testId}-search`}
                                        aria-label={searchPlaceholder.replace("…", "")}
                                    />
                                </div>
                                <p className="text-xs text-alloy-midnight/50" data-testid={`${testId}-count`}>
                                    {selectedIds.length} selected
                                </p>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="text-xs font-medium text-alloy-bend-pine hover:underline"
                                    onClick={selectAll}
                                    data-testid={`${testId}-select-all`}
                                >
                                    Select all
                                </button>
                                <button
                                    type="button"
                                    className="text-xs font-medium text-alloy-midnight/55 hover:underline"
                                    onClick={clearAll}
                                    data-testid={`${testId}-clear-all`}
                                >
                                    Clear all
                                </button>
                            </div>
                            <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto" role="group" aria-label="Location list">
                                {visible.map((row) => {
                                    const checked = selectedSet.has(row.id);
                                    const inactive = row.isActive === false;
                                    return (
                                        <li key={row.id}>
                                            <label
                                                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-alloy-stone/10 ${
                                                    inactive ? "opacity-60" : ""
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggle(row.id)}
                                                    data-testid={`${testId}-option-${row.id}`}
                                                />
                                                <span className="text-alloy-midnight">
                                                    {row.name}
                                                    {inactive ? " (inactive)" : ""}
                                                </span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    }
                </div>
            :   <p className="text-sm text-alloy-midnight/55">{allModeHint}</p>}
        </fieldset>
    );
}

export function summarizeLocationApplicability(
    mode: LocationApplicabilityMode,
    selectedIds: string[],
    locations: LocationOption[],
): string {
    if (mode === "all") return "All locations";
    if (selectedIds.length === 0) return "No locations selected";
    if (selectedIds.length === 1) {
        const name = locations.find((row) => row.id === selectedIds[0])?.name;
        return name ?? "1 location";
    }
    return `${selectedIds.length} selected locations`;
}
