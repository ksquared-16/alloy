"use client";

import type { ConfigAttentionItem, ConfigReadinessArea } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    ConfigAttentionPanel,
    ConfigGlanceMetrics,
    ConfigOperationalReadiness,
    ConfigWorkspaceCard,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import type { LocationWorkspaceModel, LocationWorkspaceTab } from "@/lib/locations/locationWorkspaceModel";

/**
 * Overview composition — attention leads; readiness supports;
 * summary and operations are lightweight regions.
 */
export function LocationOverviewSurface({
    model,
    scheduleSummary,
    onResolveAttention,
    onSelectReadinessArea,
    onOpenTab,
}: {
    model: LocationWorkspaceModel;
    scheduleSummary: string;
    onResolveAttention: (tab: LocationWorkspaceTab | "general") => void;
    onSelectReadinessArea: (tab: LocationWorkspaceTab | "general") => void;
    onOpenTab: (tab: LocationWorkspaceTab) => void;
}) {
    const readinessAreas: ConfigReadinessArea[] = model.setupItems.map((item) => ({
        key: item.key,
        label: item.label,
        complete: item.complete,
    }));

    const attentionItems: ConfigAttentionItem[] = model.attention;
    const knownComplete = readinessAreas.filter((area) => area.complete === true).length;
    const knownTotal = readinessAreas.filter((area) => area.complete !== null).length;
    const capacityNeedsAttention =
        model.configuredCapacity == null || model.roomsNeedingCapacity > 0;
    const scheduleNeedsAttention = scheduleSummary === "Not set up yet";
    const hasAttention = attentionItems.some((item) => item.grade !== "good");

    return (
        <div className="flex flex-col gap-3 pb-2" data-testid="locations-overview">
            <ConfigWorkspaceCard compact testId="locations-overview-health">
                <div
                    className={`grid gap-6 ${hasAttention ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]" : ""}`}
                >
                    <ConfigAttentionPanel
                        items={attentionItems}
                        compact
                        embedded
                        testId="locations-attention"
                        onResolve={(item) => {
                            const match = model.attention.find((entry) => entry.key === item.key);
                            if (match) onResolveAttention(match.tab);
                        }}
                    />
                    <section
                        className={hasAttention ? "lg:border-l lg:border-alloy-stone/20 lg:pl-6" : undefined}
                        data-testid="locations-setup-progress"
                        data-config-surface="region"
                    >
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">
                                    Operational readiness
                                </h2>
                                <p className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                    {knownComplete}/{knownTotal} areas · {model.setupPercent}%
                                </p>
                            </div>
                            <div
                                className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                                style={{
                                    background: `conic-gradient(${
                                        model.setupPercent >= 100 ? "#007d68" : "#00a283"
                                    } ${model.setupPercent}%, rgba(89,103,139,0.12) 0)`,
                                }}
                                aria-hidden
                            >
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-alloy-midnight">
                                    {model.setupPercent}%
                                </div>
                            </div>
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

            <ConfigGlanceMetrics
                title="Configuration summary"
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
                        hint: model.roomsNeedingCapacity > 0 ? `${model.roomsNeedingCapacity} need setup` : undefined,
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
                        label: "Schedules",
                        icon: "schedule",
                        tone: scheduleNeedsAttention ? "attention" : "ready",
                        value: scheduleNeedsAttention ? "Not set" : scheduleSummary,
                        onSelect: () => onOpenTab("schedule"),
                    },
                ]}
            />

            <ConfigWorkspaceCard title="How this location runs" compact testId="locations-overview-operations">
                <div className="grid gap-y-3 sm:grid-cols-3 sm:divide-x sm:divide-alloy-stone/20">
                    {[
                        {
                            label: "Tours",
                            value: "Availability & booking",
                            tab: "tours" as const,
                        },
                        {
                            label: "Placement",
                            value: `${model.activeRoomCount} rooms`,
                            tab: "placement" as const,
                        },
                        {
                            label: "Access",
                            value: "Team permissions",
                            tab: "access" as const,
                        },
                    ].map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            className="px-0 text-left hover:bg-alloy-bend-pine/[0.03] sm:px-4 first:sm:pl-0 last:sm:pr-0"
                            onClick={() => onOpenTab(item.tab)}
                        >
                            <p className="text-sm font-semibold text-alloy-midnight">{item.label}</p>
                            <p className="mt-0.5 text-[11px] text-alloy-midnight/50">{item.value}</p>
                            <p className="mt-1.5 text-xs font-semibold text-[#007d68]">Open →</p>
                        </button>
                    ))}
                </div>
            </ConfigWorkspaceCard>
        </div>
    );
}
