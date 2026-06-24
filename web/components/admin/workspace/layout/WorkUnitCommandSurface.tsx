"use client";

import type { ReactNode } from "react";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { filterOperationalPulseKpis } from "@/lib/kpi/workspaceKpiPresentation";
import { OipPerformanceKpiRow } from "@/components/admin/workspace/OipKpiObjectCard";
import { MetricPlacementRenderer } from "@/components/admin/metrics/MetricPlacementRenderer";
import { WS_LAYOUT, WS_LAYOUT_ATTR } from "@/lib/workspace/workspaceLayoutSystem";
import { WorkspaceQuietKpiReserve } from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";

type Props = {
    processName: string | null;
    stagePills: ReactNode;
    kpis?: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    kpiStripPlaceholder?: boolean;
    workUnitId?: string | null;
    surfaceKey?: string;
};

/** Work-unit command banner — business process title, stage pills, KPI tiles, then queue. */
export function WorkUnitCommandSurface({
    processName,
    stagePills,
    kpis = [],
    oipResolved,
    kpiStripPlaceholder = false,
    workUnitId = null,
    surfaceKey = "default",
}: Props) {
    const processLine = processName?.trim() ?? "";
    const performanceKpis = filterOperationalPulseKpis(kpis);
    const showProcessRow = Boolean(processLine || stagePills);
    const showKpiRow = true;

    if (!showProcessRow && !showKpiRow) return null;

    const v1Fallback =
        performanceKpis.length ?
            <OipPerformanceKpiRow
                kpis={performanceKpis}
                oipResolved={oipResolved}
                loading={kpiStripPlaceholder}
                layout="command"
            />
        : kpiStripPlaceholder ?
            <WorkspaceQuietKpiReserve id="wu-kpi-quiet-reserve" />
        :   null;

    return (
        <section
            className={`${WS_LAYOUT.commandBanner} ${WS_LAYOUT.commandSurface}`}
            data-ws-layout={WS_LAYOUT_ATTR.commandSurface}
            data-ws-command-banner="true"
            data-work-unit-operational-header="true"
        >
            {showProcessRow ?
                <div
                    className={WS_LAYOUT.rowProcessHeader}
                    data-ws-command-row={WS_LAYOUT_ATTR.commandRowProcessPills}
                >
                    {processLine ?
                        <h1
                            className={WS_LAYOUT.processContextLabel}
                            data-ws-command-row={WS_LAYOUT_ATTR.commandRowProcessTitle}
                            data-work-unit-process-label="true"
                        >
                            {processLine}
                        </h1>
                    :   null}
                    {stagePills ?
                        <div className={WS_LAYOUT.pillsRail} data-ws-command-pills="true">
                            {stagePills}
                        </div>
                    :   null}
                </div>
            :   null}

            {showKpiRow ?
                <div
                    className={WS_LAYOUT.rowPulse}
                    data-ws-command-row={WS_LAYOUT_ATTR.commandRowPulse}
                    data-workspace-zone="kpi-tiles"
                >
                    <MetricPlacementRenderer
                        surface="work_unit_header"
                        surfaceKey={surfaceKey}
                        placementZone="header_metrics"
                        contextType="work_unit"
                        contextId={workUnitId}
                        layout="row"
                        className="mb-2"
                        emptyFallback={v1Fallback}
                    />
                </div>
            :   null}
        </section>
    );
}
