import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { listEmploymentPositions } from "@/lib/employment/employmentService";

/**
 * Records bootstrap — the tenant vocabulary both sections need, resolved once.
 *
 * `positions` carries the KEY as well as the label because Records' position cohorts are
 * predicate-driven over configured classification: "Lead Teachers" exists because the tenant
 * configured a Lead Teacher position, not because the platform knows the phrase. Matching on the
 * label would break the moment a tenant renamed it.
 *
 * `todayYmd` is the ORGANISATION's operational day, not the browser's — a cohort like "Starting
 * Soon" that used the client clock would disagree with every other surface about which day it is.
 */
export async function GET() {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    try {
        const [positions, sitesResult, todayYmd] = await Promise.all([
            listEmploymentPositions(supabase, ctx.orgId, { activeOnly: true }),
            supabase
                .from("locations")
                .select("id, label")
                .eq("org_id", ctx.orgId)
                .eq("location_type", "site")
                .eq("is_active", true)
                .order("label"),
            resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId),
        ]);

        return NextResponse.json({
            ok: true,
            positions: positions.map((p) => ({ id: p.id, key: p.key ?? null, label: p.label })),
            sites: ((sitesResult.data ?? []) as { id: string; label: string | null }[]).map((s) => ({
                id: s.id,
                label: (s.label ?? "").trim() || "Untitled location",
            })),
            todayYmd,
        });
    } catch (e) {
        console.error("[records-bootstrap]", e);
        return NextResponse.json(
            { ok: false, error: "BOOTSTRAP_FAILED", message: e instanceof Error ? e.message : "failed" },
            { status: 500 }
        );
    }
}
