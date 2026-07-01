/**
 * Forms pack metrics.
 */

import type { MetricResolveContext, ResolvedMetricValue } from "@/lib/metrics/types";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { buildMetricResultBase } from "@/lib/metrics/resolvers/metricResolveBase";
import { resolveMetricScopeFilter } from "@/lib/metrics/scopeFilter";

export type FormSubmissionMetricRow = {
    id: string;
    status: string;
    created_at: string;
    submitted_at: string | null;
};

export type PacketSessionRow = {
    id: string;
    created_at: string;
    completed_at: string | null;
    status: string;
};

export function computeFormCompletionRate(rows: FormSubmissionMetricRow[]): {
    rate: number | null;
    created: number;
    submitted: number;
} {
    const created = rows.length;
    const submitted = rows.filter((r) => r.status === "submitted").length;
    if (created === 0) return { rate: null, created: 0, submitted: 0 };
    return { rate: submitted / created, created, submitted };
}

export function computeMedianPacketCompletionHours(sessions: PacketSessionRow[]): {
    medianHours: number | null;
    sampleSize: number;
} {
    const durations: number[] = [];
    for (const s of sessions) {
        if (!s.completed_at || s.status !== "completed") continue;
        const delta = new Date(s.completed_at).getTime() - new Date(s.created_at).getTime();
        if (delta >= 0) durations.push(delta);
    }
    if (!durations.length) return { medianHours: null, sampleSize: 0 };
    durations.sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    const medianMs =
        durations.length % 2 === 1 ? durations[mid]! : (durations[mid - 1]! + durations[mid]!) / 2;
    return { medianHours: medianMs / (1000 * 60 * 60), sampleSize: durations.length };
}

export async function resolveFormsCompletionRate(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("forms.completion_rate");
    const now = ctx.now ?? new Date();
    const base = buildMetricResultBase(ctx, def, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);
    if (filter.impossible) {
        return { ...base, value: null, formattedValue: "—", meta: { created: 0, submitted: 0 } };
    }

    const { data, error } = await ctx.supabase
        .from("form_submissions")
        .select("id, status, created_at, submitted_at")
        .eq("org_id", ctx.orgId)
        .gte("created_at", base.windowStartIso)
        .lte("created_at", base.windowEndIso);

    if (error) throw new Error(error.message);
    const { rate, created, submitted } = computeFormCompletionRate((data ?? []) as FormSubmissionMetricRow[]);

    return {
        ...base,
        value: rate,
        formattedValue: formatMetricValue(def.format, rate),
        meta: { created, submitted },
    };
}

export async function resolveFormsPacketCompletionTime(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("forms.packet_completion_time");
    const now = ctx.now ?? new Date();
    const base = buildMetricResultBase(ctx, def, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);
    if (filter.impossible) {
        return { ...base, value: null, formattedValue: "—", meta: { sample_size: 0 } };
    }

    const { data, error } = await ctx.supabase
        .from("form_packet_sessions")
        .select("id, created_at, completed_at, status")
        .eq("org_id", ctx.orgId)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .gte("completed_at", base.windowStartIso)
        .lte("completed_at", base.windowEndIso);

    if (error) throw new Error(error.message);
    const { medianHours, sampleSize } = computeMedianPacketCompletionHours((data ?? []) as PacketSessionRow[]);

    return {
        ...base,
        value: medianHours,
        formattedValue: formatMetricValue(def.format, medianHours),
        meta: { sample_size: sampleSize, unit: "hours" },
    };
}
