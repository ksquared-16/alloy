"use client";

import { useCallback, useRef, type KeyboardEvent } from "react";
import { Banknote, Search } from "lucide-react";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import type { TuitionPlanCollectionRow } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";

export type TuitionPlansLifecycleFilter = "active" | "archived" | "all";

/**
 * Tuition Plans collection rail — one row per offering (plan).
 */
export function TuitionPlansObjectSelector({
    plans,
    selectedId,
    filter,
    onFilterChange,
    search,
    onSearchChange,
    onSelect,
    totalCount,
}: {
    plans: TuitionPlanCollectionRow[];
    selectedId: string | null;
    filter: TuitionPlansLifecycleFilter;
    onFilterChange: (filter: TuitionPlansLifecycleFilter) => void;
    search: string;
    onSearchChange: (value: string) => void;
    onSelect: (planId: string) => void;
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
            const planId = plans[next]?.id;
            if (planId) onSelect(planId);
            focusRowAt(next);
        },
        [focusRowAt, onSelect, plans],
    );

    const filterLabel = filter === "active" ? "Active" : filter === "archived" ? "Archived" : "All";

    return (
        <aside
            className="locations-collection-rail process-config-setup-card hidden min-w-0 max-w-full self-start overflow-hidden p-0 xl:block"
            aria-label="Tuition Plan selector"
            data-testid="tuition-plans-object-selector"
        >
            <header className="locations-collection-rail__header" data-testid="tuition-plans-nav-collection-header">
                <div className="min-w-0 flex-1">
                    <h2 className="locations-collection-rail__title">Tuition Plans</h2>
                    <p className="locations-collection-rail__count">
                        {plans.length === totalCount
                            ? `${totalCount} Plan${totalCount === 1 ? "" : "s"}`
                            : `${plans.length} of ${totalCount} Plans`}
                        {" · "}
                        {filterLabel}
                    </p>
                </div>
            </header>

            <div className="programs-collection-controls" data-testid="tuition-plans-nav-controls">
                <label className="sr-only" htmlFor="tuition-plans-search">
                    Search Tuition Plans
                </label>
                <div className="programs-collection-controls__search-wrap">
                    <Search
                        className="programs-collection-controls__search-icon"
                        strokeWidth={2}
                        aria-hidden
                    />
                    <input
                        id="tuition-plans-search"
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search Tuition Plans…"
                        className="programs-collection-controls__search"
                        data-testid="tuition-plans-nav-search"
                    />
                </div>
                <div className="programs-collection-controls__row">
                    <label className="programs-collection-controls__field min-w-0">
                        <span className="sr-only">Status</span>
                        <select
                            className="programs-collection-controls__select"
                            value={filter}
                            onChange={(event) =>
                                onFilterChange(event.target.value as TuitionPlansLifecycleFilter)
                            }
                            data-testid="tuition-plans-nav-filter"
                            aria-label="Filter Tuition Plans by status"
                        >
                            <option value="active">Active</option>
                            <option value="archived">Archived</option>
                            <option value="all">All</option>
                        </select>
                    </label>
                </div>
            </div>

            <div
                ref={listRef}
                className="locations-collection-rail__list"
                role="listbox"
                aria-label="Tuition Plans"
                onKeyDown={onListKeyDown}
                data-testid="tuition-plans-nav-list"
            >
                {plans.length === 0 ?
                    <p className="px-3 py-4 text-sm text-alloy-midnight/50" data-testid="tuition-plans-nav-empty">
                        No Tuition Plans match this filter.
                    </p>
                :   plans.map((plan) => {
                        const selected = plan.id === selectedId;
                        const archived = plan.status === "archived";
                        return (
                            <button
                                key={plan.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                aria-current={selected ? "true" : undefined}
                                className={`${QUEUE_ROW_CARD_SHELL_CLASS} locations-collection-row focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-bend-pine ${
                                    selected ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                                } ${archived ? "locations-collection-row--inactive" : ""}`}
                                onClick={() => onSelect(plan.id)}
                                data-testid={`tuition-plans-plan-${plan.id}`}
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
                                    <Banknote className="h-4 w-4" strokeWidth={2} />
                                </span>
                                <span className="locations-collection-row__body">
                                    <span className="locations-collection-row__name flex items-center gap-2">
                                        <span className="min-w-0 truncate">{plan.name}</span>
                                        <span
                                            className={`locations-collection-row__status shrink-0 ${
                                                archived
                                                    ? "locations-collection-row__status--inactive"
                                                    : "locations-collection-row__status--active"
                                            }`}
                                        >
                                            {plan.statusLabel}
                                        </span>
                                    </span>
                                    <span className="locations-collection-row__place">
                                        {plan.programLabel}
                                        {" · "}
                                        {plan.careFormatLabel}
                                    </span>
                                    <span className="locations-collection-row__meta text-alloy-midnight/50">
                                        {plan.billingFrequencyLabel}
                                        {!plan.hasRevenueGl ?
                                            <>
                                                {" · "}
                                                <span className="text-alloy-midnight/40">Needs GL</span>
                                            </>
                                        :   null}
                                        {!plan.priceRangeLabel ?
                                            <>
                                                {" · "}
                                                <span className="text-alloy-midnight/40">No prices</span>
                                            </>
                                        :   <>
                                                {" · "}
                                                {plan.priceRangeLabel}
                                            </>
                                        }
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
