"use client";

import { useOipSettings } from "@/app/adminV2/settings/analytics/OipSettingsContext";
import { computeWorkspaceHealthSummary } from "@/lib/metrics/workspaceHealthSummary";
import { OipHealthKpiCard, OipKpiObjectRow } from "@/components/admin/workspace/OipKpiObjectCard";

function relTime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return "just now";
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
}

export default function OipSettingsSummary() {
    const { snapshot, loading, error } = useOipSettings();

    if (loading && !snapshot) {
        return (
            <div className="mb-4 rounded-xl border border-alloy-stone/18 bg-white p-4" aria-busy="true">
                <div className="h-4 w-48 animate-pulse rounded bg-alloy-stone/15" />
                <div className="mt-3 h-8 w-full animate-pulse rounded bg-alloy-stone/10" />
            </div>
        );
    }

    if (error && !snapshot) {
        return (
            <div className="mb-4 rounded-xl border border-alloy-ember/30 bg-white p-4 text-sm text-alloy-ember">
                {error}
            </div>
        );
    }

    if (!snapshot) return null;

    const health = computeWorkspaceHealthSummary(snapshot.resolved);

    return (
        <div
            className="mb-4 rounded-xl border border-alloy-stone/20 border-l-[3px] border-l-alloy-pine bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
            data-oip-settings-summary="true"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-alloy-midnight">
                        <span>
                            <span className="font-semibold tabular-nums">{snapshot.indicator_count}</span>{" "}
                            <span className="text-alloy-midnight/55">indicators</span>
                        </span>
                        <span>
                            <span className="font-semibold tabular-nums">{snapshot.active_pack_count}</span>{" "}
                            <span className="text-alloy-midnight/55">playbooks</span>
                        </span>
                        <span>
                            <span
                                className={`font-semibold tabular-nums ${snapshot.off_track_count > 0 ? "text-alloy-ember" : "text-alloy-pine"}`}
                            >
                                {snapshot.off_track_count}
                            </span>{" "}
                            <span className="text-alloy-midnight/55">off track</span>
                        </span>
                    </div>
                    <p className="mt-1 text-[11px] text-alloy-midnight/45">
                        Updated {relTime(snapshot.last_updated)}
                    </p>
                </div>
            </div>
            <div className="mt-2 border-t border-alloy-stone/8 pt-2">
                <OipKpiObjectRow>
                    <OipHealthKpiCard label="Business Health" status={health.business} />
                    <OipHealthKpiCard label="Operational Health" status={health.operational} />
                    <OipHealthKpiCard label="Enrollment Health" status={health.enrollment} />
                </OipKpiObjectRow>
            </div>
        </div>
    );
}
