"use client";

import type { ConfigAttentionItem, ConfigReadinessArea } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    ConfigAttentionPanel,
    ConfigGlanceMetrics,
    ConfigOperationalReadiness,
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
 * Overview — health first, one operational glance, quiet owned concerns.
 * Layout-first composition on stone; not a stack of competing cards.
 */
export function LocationOverviewSurface({
    model,
    scheduleSummary,
    operatingSnapshot,
    onResolveAttention,
    onSelectReadinessArea,
    onOpenTab,
}: {
    model: LocationWorkspaceModel;
    scheduleSummary: string;
    operatingSnapshot: LocationOperatingSnapshot;
    onResolveAttention: (tab: LocationWorkspaceTab | "general") => void;
    onSelectReadinessArea: (tab: LocationWorkspaceTab | "general") => void;
    onOpenTab: (tab: LocationWorkspaceTab) => void;
}) {
    const readinessAreas: ConfigReadinessArea[] = model.setupItems.map((item) => ({
        key: item.key,
        label: item.label,
        complete: item.complete,
    }));

    const attentionItems: ConfigAttentionItem[] = model.attention.map((item) => ({
        key: item.key,
        grade: item.grade,
        label: item.label,
        consequence: item.consequence,
        nextLabel: item.nextLabel,
    }));
    const hasAttention = attentionItems.some((item) => item.grade !== "good");
    const capacityNeedsAttention =
        model.configuredCapacity == null || model.roomsNeedingCapacity > 0;
    const scheduleNeedsAttention = scheduleSummary === "Not set up yet";

    const roomsWithCapacity = Math.max(0, model.activeRoomCount - model.roomsNeedingCapacity);
    const roomsNeedingCapacity = Math.max(0, model.roomsNeedingCapacity);
    const roomBarTotal = Math.max(model.activeRoomCount, roomsWithCapacity + roomsNeedingCapacity);
    const readyPct = roomBarTotal > 0 ? (roomsWithCapacity / roomBarTotal) * 100 : 0;
    const needsPct = roomBarTotal > 0 ? (roomsNeedingCapacity / roomBarTotal) * 100 : 0;

    const ownedConcerns: {
        key: LocationWorkspaceTab;
        label: string;
        status: string;
        readiness: string;
        readinessTone: "complete" | "setup" | "unknown";
    }[] = [
        {
            key: "tours",
            label: "Tours",
            status: "Availability & booking",
            readiness:
                model.setupItems.find((item) => item.key === "tours")?.complete === true ? "Complete"
                : model.setupItems.find((item) => item.key === "tours")?.complete === false ? "Needs setup"
                :   "Not assessed",
            readinessTone:
                model.setupItems.find((item) => item.key === "tours")?.complete === true ? "complete"
                : model.setupItems.find((item) => item.key === "tours")?.complete === false ? "setup"
                :   "unknown",
        },
        {
            key: "placement",
            label: "Placement",
            status:
                model.activeRoomCount > 0 ?
                    `${model.activeRoomCount} rooms available for placement`
                :   "No active rooms yet",
            readiness:
                model.setupItems.find((item) => item.key === "placement")?.complete === true ? "Complete"
                : model.setupItems.find((item) => item.key === "placement")?.complete === false ? "Needs setup"
                :   "Not assessed",
            readinessTone:
                model.setupItems.find((item) => item.key === "placement")?.complete === true ? "complete"
                : model.setupItems.find((item) => item.key === "placement")?.complete === false ? "setup"
                :   "unknown",
        },
        {
            key: "access",
            label: "Access",
            status: "Team permissions for this location",
            readiness:
                model.setupItems.find((item) => item.key === "access")?.complete === true ? "Complete"
                : model.setupItems.find((item) => item.key === "access")?.complete === false ? "Needs setup"
                :   "Not assessed",
            readinessTone:
                model.setupItems.find((item) => item.key === "access")?.complete === true ? "complete"
                : model.setupItems.find((item) => item.key === "access")?.complete === false ? "setup"
                :   "unknown",
        },
    ];

    const hoursValue =
        scheduleNeedsAttention ? "Not set"
        : operatingSnapshot.scheduleName ?
            `${scheduleSummary}`
        :   scheduleSummary;

    return (
        <div className="flex flex-col gap-4 pb-2" data-testid="locations-overview">
            <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <ConfigWorkspaceCard
                    compact
                    className="flex h-full flex-col"
                    testId="locations-overview-at-a-glance"
                >
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-[17px] font-semibold tracking-tight text-alloy-midnight">
                                At a glance
                            </h2>
                            <p className="mt-0.5 text-[12px] leading-snug text-alloy-midnight/50">
                                Primary operational metrics for this location.
                            </p>
                        </div>
                        <span className="rounded-full border border-alloy-stone/25 bg-alloy-stone/[0.06] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">
                            Operating picture
                        </span>
                    </div>
                    <ConfigGlanceMetrics
                        bare
                        layout="grid"
                        testId="locations-overview-capacity"
                        metrics={[
                            {
                                key: "capacity",
                                label: "Capacity",
                                icon: "capacity",
                                tone: capacityNeedsAttention ? "attention" : "ready",
                                value:
                                    model.configuredCapacity == null ?
                                        "Not set"
                                    :   String(model.configuredCapacity),
                                hint:
                                    model.roomsNeedingCapacity > 0 ?
                                        `${model.roomsNeedingCapacity} rooms need capacity`
                                    :   "Configured inventory",
                                onSelect: () => onOpenTab("rooms"),
                            },
                            {
                                key: "programs",
                                label: "Programs",
                                icon: "programs",
                                tone: model.activeProgramCount === 0 ? "attention" : "default",
                                value: String(model.activeProgramCount),
                                hint: "Active offerings",
                                onSelect: () => onOpenTab("programs"),
                            },
                            {
                                key: "rooms",
                                label: "Rooms",
                                icon: "rooms",
                                tone: model.activeRoomCount === 0 ? "attention" : "default",
                                value: String(model.activeRoomCount),
                                hint: "Active room inventory",
                                onSelect: () => onOpenTab("rooms"),
                            },
                            {
                                key: "schedule",
                                label: "Hours",
                                icon: "schedule",
                                tone: scheduleNeedsAttention ? "attention" : "ready",
                                value: hoursValue,
                                hint:
                                    !scheduleNeedsAttention && operatingSnapshot.scheduleName ?
                                        operatingSnapshot.scheduleName
                                    :   "Recurring location hours",
                                onSelect: () => onOpenTab("schedule"),
                            },
                        ]}
                    />

                    <div className="mt-auto border-t border-alloy-stone/20 pt-4" data-testid="locations-overview-capacity-bar">
                        <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">
                                Room capacity setup
                            </p>
                            <p className="text-[11px] text-alloy-midnight/45">
                                {roomsWithCapacity} of {roomBarTotal} rooms configured
                            </p>
                        </div>
                        <div
                            className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-alloy-stone/25"
                            role="img"
                            aria-label={`${roomsWithCapacity} rooms with capacity, ${roomsNeedingCapacity} need setup`}
                        >
                            {readyPct > 0 ?
                                <span className="h-full bg-alloy-bend-pine" style={{ width: `${readyPct}%` }} />
                            :   null}
                            {needsPct > 0 ?
                                <span className="h-full bg-alloy-ember/80" style={{ width: `${needsPct}%` }} />
                            :   null}
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-alloy-midnight/55">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-alloy-bend-pine" aria-hidden />
                                Ready: {roomsWithCapacity}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-alloy-ember/80" aria-hidden />
                                Need setup: {roomsNeedingCapacity}
                            </span>
                            {model.configuredCapacity != null ?
                                <span className="text-alloy-midnight/45">
                                    {model.configuredCapacity} total capacity
                                </span>
                            :   null}
                        </div>
                    </div>
                </ConfigWorkspaceCard>

                <ConfigWorkspaceCard
                    title="Operational readiness"
                    description="What is configured across this location."
                    compact
                    className="h-full"
                    testId="locations-setup-progress"
                >
                    <ConfigOperationalReadiness
                        percent={model.setupPercent}
                        areas={readinessAreas}
                        onSelectArea={(area) => {
                            const match = model.setupItems.find((item) => item.key === area.key);
                            if (match) onSelectReadinessArea(match.tab);
                        }}
                        compact
                        embedded
                        testId="locations-overview-readiness-detail"
                    />
                </ConfigWorkspaceCard>
            </div>

            <div
                className={`grid items-stretch gap-4 ${hasAttention ? "lg:grid-cols-2" : ""}`}
                data-testid="locations-overview-action-row"
            >
                {hasAttention ?
                    <ConfigWorkspaceCard compact className="h-full" testId="locations-overview-health">
                        <ConfigAttentionPanel
                            items={attentionItems}
                            compact
                            embedded
                            actionAlign="inline"
                            testId="locations-attention"
                            onResolve={(item) => {
                                const match = model.attention.find((entry) => entry.key === item.key);
                                if (match) onResolveAttention(match.tab);
                            }}
                        />
                    </ConfigWorkspaceCard>
                :   null}

                <ConfigWorkspaceCard
                    title="How this location runs"
                    description="Operational capabilities owned by this location."
                    compact
                    className="h-full"
                    testId="locations-overview-operations"
                >
                    <ul className="divide-y divide-alloy-forge/10" data-testid="locations-overview-owned-concerns">
                        {ownedConcerns.map((item) => (
                            <li key={item.key}>
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0 hover:bg-alloy-bend-pine/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/35"
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
                                    <span
                                        className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                            item.readinessTone === "complete" ?
                                                "border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
                                            : item.readinessTone === "setup" ?
                                                "border-alloy-ember/25 bg-alloy-ember/[0.07] text-alloy-ember"
                                            :   "border-alloy-stone/25 bg-alloy-stone/[0.05] text-alloy-midnight/40"
                                        }`}
                                    >
                                        {item.readiness}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </ConfigWorkspaceCard>
            </div>
        </div>
    );
}
