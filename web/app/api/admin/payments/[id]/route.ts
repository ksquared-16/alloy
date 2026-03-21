import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";

/** PATCH: update status_key, paid_at, notes. Editable fields only. */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: { status_key?: string | null; paid_at?: string | null; notes?: string | null };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates: { status_key?: string | null; paid_at?: string | null; notes?: string | null; updated_at?: string } = {};
    if (body.status_key !== undefined) updates.status_key = body.status_key === "" ? null : body.status_key;
    if (body.paid_at !== undefined) updates.paid_at = body.paid_at === "" || body.paid_at == null ? null : body.paid_at;
    if (body.notes !== undefined) updates.notes = body.notes === "" ? null : body.notes;
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ ok: true });
    }
    updates.updated_at = new Date().toISOString();

    const supabase = createAdminClient();
    if (updates.status_key !== undefined) {
        const { data: payRow } = await supabase.from("payments").select("job_id, customer_id").eq("id", id).maybeSingle();
        const pr = payRow as { job_id?: string | null; customer_id?: string | null } | null;
        let orgId: string | null = null;
        if (pr?.job_id) {
            const { data: j } = await supabase.from("jobs").select("org_id").eq("id", pr.job_id).maybeSingle();
            orgId = (j as { org_id?: string } | null)?.org_id ?? null;
        }
        if (!orgId && pr?.customer_id) {
            const { data: c } = await supabase.from("customers").select("org_id").eq("id", pr.customer_id).maybeSingle();
            orgId = (c as { org_id?: string } | null)?.org_id ?? null;
        }
        if (orgId) {
            const chk = await assertAllowedStatusKey(supabase, orgId, "payments", updates.status_key);
            if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: 400 });
        }
    }

    const { data, error } = await supabase
        .from("payments")
        .update(updates)
        .eq("id", id)
        .select("id, status_key, paid_at, notes, updated_at")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? { ok: true });
}
