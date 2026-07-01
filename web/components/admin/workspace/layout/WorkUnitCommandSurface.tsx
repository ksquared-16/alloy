"use client";

import type { ReactNode } from "react";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { MetricPlacementRenderer } from "@/components/admin/metrics/MetricPlacementRenderer";
import { WorkspaceQuietKpiReserve } from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";

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
    kpis: _kpis = [],
    oipResolved: _oipResolved,
    kpiStripPlaceholder: _kpiStripPlaceholder = false,
    workUnitId = null,
    surfaceKey = "default",
}: Props) {
    const processLine = processName?.trim() ?? "";
    const showProcessRow = Boolean(processLine || stagePills);

    if (!showProcessRow) return null;

    return (
        <div
            className="adminv2-os-context"
            data-alloy-os-work-unit-context="true"
            {...alloySectionDomAttrs("WU-01")}
        >
            {processLine ?
                <div className="adminv2-os-context__row adminv2-os-context__title-row">
                    <h1 className="adminv2-os-context__title" data-work-unit-process-label="true">
                        {processLine}
                    </h1>
                </div>
            :   null}
            <div
                className="adminv2-os-context__row adminv2-os-context__metric-tiles"
                data-workspace-zone="kpi-tiles"
                {...alloySectionDomAttrs("WU-02")}
            >
                <MetricPlacementRenderer
                    surface="work_unit_header"
                    surfaceKey={surfaceKey}
                    placementZone="header_metrics"
                    contextType="work_unit"
                    contextId={workUnitId}
                    layout="operational-answer"
                    loadingReserve={<WorkspaceQuietKpiReserve id="wu-kpi-quiet-reserve" />}
                />
            </div>
            {stagePills ?
                <div
                    className="adminv2-os-context__row adminv2-os-context__perspective-rail"
                    data-alloy-os-context-perspective-rail="true"
                    data-ws-command-pills="true"
                    {...alloySectionDomAttrs("WU-03")}
                >
                    {stagePills}
                </div>
            :   null}
        </div>
    );
}
