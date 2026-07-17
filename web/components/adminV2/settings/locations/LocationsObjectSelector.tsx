"use client";

import { useCallback, useRef, type KeyboardEvent } from "react";
import { ChevronRight, ListFilter, MapPin, Plus, Search } from "lucide-react";
import { formatLocationShortPlaceLine } from "@/lib/locations/locationIdentityPresentation";
import { locationSelectorAttentionSignal } from "@/lib/locations/locationSelectorSignal";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

type FleetSummary = {
    criticalCount: number;
    locality: string | null;
    isActive: boolean;
};

/**
 * Locations collection rail — first-class object selector with place identity,
 * not a compact filter queue.
 */
export function LocationsObjectSelector({
    sites,
    selectedId,
    showInactive,
    onShowInactiveChange,
    search,
    onSearchChange,
    canMutate,
    onAddLocation,
    onSelect,
    fleetById,
}: {
    sites: LocationHierarchyRow[];
    selectedId: string | null;
    showInactive: boolean;
    onShowInactiveChange: (show: boolean) => void;
    search: string;
    onSearchChange: (value: string) => void;
    canMutate: boolean;
    onAddLocation: () => void;
    onSelect: (locationId: string) => void;
    fleetById: Map<string, FleetSummary>;
}) {
    const listRef = useRef<HTMLDivElement>(null);

    const focusRowAt = useCallback((index: number) => {
        const root = listRef.current;
        if (!root) return;
        const options = root.querySelectorAll<HTMLButtonElement>('[role="option"]');
        const target = options[index];
        if (!target) return;
        target.focus();
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
            const siteId = sites[next]?.id;
            if (siteId) onSelect(siteId);
            focusRowAt(next);
        },
        [focusRowAt, onSelect, sites],
    );

    return (
        <aside
            className="locations-collection-rail process-config-setup-card hidden min-w-0 max-w-full self-start overflow-hidden p-0 xl:block"
            aria-label="Location selector"
            data-testid="locations-object-selector"
        >
            <header className="locations-collection-rail__header" data-testid="locations-nav-collection-header">
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <h2 className="locations-collection-rail__title">Locations</h2>
                        {canMutate ?
                            <ConfigurationPrimaryButton
                                className="shrink-0 gap-1 px-2 py-1 text-[11px]"
                                onClick={onAddLocation}
                                data-testid="locations-nav-add-location"
                            >
                                <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                                Add location
                            </ConfigurationPrimaryButton>
                        :   null}
                    </div>
                    <p className="locations-collection-rail__count">{sites.length} shown</p>
                </div>
            </header>

            <div className="locations-collection-rail__controls" data-testid="locations-nav-controls">
                <label className="sr-only" htmlFor="locations-search">
                    Search locations
                </label>
                <div className="locations-collection-rail__search-wrap">
                    <Search
                        className="locations-collection-rail__search-icon"
                        strokeWidth={2}
                        aria-hidden
                    />
                    <input
                        id="locations-search"
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search locations…"
                        className="locations-collection-rail__search"
                        data-testid="locations-nav-search"
                    />
                </div>
                <button
                    type="button"
                    className={`locations-collection-rail__filter ${
                        showInactive ? "locations-collection-rail__filter--active" : ""
                    }`}
                    aria-pressed={showInactive}
                    aria-label={showInactive ? "Hide inactive locations" : "Show inactive locations"}
                    title={showInactive ? "Hide inactive" : "Show inactive"}
                    onClick={() => onShowInactiveChange(!showInactive)}
                    data-testid="locations-nav-filter-inactive"
                >
                    <ListFilter className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
            </div>

            <div
                ref={listRef}
                className="locations-collection-rail__list"
                role="listbox"
                aria-label="Locations"
                onKeyDown={onListKeyDown}
                data-testid="locations-nav-list"
            >
                {sites.map((site) => {
                    const summary = fleetById.get(site.id);
                    const placeLine =
                        formatLocationShortPlaceLine({
                            address1: site.address1,
                            city: site.city,
                            state: site.state,
                        }) ??
                        summary?.locality ??
                        null;
                    const inactive = site.is_active === false;
                    const selected = site.id === selectedId;
                    const attention = locationSelectorAttentionSignal(summary?.criticalCount ?? 0);
                    const name = String(site.label ?? "").trim() || "Untitled location";

                    return (
                        <button
                            key={site.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            aria-current={selected ? "true" : undefined}
                            className={`${QUEUE_ROW_CARD_SHELL_CLASS} locations-collection-row focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-bend-pine ${
                                selected ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                            } ${inactive ? "locations-collection-row--inactive" : ""}`}
                            onClick={() => onSelect(site.id)}
                            data-testid={`locations-location-${site.id}`}
                        >
                            {selected ?
                                <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} />
                            :   null}
                            <span
                                className={`locations-collection-row__glyph ${
                                    inactive ?
                                        "text-alloy-midnight/30"
                                    : selected ?
                                        "text-alloy-bend-pine"
                                    :   "text-alloy-bend-pine/75"
                                }`}
                                aria-hidden
                            >
                                <MapPin className="h-4 w-4" strokeWidth={2} />
                            </span>
                            <span className="locations-collection-row__body">
                                <span className="locations-collection-row__name">{name}</span>
                                {placeLine ?
                                    <span className="locations-collection-row__place">{placeLine}</span>
                                :   null}
                                <span className="locations-collection-row__meta">
                                    <span
                                        className={`locations-collection-row__status ${
                                            inactive ?
                                                "locations-collection-row__status--inactive"
                                            :   "locations-collection-row__status--active"
                                        }`}
                                    >
                                        {inactive ? "Inactive" : "Active"}
                                    </span>
                                    {attention && !inactive ?
                                        <span className="locations-collection-row__attention">{attention}</span>
                                    :   null}
                                </span>
                            </span>
                            {selected ?
                                <ChevronRight
                                    className="locations-collection-row__chevron"
                                    strokeWidth={2}
                                    aria-hidden
                                />
                            :   null}
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}
