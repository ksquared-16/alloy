import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { perfWorkUnit } from "@/lib/perf/perfNamespaceLog";

export type WorkspaceRevealGatePhase =
    | "gate_start"
    | "shell_ready"
    | "department_tiles_ready"
    | "tile_counts_ready"
    | "kpi_region_ready"
    | "actions_ready"
    | "above_fold_ready";

export type WorkspaceRevealGateInput = {
    shell_ready: boolean;
    department_tiles_ready: boolean;
    tile_counts_ready: boolean;
    kpi_region_ready: boolean;
    actions_ready: boolean;
};

export type WorkspaceRevealGate = WorkspaceRevealGateInput & {
    above_fold_ready: boolean;
    reason_if_blocked: string[];
};

let gateStartMs: number | null = null;
const phaseAtMs: Partial<Record<WorkspaceRevealGatePhase, number>> = {};
let aboveFoldReadyLogged = false;

export function resetWorkspaceRevealGatePerf(): void {
    gateStartMs = null;
    aboveFoldReadyLogged = false;
    for (const k of Object.keys(phaseAtMs) as WorkspaceRevealGatePhase[]) {
        delete phaseAtMs[k];
    }
}

export function markWorkspaceRevealGateStart(detail?: Record<string, unknown>): void {
    if (typeof performance === "undefined") return;
    resetWorkspaceRevealGatePerf();
    gateStartMs = performance.now();
    phaseAtMs.gate_start = gateStartMs;
    alloyPerfSet("workspace_reveal_gate_start", gateStartMs);
    if (typeof window !== "undefined") {
        perfWorkUnit("reveal_gate_start", { surface: "workspace", ...(detail ?? {}) });
    }
}

function logPhase(phase: WorkspaceRevealGatePhase, detail?: Record<string, unknown>): void {
    if (typeof performance === "undefined" || typeof window === "undefined") return;
    if (phaseAtMs[phase] != null) return;
    const now = performance.now();
    phaseAtMs[phase] = now;
    alloyPerfSet(`workspace_reveal_${phase}`, now);
    const payload: Record<string, unknown> = {
        event: phase,
        since_gate_ms: gateStartMs != null ? Math.round(now - gateStartMs) : null,
        ...detail,
    };
    if (phase === "above_fold_ready" && gateStartMs != null) {
        payload.reveal_wait_ms = Math.round(now - gateStartMs);
    }
    perfWorkUnit(`reveal_${phase}`, { surface: "workspace", ...payload });
}

export function markWorkspaceRevealGatePhases(
    gate: WorkspaceRevealGate,
    detail?: Record<string, unknown>
): void {
    if (gate.shell_ready) logPhase("shell_ready", detail);
    if (gate.department_tiles_ready) logPhase("department_tiles_ready", detail);
    if (gate.tile_counts_ready) logPhase("tile_counts_ready", detail);
    if (gate.kpi_region_ready) logPhase("kpi_region_ready", detail);
    if (gate.actions_ready) logPhase("actions_ready", detail);
    if (gate.above_fold_ready && !aboveFoldReadyLogged) {
        aboveFoldReadyLogged = true;
        logPhase("above_fold_ready", {
            ...detail,
            reason_if_blocked: gate.reason_if_blocked,
        });
    }
}

export function computeWorkspaceRevealGate(input: WorkspaceRevealGateInput): WorkspaceRevealGate {
    const reason_if_blocked: string[] = [];
    if (!input.shell_ready) reason_if_blocked.push("shell");
    if (!input.department_tiles_ready) reason_if_blocked.push("department_tiles");
    if (!input.tile_counts_ready) reason_if_blocked.push("tile_counts");
    if (!input.kpi_region_ready) reason_if_blocked.push("kpi_region");
    if (!input.actions_ready) reason_if_blocked.push("actions");
    return {
        ...input,
        above_fold_ready: reason_if_blocked.length === 0,
        reason_if_blocked,
    };
}

export function workspaceRevealShellReady(input: {
    bootstrap_loading: boolean;
    departments_resolved: boolean;
}): boolean {
    return input.departments_resolved && !input.bootstrap_loading;
}

export function workspaceRevealDepartmentTilesReady(input: {
    bootstrap_loading: boolean;
    has_departments: boolean;
    fetch_settled_empty: boolean;
    /** Phase G: static lifecycle landing tiles — no department fetch required. */
    operator_lifecycle_landing?: boolean;
}): boolean {
    if (input.bootstrap_loading) return false;
    if (input.operator_lifecycle_landing) return true;
    return input.has_departments || input.fetch_settled_empty;
}

export function workspaceRevealTileCountsReady(input: {
    has_departments: boolean;
    quick_rollup_applied: boolean;
    fetch_settled_empty: boolean;
    operator_lifecycle_landing?: boolean;
}): boolean {
    if (input.operator_lifecycle_landing) return true;
    if (input.fetch_settled_empty && !input.has_departments) return true;
    return input.has_departments && input.quick_rollup_applied;
}

/**
 * KPI region is ready to reveal once its first-paint STRUCTURE is present: quick rollup
 * metrics applied, confirmed-empty org, primed cache, or a settled error. This routes
 * real KPI readiness into the gate (Experience Doctrine Law 1 — no region reveals
 * independently after the gate).
 *
 * It deliberately does NOT await the per-department growth rollup (2×N network in
 * `loadWorkspaceGrowthRollup`). Those genuinely-slow values settle into already-reserved
 * geometry after reveal (Operational Motion Doctrine — `settle`), never blocking the
 * surface. Degraded/bounded semantics: empty, cached, and error all resolve to ready, so
 * the region can never block reveal forever.
 */
export function workspaceRevealKpiRegionReady(input: {
    /** Quick (synchronous, non-network) rollup metrics have been applied. */
    quick_metrics_applied: boolean;
    /** Department fetch settled with no departments — no KPI region to populate. */
    fetch_settled_empty: boolean;
    /** Session cache primed this surface — structure is already known. */
    cache_primed: boolean;
    /** A settled error is a terminal state — reveal the degraded surface, do not hang. */
    errored: boolean;
}): boolean {
    if (input.errored) return true;
    if (input.fetch_settled_empty) return true;
    if (input.cache_primed) return true;
    return input.quick_metrics_applied;
}

/** Orientation rail is static chrome — always ready. */
export function workspaceRevealActionsReady(): boolean {
    return true;
}
