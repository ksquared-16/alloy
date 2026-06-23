"use client";

import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import { splitWorkspaceKpiBands } from "@/lib/kpi/workspaceKpiPresentation";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";

type Props = {
    kpis: KPIVm[];
    inventoryMaxVisible?: number;
    performanceMaxVisible?: number;
};

function BandHeading({ children }: { children: React.ReactNode }) {
    return (
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/45">
            {children}
        </div>
    );
}

/**
 * Unified workspace KPI presentation — pipeline inventory above operational performance.
 */
export default function WorkspaceKpiUnifiedStrip({
    kpis,
    inventoryMaxVisible = 5,
    performanceMaxVisible = 4,
}: Props) {
    const { inventory, performance } = splitWorkspaceKpiBands(kpis);

    if (!inventory.length && !performance.length) return null;

    const dualBand = inventory.length > 0 && performance.length > 0;

    return (
        <div className="adminv2-ws-kpi-unified-strip space-y-3" data-workspace-kpi-unified="true">
            {inventory.length ?
                <div data-workspace-kpi-band="inventory">
                    {dualBand ?
                        <BandHeading>Pipeline overview</BandHeading>
                    :   null}
                    <KPIBlock kpis={inventory} maxVisible={inventoryMaxVisible} />
                </div>
            :   null}
            {performance.length ?
                <div
                    data-workspace-kpi-band="performance"
                    className={dualBand ? "rounded-lg border border-alloy-pine/15 bg-[linear-gradient(135deg,rgba(236,247,243,0.55)_0%,rgba(255,255,255,0.4)_100%)] px-1 py-2" : ""}
                >
                    {dualBand ?
                        <BandHeading>Operational performance</BandHeading>
                    :   null}
                    <KPIBlock kpis={performance} maxVisible={performanceMaxVisible} />
                </div>
            :   null}
        </div>
    );
}
