"use client";

import type { ReactNode } from "react";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { filterOperationalPulseKpis } from "@/lib/kpi/workspaceKpiPresentation";
import { OipPerformanceKpiRow } from "@/components/admin/workspace/OipKpiObjectCard";
import { MetricPlacementRenderer } from "@/components/admin/metrics/MetricPlacementRenderer";
import { WS_LAYOUT, WS_LAYOUT_ATTR } from "@/lib/workspace/workspaceLayoutSystem";
import { WorkspaceQuietKpiReserve } from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";
import { ALLOY_OS_RUNTIME_ENABLED } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import { oipMetricDisplayValue } from "@/lib/metrics/oipKpiObjectPresentation";
import { oipSummaryLabel } from "@/lib/metrics/oipOperatorCopy";
import { oipMetricKeyForStripKey } from "@/lib/kpi/oipBridge";
import type { MetricKey } from "@/lib/kpi/types";

type Props = {
    processName: string | null;
    stagePills: ReactNode;
    kpis?: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    kpiStripPlaceholder?: boolean;
    workUnitId?: string | null;
    surfaceKey?: string;
};

function AlloyOsInlineKpiStrip({
    kpis,
    oipResolved,
    loading = false,
}: {
    kpis: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    loading?: boolean;
}) {
    const performanceKpis = filterOperationalPulseKpis(kpis);
    if (loading && performanceKpis.length === 0) {
        return <WorkspaceQuietKpiReserve id="wu-kpi-quiet-reserve" />;
    }
    if (!performanceKpis.length) return null;

    return (
        <>
            {performanceKpis.map((kpi) => {
                const metricKey =
                    kpi.id.startsWith("oip.") ? oipMetricKeyForStripKey(kpi.id as MetricKey) : null;
                const label = metricKey ? oipSummaryLabel(metricKey) : kpi.label;
                const value = oipMetricDisplayValue(kpi.value);
                return (
                    <div key={kpi.id} className="adminv2-os-kpi" data-alloy-os-kpi="true">
                        <span className="adminv2-os-kpi__value">{value}</span>
                        <span className="adminv2-os-kpi__label">{label}</span>
                    </div>
                );
            })}
        </>
    );
}

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

    if (ALLOY_OS_RUNTIME_ENABLED) {
        return (
            <div className="adminv2-os-context" data-alloy-os-work-unit-context="true">
                {processLine ?
                    <div className="adminv2-os-context__row adminv2-os-context__title-row">
                        <h1 className="adminv2-os-context__title" data-work-unit-process-label="true">
                            {processLine}
                        </h1>
                    </div>
                :   null}
                {showKpiRow ?
                    <div
                        className="adminv2-os-context__row adminv2-os-context__kpi-strip"
                        data-workspace-zone="kpi-tiles"
                    >
                        <MetricPlacementRenderer
                            surface="work_unit_header"
                            surfaceKey={surfaceKey}
                            placementZone="header_metrics"
                            contextType="work_unit"
                            contextId={workUnitId}
                            layout="row"
                            className="adminv2-os-context__kpi-placement"
                            emptyFallback={
                                <AlloyOsInlineKpiStrip
                                    kpis={kpis}
                                    oipResolved={oipResolved}
                                    loading={kpiStripPlaceholder}
                                />
                            }
                        />
                    </div>
                :   null}
                {stagePills ?
                    <div
                        className="adminv2-os-context__row adminv2-os-context__perspective-rail"
                        data-alloy-os-context-perspective-rail="true"
                        data-ws-command-pills="true"
                    >
                        {stagePills}
                    </div>
                :   null}
            </div>
        );
    }

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
