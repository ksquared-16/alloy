import type { DeptBootstrapPerfPhases } from "@/lib/workspace/deptOperationalBootstrapPerf";
import type { WorkUnitBootstrapPerfPhases } from "@/lib/workspace/workUnitOperationalBootstrapPerf";

/** Dev/staging-only server timing attached to operational-bootstrap JSON (stripped in production). */
export type BootstrapServerPerfEnvelope = {
    route_gate_ms?: number;
    route_prep_ms?: number;
    loader_ms?: number;
    payload_bytes?: number;
    phases?: WorkUnitBootstrapPerfPhases | DeptBootstrapPerfPhases | Record<string, unknown>;
};

export function attachBootstrapServerPerf<T extends Record<string, unknown>>(
    body: T,
    perf: BootstrapServerPerfEnvelope
): T {
    if (process.env.NODE_ENV === "production") return body;
    return { ...body, __server_perf: perf };
}

export function peelBootstrapServerPerf<T extends Record<string, unknown>>(
    body: T
): { payload: Omit<T, "__server_perf">; serverPerf: BootstrapServerPerfEnvelope | null } {
    const raw = body as T & { __server_perf?: BootstrapServerPerfEnvelope };
    const { __server_perf, ...rest } = raw;
    return {
        payload: rest as Omit<T, "__server_perf">,
        serverPerf: __server_perf ?? null,
    };
}
