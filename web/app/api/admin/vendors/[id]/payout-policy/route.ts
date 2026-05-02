import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { VendorPayoutPolicy } from "@/lib/admin/vendorPayoutPolicy";

/** PATCH: set or clear vendor.metadata.vendor_payout_policy. Admin only. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: vendorId } = await context.params;
    if (!vendorId) return NextResponse.json({ error: "Missing vendor id" }, { status: 400 });

    let body: { vendor_payout_policy?: VendorPayoutPolicy | null } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: vendor, error: fetchErr } = await supabase
        .from("vendors")
        .select("id, org_id, metadata")
        .eq("id", vendorId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const currentMeta = (vendor as { metadata?: Record<string, unknown> }).metadata ?? {};
    const newMeta =
        "vendor_payout_policy" in body
            ? { ...currentMeta, vendor_payout_policy: body.vendor_payout_policy ?? null }
            : currentMeta;

    const { error: updateErr } = await supabase
        .from("vendors")
        .update({ metadata: newMeta })
        .eq("id", vendorId)
        .eq("org_id", ctx.orgId);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, vendor_payout_policy: newMeta.vendor_payout_policy ?? null });
}
