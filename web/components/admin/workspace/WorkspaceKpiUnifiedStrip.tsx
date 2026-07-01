"use client";

import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import { splitWorkspaceKpiBands } from "@/lib/kpi/workspaceKpiPresentation";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { OipPerformanceKpiRow } from "@/components/admin/workspace/OipKpiObjectCard";

type Props = {
    kpis: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    loading?: boolean;
    inventoryMaxVisible?: number;
    /** @deprecated retained for call-site compat */
    performanceMaxVisible?: number;
    variant?: "default" | "unified";
    onKpiClick?: (kpi: KPIVm) => void;
};

/**
 * Work unit / workspace KPI bands — queue inventory separate from operational performance objects.
 */
export default function WorkspaceKpiUnifiedStrip({
    kpis,
    oipResolved,
    loading = false,
    inventoryMaxVisible = 5,
    performanceMaxVisible: _performanceMaxVisible = 4,
    variant = "default",
    onKpiClick,
}: Props) {
    void _performanceMaxVisible;
    const { inventory, performance } = splitWorkspaceKpiBands(kpis);

    if (!inventory.length && !performance.length) return null;

    const unified = variant === "unified";

    return (
        <div
            className={unified ? "space-y-1.5" : "adminv2-ws-kpi-unified-strip space-y-2"}
            data-workspace-kpi-unified="true"
            data-workspace-kpi-variant={variant}
        >
            {performance.length ?
                <div
                    data-workspace-kpi-band="performance"
                    className={
                        unified
                            ? "pt-0"
                            : "rounded-lg border border-alloy-stone/18 border-l-[3px] border-l-alloy-juniper bg-white px-2 py-1.5"
                    }
                    data-work-unit-operational-performance="true"
                >
                    {!unified ?
                        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                            Operational Performance
                        </div>
                    :   null}
                    <OipPerformanceKpiRow
                        kpis={performance}
                        oipResolved={oipResolved}
                        loading={loading}
                        compact
                        layout="command"
                        onKpiClick={onKpiClick}
                    />
                </div>
            :   null}
            {inventory.length ?
                <div
                    data-workspace-kpi-band="inventory"
                    className={
                        unified
                            ? "border-t border-alloy-stone/8 pt-1.5"
                            : "rounded-lg border border-alloy-stone/18 bg-white px-2 py-1.5"
                    }
                >
                    {!unified ?
                        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/50">
                            Queue Overview
                        </div>
                    :   null}
                    <KPIBlock kpis={inventory} maxVisible={inventoryMaxVisible} />
                </div>
            :   null}
        </div>
    );
}
