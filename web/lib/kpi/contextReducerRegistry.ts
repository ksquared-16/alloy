import type { MetricKey } from "@/lib/kpi/types";

/**
 * Context-derived metric keys (KPI V1) — distinct from future Card-10 template registry.
 * All resolve from `WorkspaceKpiContext` | `DepartmentKpiContext` | `WorkUnitKpiContext` only.
 */
export const CONTEXT_DERIVED_METRIC_KEYS: readonly MetricKey[] = [
    "ctx.workspace.total_in_scope",
    "ctx.dept.total_in_scope",
    "ctx.dept.queue_total",
    "ctx.dept.needs_attention_count",
    "ctx.wu.total_in_queue",
    "ctx.wu.selected_queue_count",
    "ctx.wu.primary_lane_total",
    "ctx.wu.needs_attention_count",
] as const;

const SET = new Set<string>(CONTEXT_DERIVED_METRIC_KEYS);

export function isContextDerivedMetricKey(key: string): boolean {
    return SET.has(key);
}
