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
 * Locations portfolio landing — retained right workspace when URL has no locationId.
 * Orientation only; the left collection rail remains the selector.
 */
export default function LocationsLanding({
    collection,
    onOpenLocation,
    onAddLocation,
    canMutate,
}: {
    collection: LocationsCollectionModel;
    showInactive?: boolean;
    onShowInactiveChange?: (next: boolean) => void;
    search?: string;
    onSearchChange?: (next: string) => void;
    onOpenLocation: (locationId: string, tab?: LocationWorkspaceTab | "general") => void;
    onAddLocation: () => void;
    canMutate: boolean;
}) {
    const activeLocations = collection.locations.filter((location) => location.isActive);
    const glanceRows = activeLocations.slice(0, 12);
    const totalProgramsOffered = collection.totalPrograms;
    const totalCapacity = collection.totalConfiguredCapacity;

    return (
        <div className="flex w-full flex-col gap-3" data-testid="locations-landing">
            <section className="process-config-setup-card p-5" data-testid="locations-landing-header">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">Locations</h2>
                        <p className="mt-1.5 max-w-2xl text-sm text-alloy-midnight/55">
                            The places where your organization operates.
                        </p>
                    </div>
                    {canMutate ?
                        <ConfigurationPrimaryButton
                            onClick={onAddLocation}
                            data-testid="locations-add-location"
                        >
                            Add Location
                        </ConfigurationPrimaryButton>
                    :   null}
                </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="locations-landing-summary">
                <ConfigWorkspaceCard compact className="h-full" testId="locations-landing-active-count">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Active Locations
                    </p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                        {collection.activeLocationCount}
                    </p>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full" testId="locations-landing-programs-count">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Programs Offered
                    </p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                        {totalProgramsOffered}
                    </p>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full" testId="locations-landing-rooms-count">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Rooms
                    </p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                        {collection.totalRooms}
                    </p>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full" testId="locations-landing-capacity-count">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Total Capacity
                    </p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                        {totalCapacity == null ? "—" : totalCapacity}
                    </p>
                </ConfigWorkspaceCard>
            </div>

            <ConfigWorkspaceCard compact testId="locations-list-card">
                <p className="text-sm font-semibold text-alloy-midnight">Locations at a glance</p>
                <p className="mt-0.5 text-[12px] text-alloy-midnight/50">
                    Select a Location in the collection to configure Programs, Rooms, and schedules.
                </p>

                {glanceRows.length === 0 ?
                    <div className="mt-4 px-1 py-6 text-center" data-testid="locations-empty">
                        <p className="text-sm font-medium text-alloy-midnight">
                            {collection.locationCount === 0 ? "Add your first Location" : "No active Locations"}
                        </p>
                        <p className="mt-1 text-sm text-alloy-midnight/55">
                            {collection.locationCount === 0 ?
                                "Locations are where Programs, Rooms, and schedule definitions come together."
                            :   "Include inactive Locations from the collection filters if needed."}
                        </p>
                        {canMutate && collection.locationCount === 0 ?
                            <ConfigurationPrimaryButton className="mt-4" onClick={onAddLocation}>
                                Add Location
                            </ConfigurationPrimaryButton>
                        :   null}
                    </div>
                :   <ul
                        className="mt-2 divide-y divide-alloy-forge/10"
                        data-testid="locations-list"
                        data-scroll-mode="natural"
                    >
                        {glanceRows.map((location) => (
                            <li key={location.id}>
                                <button
                                    type="button"
                                    className="grid min-h-[3.25rem] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 text-left transition-colors hover:bg-alloy-bend-pine/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/30"
                                    onClick={() => onOpenLocation(location.id)}
                                    data-testid={`locations-row-${location.id}`}
                                >
                                    <div className="min-w-0">
                                        <span className="text-sm font-semibold text-alloy-midnight">
                                            {location.displayName}
                                        </span>
                                        {location.locality ?
                                            <p className="mt-0.5 text-[12px] text-alloy-midnight/50">
                                                {location.locality}
                                            </p>
                                        :   null}
                                    </div>
                                    <span className="shrink-0 text-sm text-alloy-midnight/55">
                                        {[
                                            `${location.activeProgramCount} ${location.activeProgramCount === 1 ? "Program" : "Programs"}`,
                                            `${location.activeRoomCount} ${location.activeRoomCount === 1 ? "Room" : "Rooms"}`,
                                            location.configuredCapacity != null ?
                                                `Capacity ${location.configuredCapacity}`
                                            :   null,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                }
            </ConfigWorkspaceCard>
        </div>
    );
}
