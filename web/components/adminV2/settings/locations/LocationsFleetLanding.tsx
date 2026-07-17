"use client";

import { ArrowUpRight } from "lucide-react";
import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import type {
    LocationsFleetLocationSummary,
    LocationsFleetModel,
} from "@/lib/locations/locationWorkspaceModel";

function formatCapacity(value: number | null): string {
    if (value == null) return "Not assessed";
    return value.toLocaleString();
}

function LocationFleetTile({
    location,
    onOpen,
}: {
    location: LocationsFleetLocationSummary;
    onOpen: () => void;
}) {
    const attention = location.topAttention;
    const attentionLabel =
        attention?.grade === "fix" ? "Needs attention"
        : attention?.grade === "improve" ? "Improve"
        : "No current attention";

    return (
        <article
            className="h-full overflow-hidden rounded-xl border border-alloy-forge/10 bg-white shadow-[0_1px_2px_rgba(19,33,43,0.04)]"
            data-config-object="location"
        >
            <button
                type="button"
                className="flex h-full w-full flex-col text-left transition-colors hover:bg-alloy-bend-pine/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/35"
                onClick={onOpen}
                data-testid={`locations-fleet-tile-${location.id}`}
            >
                <div className="flex flex-1 flex-col px-3.5 pb-2.5 pt-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h3 className="truncate text-[14px] font-semibold tracking-tight text-alloy-midnight">
                                {location.displayName}
                            </h3>
                            <p className="mt-0.5 truncate text-[10px] text-alloy-midnight/48">
                                {location.locality ?? "Local identity not assessed"}
                            </p>
                        </div>
                        <span
                            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                                location.isActive ?
                                    "border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.07] text-alloy-bend-pine"
                                :   "border-alloy-forge/10 bg-alloy-stone/[0.08] text-alloy-midnight/45"
                            }`}
                        >
                            {location.isActive ? "Active" : "Inactive"}
                        </span>
                    </div>

                    <dl className="mt-2 grid grid-cols-3 divide-x divide-alloy-stone/20 border-y border-alloy-stone/20 py-1.5">
                        <div className="pr-2">
                            <dt className="text-[9px] text-alloy-midnight/40">Rooms</dt>
                            <dd className="mt-0.5 text-[11px] font-semibold text-alloy-midnight">
                                {location.activeRoomCount}
                            </dd>
                        </div>
                        <div className="px-2">
                            <dt className="text-[9px] text-alloy-midnight/40">Programs</dt>
                            <dd className="mt-0.5 text-[11px] font-semibold text-alloy-midnight">
                                {location.activeProgramCount}
                            </dd>
                        </div>
                        <div className="pl-2">
                            <dt className="text-[9px] text-alloy-midnight/40">Capacity</dt>
                            <dd className="mt-0.5 truncate text-[11px] font-semibold text-alloy-midnight">
                                {formatCapacity(location.configuredCapacity)}
                            </dd>
                        </div>
                    </dl>

                    <div className="mt-2">
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="text-alloy-midnight/45">Operational readiness</span>
                            <span className="font-semibold text-alloy-midnight">{location.setupPercent}%</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-alloy-stone/25">
                            <div
                                className="h-full rounded-full bg-alloy-bend-pine"
                                style={{ width: `${Math.min(100, Math.max(0, location.setupPercent))}%` }}
                            />
                        </div>
                    </div>

                    <p
                        className={`mt-2 line-clamp-1 text-[10px] ${
                            attention?.grade === "fix" ? "text-amber-800"
                            : attention?.grade === "improve" ? "text-blue-800"
                            : "text-alloy-midnight/45"
                        }`}
                        title={attention?.label}
                    >
                        <span className="font-semibold">{attentionLabel}</span>
                        {attention ? ` · ${attention.label}` : ""}
                    </p>
                </div>

                <span className="flex w-full items-center justify-between border-t border-alloy-stone/25 bg-alloy-stone/[0.025] px-3.5 py-1.5 text-[11px] font-semibold text-alloy-bend-pine">
                    Open location
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </span>
            </button>
        </article>
    );
}

export default function LocationsFleetLanding({
    fleet,
    showInactive,
    onShowInactiveChange,
    search,
    onSearchChange,
    onOpenLocation,
    onAddLocation,
    canMutate,
}: {
    fleet: LocationsFleetModel;
    showInactive: boolean;
    onShowInactiveChange: (next: boolean) => void;
    search: string;
    onSearchChange: (next: string) => void;
    onOpenLocation: (locationId: string) => void;
    onAddLocation: () => void;
    canMutate: boolean;
}) {
    const visible = fleet.locations.filter((location) => {
        if (!showInactive && !location.isActive) return false;
        const query = search.trim().toLowerCase();
        if (!query) return true;
        return [location.displayName, location.locality]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value.includes(query));
    });

    const readinessLabel =
        fleet.locationCount === 0 ? "No locations yet"
        : fleet.totalCritical > 0 ?
            `${fleet.totalCritical} ${fleet.totalCritical === 1 ? "item needs" : "items need"} attention`
        : fleet.totalImprove > 0 ?
            `${fleet.totalImprove} ${fleet.totalImprove === 1 ? "improvement" : "improvements"} available`
        :   "No current attention";

    return (
        <div className="flex flex-col gap-2.5" data-testid="locations-fleet-landing">
            <section data-testid="locations-fleet-objects">
                <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                    <div className="mr-auto">
                        <h2 className="config-typo-workspace-title">Locations</h2>
                        <p className="text-[10px] text-alloy-midnight/42">
                            {visible.length} of {fleet.locationCount} shown
                        </p>
                    </div>
                    <label className="sr-only" htmlFor="locations-fleet-search">
                        Search locations
                    </label>
                    <input
                        id="locations-fleet-search"
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search locations"
                        className="config-runtime-input max-w-[15rem]"
                        data-testid="locations-fleet-search"
                    />
                    <label className="flex items-center gap-1.5 text-[11px] text-alloy-midnight/55">
                        <input
                            type="checkbox"
                            checked={showInactive}
                            onChange={(event) => onShowInactiveChange(event.target.checked)}
                            data-testid="locations-fleet-show-inactive"
                        />
                        Inactive
                    </label>
                    {canMutate ?
                        <ConfigurationPrimaryButton
                            className="px-2.5 py-1.5"
                            onClick={onAddLocation}
                            data-testid="locations-fleet-add-location"
                        >
                            Add Location
                        </ConfigurationPrimaryButton>
                    :   null}
                </div>

                {visible.length === 0 ?
                    <div
                        className="rounded-xl border border-alloy-forge/10 bg-white px-4 py-7 text-center"
                        data-testid="locations-fleet-empty"
                    >
                        <p className="text-sm font-medium text-alloy-midnight">
                            {fleet.locationCount === 0 ? "Add your first location" : "No locations match"}
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            {fleet.locationCount === 0 ?
                                "Locations are the operational root for programs, rooms, schedules, and tours."
                            :   "Try a different search or include inactive locations."}
                        </p>
                        {canMutate && fleet.locationCount === 0 ?
                            <ConfigurationPrimaryButton className="mt-3" onClick={onAddLocation}>
                                Add Location
                            </ConfigurationPrimaryButton>
                        :   null}
                    </div>
                :   <div
                        className="grid auto-rows-fr items-stretch gap-2 md:grid-cols-2 xl:grid-cols-3"
                        data-testid="locations-fleet-grid"
                    >
                        {visible.map((location) => (
                            <LocationFleetTile
                                key={location.id}
                                location={location}
                                onOpen={() => onOpenLocation(location.id)}
                            />
                        ))}
                    </div>
                }
            </section>

            <div className="grid items-stretch gap-2.5 xl:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
                <ConfigWorkspaceCard
                    title="Needs Attention"
                    compact
                    className="h-full"
                    testId="locations-fleet-attention-list"
                >
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                        <p className="font-semibold text-alloy-midnight/65">{readinessLabel}</p>
                        <p className="text-alloy-midnight/42">
                            {fleet.locationsNeedingAttention}{" "}
                            {fleet.locationsNeedingAttention === 1 ? "location" : "locations"}
                        </p>
                    </div>
                    {fleet.attentionHighlights.length > 0 ?
                        <ul className="grid gap-1.5 sm:grid-cols-2">
                            {fleet.attentionHighlights.map((highlight) => (
                                <li key={`${highlight.locationId}-${highlight.item.key}`}>
                                    <button
                                        type="button"
                                        className="h-full w-full rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.025] px-2.5 py-2 text-left transition-colors hover:bg-alloy-bend-pine/[0.04]"
                                        onClick={() => onOpenLocation(highlight.locationId)}
                                        data-testid={`locations-fleet-attention-${highlight.locationId}`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span
                                                className={`mt-px ${
                                                    highlight.item.grade === "fix" ? "text-amber-700" : "text-blue-700"
                                                }`}
                                                aria-hidden="true"
                                            >
                                                {highlight.item.grade === "fix" ? "⚠" : "ⓘ"}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[11px] font-semibold text-alloy-midnight">
                                                    {highlight.item.label}
                                                </p>
                                                {highlight.item.consequence ?
                                                    <p className="mt-0.5 line-clamp-1 text-[10px] text-alloy-midnight/52">
                                                        {highlight.item.consequence}
                                                    </p>
                                                :   null}
                                                <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                                                    <span className="truncate text-alloy-midnight/42">
                                                        {highlight.locationName}
                                                    </span>
                                                    <span className="shrink-0 font-semibold text-alloy-bend-pine">
                                                        {highlight.item.nextLabel ?? "Open"} →
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    :   <p className="rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.025] px-2.5 py-2 text-[11px] text-alloy-midnight/50">
                            No current fleet attention.
                        </p>
                    }
                </ConfigWorkspaceCard>

                <ConfigWorkspaceCard
                    title="Fleet Summary"
                    compact
                    className="h-full"
                    testId="locations-fleet-summary"
                >
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                        <div>
                            <dt className="text-alloy-midnight/42">Locations</dt>
                            <dd className="mt-0.5 font-semibold text-alloy-midnight">
                                {fleet.activeLocationCount}
                                {fleet.inactiveLocationCount > 0 ?
                                    <span className="ml-1 font-normal text-alloy-midnight/42">
                                        +{fleet.inactiveLocationCount} inactive
                                    </span>
                                :   null}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-alloy-midnight/42">Rooms</dt>
                            <dd className="mt-0.5 font-semibold text-alloy-midnight">{fleet.totalRooms}</dd>
                        </div>
                        <div>
                            <dt className="text-alloy-midnight/42">Programs offered</dt>
                            <dd className="mt-0.5 font-semibold text-alloy-midnight">{fleet.totalPrograms}</dd>
                        </div>
                        <div>
                            <dt className="text-alloy-midnight/42">Known capacity</dt>
                            <dd className="mt-0.5 font-semibold text-alloy-midnight">
                                {formatCapacity(fleet.totalConfiguredCapacity)}
                            </dd>
                        </div>
                    </dl>
                    <div className="mt-2 border-t border-alloy-stone/20 pt-2">
                        <div className="flex items-center justify-between text-[10px]">
                            <span className="text-alloy-midnight/42">Average readiness</span>
                            <span className="font-semibold text-alloy-midnight">{fleet.averageSetupPercent}%</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-alloy-stone/25">
                            <div
                                className="h-full rounded-full bg-alloy-bend-pine"
                                style={{ width: `${Math.min(100, Math.max(0, fleet.averageSetupPercent))}%` }}
                            />
                        </div>
                    </div>
                </ConfigWorkspaceCard>
            </div>
        </div>
    );
}
