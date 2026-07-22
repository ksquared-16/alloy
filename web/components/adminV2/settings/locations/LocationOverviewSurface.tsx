"use client";

import {
    ConfigWorkspaceCard,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import type { LocationWorkspaceModel, LocationWorkspaceTab } from "@/lib/locations/locationWorkspaceModel";

export type LocationOperatingSnapshot = {
    scheduleName: string | null;
    hoursLabel: string | null;
    programNames: string[];
    activeRoomCount: number;
    configuredCapacity: number | null;
};

/**
 * Overview — operator facts about this Location (not configuration health).
 */
export function LocationOverviewSurface({
    model,
    scheduleSummary,
    operatingSnapshot,
    onOpenTab,
}: {
    model: LocationWorkspaceModel;
    scheduleSummary: string;
    operatingSnapshot: LocationOperatingSnapshot;
    onResolveAttention?: (tab: LocationWorkspaceTab | "general") => void;
    onSelectReadinessArea?: (tab: LocationWorkspaceTab | "general") => void;
    onOpenTab: (tab: LocationWorkspaceTab) => void;
}) {
    const hoursValue =
        scheduleSummary === "Not set up yet" ? "Not set"
        : operatingSnapshot.hoursLabel?.trim() || scheduleSummary;

    const timezoneLabel = model.timezone?.trim() || "Not set";

    const ownedLinks: { key: LocationWorkspaceTab; label: string; status: string }[] = [
        {
            key: "tours",
            label: "Tours",
            status: "Availability and booking for this Location",
        },
        {
            key: "placement",
            label: "Placement",
            status:
                model.activeRoomCount > 0 ?
                    `${model.activeRoomCount} ${model.activeRoomCount === 1 ? "room" : "rooms"} available`
                :   "No active rooms yet",
        },
        {
            key: "access",
            label: "Access",
            status: "Team permissions for this Location",
        },
    ];

    return (
        <div className="flex w-full flex-col gap-3" data-testid="locations-overview">
            <section className="process-config-setup-card p-5" data-testid="locations-overview-identity">
                <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">
                    About this Location
                </h2>
                <p className="mt-1.5 text-sm text-alloy-midnight/55">
                    {model.address?.trim() || "Address not set yet."}
                </p>
                {model.phone ?
                    <p className="mt-1 text-sm text-alloy-midnight/50">{model.phone}</p>
                :   null}
            </section>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="locations-overview-facts">
                <ConfigWorkspaceCard compact className="h-full" testId="locations-overview-programs">
                    <button type="button" className="w-full text-left" onClick={() => onOpenTab("programs")}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                            Programs Offered
                        </p>
                        <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                            {model.activeProgramCount}
                        </p>
                    </button>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full" testId="locations-overview-rooms">
                    <button type="button" className="w-full text-left" onClick={() => onOpenTab("rooms")}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                            Rooms
                        </p>
                        <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                            {model.activeRoomCount}
                        </p>
                    </button>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full" testId="locations-overview-capacity">
                    <button type="button" className="w-full text-left" onClick={() => onOpenTab("rooms")}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                            Capacity
                        </p>
                        <p className="mt-1.5 text-lg font-semibold tracking-tight text-alloy-midnight">
                            {model.configuredCapacity == null ? "Not set" : model.configuredCapacity}
                        </p>
                    </button>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full" testId="locations-overview-hours">
                    <button type="button" className="w-full text-left" onClick={() => onOpenTab("schedule")}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                            Operating Hours
                        </p>
                        <p className="mt-1.5 text-sm font-semibold tracking-tight text-alloy-midnight">
                            {hoursValue}
                        </p>
                        {operatingSnapshot.scheduleName ?
                            <p className="mt-0.5 text-[12px] text-alloy-midnight/45">
                                {operatingSnapshot.scheduleName}
                            </p>
                        :   null}
                    </button>
                </ConfigWorkspaceCard>
                <ConfigWorkspaceCard compact className="h-full sm:col-span-2 lg:col-span-2" testId="locations-overview-timezone">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                        Timezone
                    </p>
                    <p className="mt-1.5 text-sm font-semibold tracking-tight text-alloy-midnight">
                        {timezoneLabel}
                    </p>
                </ConfigWorkspaceCard>
            </div>

            <ConfigWorkspaceCard compact testId="locations-overview-operations">
                <p className="text-sm font-semibold text-alloy-midnight">Also at this Location</p>
                <ul className="mt-2 divide-y divide-alloy-forge/10" data-testid="locations-overview-owned-concerns">
                    {ownedLinks.map((item) => (
                        <li key={item.key}>
                            <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 py-2.5 text-left first:pt-1 last:pb-0 hover:bg-alloy-bend-pine/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/35"
                                onClick={() => onOpenTab(item.key)}
                                data-testid={`locations-overview-concern-${item.key}`}
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-alloy-midnight">
                                        {item.label}
                                    </span>
                                    <span className="mt-0.5 block text-[12px] leading-snug text-alloy-midnight/50">
                                        {item.status}
                                    </span>
                                </span>
                                <span className="shrink-0 text-sm font-medium text-alloy-bend-pine">Open</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </ConfigWorkspaceCard>
        </div>
    );
}
