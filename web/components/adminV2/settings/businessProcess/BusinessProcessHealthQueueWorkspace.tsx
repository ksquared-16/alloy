"use client";

import {
    BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY,
} from "@/lib/lifecycle/businessProcessUiLabels";

export default function BusinessProcessHealthListColumn({
    runtimeSummary,
    processLabel,
}: {
    runtimeSummary: "unknown" | "pass" | "fail";
    processLabel: string;
}) {
    const ready = runtimeSummary === "pass";
    const review = runtimeSummary === "fail" || runtimeSummary === "unknown";

    return (
        <div className="space-y-3" data-testid="business-process-health-list-column">
            <div>
                <h4 className="text-sm font-semibold text-alloy-midnight">Configuration Health</h4>
                <p className="text-[11px] text-alloy-forge/70">{BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY}</p>
            </div>
            <div
                className="process-config-work-view-list-card process-config-work-view-list-card--active"
                data-testid="business-process-health-process-item"
            >
                <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-alloy-midnight">{processLabel}</p>
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                            ready
                                ? "bg-alloy-pine/10 text-alloy-pine"
                                : review
                                  ? "bg-amber-500/10 text-amber-800/80"
                                  : "bg-alloy-forge/8 text-alloy-midnight/45"
                        }`}
                        data-testid="business-process-health-status-badge"
                    >
                        {ready ? "Healthy" : review ? "Review" : "Pending"}
                    </span>
                </div>
                <p className="mt-0.5 text-[11px] text-alloy-forge/70">
                    {BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY}
                </p>
            </div>
        </div>
    );
}
