import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** PATCH: update amount_cents and/or is_active. */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: { amount?: number; amount_cents?: number; is_active?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.amount_cents !== undefined) {
        const n = Number(body.amount_cents);
        updates.amount_cents = Number.isNaN(n) ? 0 : Math.max(0, Math.round(n));
    }
    if (body.amount !== undefined) {
        const n = Number(body.amount);
        updates.amount_cents = Number.isNaN(n) ? 0 : Math.max(0, Math.round(n * 100));
    }
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

    (updates as { updated_at: string }).updated_at = new Date().toISOString();

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("pricing_recurring_prices")
        .update(updates)
        .eq("id", id)
        .select("id, amount_cents, is_active, updated_at")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? { ok: true });
}
