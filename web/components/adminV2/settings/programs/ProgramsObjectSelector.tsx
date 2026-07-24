"use client";

import { useCallback, useRef, type KeyboardEvent } from "react";
import { BookOpen, Search } from "lucide-react";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import {
    PROGRAMS_SORT_OPTIONS,
    type ProgramOperatorRow,
    type ProgramsLifecycleFilter,
    type ProgramsSortDirection,
    type ProgramsSortField,
} from "@/lib/programs/programsOperatorModel";

/**
 * Programs collection rail — two-row filter/sort toolbar; no duplicate Add action.
 */
export function ProgramsObjectSelector({
    programs,
    selectedId,
    filter,
    onFilterChange,
    sortField,
    sortDirection,
    onSortChange,
    search,
    onSearchChange,
    onSelect,
    totalCount,
}: {
    programs: ProgramOperatorRow[];
    selectedId: string | null;
    filter: ProgramsLifecycleFilter;
    onFilterChange: (filter: ProgramsLifecycleFilter) => void;
    sortField: ProgramsSortField;
    sortDirection: ProgramsSortDirection;
    onSortChange: (field: ProgramsSortField, direction: ProgramsSortDirection) => void;
    search: string;
    onSearchChange: (value: string) => void;
    onSelect: (programId: string) => void;
    totalCount: number;
}) {
    const listRef = useRef<HTMLDivElement>(null);

    const focusRowAt = useCallback((index: number) => {
        const root = listRef.current;
        if (!root) return;
        const options = root.querySelectorAll<HTMLButtonElement>('[role="option"]');
        options[index]?.focus();
    }, []);

    const onListKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
                return;
            }
            const options = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
            if (!options?.length) return;
            const currentIndex = Array.from(options).findIndex((el) => el === document.activeElement);
            let next = currentIndex;
            if (event.key === "ArrowDown") next = Math.min((currentIndex < 0 ? -1 : currentIndex) + 1, options.length - 1);
            if (event.key === "ArrowUp") next = Math.max((currentIndex < 0 ? options.length : currentIndex) - 1, 0);
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = options.length - 1;
            if (next === currentIndex || next < 0) return;
            event.preventDefault();
            const programId = programs[next]?.id;
            if (programId) onSelect(programId);
            focusRowAt(next);
        },
        [focusRowAt, onSelect, programs],
    );

    const filterLabel =
        filter === "active" ? "Active" : filter === "archived" ? "Archived" : "All";
    const sortValue = `${sortField}:${sortDirection}`;

    return (
        <aside
            className="locations-collection-rail process-config-setup-card hidden min-w-0 max-w-full self-start overflow-hidden p-0 xl:block"
            aria-label="Program selector"
            data-testid="programs-object-selector"
        >
            <header className="locations-collection-rail__header" data-testid="programs-nav-collection-header">
                <div className="min-w-0 flex-1">
                    <h2 className="locations-collection-rail__title">Programs</h2>
                    <p className="locations-collection-rail__count">
                        {programs.length === totalCount
                            ? `${totalCount} Program${totalCount === 1 ? "" : "s"}`
                            : `${programs.length} of ${totalCount} Programs`}
                        {" · "}
                        {filterLabel}
                    </p>
                </div>
            </header>

            <div className="programs-collection-controls" data-testid="programs-nav-controls">
                <label className="sr-only" htmlFor="programs-search">
                    Search Programs
                </label>
                <div className="programs-collection-controls__search-wrap">
                    <Search
                        className="programs-collection-controls__search-icon"
                        strokeWidth={2}
                        aria-hidden
                    />
                    <input
                        id="programs-search"
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search Programs…"
                        className="programs-collection-controls__search"
                        data-testid="programs-nav-search"
                    />
                </div>
                <div className="programs-collection-controls__row">
                    <label className="programs-collection-controls__field min-w-0">
                        <span className="sr-only">Status</span>
                        <select
                            className="programs-collection-controls__select"
                            value={filter}
                            onChange={(event) =>
                                onFilterChange(event.target.value as ProgramsLifecycleFilter)
                            }
                            data-testid="programs-nav-filter"
                            aria-label="Filter Programs by status"
                        >
                            <option value="active">Active</option>
                            <option value="archived">Archived</option>
                            <option value="all">All</option>
                        </select>
                    </label>
                    <label className="programs-collection-controls__field min-w-0">
                        <span className="sr-only">Sort by</span>
                        <select
                            className="programs-collection-controls__select"
                            value={sortValue}
                            onChange={(event) => {
                                const [field, direction] = event.target.value.split(":") as [
                                    ProgramsSortField,
                                    ProgramsSortDirection,
                                ];
                                onSortChange(field, direction);
                            }}
                            data-testid="programs-nav-sort"
                            aria-label="Sort Programs"
                        >
                            {PROGRAMS_SORT_OPTIONS.map((option) => (
                                <option
                                    key={`${option.field}:${option.direction}`}
                                    value={`${option.field}:${option.direction}`}
                                >
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div
                ref={listRef}
                className="locations-collection-rail__list"
                role="listbox"
                aria-label="Programs"
                onKeyDown={onListKeyDown}
                data-testid="programs-nav-list"
            >
                {programs.length === 0 ?
                    <p className="px-3 py-4 text-sm text-alloy-midnight/50" data-testid="programs-nav-empty">
                        No Programs match this filter.
                    </p>
                :   programs.map((program) => {
                        const selected = program.id === selectedId;
                        const archived = program.lifecycleStatus === "retired";
                        return (
                            <button
                                key={program.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                aria-current={selected ? "true" : undefined}
                                className={`${QUEUE_ROW_CARD_SHELL_CLASS} locations-collection-row focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-bend-pine ${
                                    selected ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                                } ${archived ? "locations-collection-row--inactive" : ""}`}
                                onClick={() => onSelect(program.id)}
                                data-testid={`programs-program-${program.id}`}
                            >
                                {selected ?
                                    <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} />
                                :   null}
                                <span
                                    className={`locations-collection-row__glyph ${
                                        archived
                                            ? "text-alloy-midnight/30"
                                            : selected
                                              ? "text-alloy-bend-pine"
                                              : "text-alloy-bend-pine/75"
                                    }`}
                                    aria-hidden
                                >
                                    <BookOpen className="h-4 w-4" strokeWidth={2} />
                                </span>
                                <span className="locations-collection-row__body">
                                    <span className="locations-collection-row__name flex items-center gap-2">
                                        <span className="min-w-0 truncate">{program.name}</span>
                                        <span
                                            className={`locations-collection-row__status shrink-0 ${
                                                archived
                                                    ? "locations-collection-row__status--inactive"
                                                    : "locations-collection-row__status--active"
                                            }`}
                                        >
                                            {program.statusLabel}
                                        </span>
                                    </span>
                                    {program.ageRangeLabel ?
                                        <span className="locations-collection-row__place">{program.ageRangeLabel}</span>
                                    :   null}
                                    <span className="locations-collection-row__meta text-alloy-midnight/50">
                                        {archived ? "Archived" : program.availabilityLabel}
                                    </span>
                                </span>
                            </button>
                        );
                    })
                }
            </div>
        </aside>
    );
}
