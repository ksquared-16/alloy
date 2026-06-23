/**
 * Entity-snapshot metrics — point-in-time counts from authoritative tables.
 */

import type { MetricResolveContext, ResolvedMetricValue } from "@/lib/metrics/types";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { resolveMetricTimeWindowBounds } from "@/lib/metrics/timeWindow";
import { loadScopedOpportunityIds, resolveMetricScopeFilter } from "@/lib/metrics/scopeFilter";

export type OperationalTaskMetricRow = {
    id: string;
    status: string;
    due_at: string;
    entity_id: string;
};

export function countOverdueOpenTasks(tasks: OperationalTaskMetricRow[], now: Date): number {
    const nowMs = now.getTime();
    return tasks.filter((t) => t.status === "open" && new Date(t.due_at).getTime() < nowMs).length;
}

export async function resolveOpsWorkOverdueCount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("ops.work_overdue_count");
    const now = ctx.now ?? new Date();
    const { windowStart, windowEnd } = resolveMetricTimeWindowBounds(ctx.window, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);

    const base: Omit<ResolvedMetricValue, "value" | "formattedValue" | "meta"> = {
        key: def.key,
        label: def.label,
        format: def.format,
        window: ctx.window,
        windowStartIso: windowStart.toISOString(),
        windowEndIso: windowEnd.toISOString(),
        computedAtIso: now.toISOString(),
        sources: def.sources,
        resolveMode: ctx.mode ?? "live",
    };

    if (filter.impossible) {
        return { ...base, value: 0, formattedValue: formatMetricValue(def.format, 0), meta: { overdue: 0 } };
    }

    let q = ctx.supabase
        .from("operational_tasks")
        .select("id, status, due_at, entity_id")
        .eq("org_id", ctx.orgId)
        .eq("status", "open");

    const scopedOppIds = await loadScopedOpportunityIds(ctx.supabase, ctx.orgId, filter);
    if (scopedOppIds !== null) {
        if (!scopedOppIds.length) {
            return { ...base, value: 0, formattedValue: formatMetricValue(def.format, 0), meta: { overdue: 0 } };
        }
        q = q.in("entity_id", scopedOppIds);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const overdue = countOverdueOpenTasks((data ?? []) as OperationalTaskMetricRow[], now);

    return {
        ...base,
        value: overdue,
        formattedValue: formatMetricValue(def.format, overdue),
        meta: { overdue, snapshot: true },
    };
}
