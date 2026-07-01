/**
 * Platform KPI/status color semantics (shared by Processing, Communications, and any
 * future operator workspace). One mapping so sibling product areas never invent
 * module-specific decorative colors.
 *
 * State → meaning → Alloy token:
 *   attention → needs attention / unread / errors      → red       (text-red-600 / bg-red-500)
 *   pending   → needs decision / scheduled / pending   → amber     (alloy-ember)
 *   ready     → ready to approve / ready to send        → Bend Pine (alloy-juniper)
 *   done      → completed / saved / sent                → slate     (alloy-slate)
 *   info      → informational-only (use sparingly)      → blue      (alloy-blue)
 *   neutral   → default / no semantic weight            → midnight muted
 *
 * Only `alloy-*` tokens confirmed in globals.css (plus Tailwind `red`) are used here.
 */

export type KpiState = "attention" | "pending" | "ready" | "done" | "info" | "neutral";

const VALUE_CLASS: Record<KpiState, string> = {
    attention: "text-red-600",
    pending: "text-alloy-ember",
    ready: "text-alloy-juniper",
    done: "text-alloy-slate",
    info: "text-alloy-blue",
    neutral: "text-alloy-midnight/70",
};

const DOT_CLASS: Record<KpiState, string> = {
    attention: "bg-red-500",
    pending: "bg-alloy-ember",
    ready: "bg-alloy-juniper",
    done: "bg-alloy-slate/60",
    info: "bg-alloy-blue",
    neutral: "bg-alloy-midnight/25",
};

/** Value text color for a KPI state. */
export function kpiValueClass(state: KpiState = "neutral"): string {
    return VALUE_CLASS[state];
}

/** Status dot color for a KPI state. */
export function kpiDotClass(state: KpiState = "neutral"): string {
    return DOT_CLASS[state];
}
