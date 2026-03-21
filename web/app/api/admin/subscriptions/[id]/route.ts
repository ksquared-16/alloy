import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps, logAdminAudit, getAdminAuth } from "@/lib/adminAuth";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { assertAllowedStatusKey, resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";

/** PATCH: update customer_subscriptions.status_key (and legacy status string for compatibility). */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: { status_key?: string | null };
    try {
        body = (await request.json()) as { status_key?: string | null };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (body.status_key === undefined) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: sub, error: subErr } = await supabase
        .from("customer_subscriptions")
        .select("id, org_id, customer_id, status, status_key")
        .eq("id", id)
        .maybeSingle();

    if (subErr || !sub) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = sub as { org_id?: string | null; customer_id: string; status: string; status_key?: string | null };
    let orgId = row.org_id?.trim() || null;
    if (!orgId) {
        const { data: cust } = await supabase.from("customers").select("org_id").eq("id", row.customer_id).maybeSingle();
        orgId = (cust as { org_id?: string } | null)?.org_id ?? null;
    }
    if (!orgId) {
        return NextResponse.json({ error: "Could not resolve org for subscription" }, { status: 400 });
    }
    if (orgId !== ctx.orgId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const auth = await getAdminAuth();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const oldSk = row.status_key ?? null;
    const newSk = body.status_key === "" || body.status_key == null ? null : String(body.status_key).trim() || null;

    const chk = await assertAllowedStatusKey(supabase, orgId, "subscriptions", newSk);
    if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: 400 });

    const updates: Record<string, unknown> = {
        status_key: newSk,
        updated_at: new Date().toISOString(),
    };
    if (newSk != null) {
        const label = await resolveStatusLabel(supabase, orgId, "subscriptions", newSk);
        updates.status = (label ?? newSk).slice(0, 200);
    }

    const { data: updated, error: updateErr } = await supabase
        .from("customer_subscriptions")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    await emitStatusChangedEvent({
        supabase,
        orgId,
        entityType: "subscriptions",
        entityId: id,
        oldStatusKey: oldSk,
        newStatusKey: newSk,
    });

    logAdminAudit({
        entity: "customer_subscriptions",
        id,
        changed_fields: Object.keys(updates),
        actor_user_id: auth.user.id,
        role: auth.role,
    });

    const out: Record<string, unknown> = { ...(updated as Record<string, unknown>) };
    const sk = (out.status_key as string | null) ?? null;
    out._status_display = await resolveStatusLabel(supabase, orgId, "subscriptions", sk);
    return NextResponse.json(out);
}
