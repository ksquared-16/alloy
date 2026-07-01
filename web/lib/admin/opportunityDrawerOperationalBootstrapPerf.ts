import type { OpportunityDrawerOperationalBootstrapResponse } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";
import { perfDrawer } from "@/lib/perf/perfNamespaceLog";

export type DrawerBootstrapPerfPhases = Record<string, number>;

export function logOpportunityDrawerOperationalBootstrapPerf(params: {
    opportunityId: string;
    routeGateMs: number;
    phases: DrawerBootstrapPerfPhases;
    totalMs: number;
}): void {
    if (process.env.NODE_ENV === "production" && params.totalMs <= 400) return;
    perfDrawer("bootstrap_server", {
        entity_type: "opportunity",
        entity_id: params.opportunityId,
        duration_ms: params.totalMs,
        total_ms: params.totalMs,
        source: "network",
    });
}

export function drawerBootstrapTimingFromPhases(
    routeGateMs: number,
    phases: DrawerBootstrapPerfPhases,
    totalMs: number
): OpportunityDrawerOperationalBootstrapResponse["timing"] {
    return {
        route_gate_ms: routeGateMs,
        phases_ms: phases,
        attention_resolver_passes: 0,
    };
}
