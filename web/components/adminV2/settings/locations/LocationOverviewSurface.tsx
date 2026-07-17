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
    }[] = [
        {
            key: "tours",
            label: "Tours",
            status: "Availability & booking",
        },
        {
            key: "placement",
            label: "Placement",
            status:
                model.activeRoomCount > 0 ?
                    `${model.activeRoomCount} rooms available for placement`
                :   "No active rooms yet",
        },
        {
            key: "access",
            label: "Access",
            status: "Team permissions for this location",
        },
    ];

    const hoursValue =
        scheduleNeedsAttention ? "Not set"
        : operatingSnapshot.scheduleName ?
            `${scheduleSummary}`
        :   scheduleSummary;

    return (
        <div className="flex flex-col gap-4 pb-2" data-testid="locations-overview">
            {/* Region A — Health: attention leads; readiness supports */}
            <ConfigWorkspaceCard compact testId="locations-overview-health">
                <div
                    className={`grid gap-6 ${hasAttention ? "lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]" : ""}`}
                >
                    {hasAttention ?
                        <ConfigAttentionPanel
                            items={attentionItems}
                            compact
                            embedded
                            actionAlign="trailing"
                            testId="locations-attention"
                            onResolve={(item) => {
                                const match = model.attention.find((entry) => entry.key === item.key);
                                if (match) onResolveAttention(match.tab);
                            }}
                        />
                    :   null}
                    <section
                        className={
                            hasAttention ? "lg:border-l lg:border-alloy-stone/20 lg:pl-6" : undefined
                        }
                        data-testid="locations-setup-progress"
                        data-config-surface="region"
                    >
                        <div className="mb-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2
                                    className={
                                        hasAttention ?
                                            "text-[12px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45"
                                        :   "text-[15px] font-semibold tracking-tight text-alloy-midnight"
                                    }
                                >
                                    Operational readiness
                                </h2>
                                {hasAttention ?
                                    <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/45">
                                        Understanding of what is configured — not a second task list.
                                    </p>
                                :   null}
                            </div>
                            {model.setupPercent < 100 ?
                                <div
                                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                                    style={{
                                        background: `conic-gradient(#00a283 ${model.setupPercent}%, rgba(89,103,139,0.12) 0)`,
                                    }}
                                    aria-hidden
                                >
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-alloy-midnight">
                                        {model.setupPercent}%
                                    </div>
                                </div>
                            :   null}
                        </div>
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
                    </section>
                </div>
            </ConfigWorkspaceCard>

            {/* Region B — At a glance: one cohesive operational summary */}
            <ConfigWorkspaceCard compact testId="locations-overview-at-a-glance">
                <h2 className="config-typo-workspace-title mb-3">At a glance</h2>
                <ConfigGlanceMetrics
                    bare
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
                                :   undefined,
                            onSelect: () => onOpenTab("rooms"),
                        },
                        {
                            key: "rooms",
                            label: "Rooms",
                            icon: "rooms",
                            tone: model.activeRoomCount === 0 ? "attention" : "default",
                            value: String(model.activeRoomCount),
                            onSelect: () => onOpenTab("rooms"),
                        },
                        {
                            key: "programs",
                            label: "Programs",
                            icon: "programs",
                            tone: model.activeProgramCount === 0 ? "attention" : "default",
                            value: String(model.activeProgramCount),
                            onSelect: () => onOpenTab("programs"),
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
                                :   undefined,
                            onSelect: () => onOpenTab("schedule"),
                        },
                    ]}
                />

                {roomBarTotal > 0 ?
                    <div className="mt-4 border-t border-alloy-stone/20 pt-3" data-testid="locations-overview-capacity-bar">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">
                            Room capacity setup
                        </p>
                        <div
                            className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-alloy-stone/25"
                            role="img"
                            aria-label={`${roomsWithCapacity} rooms with capacity, ${roomsNeedingCapacity} need setup`}
                        >
                            {readyPct > 0 ?
                                <span
                                    className="h-full bg-[#00a283]"
                                    style={{ width: `${readyPct}%` }}
                                />
                            :   null}
                            {needsPct > 0 ?
                                <span
                                    className="h-full bg-alloy-ember/80"
                                    style={{ width: `${needsPct}%` }}
                                />
                            :   null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-alloy-midnight/55">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#00a283]" aria-hidden />
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
                :   null}
            </ConfigWorkspaceCard>

            {/* Region C — How this location runs: one quiet owned-concerns list */}
            <ConfigWorkspaceCard
                title="How this location runs"
                compact
                testId="locations-overview-operations"
            >
                <p className="mb-2 text-[12px] leading-snug text-alloy-midnight/50">
                    Owned concerns beyond the core operating picture.
                </p>
                <ul className="divide-y divide-alloy-forge/10" data-testid="locations-overview-owned-concerns">
                    {ownedConcerns.map((item) => (
                        <li key={item.key}>
                            <button
                                type="button"
                                className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left first:pt-0 last:pb-0 hover:bg-alloy-bend-pine/[0.03]"
                                onClick={() => onOpenTab(item.key)}
                                data-testid={`locations-overview-concern-${item.key}`}
                            >
                                <span className="text-sm font-semibold text-alloy-midnight">{item.label}</span>
                                <span className="min-w-0 flex-1 text-right text-[12px] text-alloy-midnight/55">
                                    {item.status}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </ConfigWorkspaceCard>
        </div>
    );
}
