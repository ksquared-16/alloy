import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: org_settings for current org. Admin/ops read. Includes metadata.config_locked (and top-level config_locked for convenience). */
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
    const payload = data ?? { org_id: ctx.orgId, payout_type: null, payout_value: null, metadata: null };
    const metadata = (payload as { metadata?: Record<string, unknown> }).metadata ?? {};
    const config_locked = Boolean((metadata as { config_locked?: boolean }).config_locked);
    return NextResponse.json({ ...payload, config_locked });
}

/** PATCH: update org_settings. Admin only. Merges metadata safely (does not overwrite unrelated keys). */
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

    let body: { metadata?: Record<string, unknown> } = {};
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
        body.metadata !== undefined && typeof body.metadata === "object"
            ? { ...currentMeta, ...body.metadata }
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

    const payload = updated ?? { org_id: ctx.orgId, payout_type: null, payout_value: null, metadata: newMeta };
    const metadata = (payload as { metadata?: Record<string, unknown> }).metadata ?? {};
    const config_locked = Boolean((metadata as { config_locked?: boolean }).config_locked);
    return NextResponse.json({ ...payload, config_locked });
}
