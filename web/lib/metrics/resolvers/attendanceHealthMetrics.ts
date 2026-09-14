/**
 * Attendance health — three DIFFERENT questions, kept apart on purpose.
 *
 *   1. TRUTH QUALITY       how often did we have to correct what we recorded?
 *   2. INTEGRATION HEALTH  what did another system send that we could not use?
 *   3. CONSEQUENCE HEALTH  what followed from attendance and is not settled?
 *
 * Collapsing these into one "Attendance errors" number is the failure this
 * module is shaped against. They have different owners, different remedies and
 * different audiences: a correction is an operator fixing a mistake, an unmapped
 * provider event is an integration nobody has finished wiring, and an unresolved
 * consequence is a billing decision waiting on a person. One number would tell
 * whoever saw it to go and fix the wrong thing.
 *
 * ── PROVIDER EVIDENCE IS NOT ATTENDANCE ──
 *
 * `attendance_integration_events` is an inbox. A row there says a system sent
 * something, not that a child was present. An unmapped event therefore worsens
 * integration health and leaves every Attendance count untouched — which is why
 * this metric counts inbox rows and no Attendance metric reads that table at all.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricResolveContext, OipMetricKey, ResolvedMetricValue } from "@/lib/metrics/types";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { resolveMetricTimeWindowBounds } from "@/lib/metrics/timeWindow";
import { resolveReadableSiteIds } from "@/lib/metrics/resolvers/attendanceMetricScope";
import {
    ATTENDANCE_CONSUMPTION_FAMILY,
    type ConsequenceStatus,
} from "@/lib/childcareOperational/attendance/attendanceConsequenceContext";

/** Inbox dispositions that represent something an operator may need to fix. */
export const UNUSABLE_DISPOSITIONS = ["unmapped", "unattributed", "conflicted", "rejected"] as const;

function shell(
    ctx: MetricResolveContext,
    key: OipMetricKey,
    value: number | null,
    meta: Record<string, unknown>,
    bounds?: { windowStart: Date; windowEnd: Date },
): ResolvedMetricValue {
    const def = getMetricDefinition(key);
    const now = new Date().toISOString();
    return {
        key,
        label: def.label,
        format: def.format,
        value,
        formattedValue: formatMetricValue(def.format, value),
        window: ctx.window,
        windowStartIso: bounds ? bounds.windowStart.toISOString() : now,
        windowEndIso: bounds ? bounds.windowEnd.toISOString() : now,
        computedAtIso: now,
        sources: def.sources,
        resolveMode: "live",
        meta,
    };
}

/* ------------------------------------------------------------------ */
/* 1. Truth quality                                                    */
/* ------------------------------------------------------------------ */

/**
 * Share of authored attendance facts that were corrected or reversed.
 *
 * This is the one historical metric that legitimately counts RAW event volume,
 * and the reason is worth stating: its business question is "how often do we have
 * to correct ourselves", so the corrections ARE the subject. Every other
 * historical Attendance metric must fold to corrected meaning first, because
 * there the corrections are noise rather than signal.
 */
export function computeCorrectionRate(rows: readonly { entry_type: string }[]): number | null {
    if (rows.length === 0) return null; // no facts is not a 0% correction rate
    const corrected = rows.filter(
        (r) => r.entry_type === "correction" || r.entry_type === "reversal",
    ).length;
    return corrected / rows.length;
}

export async function resolveAttendanceCorrectionRate(
    ctx: MetricResolveContext,
): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "attendance.correction_rate";
    const siteIds = await resolveReadableSiteIds(ctx);
    if (siteIds === null) return shell(ctx, key, null, { unsupported_scope: true });

    const bounds = resolveMetricTimeWindowBounds(ctx.window);
    if (siteIds.length === 0) return shell(ctx, key, null, { site_count: 0 }, bounds);

    let q = (ctx.supabase as SupabaseClient)
        .from("child_attendance_events")
        .select("entry_type")
        .eq("org_id", ctx.orgId)
        .gte("event_at", bounds.windowStart.toISOString())
        .lte("event_at", bounds.windowEnd.toISOString());
    if (ctx.siteLocationId) q = q.eq("site_location_id", ctx.siteLocationId);

    const { data, error } = await q;
    if (error) return shell(ctx, key, null, { error: error.message }, bounds);

    const rows = (data ?? []) as { entry_type: string }[];
    return shell(ctx, key, computeCorrectionRate(rows), { fact_count: rows.length }, bounds);
}

/* ------------------------------------------------------------------ */
/* 2. Integration health                                               */
/* ------------------------------------------------------------------ */

export async function resolveAttendanceUnmappedEventCount(
    ctx: MetricResolveContext,
): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "attendance.unmapped_event_count";
    const bounds = resolveMetricTimeWindowBounds(ctx.window);

    /*
     * The inbox carries no site linkage, so this is org-wide only and the
     * registry says so with `orgScopeOnly`. A narrowed request must be reported
     * as unsupported rather than answered with the org number, which would read
     * as a site figure.
     */
    if (ctx.siteLocationId) {
        return shell(ctx, key, null, { unsupported_scope: "org_only" }, bounds);
    }

    const { data, error } = await (ctx.supabase as SupabaseClient)
        .from("attendance_integration_events")
        .select("disposition")
        .eq("org_id", ctx.orgId)
        .in("disposition", [...UNUSABLE_DISPOSITIONS])
        .gte("created_at", bounds.windowStart.toISOString())
        .lte("created_at", bounds.windowEnd.toISOString());
    if (error) return shell(ctx, key, null, { error: error.message }, bounds);

    const rows = (data ?? []) as { disposition: string }[];
    const byDisposition: Record<string, number> = {};
    for (const r of rows) byDisposition[r.disposition] = (byDisposition[r.disposition] ?? 0) + 1;

    return shell(ctx, key, rows.length, { by_disposition: byDisposition }, bounds);
}

/* ------------------------------------------------------------------ */
/* 3. Consequence health                                               */
/* ------------------------------------------------------------------ */

export async function resolveAttendanceConsequenceReviewCount(
    ctx: MetricResolveContext,
): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "attendance.consequence_review_count";
    const siteIds = await resolveReadableSiteIds(ctx);
    if (siteIds === null) return shell(ctx, key, null, { unsupported_scope: true });

    /*
     * Status only. No amount, no rate, no total — Thread 7 owns what a
     * consequence is worth and the Financials pack owns every monetary metric.
     * This counts how many are waiting on a decision, which is an operational
     * question Attendance may legitimately ask about its own consequences.
     */
    const pending: ConsequenceStatus = "recorded";
    let q = (ctx.supabase as SupabaseClient)
        .from("consumption_events")
        .select("status")
        .eq("org_id", ctx.orgId)
        .eq("source_family", ATTENDANCE_CONSUMPTION_FAMILY)
        .eq("status", pending);
    if (ctx.siteLocationId) q = q.eq("location_id", ctx.siteLocationId);

    const { data, error } = await q;
    if (error) return shell(ctx, key, null, { error: error.message });

    const rows = (data ?? []) as { status: string }[];
    return shell(ctx, key, rows.length, { status: pending });
}
