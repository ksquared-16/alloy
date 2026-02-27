import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { getOrgConfigLocked } from "@/lib/admin/getOrgConfigLocked";
import type { VendorPayoutPolicy } from "@/lib/admin/vendorPayoutPolicy";

/** GET: org_settings for current org. Admin/ops read. */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("org_settings")
        .select("org_id, payout_type, payout_value, metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? { org_id: ctx.orgId, payout_type: null, payout_value: null, metadata: null });
}

/** PATCH: update org_settings (e.g. metadata.vendor_payout_policy). Admin only. Respects config lock. */
export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const locked = await getOrgConfigLocked(ctx.orgId);
    if (locked) {
        return NextResponse.json(
            { error: "Configuration is locked. Unlock in System Settings." },
            { status: 403 }
        );
    }

    let body: { metadata?: { vendor_payout_policy?: VendorPayoutPolicy } } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: existing, error: fetchErr } = await supabase
        .from("org_settings")
        .select("org_id, metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const currentMeta = (existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const newMeta =
        body.metadata !== undefined
            ? { ...currentMeta, vendor_payout_policy: body.metadata.vendor_payout_policy ?? null }
            : currentMeta;

    const { error: upsertErr } = await supabase.from("org_settings").upsert(
        {
            org_id: ctx.orgId,
            metadata: newMeta,
        },
        { onConflict: "org_id" }
    );

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

    const { data: updated } = await supabase
        .from("org_settings")
        .select("org_id, payout_type, payout_value, metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    return NextResponse.json(updated ?? { org_id: ctx.orgId, metadata: newMeta });
}
