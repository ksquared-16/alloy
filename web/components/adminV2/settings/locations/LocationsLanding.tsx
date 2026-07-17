"use client";

import { useState } from "react";
import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import type { LocationsCollectionModel } from "@/lib/locations/locationWorkspaceModel";

function formatCapacity(value: number | null): string {
    if (value == null) return "Not set up yet";
    return `${value.toLocaleString()} capacity`;
}

export function locationsCollectionUsesBoundedScroll(locationCount: number): boolean {
    return locationCount >= 7;
}

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
    onOpenLocation: (locationId: string) => void;
    onAddLocation: () => void;
    canMutate: boolean;
}) {
    const [showAllAttention, setShowAllAttention] = useState(false);
    const visible = collection.locations.filter((location) => {
        if (!showInactive && !location.isActive) return false;
        const query = search.trim().toLowerCase();
        if (!query) return true;
        return [location.displayName, location.locality]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value.includes(query));
    });

    const attentionPreview = showAllAttention ?
        collection.attentionHighlights
    :   collection.attentionHighlights.slice(0, 3);
    const hasMoreAttention = collection.attentionHighlights.length > 3;
    const readinessLabel =
        collection.locationCount === 0 ? "No locations yet"
        : collection.totalCritical > 0 ?
            `${collection.totalCritical} ${collection.totalCritical === 1 ? "item needs" : "items need"} attention`
        : collection.totalImprove > 0 ?
            `${collection.totalImprove} ${collection.totalImprove === 1 ? "improvement" : "improvements"} available`
        :   "None";

    return (
        <div className="flex max-w-[72rem] flex-col gap-2.5" data-testid="locations-landing">
            <ConfigWorkspaceCard compact testId="locations-operational-summary">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,34fr)_minmax(0,38fr)_minmax(0,28fr)] sm:divide-x sm:divide-alloy-stone/20">
                    <section className="sm:pr-3" data-testid="locations-readiness">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Operational readiness
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                            {collection.averageSetupPercent}%
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            {collection.locationsSetupComplete} of {collection.locationCount}{" "}
                            {collection.locationCount === 1 ? "location" : "locations"} fully configured
                        </p>
                        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-alloy-stone/25">
                            <div
                                className="h-full rounded-full bg-alloy-bend-pine"
                                style={{ width: `${Math.min(100, Math.max(0, collection.averageSetupPercent))}%` }}
                            />
                        </div>
                    </section>

                    <section className="sm:px-3" data-testid="locations-attention-summary">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Needs attention
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                            {readinessLabel}
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            {collection.locationsNeedingAttention}{" "}
                            {collection.locationsNeedingAttention === 1 ? "location" : "locations"} need follow-up
                        </p>
                    </section>

                    <section className="sm:pl-3" data-testid="locations-inventory">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Inventory
                        </p>
                        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-alloy-midnight/80">
                            <div>
                                <dt className="config-typo-sublabel">Locations</dt>
                                <dd className="font-semibold text-alloy-midnight">
                                    {collection.activeLocationCount}
                                    {collection.inactiveLocationCount > 0 ?
                                        <span className="ml-1 font-normal text-alloy-midnight/45">
                                            (+{collection.inactiveLocationCount} inactive)
                                        </span>
                                    :   null}
                                </dd>
                            </div>
                            <div>
                                <dt className="config-typo-sublabel">Rooms</dt>
                                <dd className="font-semibold text-alloy-midnight">{collection.totalRooms}</dd>
                            </div>
                            <div>
                                <dt className="config-typo-sublabel">Programs</dt>
                                <dd className="font-semibold text-alloy-midnight">{collection.totalPrograms}</dd>
                            </div>
                            <div>
                                <dt className="config-typo-sublabel">Capacity</dt>
                                <dd className="font-semibold text-alloy-midnight">
                                    {formatCapacity(collection.totalConfiguredCapacity)}
                                </dd>
                            </div>
                        </dl>
                    </section>
                </div>
            </ConfigWorkspaceCard>

            {collection.attentionHighlights.length > 0 ?
                <ConfigWorkspaceCard
                    title="Needs attention"
                    description="Highest-impact items across locations."
                    compact
                    testId="locations-attention-list"
                >
                    <ul className="divide-y divide-alloy-forge/10">
                        {attentionPreview.map((highlight) => (
                            <li key={`${highlight.locationId}-${highlight.item.key}`} className="py-1.5 first:pt-0 last:pb-0">
                                <button
                                    type="button"
                                    className="-mx-1 w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left hover:bg-alloy-bend-pine/[0.04]"
                                    onClick={() => onOpenLocation(highlight.locationId)}
                                    data-testid={`locations-attention-${highlight.locationId}`}
                                >
                                    <div className="flex items-start gap-2.5">
                                        <span
                                            className={`mt-0.5 ${
                                                highlight.item.grade === "fix" ? "text-amber-700" : "text-blue-700"
                                            }`}
                                            aria-hidden="true"
                                        >
                                            {highlight.item.grade === "fix" ? "⚠" : "ⓘ"}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-alloy-midnight">
                                                {highlight.item.label}
                                            </p>
                                            {highlight.item.consequence ?
                                                <p className="mt-0.5 text-[12px] leading-snug text-alloy-midnight/55">
                                                    {highlight.item.consequence}
                                                </p>
                                            :   null}
                                            <p className="mt-1 text-[11px] text-alloy-midnight/45">
                                                {highlight.locationName}
                                            </p>
                                            <p className="mt-1.5 text-xs font-semibold text-alloy-bend-pine">
                                                {(highlight.item.nextLabel ?? "Open location") + " →"}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {hasMoreAttention ?
                        <button
                            type="button"
                            className="mt-2 text-xs font-semibold text-alloy-bend-pine hover:underline"
                            onClick={() => setShowAllAttention((current) => !current)}
                            aria-expanded={showAllAttention}
                            data-testid="locations-attention-toggle"
                        >
                            {showAllAttention ?
                                "Show less"
                            :   `View all ${collection.attentionHighlights.length} attention items`}
                        </button>
                    :   null}
                </ConfigWorkspaceCard>
            :   null}

            <ConfigWorkspaceCard compact testId="locations-list-card">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                    <p className="config-typo-queue-section-label mr-auto">Locations</p>
                    <label className="sr-only" htmlFor="locations-search">
                        Search locations
                    </label>
                    <input
                        id="locations-search"
                        type="search"
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search locations"
                        className="config-runtime-input max-w-sm flex-1"
                        data-testid="locations-search"
                    />
                    <label className="flex items-center gap-1.5 text-[11px] text-alloy-midnight/55">
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
                            {collection.locationCount === 0 ? "Add your first location" : "No locations match"}
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            {collection.locationCount === 0 ?
                                "Locations are the operational root for programs, rooms, schedules, and tours."
                            :   "Try a different search or include inactive locations."}
                        </p>
                        {canMutate && collection.locationCount === 0 ?
                            <ConfigurationPrimaryButton
                                className="mt-4"
                                onClick={onAddLocation}
                            >
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
                        data-scroll-mode={locationsCollectionUsesBoundedScroll(visible.length) ? "bounded" : "natural"}
                    >
                        {visible.map((location) => (
                            <li key={location.id}>
                                <button
                                    type="button"
                                    className="flex w-full items-start gap-3 px-1 py-2 text-left transition-colors hover:bg-alloy-bend-pine/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/30"
                                    onClick={() => onOpenLocation(location.id)}
                                    data-testid={`locations-row-${location.id}`}
                                >
                                    <div className="min-w-0 flex-1">
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
            </ConfigWorkspaceCard>
        </div>
    );
}
