"use client";

import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { WorkspaceHealthSummary } from "@/lib/metrics/workspaceHealthSummary";
import { OipHealthStrip } from "@/components/admin/workspace/OipHealthStrip";
import { OipPerformanceKpiRow } from "@/components/admin/workspace/OipKpiObjectCard";
import { WS_LAYOUT, WS_LAYOUT_ATTR } from "@/lib/workspace/workspaceLayoutSystem";
import { WS_ZONE_MT } from "@/lib/workspace/workspaceLayoutSpacing";

type Props = {
    health: WorkspaceHealthSummary;
    kpis: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    loading?: boolean;
    contextLabel?: string | null;
};

/** Workspace root command banner — org context, health, operational pulse KPIs. */
export function WorkspaceHealthPulseSection({
    health,
    kpis,
    oipResolved,
    loading = false,
    contextLabel = null,
}: Props) {
    const orgName = contextLabel?.trim() ?? "";

    return (
        <section
            className={`${WS_LAYOUT.commandBanner} space-y-2`}
            data-ws-layout={WS_LAYOUT_ATTR.workspaceSectionA}
            data-ws-command-banner="true"
            data-workspace-health-pulse="true"
        >
            {orgName ?
                <h1 className={WS_LAYOUT.workspaceTitle} data-workspace-org-title="true">
                    {orgName}
                </h1>
            :   null}

            <div>
                <h2 className={WS_LAYOUT.sectionKicker}>Workspace Health</h2>
                <div className={`${WS_ZONE_MT.bandRow} min-w-0`} data-workspace-zone="health-snapshot">
                    <OipHealthStrip health={health} />
                </div>
            </div>

            <div className={WS_LAYOUT.sectionBreak} data-workspace-zone="operational-pulse">
                <h3 className={`${WS_LAYOUT.sectionKicker} mb-1.5`}>Operational Pulse</h3>
                <OipPerformanceKpiRow
                    kpis={kpis}
                    oipResolved={oipResolved}
                    loading={loading}
                    layout="command"
                />
            </div>
        </section>
    );
}
