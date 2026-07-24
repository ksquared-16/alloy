"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { TuitionPlanOverviewPanel } from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlanOverviewPanel";
import { TuitionPlanOptionsPanel } from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlanOptionsPanel";
import { TuitionPlanLocationsPanel } from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlanLocationsPanel";
import {
    TuitionPlanHistoryPanel,
    TuitionPlanUpcomingPanel,
} from "@/components/adminV2/settings/financials/tuitionPlans/TuitionPlanHistoryPanel";
import type { TuitionPlanDetailVm } from "@/lib/financials/tuitionPlans/tuitionPlanViewModel";
import type { TuitionPlansSnapshot } from "@/lib/financials/tuitionPlans/tuitionPlansCache";

export type TuitionPlanWorkspaceTab = "overview" | "options" | "locations" | "upcoming" | "history";

const TABS: { key: TuitionPlanWorkspaceTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "options", label: "Tuition Options" },
    { key: "locations", label: "Locations" },
    { key: "upcoming", label: "Upcoming Changes" },
    { key: "history", label: "History" },
];

export function normalizeTuitionPlanTab(value: string | null | undefined): TuitionPlanWorkspaceTab {
    const normalized = value?.trim().toLowerCase();
    if (normalized === "options" || normalized === "locations" || normalized === "upcoming" || normalized === "history") {
        return normalized;
    }
    return "overview";
}

export function TuitionPlanWorkspace({
    detail,
    snapshot,
    tab,
    canMutate,
    onTabChange,
    onEdit,
    onScheduleChange,
    onManageCommitments,
    onCompare,
    onReload,
}: {
    detail: TuitionPlanDetailVm;
    snapshot: TuitionPlansSnapshot;
    tab: TuitionPlanWorkspaceTab;
    canMutate: boolean;
    onTabChange: (tab: TuitionPlanWorkspaceTab) => void;
    onEdit: () => void;
    onScheduleChange: () => void;
    onManageCommitments: () => void;
    onCompare: () => void;
    onReload: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const archived = detail.status === "archived";

    useEffect(() => {
        if (!menuOpen) return;
        const onPointer = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
        };
        window.addEventListener("mousedown", onPointer);
        return () => window.removeEventListener("mousedown", onPointer);
    }, [menuOpen]);

    return (
        <div className="space-y-4" data-testid="tuition-plan-workspace">
            <section className="process-config-setup-card p-5" data-testid="tuition-plan-workspace-header">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">{detail.name}</h2>
                            <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    archived
                                        ? "bg-alloy-stone/40 text-alloy-midnight/55"
                                        : "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                }`}
                                data-testid="tuition-plan-workspace-status"
                            >
                                {detail.statusLabel}
                            </span>
                        </div>
                        <p className="mt-1.5 text-sm text-alloy-midnight/55" data-testid="tuition-plan-workspace-summary">
                            {[detail.programLabel, detail.careFormatLabel, detail.billingFrequencyLabel]
                                .filter(Boolean)
                                .join(" · ")}
                            {" · "}
                            {detail.currentAsOfLabel}
                        </p>
                    </div>
                    {canMutate && !archived ?
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <ConfigurationPrimaryButton onClick={onEdit} data-testid="tuition-plan-edit">
                                Edit Plan
                            </ConfigurationPrimaryButton>
                            <ConfigurationSecondaryButton
                                onClick={onScheduleChange}
                                data-testid="tuition-plan-schedule-change"
                            >
                                Schedule Change
                            </ConfigurationSecondaryButton>
                            <div className="relative" ref={menuRef}>
                                <ConfigurationSecondaryButton
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    onClick={() => setMenuOpen((open) => !open)}
                                    data-testid="tuition-plan-more"
                                >
                                    <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
                                    <span className="sr-only">More</span>
                                </ConfigurationSecondaryButton>
                                {menuOpen ?
                                    <div
                                        role="menu"
                                        className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-alloy-stone/25 bg-white py-1 shadow-sm"
                                        data-testid="tuition-plan-more-menu"
                                    >
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="block w-full px-3 py-2 text-left text-sm text-alloy-midnight hover:bg-alloy-stone/10"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                onManageCommitments();
                                            }}
                                            data-testid="tuition-plan-manage-commitments"
                                        >
                                            Manage Commitments
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="block w-full px-3 py-2 text-left text-sm text-alloy-midnight hover:bg-alloy-stone/10"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                onCompare();
                                            }}
                                            data-testid="tuition-plan-compare-locations"
                                        >
                                            Compare Locations
                                        </button>
                                    </div>
                                :   null}
                            </div>
                        </div>
                    :   null}
                </div>

                <div
                    className="mt-4 flex flex-wrap gap-1 border-b border-alloy-stone/20"
                    role="tablist"
                    aria-label="Tuition Plan sections"
                    data-testid="tuition-plan-workspace-tabs"
                >
                    {TABS.map((item) => {
                        const selected = tab === item.key;
                        return (
                            <button
                                key={item.key}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                onClick={() => onTabChange(item.key)}
                                className={`px-3 py-2 text-[12px] -mb-px border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/35 rounded-sm ${
                                    selected
                                        ? "border-alloy-bend-pine text-alloy-bend-pine font-semibold"
                                        : "border-transparent text-alloy-midnight/55 hover:text-alloy-midnight"
                                }`}
                                data-testid={`tuition-plan-tab-${item.key}`}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            <div role="tabpanel" data-testid={`tuition-plan-tabpanel-${tab}`}>
                {tab === "overview" ?
                    <TuitionPlanOverviewPanel
                        detail={detail}
                        onViewOptions={() => onTabChange("options")}
                        onCompare={onCompare}
                        onSetTuition={() => onTabChange("options")}
                    />
                : tab === "options" ?
                    <TuitionPlanOptionsPanel
                        detail={detail}
                        canMutate={canMutate && !archived}
                        onScheduleChange={onScheduleChange}
                        onManageCommitments={onManageCommitments}
                        onGoToUpcoming={() => onTabChange("upcoming")}
                        onGoToHistory={() => onTabChange("history")}
                    />
                : tab === "locations" ?
                    <TuitionPlanLocationsPanel
                        detail={detail}
                        snapshot={snapshot}
                        canMutate={canMutate && !archived}
                        onCompare={onCompare}
                        onReload={onReload}
                        onManageLocations={onEdit}
                    />
                : tab === "upcoming" ?
                    <TuitionPlanUpcomingPanel detail={detail} />
                :   <TuitionPlanHistoryPanel detail={detail} snapshot={snapshot} />
                }
            </div>
        </div>
    );
}
