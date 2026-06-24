"use client";

import type { ReactNode } from "react";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { filterOperationalPulseKpis } from "@/lib/kpi/workspaceKpiPresentation";
import { OipPerformanceKpiRow } from "@/components/admin/workspace/OipKpiObjectCard";
import { WS_LAYOUT, WS_LAYOUT_ATTR } from "@/lib/workspace/workspaceLayoutSystem";
import { WorkspaceQuietKpiReserve } from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";

type Props = {
    processName: string | null;
    stagePills: ReactNode;
    kpis?: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    kpiStripPlaceholder?: boolean;
};

/** Work-unit command banner — business process title, stage pills, KPI tiles, then queue. */
export function WorkUnitCommandSurface({
    processName,
    stagePills,
    kpis = [],
    oipResolved,
    kpiStripPlaceholder = false,
}: Props) {
    const processLine = processName?.trim() ?? "";
    const performanceKpis = filterOperationalPulseKpis(kpis);
    const showProcessRow = Boolean(processLine || stagePills);
    const showKpiRow = kpiStripPlaceholder || performanceKpis.length > 0;

    if (!showProcessRow && !showKpiRow) return null;

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
                    {kpiStripPlaceholder && !performanceKpis.length ?
                        <WorkspaceQuietKpiReserve id="wu-kpi-quiet-reserve" />
                    :   <OipPerformanceKpiRow
                            kpis={performanceKpis}
                            oipResolved={oipResolved}
                            loading={kpiStripPlaceholder}
                            layout="command"
                        />
                    }
                </div>
            :   null}
        </section>
    );
}
