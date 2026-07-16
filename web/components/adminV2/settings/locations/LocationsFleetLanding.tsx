"use client";

import type { ReactNode } from "react";
import type { LocationsFleetModel } from "@/lib/locations/locationWorkspaceModel";

function FleetCard({
    title,
    description,
    icon,
    children,
    testId,
}: {
    title: string;
    description?: string;
    icon?: string;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <section className="process-config-setup-card p-3.5" data-testid={testId}>
            <div className="mb-2.5 flex items-center gap-2">
                {icon ?
                    <span className="text-base text-[#007d68]" aria-hidden>
                        {icon}
                    </span>
                :   null}
                <div>
                    <h2 className="text-[13px] font-semibold tracking-tight text-alloy-midnight">{title}</h2>
                    {description ?
                        <p className="config-typo-sublabel mt-0.5">{description}</p>
                    :   null}
                </div>
            </div>
            {children}
        </section>
    );
}

function formatCapacity(value: number | null): string {
    if (value == null) return "Not set up yet";
    return `${value.toLocaleString()} capacity`;
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
        :   "Everything looks good";

    return (
        <div className="space-y-4" data-testid="locations-fleet-landing">
            <div className="grid gap-4 lg:grid-cols-3" data-testid="locations-fleet-rollups">
                <FleetCard title="Operational readiness" icon="◎" testId="locations-fleet-readiness">
                    <p className="text-xl font-semibold tracking-tight text-alloy-midnight">
                        {fleet.averageSetupPercent}%
                    </p>
                    <p className="config-typo-sublabel mt-1">
                        {fleet.locationsSetupComplete} of {fleet.locationCount}{" "}
                        {fleet.locationCount === 1 ? "location" : "locations"} fully configured
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-alloy-stone/25">
                        <div
                            className="h-full rounded-full bg-[#00a283]"
                            style={{ width: `${Math.min(100, Math.max(0, fleet.averageSetupPercent))}%` }}
                        />
                    </div>
                </FleetCard>

                <FleetCard title="Needs attention" icon="⚠" testId="locations-fleet-attention-summary">
                    <p className="text-xl font-semibold tracking-tight text-alloy-midnight">{readinessLabel}</p>
                    <p className="config-typo-sublabel mt-1">
                        {fleet.locationsNeedingAttention}{" "}
                        {fleet.locationsNeedingAttention === 1 ? "location" : "locations"} need follow-up
                    </p>
                </FleetCard>

                <FleetCard title="Inventory" icon="▦" testId="locations-fleet-inventory">
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-alloy-midnight/80">
                        <div>
                            <dt className="config-typo-sublabel">Locations</dt>
                            <dd className="font-semibold text-alloy-midnight">
                                {fleet.activeLocationCount}
                                {fleet.inactiveLocationCount > 0 ?
                                    <span className="ml-1 font-normal text-alloy-midnight/45">
                                        (+{fleet.inactiveLocationCount} inactive)
                                    </span>
                                :   null}
                            </dd>
                        </div>
                        <div>
                            <dt className="config-typo-sublabel">Rooms</dt>
                            <dd className="font-semibold text-alloy-midnight">{fleet.totalRooms}</dd>
                        </div>
                        <div>
                            <dt className="config-typo-sublabel">Programs</dt>
                            <dd className="font-semibold text-alloy-midnight">{fleet.totalPrograms}</dd>
                        </div>
                        <div>
                            <dt className="config-typo-sublabel">Capacity</dt>
                            <dd className="font-semibold text-alloy-midnight">
                                {formatCapacity(fleet.totalConfiguredCapacity)}
                            </dd>
                        </div>
                    </dl>
                </FleetCard>
            </div>

            {fleet.attentionHighlights.length > 0 ?
                <FleetCard
                    title="Needs attention"
                    description="Highest-impact items across locations."
                    testId="locations-fleet-attention-list"
                >
                    <ul className="divide-y divide-alloy-forge/10">
                        {fleet.attentionHighlights.map((highlight) => (
                            <li
                                key={`${highlight.locationId}-${highlight.item.key}`}
                                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                            >
                                <span
                                    className={
                                        highlight.item.grade === "fix" ? "text-amber-700" : "text-blue-700"
                                    }
                                    aria-hidden="true"
                                >
                                    {highlight.item.grade === "fix" ? "⚠" : "ⓘ"}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-alloy-midnight/80">{highlight.item.label}</p>
                                    <p className="config-typo-sublabel mt-0.5">{highlight.locationName}</p>
                                </div>
                                <button
                                    type="button"
                                    className="shrink-0 text-xs font-medium text-[#007d68]"
                                    onClick={() => onOpenLocation(highlight.locationId)}
                                    data-testid={`locations-fleet-attention-${highlight.locationId}`}
                                >
                                    Open →
                                </button>
                            </li>
                        ))}
                    </ul>
                </FleetCard>
            :   null}

            <FleetCard title="Locations" testId="locations-fleet-list-card">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                    <label className="sr-only" htmlFor="locations-fleet-search">
                        Search locations
                    </label>
                    <input
                        id="locations-fleet-search"
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search locations"
                        className="config-runtime-input max-w-sm flex-1"
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
                        <button
                            type="button"
                            className="ml-auto rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                            onClick={onAddLocation}
                            data-testid="locations-fleet-add-location"
                        >
                            Add Location
                        </button>
                    :   null}
                </div>

                {visible.length === 0 ?
                    <div
                        className="rounded-lg border border-dashed border-alloy-forge/15 px-4 py-8 text-center"
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
                            <button
                                type="button"
                                className="mt-4 text-xs font-semibold text-[#007d68]"
                                onClick={onAddLocation}
                            >
                                Add Location →
                            </button>
                        :   null}
                    </div>
                :   <ul className="divide-y divide-alloy-forge/10" data-testid="locations-fleet-list">
                        {visible.map((location) => (
                            <li key={location.id}>
                                <button
                                    type="button"
                                    className="flex w-full items-start gap-3 py-3 text-left hover:bg-alloy-stone/10"
                                    onClick={() => onOpenLocation(location.id)}
                                    data-testid={`locations-fleet-row-${location.id}`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-alloy-midnight">
                                                {location.displayName}
                                            </span>
                                            <span
                                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                                    location.isActive ?
                                                        "border-[#00a283]/25 bg-[#00a283]/10 text-[#007d68]"
                                                    :   "border-alloy-forge/15 bg-alloy-stone/15 text-alloy-midnight/55"
                                                }`}
                                            >
                                                {location.isActive ? "Active" : "Inactive"}
                                            </span>
                                        </div>
                                        <p className="config-typo-sublabel mt-0.5">
                                            {[
                                                location.locality,
                                                `${location.activeRoomCount} ${location.activeRoomCount === 1 ? "room" : "rooms"}`,
                                                `${location.activeProgramCount} ${location.activeProgramCount === 1 ? "program" : "programs"}`,
                                                location.configuredCapacity != null ?
                                                    `${location.configuredCapacity} capacity`
                                                :   null,
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </p>
                                        {location.topAttention && location.topAttention.grade !== "good" ?
                                            <p
                                                className={`mt-1 text-xs ${
                                                    location.topAttention.grade === "fix" ?
                                                        "text-amber-800"
                                                    :   "text-blue-800"
                                                }`}
                                            >
                                                {location.topAttention.label}
                                            </p>
                                        :   null}
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-xs font-semibold text-alloy-midnight">
                                            {location.setupPercent}%
                                        </p>
                                        <p className="config-typo-sublabel">ready</p>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                }
            </FleetCard>
        </div>
    );
}
