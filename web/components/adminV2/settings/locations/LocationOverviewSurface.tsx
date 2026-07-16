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
 * Full-width Overview — page owns understanding/state.
 * Commands live on the shell Actions rail, not here.
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
    const readinessCaption =
        model.setupPercent >= 100 ? "Ready"
        : model.setupPercent >= 60 ? "Getting close"
        :   "Needs setup";
    const capacityNeedsAttention =
        model.configuredCapacity == null || model.roomsNeedingCapacity > 0;
    const scheduleNeedsAttention = scheduleSummary === "Not set up yet";

    return (
        <div className="space-y-4" data-testid="locations-overview">
            <div className="grid gap-3 lg:grid-cols-2" data-testid="locations-overview-health">
                <ConfigAttentionPanel
                    items={attentionItems}
                    compact
                    testId="locations-attention"
                    onResolve={(item) => {
                        const match = model.attention.find((entry) => entry.key === item.key);
                        if (match) onResolveAttention(match.tab);
                    }}
                />
                <section
                    className="rounded-xl border border-alloy-forge/10 bg-white p-3 shadow-[0_1px_0_rgba(15,23,42,0.03)]"
                    data-testid="locations-setup-progress"
                >
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                            <h2 className="config-typo-workspace-title">Operational readiness</h2>
                            <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                                {knownComplete} of {knownTotal}{" "}
                                {knownTotal === 1 ? "area" : "areas"} complete · {readinessCaption}
                            </p>
                        </div>
                        <div
                            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
                            style={{
                                background: `conic-gradient(${
                                    model.setupPercent >= 100 ? "#007d68" : "#00a283"
                                } ${model.setupPercent}%, rgba(89,103,139,0.12) 0)`,
                            }}
                            aria-hidden
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-semibold text-alloy-midnight">
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
                        hint:
                            model.roomsNeedingCapacity > 0 ?
                                `${model.roomsNeedingCapacity} rooms need setup`
                            : model.configuredCapacity == null ?
                                "Children this location can serve"
                            :   "Children across active rooms",
                        onSelect: () => onOpenTab("rooms"),
                    },
                    {
                        key: "rooms",
                        label: "Rooms",
                        icon: "rooms",
                        tone: model.activeRoomCount === 0 ? "attention" : "default",
                        value: String(model.activeRoomCount),
                        hint: model.activeRoomCount === 0 ? "Add a room to begin" : "Active classrooms",
                        onSelect: () => onOpenTab("rooms"),
                    },
                    {
                        key: "programs",
                        label: "Programs",
                        icon: "programs",
                        tone: model.activeProgramCount === 0 ? "attention" : "default",
                        value: String(model.activeProgramCount),
                        hint: model.activeProgramCount === 0 ? "Nothing offered yet" : "Active offerings",
                        onSelect: () => onOpenTab("programs"),
                    },
                    {
                        key: "schedule",
                        label: "Schedules",
                        icon: "schedule",
                        tone: scheduleNeedsAttention ? "attention" : "ready",
                        value: scheduleNeedsAttention ? "Not set" : scheduleSummary,
                        hint: scheduleNeedsAttention ? "Weekly operating hours" : "Primary weekly pattern",
                        onSelect: () => onOpenTab("schedule"),
                    },
                ]}
            />

            <ConfigWorkspaceCard title="How this location runs" compact testId="locations-overview-operations">
                <div className="grid gap-2.5 sm:grid-cols-3">
                    {[
                        {
                            label: "Tours",
                            value: "Availability and booking",
                            action: "Open tours",
                            tab: "tours" as const,
                            well: "bg-alloy-bend-pine/[0.08] text-[#007d68]",
                            glyph: "M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z",
                        },
                        {
                            label: "Placement",
                            value: `${model.activeRoomCount} rooms participate`,
                            action: "Open placement",
                            tab: "placement" as const,
                            well: "bg-alloy-bend-pine/[0.08] text-[#007d68]",
                            glyph: "M4 6h16M4 12h10M4 18h7",
                        },
                        {
                            label: "Access",
                            value: "Team permissions",
                            action: "Open access",
                            tab: "access" as const,
                            well: "bg-alloy-midnight/[0.05] text-alloy-midnight/70",
                            glyph: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0",
                        },
                    ].map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            className="rounded-xl border border-alloy-forge/10 bg-white px-3 py-2.5 text-left shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-colors hover:border-alloy-bend-pine/25 hover:bg-alloy-bend-pine/[0.03]"
                            onClick={() => onOpenTab(item.tab)}
                        >
                            <div className="flex items-start gap-2.5">
                                <span
                                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.well}`}
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.75"
                                        className="h-4 w-4"
                                        aria-hidden
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d={item.glyph} />
                                    </svg>
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-alloy-midnight">{item.label}</p>
                                    <p className="mt-0.5 text-[11px] text-alloy-midnight/50">{item.value}</p>
                                    <p className="mt-2 text-xs font-semibold text-[#007d68]">{item.action} →</p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </ConfigWorkspaceCard>
        </div>
    );
}
