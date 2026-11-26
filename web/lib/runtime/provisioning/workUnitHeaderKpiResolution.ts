import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAnalyticsReadAccess } from "@/lib/admin/canReadAnalytics";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { resolveMetrics } from "@/lib/metrics/metricEngine";
import { isKnownOipMetricKey } from "@/lib/metrics/registry";
import { metricResolveApiItemsFromResolved } from "@/lib/metrics/metricResolveApiItem";
import { buildOipWarmScopeKey } from "@/lib/metrics/oipWorkspaceWarmCache";
import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";
import type { OipMetricKey } from "@/lib/metrics/types";

/**
 * THE HEADER KPI ANSWER, RESOLVED DURING THE DOCUMENT'S OWN COMPOSITION.
 *
 * ── THE SERIAL EDGE THIS RETIRES ──
 *
 * The Work Unit header KPIs are fetched by `useOperationalAnswers`, a client hook whose effect runs
 * on mount. Measured on deployed staging that request STARTS ~50ms AFTER the document lands and
 * finishes ~1.2-1.9s later, and because its values are authoritative rendered numerals it is the
 * completion owner: the cards finish at ~4,739ms and V2.1 is held to ~5,588-5,774ms by this edge
 * alone. Nothing about the work requires hydration — every input (org, work unit, site, the key
 * set, and the authorization scope) is already known while the document is being composed.
 *
 * ── NOT A SECOND METRIC PATH ──
 *
 * This calls the SAME `resolveMetrics` with the same context shape the route builds, over the same
 * keys the header would have asked for. No "fast" variant, no alternative definition, no new
 * endpoint. The route survives untouched; it remains the path for refreshes, for other surfaces,
 * and for any frame that arrives without a seeded answer.
 *
 * ── AUTHORIZATION IS RE-DECIDED HERE, NOT TRANSPORTED ──
 *
 * `requireAnalyticsReadAccess()` takes no arguments: it reads THIS request's own admin access
 * bundle and returns the same authoritative decision the metrics route would reach. So starting
 * earlier cannot widen the gate — a caller who may see the Work Unit but may not read analytics
 * gets `forbidden` here exactly as they would from the route. No permission verdict is persisted,
 * cached or carried; only resolved metric CONTENT travels.
 */
export type WorkUnitHeaderKpiAnswer =
    | { status: "ok"; values: Record<string, MetricResolveApiItem> }
    /** The operator may see this Work Unit but may not read analytics. NOT an error, and NOT zero. */
    | { status: "forbidden" }
    /** Resolution failed or did not finish inside its budget. The client falls back to its fetch. */
    | { status: "unavailable" };

/**
 * A BUDGET, BECAUSE OVERLAP IS THE POINT — NOT RELOCATION.
 *
 * `resolveMetrics` walks its keys SEQUENTIALLY, so a cold three-key resolve can approach the sum
 * of its parts rather than the max. Awaiting it unconditionally would risk trading a
 * post-hydration wait for a document blocked behind the same work, which is not a win. So the
 * answer joins what is ready and ships without it otherwise; the client's existing fetch remains
 * the fallback and nothing is fabricated in the meantime.
 */
export const WORK_UNIT_HEADER_KPI_JOIN_GRACE_MS = 150;

/**
 * What travels in the answer. `scopeKey` is the SAME identity the client warm cache computes, so a
 * seed resolved org-wide can never answer for an operator who has a site selected: the client
 * compares and falls back to its own fetch on any mismatch.
 */
export type WorkUnitHeaderKpiSeed = WorkUnitHeaderKpiAnswer & { scopeKey: string };

export function workUnitHeaderKpiKeysFromSlots(
    slots: ReadonlyArray<{ sourceKey?: string | null }>,
): OipMetricKey[] {
    const seen = new Set<string>();
    for (const slot of slots) {
        const k = slot.sourceKey?.trim();
        if (k && isKnownOipMetricKey(k)) seen.add(k);
    }
    // Sorted so the key SET, not slot order, is the identity — the same canonicalisation the
    // client hook applies, so a seeded answer and a client fetch address the same warm scope.
    return [...seen].sort() as OipMetricKey[];
}

export async function resolveWorkUnitHeaderKpis(args: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string | null;
    siteLocationId: string | null;
    keys: OipMetricKey[];
}): Promise<WorkUnitHeaderKpiAnswer> {
    if (!args.keys.length) return { status: "ok", values: {} };

    const auth = await requireAnalyticsReadAccess();
    if (!auth.ok) return { status: "forbidden" };

    const { data: orgSettings } = await args.supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", args.orgId)
        .maybeSingle();

    const resolved = await resolveMetrics({
        ctx: {
            supabase: args.supabase,
            orgId: args.orgId,
            scope: scopeDimensionsFromAccess(auth.access),
            window: "rolling_30d",
            siteLocationId: args.siteLocationId,
            dimensions: {},
            mode: "live",
            workUnitId: args.workUnitId,
        },
        keys: args.keys,
        orgMetadata: (orgSettings as { metadata?: unknown } | null)?.metadata ?? null,
    });

    // The SHARED serialisation — the same one the metrics route emits, so a seeded answer and a
    // client fetch are byte-comparable rather than merely similar.
    const values: Record<string, MetricResolveApiItem> = {};
    for (const item of metricResolveApiItemsFromResolved(resolved)) {
        values[item.metric_key] = item;
    }
    return { status: "ok", values };
}

/**
 * THE INJECTABLE THE ROUTE HANDS THE COMPOSER.
 *
 * Everything that reaches `next/headers` — the analytics gate above — stays on this side of the
 * boundary. The composer holds only a type import, so it never drags the auth graph into a
 * client-reachable module. Returns null rather than throwing: a header KPI that cannot be resolved
 * must degrade to "the client fetches as before", never to a failed document.
 */
export function makeWorkUnitHeaderKpiResolver(args: {
    supabase: SupabaseClient;
    orgId: string;
}): (a: {
    workUnitId: string;
    kpiSlots: ReadonlyArray<{ sourceKey?: string | null }>;
}) => Promise<WorkUnitHeaderKpiSeed | null> {
    return async ({ workUnitId, kpiSlots }) => {
        try {
            const keys = workUnitHeaderKpiKeysFromSlots(kpiSlots);
            if (!keys.length) return null;
            const answer = await resolveWorkUnitHeaderKpis({
                supabase: args.supabase,
                orgId: args.orgId,
                workUnitId,
                /*
                 * The composer carries no site filter, so the seed states the scope it WAS resolved
                 * for and the client uses it only on an exact match. An org-wide seed must never
                 * answer for an operator who has a site selected.
                 */
                siteLocationId: null,
                keys,
            });
            return {
                scopeKey: buildOipWarmScopeKey({ siteId: null, workUnitId, keys }),
                ...answer,
            };
        } catch {
            return null;
        }
    };
}
