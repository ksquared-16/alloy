"use client";

import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import type {
    LocationsCollectionModel,
    LocationWorkspaceTab,
} from "@/lib/locations/locationWorkspaceModel";

export function locationsCollectionUsesBoundedScroll(locationCount: number): boolean {
    return locationCount >= 7;
}

/**
 * Locations no-selection landing — calm orientation (not readiness / analytics).
 */
export default function LocationsLanding({
    collection,
    showInactive,
    onShowInactiveChange,
    search,
    onSearchChange,
    onOpenLocation,
    onAddLocation,
    canMutate,
}: {
    collection: LocationsCollectionModel;
    showInactive: boolean;
    onShowInactiveChange: (next: boolean) => void;
    search: string;
    onSearchChange: (next: string) => void;
    onOpenLocation: (locationId: string, tab?: LocationWorkspaceTab | "general") => void;
    onAddLocation: () => void;
    canMutate: boolean;
}) {
    const visible = collection.locations.filter((location) => {
        if (!showInactive && !location.isActive) return false;
        const query = search.trim().toLowerCase();
        if (!query) return true;
        return [location.displayName, location.locality]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value.includes(query));
    });

    const locationsOfferingPrograms = collection.locations.filter(
        (location) => location.isActive && location.activeProgramCount > 0,
    ).length;

    return (
        <div className="flex w-full flex-col gap-3" data-testid="locations-landing">
            <section className="process-config-setup-card p-5" data-testid="locations-landing-header">
                <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">Locations</h2>
                <p className="mt-1.5 max-w-2xl text-sm text-alloy-midnight/55">
                    Where your organization offers Programs, Rooms, and schedule patterns.
                </p>
            </section>

            <div className="grid gap-3 sm:grid-cols-3" data-testid="locations-landing-summary">
                <ConfigWorkspaceCard compact className="h-full" testId="locations-landing-active-count">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Active Locations
                    </p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                        {collection.activeLocationCount}
                    </p>
                    {collection.inactiveLocationCount > 0 ?
                        <p className="mt-0.5 text-[12px] text-alloy-midnight/45">
                            +{collection.inactiveLocationCount} inactive
                        </p>
                    :   null}
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full" testId="locations-landing-rooms-count">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Rooms
                    </p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                        {collection.totalRooms}
                    </p>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full" testId="locations-landing-programs-count">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Locations Offering Programs
                    </p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                        {locationsOfferingPrograms}
                    </p>
                </ConfigWorkspaceCard>
            </div>

            <ConfigWorkspaceCard compact testId="locations-list-card">
                <div className="mb-2.5 flex flex-wrap items-start gap-3">
                    <div className="mr-auto">
                        <p className="text-sm font-semibold text-alloy-midnight">Locations</p>
                        <p className="mt-0.5 text-[12px] text-alloy-midnight/50">
                            {visible.length} {visible.length === 1 ? "Location" : "Locations"}
                        </p>
                    </div>
                    <label className="sr-only" htmlFor="locations-landing-search">
                        Search Locations
                    </label>
                    <input
                        id="locations-landing-search"
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search Locations…"
                        className="config-runtime-input max-w-xs flex-1"
                        data-testid="locations-search"
                    />
                    <label className="flex items-center gap-1.5 self-center text-[11px] text-alloy-midnight/55">
                        <input
                            type="checkbox"
                            checked={showInactive}
                            onChange={(event) => onShowInactiveChange(event.target.checked)}
                            data-testid="locations-show-inactive"
                        />
                        Inactive
                    </label>
                    {canMutate ?
                        <ConfigurationPrimaryButton
                            onClick={onAddLocation}
                            data-testid="locations-add-location"
                        >
                            Add Location
                        </ConfigurationPrimaryButton>
                    :   null}
                </div>

                {visible.length === 0 ?
                    <div className="px-1 py-8 text-center" data-testid="locations-empty">
                        <p className="text-sm font-medium text-alloy-midnight">
                            {collection.locationCount === 0 ? "Add your first Location" : "No Locations match"}
                        </p>
                        <p className="mt-1 text-sm text-alloy-midnight/55">
                            {collection.locationCount === 0 ?
                                "Locations are where Programs, Rooms, and schedule patterns come together."
                            :   "Try a different search or include inactive Locations."}
                        </p>
                        {canMutate && collection.locationCount === 0 ?
                            <ConfigurationPrimaryButton className="mt-4" onClick={onAddLocation}>
                                Add Location
                            </ConfigurationPrimaryButton>
                        :   null}
                    </div>
                :   <ul
                        className={`divide-y divide-alloy-forge/10 ${
                            locationsCollectionUsesBoundedScroll(visible.length) ?
                                "max-h-[28rem] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
                            :   ""
                        }`}
                        data-testid="locations-list"
                        data-scroll-mode={
                            locationsCollectionUsesBoundedScroll(visible.length) ? "bounded" : "natural"
                        }
                    >
                        {visible.map((location) => (
                            <li key={location.id}>
                                <button
                                    type="button"
                                    className="grid min-h-[3.75rem] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-1 py-2.5 text-left transition-colors hover:bg-alloy-bend-pine/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/30"
                                    onClick={() => onOpenLocation(location.id)}
                                    data-testid={`locations-row-${location.id}`}
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-alloy-midnight">
                                                {location.displayName}
                                            </span>
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                    location.isActive ?
                                                        "bg-alloy-bend-pine/10 text-[#007d68]"
                                                    :   "bg-alloy-stone/20 text-alloy-midnight/55"
                                                }`}
                                            >
                                                {location.isActive ? "Active" : "Inactive"}
                                            </span>
                                        </div>
                                        {location.locality ?
                                            <p className="mt-0.5 text-[12px] text-alloy-midnight/50">
                                                {location.locality}
                                            </p>
                                        :   null}
                                        <p className="mt-1 text-[12px] text-alloy-midnight/45">
                                            {[
                                                `${location.activeProgramCount} ${location.activeProgramCount === 1 ? "Program" : "Programs"}`,
                                                `${location.activeRoomCount} ${location.activeRoomCount === 1 ? "room" : "rooms"}`,
                                                location.configuredCapacity != null ?
                                                    `${location.configuredCapacity} capacity`
                                                :   null,
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </p>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                }
            </ConfigWorkspaceCard>
        </div>
    );
}
