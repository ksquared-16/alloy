import type { SupabaseClient } from "@supabase/supabase-js";

import {
    resolveWorkUnitHeaderKpis, workUnitHeaderKpiKeysFromSlots,
} from "@/lib/runtime/provisioning/workUnitHeaderKpiResolution";

/**
 * KPI AND WORK VIEW VALUES FOR THE FIRST-ORDER FRAME.
 *
 * Both are FIRST-ORDER product truth by Director ruling: geometry without values is not a
 * complete frame. So they are acquired inside the first-order plan, concurrently with the card
 * reads, rather than seeded beside the composition.
 *
 * ── NOTHING IS RE-IMPLEMENTED HERE ──
 *
 * KPIs resolve through `resolveWorkUnitHeaderKpis`, which already derives its key set from
 * CONFIGURED slots via `workUnitHeaderKpiKeysFromSlots` and validates each against
 * `isKnownOipMetricKey`. Work View totals resolve through `resolveWorkViewTotalsSeed`, which
 * delegates to `evaluateWorkViewTotalsForGroup` — the one canonical evaluator, whose duplication
 * with QVT this programme already closed. A second implementation of either would be exactly the
 * divergence the capability model exists to prevent.
 *
 * ── WHY THE WORK VIEW INPUTS ARRIVE FROM THE CALLER ──
 *
 * `resolveWorkViewTotalsSeed` needs the department's work units, the configured count targets,
 * the caller's record scope and the viewer's display timezone. Those are request-time facts the
 * route has already resolved — scope from the access gate, timezone from the viewer. A′ takes
 * them as inputs for the same reason it takes `authority` as an input: deciding them here would
 * make a second scope authority and a second timezone owner out of a projection runtime.
 */

export type HeaderKpiValues = { status: string; values: Record<string, unknown> };
export type WorkViewTotalValues = { status: string; totalsByViewId: Record<string, number | null> };

export async function readHeaderKpiValues(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string | null;
    siteLocationId: string | null;
    /** Configured KPI slots. The canonical resolver decides which are known metric keys. */
    configuredKpiKeys: readonly string[];
}): Promise<HeaderKpiValues> {
    const keys = workUnitHeaderKpiKeysFromSlots(params.configuredKpiKeys.map((k) => ({ sourceKey: k })));
    if (!keys.length) return { status: "ok", values: {} };

    const answer = await resolveWorkUnitHeaderKpis({
        supabase: params.supabase,
        orgId: params.orgId,
        workUnitId: params.workUnitId,
        siteLocationId: params.siteLocationId,
        keys,
    });
    // The resolver states `forbidden` itself when analytics access is refused; it is carried
    // through rather than translated, so the capability can answer FORBIDDEN and not UNAVAILABLE.
    return {
        status: answer.status,
        values: (answer as { values?: Record<string, unknown> }).values ?? {},
    };
}
