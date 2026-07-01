/**
 * Operational health pack — workflow runs, attention, readiness evaluators.
 *
 * ATTENTION / READINESS metrics use bounded candidate scans (snapshot semantics).
 */

import type { MetricResolveContext, ResolvedMetricValue } from "@/lib/metrics/types";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { buildMetricResultBase } from "@/lib/metrics/resolvers/metricResolveBase";
import { applyOpportunityScopeToQuery, resolveMetricScopeFilter } from "@/lib/metrics/scopeFilter";
import { applyStatusKeyDimension } from "@/lib/metrics/dimensionsFilter";
import { createDefaultOpportunityAttentionResolvedConfig } from "@/lib/opportunities/opportunityAttentionConfig";
import { resolveOpportunityAttention } from "@/lib/opportunities/opportunityAttentionResolver";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { evaluateOperationalReadiness } from "@/lib/completion/evaluateOperationalReadiness";

export const NEEDS_ATTENTION_METRIC_FETCH_CAP = 2000;
export const READINESS_GAP_METRIC_FETCH_CAP = 500;

export type WorkflowRunMetricRow = {
    status: string;
    started_at: string;
};

export function computeWorkflowFailureRate(runs: WorkflowRunMetricRow[]): {
    rate: number | null;
    failed: number;
    terminal: number;
} {
    const terminal = runs.filter((r) => r.status !== "pending" && r.status !== "running");
    const terminalCount = terminal.length;
    if (terminalCount === 0) return { rate: null, failed: 0, terminal: 0 };
    const failed = terminal.filter((r) => r.status === "failed").length;
    return { rate: failed / terminalCount, failed, terminal: terminalCount };
}

export async function resolveOpsWorkflowFailureRate(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("ops.workflow_failure_rate");
    const now = ctx.now ?? new Date();
    const base = buildMetricResultBase(ctx, def, now);

    const { data, error } = await ctx.supabase
        .from("workflow_runs")
        .select("status, started_at")
        .eq("org_id", ctx.orgId)
        .gte("started_at", base.windowStartIso)
        .lte("started_at", base.windowEndIso);

    if (error) throw new Error(error.message);
    const { rate, failed, terminal } = computeWorkflowFailureRate((data ?? []) as WorkflowRunMetricRow[]);

    return {
        ...base,
        value: rate,
        formattedValue: formatMetricValue(def.format, rate),
        meta: { failed, terminal },
    };
}

export async function resolveOpsNeedsAttentionCount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("ops.needs_attention_count");
    const now = ctx.now ?? new Date();
    const base = buildMetricResultBase(ctx, def, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);

    if (filter.impossible) {
        return {
            ...base,
            value: 0,
            formattedValue: "0",
            meta: { count: 0, cap: NEEDS_ATTENTION_METRIC_FETCH_CAP, snapshot_semantics: true },
        };
    }

    const statusDefs = await fetchEffectiveStatusDefinitions(ctx.supabase, ctx.orgId, "opportunities");
    const attentionConfig = createDefaultOpportunityAttentionResolvedConfig();
    const nowMs = now.getTime();

    let q = ctx.supabase
        .from("opportunities")
        .select("id, status_key, metadata, monetary_value_cents, work_unit_id, location_id, updated_at, created_at")
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false })
        .limit(NEEDS_ATTENTION_METRIC_FETCH_CAP);

    if (ctx.workUnitId) {
        q = q.eq("work_unit_id", ctx.workUnitId);
    }
    q = applyOpportunityScopeToQuery(q, filter);
    q = applyStatusKeyDimension(q, ctx.dimensions);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    let count = 0;
    for (const row of data ?? []) {
        const result = resolveOpportunityAttention({
            opportunity: row as Parameters<typeof resolveOpportunityAttention>[0]["opportunity"],
            defs: statusDefs,
            nowMs,
            config: attentionConfig,
        });
        if (result.needs_attention) count++;
    }

    return {
        ...base,
        value: count,
        formattedValue: formatMetricValue(def.format, count),
        meta: {
            count,
            candidates_fetched: (data ?? []).length,
            cap: NEEDS_ATTENTION_METRIC_FETCH_CAP,
            snapshot_semantics: true,
        },
    };
}

export async function resolveOpsReadinessGapCount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("ops.readiness_gap_count");
    const now = ctx.now ?? new Date();
    const base = buildMetricResultBase(ctx, def, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);

    if (filter.impossible) {
        return {
            ...base,
            value: 0,
            formattedValue: "0",
            meta: { count: 0, cap: READINESS_GAP_METRIC_FETCH_CAP, snapshot_semantics: true },
        };
    }

    let q = ctx.supabase
        .from("opportunities")
        .select("id, status_key, metadata, org_id, work_unit_id, location_id, customer_id, primary_contact_id")
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false })
        .limit(READINESS_GAP_METRIC_FETCH_CAP);

    if (ctx.workUnitId) {
        q = q.eq("work_unit_id", ctx.workUnitId);
    }
    q = applyOpportunityScopeToQuery(q, filter);
    q = applyStatusKeyDimension(q, ctx.dimensions);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    let gapCount = 0;
    for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        try {
            const result = evaluateOperationalReadiness({
                org_id: ctx.orgId,
                subject: { entity_type: "opportunities", entity_id: String(r.id) },
                trigger: "record_view",
                record: r,
            });
            if (result.gaps.length > 0) gapCount++;
        } catch {
            // skip rows that cannot evaluate with minimal snapshot
        }
    }

    return {
        ...base,
        value: gapCount,
        formattedValue: formatMetricValue(def.format, gapCount),
        meta: {
            count: gapCount,
            candidates_fetched: (data ?? []).length,
            cap: READINESS_GAP_METRIC_FETCH_CAP,
            snapshot_semantics: true,
        },
    };
}

// Re-export overdue from entity snapshot file for metricEngine switch
export { resolveOpsWorkOverdueCount } from "@/lib/metrics/resolvers/entitySnapshotMetrics";
