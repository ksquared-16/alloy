import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";

export async function POST(
    _request: NextRequest,
    context: { params: Promise<{ token: string }> }
) {
    const { token } = await context.params;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const supabase = createServiceRoleClient();
    const { data: row, error: fetchErr } = await supabase
        .from("action_links")
        .select("id, action_type, entity_type, entity_id, consumed_at, expires_at")
        .eq("token", token)
        .single();

    if (fetchErr || !row) {
        return NextResponse.json({ error: "Invalid or not found" }, { status: 404 });
    }
    const r = row as { id: string; action_type: string; entity_type: string; entity_id: string; consumed_at: string | null; expires_at: string };
    if (r.consumed_at) {
        return NextResponse.json({ error: "Already used" }, { status: 410 });
    }
    if (new Date(r.expires_at) <= new Date()) {
        return NextResponse.json({ error: "Expired" }, { status: 410 });
    }

    const { error: updateErr } = await supabase
        .from("action_links")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", r.id);
    if (updateErr) {
        return NextResponse.json({ error: "Failed to mark consumed" }, { status: 500 });
    }

    if (r.action_type === "vendor_accept_job" && r.entity_type === "job") {
        const body = await _request.json().catch(() => ({})) as { vendor_id?: string };
        const vendorId = body.vendor_id;
        if (vendorId) {
            await supabase
                .from("jobs")
                .update({ vendor_id: vendorId })
                .eq("id", r.entity_id);
        }
        return NextResponse.json({ ok: true, action: "vendor_accept_job" });
    }
    if (r.action_type === "customer_cancel" && r.entity_type === "schedule") {
        const body = await _request.json().catch(() => ({})) as { canceled_by?: string; cancel_reason?: string };
        await supabase
            .from("schedules")
            .update({
                canceled_at: new Date().toISOString(),
                canceled_by: body.canceled_by ?? "customer",
                cancel_reason: body.cancel_reason ?? null,
            })
            .eq("id", r.entity_id);
        return NextResponse.json({ ok: true, action: "customer_cancel" });
    }
    if (r.action_type === "customer_reschedule" || r.action_type === "customer_cancel") {
        return NextResponse.json({ ok: true, action: r.action_type });
    }

    return NextResponse.json({ ok: true });
}
