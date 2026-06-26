"use client";

import type { WorkspaceHealthSummary } from "@/lib/metrics/workspaceHealthSummary";
import type { OipHealthStatus } from "@/lib/metrics/oipStatusPresentation";
import { oipHealthStatusChipClass, oipHealthStatusLabel } from "@/lib/metrics/oipStatusPresentation";

export function OipHealthChip({
    label,
    status,
    compact = false,
}: {
    label: string;
    status: OipHealthStatus;
    compact?: boolean;
}) {
    return (
        <div
            className={
                compact
                    ? "inline-flex items-center gap-1.5 rounded-md border border-alloy-juniper/12 bg-white px-2 py-1"
                    : "inline-flex items-center gap-2.5 rounded-lg border border-alloy-juniper/15 bg-white/90 px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            }
            data-oip-health-chip="true"
            data-oip-health-chip-compact={compact ? "true" : undefined}
        >
            <span
                className={
                    compact
                        ? "text-[11px] font-medium text-alloy-midnight/60"
                        : "text-xs font-medium text-alloy-midnight/70"
                }
            >
                {label}
            </span>
            <span
                className={`font-bold uppercase tracking-wide ${oipHealthStatusChipClass(status)} ${
                    compact
                        ? "rounded px-1.5 py-0.5 text-[9px]"
                        : "rounded-md px-2.5 py-1 text-[10px]"
                }`}
            >
                {oipHealthStatusLabel(status)}
            </span>
        </div>
    );
}

/** Status-only health strip — not KPI cards. */
export function OipHealthStrip({
    health,
    compact = false,
}: {
    health: WorkspaceHealthSummary;
    compact?: boolean;
}) {
    return (
        <div
            className={`flex flex-wrap ${compact ? "gap-1.5 justify-end" : "gap-2"}`}
            data-workspace-health-strip="true"
        >
            <OipHealthChip label="Business Health" status={health.business} compact={compact} />
            <OipHealthChip label="Operational Health" status={health.operational} compact={compact} />
            <OipHealthChip label="Enrollment Health" status={health.enrollment} compact={compact} />
        </div>
    );
}
