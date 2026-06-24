"use client";

import type { WorkspaceHealthSummary } from "@/lib/metrics/workspaceHealthSummary";
import type { OipHealthStatus } from "@/lib/metrics/oipStatusPresentation";
import { oipHealthStatusChipClass, oipHealthStatusLabel } from "@/lib/metrics/oipStatusPresentation";

export function OipHealthChip({ label, status }: { label: string; status: OipHealthStatus }) {
    return (
        <div
            className="inline-flex items-center gap-2.5 rounded-lg border border-alloy-juniper/15 bg-white/90 px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            data-oip-health-chip="true"
        >
            <span className="text-xs font-medium text-alloy-midnight/70">{label}</span>
            <span
                className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${oipHealthStatusChipClass(status)}`}
            >
                {oipHealthStatusLabel(status)}
            </span>
        </div>
    );
}

/** Status-only health strip — not KPI cards. */
export function OipHealthStrip({ health }: { health: WorkspaceHealthSummary }) {
    return (
        <div className="flex flex-wrap gap-2" data-workspace-health-strip="true">
            <OipHealthChip label="Business Health" status={health.business} />
            <OipHealthChip label="Operational Health" status={health.operational} />
            <OipHealthChip label="Enrollment Health" status={health.enrollment} />
        </div>
    );
}
