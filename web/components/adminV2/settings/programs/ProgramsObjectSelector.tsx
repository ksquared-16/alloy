"use client";

import { useCallback, useRef, type KeyboardEvent } from "react";
import { BookOpen, ListFilter, Plus, Search } from "lucide-react";
import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import type { ProgramOperatorRow, ProgramsLifecycleFilter } from "@/lib/programs/programsOperatorModel";

/**
 * Programs collection rail — mirrors LocationsObjectSelector structure and Alloy tokens.
 */
export function ProgramsObjectSelector({
    programs,
    selectedId,
    filter,
    onFilterChange,
    search,
    onSearchChange,
    canMutate,
    onAddProgram,
    onSelect,
    totalCount,
}: {
    programs: ProgramOperatorRow[];
    selectedId: string | null;
    filter: ProgramsLifecycleFilter;
    onFilterChange: (filter: ProgramsLifecycleFilter) => void;
    search: string;
    onSearchChange: (value: string) => void;
    canMutate: boolean;
    onAddProgram: () => void;
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

    const cycleFilter = () => {
        if (filter === "active") onFilterChange("archived");
        else if (filter === "archived") onFilterChange("all");
        else onFilterChange("active");
    };

    const filterLabel =
        filter === "active" ? "Active" : filter === "archived" ? "Archived" : "All";

    return (
        <aside
            className="locations-collection-rail process-config-setup-card hidden min-w-0 max-w-full self-start overflow-hidden p-0 xl:block"
            aria-label="Program selector"
            data-testid="programs-object-selector"
        >
            <header className="locations-collection-rail__header" data-testid="programs-nav-collection-header">
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <h2 className="locations-collection-rail__title">Programs</h2>
                        {canMutate ?
                            <ConfigurationPrimaryButton
                                className="shrink-0 gap-1 px-2 py-1 text-[11px]"
                                onClick={onAddProgram}
                                data-testid="programs-nav-add-program"
                            >
                                <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                                Add Program
                            </ConfigurationPrimaryButton>
                        :   null}
                    </div>
                    <p className="locations-collection-rail__count">
                        {programs.length === totalCount
                            ? `${totalCount} Program${totalCount === 1 ? "" : "s"}`
                            : `${programs.length} of ${totalCount} Programs`}
                        {" · "}
                        {filterLabel}
                    </p>
                </div>
            </header>

            <div className="locations-collection-rail__controls" data-testid="programs-nav-controls">
                <label className="sr-only" htmlFor="programs-search">
                    Search Programs
                </label>
                <div className="locations-collection-rail__search-wrap">
                    <Search className="locations-collection-rail__search-icon" strokeWidth={2} aria-hidden />
                    <input
                        id="programs-search"
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search Programs…"
                        className="locations-collection-rail__search"
                        data-testid="programs-nav-search"
                    />
                </div>
                <button
                    type="button"
                    className={`locations-collection-rail__filter ${
                        filter !== "active" ? "locations-collection-rail__filter--active" : ""
                    }`}
                    aria-pressed={filter !== "active"}
                    aria-label={`Filter: ${filterLabel}. Click to change.`}
                    title={`Showing ${filterLabel}`}
                    onClick={cycleFilter}
                    data-testid="programs-nav-filter"
                >
                    <ListFilter className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
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
