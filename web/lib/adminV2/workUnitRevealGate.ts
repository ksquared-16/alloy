import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";

export type WorkUnitRevealGatePhase =
    | "gate_start"
    | "shell_ready"
    | "summaries_ready"
    | "actions_ready"
    | "rows_ready"
    | "above_fold_ready";

export type WorkUnitRevealGateInput = {
    shell_ready: boolean;
    summaries_ready: boolean;
    actions_ready: boolean;
    rows_ready: boolean;
};

export type WorkUnitRevealGate = WorkUnitRevealGateInput & {
    above_fold_ready: boolean;
    reason_if_blocked: string[];
};

export type WorkUnitRevealShellReadyInput = {
    work_unit_loaded: boolean;
    department_loaded: boolean;
    bootstrap_loading: boolean;
    error: string | null;
};

export type WorkUnitRevealSummariesReadyInput = {
    queue_summaries: unknown[] | null;
    queue_summaries_error: string | null;
};

export type WorkUnitRevealActionsReadyInput = {
    reserve_actions_rail: boolean;
    enrollment_actions_settled: boolean;
};

export type WorkUnitRevealRowsReadyInput = {
    lane_authority_ready: boolean;
    queue_summaries: { length: number } | null;
    queue_summaries_error: string | null;
    /** Selected lane has a settled display state (rows, cache, empty, or error). */
    lane_reveal_settled: boolean;
    /** @deprecated Buffer must not bypass coordinated lane reveal. */
    queue_rows_buffer_valid?: boolean;
};

let gateStartMs: number | null = null;
const phaseAtMs: Partial<Record<WorkUnitRevealGatePhase, number>> = {};
let aboveFoldReadyLogged = false;

export function resetWorkUnitRevealGatePerf(): void {
    gateStartMs = null;
    aboveFoldReadyLogged = false;
    for (const k of Object.keys(phaseAtMs) as WorkUnitRevealGatePhase[]) {
        delete phaseAtMs[k];
    }
}

export function markWorkUnitRevealGateStart(detail?: Record<string, unknown>): void {
    if (typeof performance === "undefined") return;
    resetWorkUnitRevealGatePerf();
    gateStartMs = performance.now();
    phaseAtMs.gate_start = gateStartMs;
    alloyPerfSet("wu_reveal_gate_start", gateStartMs);
    if (typeof window !== "undefined") {
        console.info("[wu-reveal-gate]", { event: "gate_start", ...detail });
    }
}

function logPhase(phase: WorkUnitRevealGatePhase, detail?: Record<string, unknown>): void {
    if (typeof performance === "undefined" || typeof window === "undefined") return;
    if (phaseAtMs[phase] != null) return;
    const now = performance.now();
    phaseAtMs[phase] = now;
    alloyPerfSet(`wu_reveal_${phase}`, now);
    const payload: Record<string, unknown> = {
        event: phase,
        since_gate_ms: gateStartMs != null ? Math.round(now - gateStartMs) : null,
        ...detail,
    };
    if (phase === "above_fold_ready" && gateStartMs != null) {
        payload.reveal_wait_ms = Math.round(now - gateStartMs);
    }
    console.info("[wu-reveal-gate]", payload);
}

export function markWorkUnitRevealGatePhases(
    gate: WorkUnitRevealGate,
    detail?: Record<string, unknown>
): void {
    if (gate.shell_ready) logPhase("shell_ready", detail);
    if (gate.summaries_ready) logPhase("summaries_ready", detail);
    if (gate.actions_ready) logPhase("actions_ready", detail);
    if (gate.rows_ready) logPhase("rows_ready", detail);
    if (gate.above_fold_ready && !aboveFoldReadyLogged) {
        aboveFoldReadyLogged = true;
        logPhase("above_fold_ready", {
            ...detail,
            reason_if_blocked: gate.reason_if_blocked,
        });
    }
}

export function computeWorkUnitRevealGate(input: WorkUnitRevealGateInput): WorkUnitRevealGate {
    const reason_if_blocked: string[] = [];
    if (!input.shell_ready) reason_if_blocked.push("shell");
    if (!input.summaries_ready) reason_if_blocked.push("summaries");
    if (!input.actions_ready) reason_if_blocked.push("actions");
    if (!input.rows_ready) reason_if_blocked.push("rows");
    return {
        ...input,
        above_fold_ready: reason_if_blocked.length === 0,
        reason_if_blocked,
    };
}

export function workUnitRevealShellReady(input: WorkUnitRevealShellReadyInput): boolean {
    return (
        input.work_unit_loaded &&
        input.department_loaded &&
        !input.bootstrap_loading &&
        !input.error
    );
}

export function workUnitRevealSummariesReady(input: WorkUnitRevealSummariesReadyInput): boolean {
    return input.queue_summaries !== null || Boolean(input.queue_summaries_error);
}

export function workUnitRevealActionsReady(input: WorkUnitRevealActionsReadyInput): boolean {
    if (!input.reserve_actions_rail) return true;
    return input.enrollment_actions_settled;
}

export function workUnitRevealRowsReady(input: WorkUnitRevealRowsReadyInput): boolean {
    if (!input.lane_authority_ready) return false;
    if (input.queue_summaries_error && input.queue_summaries === null) return true;
    if (input.queue_summaries && input.queue_summaries.length === 0) return true;
    return input.lane_reveal_settled;
}
