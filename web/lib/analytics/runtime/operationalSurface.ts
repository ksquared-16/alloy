/**
 * Operational Intelligence surface — SERVER data builder.
 *
 * Resolves real OIP metrics (via the existing MetricEngine), one scoped opportunity
 * status breakdown (smallest-safe server resolver, reusing existing scope helpers),
 * and drill hrefs (via the Phase 1 DrillResolver). Produces a serializable model.
 *
 * Product model: the RUNTIME surface is the Workspace → Operational Intelligence modal
 * (rendered by OperationalIntelligencePanel, fed by /api/admin/intelligence/operational);
 * CONFIGURATION lives in Surfaces. There is no standalone product page — routes are
 * implementation details for data/modal state only.
 *
 * No new metric engine, no OIP math duplication, no migrations.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import type { MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";
import { resolveMetrics } from "@/lib/metrics/metricEngine";
import { readMetricTrend } from "@/lib/metrics/snapshots/readMetricTrend";
import { resolveMetricScopeFilter, applyOpportunityScopeToQuery } from "@/lib/metrics/scopeFilter";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { resolvePlacementsForSurface } from "@/lib/metrics/platform/placementResolver";
import { getOperationalCalculation } from "@/lib/analytics/calculations/registry";
import { isKnownOipMetricKey } from "@/lib/metrics/registry";
import {
    resolveCalculationDrill,
    resolveDrill,
    getDrillContract,
    type WorkspaceQueueLocator,
} from "@/lib/analytics/runtime/drillResolver";
import type { AnalyticsContext, DrillSelection } from "@/lib/analytics/runtime/types";
import { periodDaysForWindow, windowLabel } from "@/lib/analytics/runtime/metricWindow";
import {
    assembleBreakdownBars,
    affectedWorkFromBreakdown,
    healthFromKpiStatus,
    tallyStatusCounts,
    buildMetricComparison,
    resolveSiteLabel,
    deriveConfiguredMetrics,
    type OperationalMetricCard,
    type OperationalSurfaceModel,
    type SiteOption,
} from "@/lib/analytics/runtime/operationalSurfaceModel";

/**
 * Default metric set when no placements are configured for `operational_intelligence`.
 * When placements exist (Settings → Analytics → "Where it appears"), they drive the
 * set/order/labels instead — configuration reaches the runtime modal.
 */
const SURFACE_METRIC_KEYS: readonly OipMetricKey[] = [
    "enrollment.lead_count",
    "enrollment.tour_conversion_rate",
    "ops.needs_attention_count",
    "ops.work_overdue_count",
    "comms.delivery_rate",
];

/** Resolve the configured metric list from placements; empty when none are placed. */
async function resolveConfiguredMetricList(
    supabase: SupabaseClient,
    orgId: string,
): Promise<Array<{ key: OipMetricKey; label: string }>> {
    try {
        const placements = await resolvePlacementsForSurface({
            supabase,
            orgId,
            surface: "operational_intelligence",
        });
        return deriveConfiguredMetrics(placements, isKnownOipMetricKey).map((m) => ({
            key: m.key as OipMetricKey,
            label: m.label,
        }));
    } catch {
        return [];
    }
}

const OPPORTUNITY_BREAKDOWN_CAP = 5000;
const WORKSPACE_LANDING_HREF = "/adminV2/workspace";

export type BuildOperationalSurfaceParams = {
    supabase: SupabaseClient;
    orgId: string;
    accessScope: AdminAccessScopeDimensions;
    windowKey: MetricTimeWindowKey;
    siteId: string | null;
    siteOptions: SiteOption[];
    compareOn: boolean;
};

/** Resolve a single workspace work-unit + department to drill into (best-effort). */
async function resolveWorkspaceLocator(
    supabase: SupabaseClient,
    orgId: string,
): Promise<WorkspaceQueueLocator | null> {
    try {
        const { data, error } = await supabase
            .from("work_units")
            .select("id, name, department_id")
            .eq("org_id", orgId)
            .limit(50);
        if (error || !data?.length) return null;

        type WuRow = { id: string; name: string | null; department_id: string | null };
        const rows = (data as WuRow[]).filter((r) => r.id && r.department_id);
        if (!rows.length) return null;

        const enrollmentish = rows.find((r) => /enroll|pipeline|lead/i.test(String(r.name ?? "")));
        const chosen = enrollmentish ?? rows[0];
        const departmentId = String(chosen.department_id);
        const workUnitId = String(chosen.id);

        return {
            workspaceBasePath: WORKSPACE_LANDING_HREF,
            departmentId,
            // Every Phase-1 drill contract key resolves to this work unit for the
            // org-level surface; the status filter narrows the landing queue.
            resolveWorkUnitId: () => workUnitId,
        };
    } catch {
        return null;
    }
}

/** Smallest-safe breakdown: open opportunities grouped by status_key, scoped + capped. */
async function resolveOpportunityStatusCounts(
    supabase: SupabaseClient,
    orgId: string,
    accessScope: AdminAccessScopeDimensions,
    siteId: string | null,
): Promise<{ counts: { statusKey: string; count: number }[]; labelFor: (k: string) => string; bounded: boolean }> {
    const filter = await resolveMetricScopeFilter(supabase, orgId, accessScope, siteId);
    if (filter.impossible) {
        return { counts: [], labelFor: (k) => k, bounded: false };
    }

    let q = supabase
        .from("opportunities")
        .select("id, status_key")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(OPPORTUNITY_BREAKDOWN_CAP);
    q = applyOpportunityScopeToQuery(q, filter);

    const { data, error } = await q;
    if (error) throw new Error(`operational status breakdown: ${error.message}`);

    const rows = (data ?? []) as Array<{ status_key: string | null }>;
    const counts = tallyStatusCounts(rows.map((r) => r.status_key));

    const defs = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities");
    const labelMap = new Map(defs.map((d) => [d.status_key, d.status_label?.trim() || d.status_key]));
    const labelFor = (k: string) => labelMap.get(k) ?? k;

    return { counts, labelFor, bounded: rows.length >= OPPORTUNITY_BREAKDOWN_CAP };
}

export async function buildOperationalSurfaceModel(
    params: BuildOperationalSurfaceParams,
): Promise<OperationalSurfaceModel> {
    const { supabase, orgId, accessScope, windowKey, siteId, siteOptions, compareOn } = params;
    const siteLabel = resolveSiteLabel(siteId, siteOptions);
    const dataNotes: string[] = [];

    const ctx: AnalyticsContext = {
        orgId,
        accessScope,
        surfaceId: "operational",
        dateRange: { version: 1, kind: "rolling", days: periodDaysForWindow(windowKey) },
        siteLocationIds: siteId ? [siteId] : null,
    };

    const locator = await resolveWorkspaceLocator(supabase, orgId);
    if (!locator) {
        dataNotes.push("No workspace work unit resolved — drills fall back to the workspace landing.");
    }

    /** Resolve a calculation's default drill, falling back to the workspace landing. */
    function cardDrill(key: OipMetricKey): { href: string; label: string } {
        if (locator) {
            const intent = resolveCalculationDrill(getOperationalCalculation(key), ctx, locator);
            if (intent.kind === "href") return { href: intent.href, label: intent.label };
        }
        return { href: WORKSPACE_LANDING_HREF, label: "Open workspace" };
    }

    // 1) Metric set: configured placements (Settings → Analytics → "Where it appears")
    //    drive the set / order / labels; fall back to code defaults when none are placed.
    const configured = await resolveConfiguredMetricList(supabase, orgId);
    const metricsSource: "configured" | "default" = configured.length > 0 ? "configured" : "default";
    const metricList: Array<{ key: OipMetricKey; label: string }> =
        configured.length > 0
            ? configured
            : SURFACE_METRIC_KEYS.map((key) => ({ key, label: getOperationalCalculation(key).label }));
    const metricKeys = metricList.map((m) => m.key);

    // Real OIP metric values (live; honors the modal-local site/window filters).
    const resolved = await resolveMetrics({
        ctx: {
            supabase,
            orgId,
            scope: accessScope,
            window: windowKey,
            siteLocationId: siteId,
            dimensions: {},
            mode: "live",
        },
        keys: metricKeys,
        includeKpi: true,
    });
    const resolvedByKey = new Map(resolved.map((r) => [r.metric.key, r]));

    // Optional prior-period comparison — real snapshot deltas (metric_snapshots);
    // honest "no prior snapshot yet" copy when history is sparse. Never fabricated.
    const trendByKey = new Map<OipMetricKey, Awaited<ReturnType<typeof readMetricTrend>>>();
    if (compareOn) {
        const scopeType = siteId ? "site" : "org";
        const trends = await Promise.all(
            metricKeys.map((key) =>
                readMetricTrend(supabase, { orgId, metricKey: key, windowKey, scopeType, scopeId: siteId }).catch(
                    () => null,
                ),
            ),
        );
        metricKeys.forEach((key, i) => {
            const t = trends[i];
            if (t) trendByKey.set(key, t);
        });
        if (![...trendByKey.values()].some((t) => t.hasTrend)) {
            dataNotes.push("Comparison is on, but no prior snapshots exist yet for this scope — deltas appear once snapshot history accrues.");
        }
    }

    let freshnessIso: string | null = null;

    const metrics: OperationalMetricCard[] = metricList.map(({ key, label }) => {
        const calc = getOperationalCalculation(key);
        const row = resolvedByKey.get(key);
        const drill = cardDrill(key);
        const computedAt = row?.metric.computedAtIso ?? null;
        if (computedAt && (!freshnessIso || computedAt > freshnessIso)) freshnessIso = computedAt;
        return {
            key,
            label,
            question: calc.questionAnswered,
            value: row?.metric.value ?? null,
            formattedValue: row?.metric.formattedValue ?? "—",
            format: calc.format,
            health: healthFromKpiStatus(row?.kpi?.status),
            bounded: calc.bounded,
            drillHref: drill.href,
            drillLabel: drill.label,
            comparison: buildMetricComparison(trendByKey.get(key) ?? null, compareOn),
        };
    });

    dataNotes.push(
        metricsSource === "configured"
            ? `Metrics are configured in Settings → Analytics → "Where it appears" (${metricList.length} placed). Live in this modal.`
            : `Showing default metrics — place metrics in Settings → Analytics → "Where it appears" to customize this modal.`,
    );

    // 2) Real breakdown (open opportunities by status), with per-segment queue drills.
    const leadsContract = getDrillContract("enrollment.leads");
    function segmentDrill(statusKey: string): string | null {
        if (!locator || !leadsContract) return null;
        const selection: DrillSelection = {
            destinationKind: "queue",
            target: "queue/leads",
            dimensionKey: "status_key",
            dimensionValue: statusKey,
        };
        const intent = resolveDrill(leadsContract, ctx, locator, selection);
        return intent.kind === "href" ? intent.href : null;
    }

    let breakdownBars: ReturnType<typeof assembleBreakdownBars> = [];
    let breakdownBounded = false;
    try {
        const { counts, labelFor, bounded } = await resolveOpportunityStatusCounts(
            supabase,
            orgId,
            accessScope,
            siteId,
        );
        breakdownBounded = bounded;
        breakdownBars = assembleBreakdownBars(counts, labelFor, segmentDrill);
        if (bounded) dataNotes.push(`Breakdown sampled the most recent ${OPPORTUNITY_BREAKDOWN_CAP} opportunities.`);
        if (!breakdownBars.length) dataNotes.push("No open opportunities in scope for the status breakdown.");
    } catch (err) {
        dataNotes.push(`Status breakdown unavailable: ${(err as Error).message}`);
    }

    const affectedWork = affectedWorkFromBreakdown(breakdownBars);

    dataNotes.unshift(
        "Metrics and breakdown are resolved live from OIP/operational data; drills navigate to real workspace queues.",
    );

    return {
        windowKey,
        windowLabel: windowLabel(windowKey),
        siteId,
        siteLabel,
        siteOptions,
        compareOn,
        metricsSource,
        freshnessIso,
        metrics,
        breakdown: {
            title: "Open opportunities by status",
            question: "Where is enrollment demand sitting right now?",
            bars: breakdownBars,
            bounded: breakdownBounded,
            note: "Each bar opens the matching workspace queue, filtered to that status.",
        },
        affectedWork,
        dataNotes,
    };
}
