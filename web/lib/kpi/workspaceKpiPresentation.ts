import type { KPIVm } from "@/lib/ui-v2/workspace-types";

/** Split workspace strip into pipeline inventory vs operational intelligence performance. */
export function splitWorkspaceKpiBands(kpis: KPIVm[]): { inventory: KPIVm[]; performance: KPIVm[] } {
    const performance = kpis.filter((k) => k.id.startsWith("oip."));
    const inventory = kpis.filter((k) => !k.id.startsWith("oip."));
    return { inventory, performance };
}

export function isOipKpiCell(kpi: KPIVm): boolean {
    return kpi.id.startsWith("oip.");
}
