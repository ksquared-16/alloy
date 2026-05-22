import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";

export type AdminV2LegacyFanOutSurface = "workspace" | "department" | "work_unit";

export type AdminV2LegacyFanOutReason =
    | "bootstrap_unavailable"
    | "bootstrap_invalid"
    | "bootstrap_error"
    | "queue_summaries_failed"
    | "queue_api_unsupported";

/**
 * Explicit marker when a page falls back to multi-request legacy loading.
 * Does not change fetch behavior — diagnostics only (Card 5).
 */
export function logAdminV2LegacyFanOut(args: {
    surface: AdminV2LegacyFanOutSurface;
    reason: AdminV2LegacyFanOutReason;
    departmentId?: string;
    workUnitId?: string;
    status?: number;
}): void {
    const payload = {
        tag: "adminv2_legacy_fan_out",
        surface: args.surface,
        reason: args.reason,
        department_id: args.departmentId ?? null,
        work_unit_id: args.workUnitId ?? null,
        http_status: args.status ?? null,
    };
    if (typeof window !== "undefined") {
        console.warn("[adminv2-legacy-fan-out]", payload);
        if (typeof performance !== "undefined") {
            alloyPerfSet(`legacy_fan_out_${args.surface}`, performance.now());
        }
    }
}
