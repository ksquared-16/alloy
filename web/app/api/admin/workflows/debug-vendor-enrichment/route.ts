import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { getAdminAuth, requireAdminOrOps } from "@/lib/adminAuth";

/**
 * GET /api/admin/workflows/debug-vendor-enrichment?vendor_id=...
 * Returns vendor row + vendor_status (id, key, label) + vendor_vertical_ids, vendor_vertical_keys, vendor_vertical_names.
 * Gated to non-production (NODE_ENV !== 'production' or VERCEL_ENV !== 'production').
 */
export async function GET(request: NextRequest) {
    const isProduction =
        process.env.NODE_ENV === "production" ||
        process.env.VERCEL_ENV === "production";
    if (isProduction) {
        return NextResponse.json({ error: "Not available in production" }, { status: 404 });
    }

    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuth();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const vendorId = searchParams.get("vendor_id")?.trim();
    if (!vendorId) {
        return NextResponse.json({ error: "Missing vendor_id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "vendors", vendorId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const { data: vendor, error: vendorErr } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", vendorId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (vendorErr) {
        return NextResponse.json({ error: vendorErr.message }, { status: 500 });
    }
    if (!vendor) {
        return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const out: Record<string, unknown> = { vendor };

    const statusId = (vendor as { vendor_status_id?: string | null }).vendor_status_id;
    if (statusId) {
        const { data: vs } = await supabase
            .from("vendor_statuses")
            .select("id, key, label")
            .eq("id", statusId)
            .maybeSingle();
        out.vendor_status = vs ? { id: vs.id, key: (vs as { key: string }).key, label: (vs as { label: string }).label } : null;
    } else {
        out.vendor_status = null;
    }

    const { data: vvRows } = await supabase
        .from("vendor_verticals")
        .select("vertical_id")
        .eq("vendor_id", vendorId);
    const verticalIds = ((vvRows ?? []) as { vertical_id: string }[]).map((r) => r.vertical_id);
    out.vendor_vertical_ids = verticalIds;

    if (verticalIds.length > 0) {
        const { data: vertRows } = await supabase
            .from("verticals")
            .select("id, slug, name")
            .in("id", verticalIds);
        const keys: string[] = [];
        const names: string[] = [];
        for (const v of vertRows ?? []) {
            const r = v as { id: string; slug?: string | null; name?: string | null };
            keys.push(r.slug ?? r.id);
            names.push(r.name ?? r.id);
        }
        out.vendor_vertical_keys = keys;
        out.vendor_vertical_names = names;
    } else {
        out.vendor_vertical_keys = [];
        out.vendor_vertical_names = [];
    }

    return NextResponse.json(out);
}
