import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { resolveMetrics } from "@/lib/metrics/metricEngine";
import { getMetricPack } from "@/lib/metrics/packs";
import { assertMetricSiteAccess } from "@/lib/metrics/resolveMetricSiteAccess";
import { parseMetricTimeWindow } from "@/lib/metrics/timeWindow";
import type { MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/overview-metrics?site_location_id=…&window=…
 *
 * The Financials landing figures, resolved THROUGH the Operational Intelligence metric engine
 * rather than beside it.
 *
 * ── WHY THIS EXISTS ALONGSIDE `/api/admin/metrics/resolve` ──
 *
 * That route is the analytics plane's, and it gates on analytics read access. The Financials
 * workspace gates on `fin.read`: an operator who runs the financial day is not necessarily an
 * analytics reader, and an analytics reader is not automatically entitled to money. The
 * ENGINE is shared — the same `resolveMetrics`, the same registry, the same resolvers — and
 * only the door differs. Nothing here computes a metric, and the key list is the registered
 * Financials pack rather than anything this route chose.
 *
 * ── SCOPE ──
 *
 * The gate's own dimensions are passed to the engine, and a requested site is verified against
 * them before it is used, so the tiles cannot answer a question the queue beneath them refuses.
 */
export async function GET(request: NextRequest) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const access = gate.access;

    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: access.orgId, userId: access.userId });
    if (!allowed.ok) {
        return NextResponse.json({ error: allowed.message }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const windowParam = params.get("window");
    const parsedWindow = windowParam ? parseMetricTimeWindow(windowParam) : null;
    if (windowParam && !parsedWindow) {
        return NextResponse.json(
            { error: "Invalid window", allowed: ["rolling_24h", "rolling_7d", "rolling_30d"] },
            { status: 400 },
        );
    }
    const window: MetricTimeWindowKey = parsedWindow ?? "rolling_30d";

    const scope = scopeDimensionsFromAccess(access);
    const siteId = params.get("site_location_id")?.trim() || null;
    if (siteId) {
        const siteAllowed = await assertMetricSiteAccess({ supabase, orgId: access.orgId, scope, siteId });
        if (!siteAllowed) {
            return NextResponse.json({ error: "Site not in access scope" }, { status: 403 });
        }
    }

    const pack = getMetricPack("financials");
    const keys = [...(pack?.metricKeys ?? [])] as OipMetricKey[];
    if (keys.length === 0) {
        return NextResponse.json({ ok: false, error: "Financials metric pack is empty" }, { status: 500 });
    }

    try {
        const resolved = await resolveMetrics({
            ctx: { supabase, orgId: access.orgId, scope, window, siteLocationId: siteId, mode: "live" },
            keys,
            includeKpi: false,
        });
        return NextResponse.json({
            ok: true,
            window,
            site_location_id: siteId,
            metrics: resolved.map(({ metric }) => ({
                metric_key: metric.key,
                label: metric.label,
                format: metric.format,
                value: metric.value,
                formatted_value: metric.formattedValue,
                window: metric.window,
                window_start: metric.windowStartIso,
                window_end: metric.windowEndIso,
                computed_at: metric.computedAtIso,
                sources: metric.sources,
                meta: metric.meta,
            })),
        });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
