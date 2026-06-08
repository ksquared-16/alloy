import type { OpportunityDrawerOperationalBootstrapResponse } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";

export type DrawerBootstrapPerfPhases = Record<string, number>;

export function logOpportunityDrawerOperationalBootstrapPerf(params: {
    opportunityId: string;
    routeGateMs: number;
    phases: DrawerBootstrapPerfPhases;
    totalMs: number;
}): void {
    const payload = {
        opportunity_id: params.opportunityId,
        route_gate_ms: params.routeGateMs,
        phases_ms: params.phases,
        total_ms: params.totalMs,
        attention_resolver_passes: 0 as const,
    };
    if (process.env.NODE_ENV !== "production" || params.totalMs > 400) {
        console.info("[drawer-bootstrap-perf]", payload);
    }
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
