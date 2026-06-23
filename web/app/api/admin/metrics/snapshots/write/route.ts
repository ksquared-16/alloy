import { NextRequest, NextResponse } from "next/server";

import { isInternalCronAuthorized } from "@/lib/admin/cronAuth";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { parseMetricTimeWindow } from "@/lib/metrics/timeWindow";
import { writeAllOrgMetricSnapshots, writeOrgMetricSnapshots } from "@/lib/metrics/snapshots/writeOrgMetricSnapshots";
import type { MetricTimeWindowKey } from "@/lib/metrics/types";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

const ALLOWED_WINDOWS = new Set<MetricTimeWindowKey>(["rolling_7d", "rolling_30d"]);

/**
 * POST /api/admin/metrics/snapshots/write
 *
 * Append live-resolved metric snapshots for trend history.
 *
 * Auth: `x-cron-token` (all orgs) or admin/ops session (single org only).
 * Body: { org_id?, windows?, include_site_scopes? }
 */
export async function POST(request: NextRequest) {
    let body: unknown = {};
    try {
        if (request.headers.get("content-type")?.includes("application/json")) {
            body = await request.json();
        }
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const cronOk = isInternalCronAuthorized(request);
    let orgIdFilter: string | null = null;

    if (cronOk) {
        orgIdFilter = isRecord(body) && typeof body.org_id === "string" ? body.org_id.trim() || null : null;
    } else {
        const forbidden = await requireAdminOrOps();
        if (forbidden) return forbidden;
        const ctx = await getAdminAccessContextCached();
        if (!ctx.ok) return adminContextFailureResponse(ctx);
        orgIdFilter = ctx.orgId;
    }

    const windowsRaw = isRecord(body) && Array.isArray(body.windows) ? body.windows : null;
    const windows: MetricTimeWindowKey[] = [];
    if (windowsRaw) {
        for (const w of windowsRaw) {
            if (typeof w !== "string") continue;
            const parsed = parseMetricTimeWindow(w);
            if (parsed && ALLOWED_WINDOWS.has(parsed)) windows.push(parsed);
        }
    }

    const includeSiteScopes =
        !isRecord(body) || body.include_site_scopes == null ? true : Boolean(body.include_site_scopes);

    const supabase = createAdminClient();

    if (cronOk && !orgIdFilter) {
        const batch = await writeAllOrgMetricSnapshots({
            supabase,
            orgIdFilter: null,
            windows: windows.length ? windows : undefined,
            includeSiteScopes,
        });
        return NextResponse.json({
            ok: true,
            mode: "cron_all_orgs",
            orgs_processed: batch.orgs,
            written: batch.written,
            skipped: batch.skipped,
            errors: batch.errors.slice(0, 20),
            error_count: batch.errors.length,
        });
    }

    if (!orgIdFilter) {
        return NextResponse.json({ ok: false, error: "ORG_REQUIRED" }, { status: 400 });
    }

    const accessCtx = cronOk ? null : await getAdminAccessContextCached();
    const scope = accessCtx?.ok ? scopeDimensionsFromAccess(accessCtx) : undefined;

    const { data: orgSettings } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", orgIdFilter)
        .maybeSingle();

    const result = await writeOrgMetricSnapshots({
        supabase,
        orgId: orgIdFilter,
        scope,
        windows: windows.length ? windows : undefined,
        includeSiteScopes,
        orgMetadata: (orgSettings as { metadata?: unknown } | null)?.metadata ?? null,
    });

    return NextResponse.json({
        ok: true,
        mode: cronOk ? "cron_single_org" : "admin_single_org",
        org_id: orgIdFilter,
        written: result.written,
        skipped: result.skipped,
        errors: result.errors.slice(0, 20),
        error_count: result.errors.length,
    });
}
