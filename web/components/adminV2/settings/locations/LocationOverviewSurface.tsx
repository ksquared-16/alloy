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
                <section className="process-config-setup-card p-3" data-testid="locations-setup-progress">
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                            <h2 className="config-typo-workspace-title">Operational readiness</h2>
                            <p className="config-typo-sublabel mt-0.5">
                                {knownComplete} of {knownTotal}{" "}
                                {knownTotal === 1 ? "area" : "areas"} complete · {readinessCaption}
                            </p>
                        </div>
                        <div
                            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
                            style={{
                                background: `conic-gradient(#00a283 ${model.setupPercent}%, rgba(89,103,139,0.12) 0)`,
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
                        value:
                            model.configuredCapacity == null ?
                                "Not set up yet"
                            :   `${model.configuredCapacity} children`,
                        hint:
                            model.roomsNeedingCapacity > 0 ?
                                `${model.roomsNeedingCapacity} rooms need setup`
                            :   undefined,
                        onSelect: () => onOpenTab("rooms"),
                    },
                    {
                        key: "rooms",
                        label: "Rooms",
                        value: `${model.activeRoomCount} active`,
                        onSelect: () => onOpenTab("rooms"),
                    },
                    {
                        key: "programs",
                        label: "Programs",
                        value: `${model.activeProgramCount} active`,
                        onSelect: () => onOpenTab("programs"),
                    },
                    {
                        key: "schedule",
                        label: "Schedules",
                        value: scheduleSummary,
                        onSelect: () => onOpenTab("schedule"),
                    },
                ]}
            />

            <ConfigWorkspaceCard title="How this location runs" compact testId="locations-overview-operations">
                <div className="grid gap-3 sm:grid-cols-3">
                    {[
                        {
                            label: "Tours",
                            value: "Availability and booking",
                            action: "Manage availability",
                            tab: "tours" as const,
                        },
                        {
                            label: "Placement",
                            value: `${model.activeRoomCount} rooms participate`,
                            action: "Placement rules",
                            tab: "placement" as const,
                        },
                        {
                            label: "Access",
                            value: "Team permissions",
                            action: "Manage access",
                            tab: "access" as const,
                        },
                    ].map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            className="rounded-lg border border-alloy-forge/10 px-3 py-2.5 text-left hover:bg-alloy-stone/10"
                            onClick={() => onOpenTab(item.tab)}
                        >
                            <p className="text-sm font-semibold text-alloy-midnight">{item.label}</p>
                            <p className="config-typo-sublabel mt-0.5">{item.value}</p>
                            <p className="mt-2 text-xs font-semibold text-[#007d68]">{item.action} →</p>
                        </button>
                    ))}
                </div>
            </ConfigWorkspaceCard>
        </div>
    );
}
