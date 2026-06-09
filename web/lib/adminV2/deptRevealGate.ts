import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { perfWorkUnit } from "@/lib/perf/perfNamespaceLog";

export type DeptRevealGatePhase =
    | "gate_start"
    | "shell_ready"
    | "work_units_ready"
    | "operational_region_ready"
    | "kpi_strip_ready"
    | "actions_ready"
    | "above_fold_ready";

export type DeptRevealGateInput = {
    shell_ready: boolean;
    work_units_ready: boolean;
    operational_region_ready: boolean;
    kpi_strip_ready: boolean;
    actions_ready: boolean;
};

export type DeptRevealGate = DeptRevealGateInput & {
    above_fold_ready: boolean;
    reason_if_blocked: string[];
};

let gateStartMs: number | null = null;
const phaseAtMs: Partial<Record<DeptRevealGatePhase, number>> = {};
let aboveFoldReadyLogged = false;

export function resetDeptRevealGatePerf(): void {
    gateStartMs = null;
    aboveFoldReadyLogged = false;
    for (const k of Object.keys(phaseAtMs) as DeptRevealGatePhase[]) {
        delete phaseAtMs[k];
    }
}

export function markDeptRevealGateStart(detail?: Record<string, unknown>): void {
    if (typeof performance === "undefined") return;
    resetDeptRevealGatePerf();
    gateStartMs = performance.now();
    phaseAtMs.gate_start = gateStartMs;
    alloyPerfSet("dept_reveal_gate_start", gateStartMs);
    if (typeof window !== "undefined") {
        perfWorkUnit("reveal_gate_start", { surface: "department", ...(detail ?? {}) });
    }
}

function logPhase(phase: DeptRevealGatePhase, detail?: Record<string, unknown>): void {
    if (typeof performance === "undefined" || typeof window === "undefined") return;
    if (phaseAtMs[phase] != null) return;
    const now = performance.now();
    phaseAtMs[phase] = now;
    alloyPerfSet(`dept_reveal_${phase}`, now);
    const payload: Record<string, unknown> = {
        event: phase,
        since_gate_ms: gateStartMs != null ? Math.round(now - gateStartMs) : null,
        ...detail,
    };
    if (phase === "above_fold_ready" && gateStartMs != null) {
        payload.reveal_wait_ms = Math.round(now - gateStartMs);
    }
    perfWorkUnit(`reveal_${phase}`, { surface: "department", ...payload });
}

export function markDeptRevealGatePhases(gate: DeptRevealGate, detail?: Record<string, unknown>): void {
    if (gate.shell_ready) logPhase("shell_ready", detail);
    if (gate.work_units_ready) logPhase("work_units_ready", detail);
    if (gate.operational_region_ready) logPhase("operational_region_ready", detail);
    if (gate.kpi_strip_ready) logPhase("kpi_strip_ready", detail);
    if (gate.actions_ready) logPhase("actions_ready", detail);
    if (gate.above_fold_ready && !aboveFoldReadyLogged) {
        aboveFoldReadyLogged = true;
        logPhase("above_fold_ready", {
            ...detail,
            reason_if_blocked: gate.reason_if_blocked,
        });
    }
}

export function computeDeptRevealGate(input: DeptRevealGateInput): DeptRevealGate {
    const reason_if_blocked: string[] = [];
    if (!input.shell_ready) reason_if_blocked.push("shell");
    if (!input.work_units_ready) reason_if_blocked.push("work_units");
    if (!input.operational_region_ready) reason_if_blocked.push("operational_region");
    if (!input.kpi_strip_ready) reason_if_blocked.push("kpi_strip");
    if (!input.actions_ready) reason_if_blocked.push("actions");
    return {
        ...input,
        above_fold_ready: reason_if_blocked.length === 0,
        reason_if_blocked,
    };
}

export function deptRevealShellReady(input: {
    department_id: string | null;
    department_loaded: boolean;
    bootstrap_loading: boolean;
}): boolean {
    return Boolean(input.department_id && input.department_loaded && !input.bootstrap_loading);
}

export function deptRevealWorkUnitsReady(input: {
    work_units_resolved: boolean;
}): boolean {
    return input.work_units_resolved;
}

export function deptRevealKpiStripReady(input: {
    placement_rows_defined: boolean;
}): boolean {
    return input.placement_rows_defined;
}

export function deptRevealActionsReady(input: {
    reserve_actions_rail: boolean;
    enrollment_actions_settled: boolean;
}): boolean {
    if (!input.reserve_actions_rail) return true;
    return input.enrollment_actions_settled;
}
