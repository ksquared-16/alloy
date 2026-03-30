import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps, logAdminAudit, getAdminAuth } from "@/lib/adminAuth";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import {
    assertAllowedStatusKey,
    displayLabelsFromDefinitions,
    fetchEffectiveStatusDefinitions,
    resolveDisplayFromLabelMap,
} from "@/lib/admin/statusDefinitionsResolve";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";

/** PATCH: update `customer_subscriptions.status` (text; no `status_key` column on this table). */
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

    let body: { status?: string | null };
    try {
        body = (await request.json()) as { status?: string | null };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (body.status === undefined) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: sub, error: subErr } = await supabase
        .from("customer_subscriptions")
        .select("id, org_id, customer_id, status")
        .eq("id", id)
        .maybeSingle();

    if (subErr || !sub) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = sub as { org_id?: string | null; customer_id: string; status: string };
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

    const newStatus =
        body.status === "" || body.status == null ? null : String(body.status).trim().slice(0, 200) || null;
    if (newStatus == null || newStatus === "") {
        return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const defs = await fetchEffectiveStatusDefinitions(supabase, orgId, "subscriptions", { activeOnly: true });
    if (defs.length > 0) {
        const chk = await assertAllowedStatusKey(supabase, orgId, "subscriptions", newStatus);
        if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: 400 });
    }

    const oldStatus = row.status != null ? String(row.status).trim() : "";

    const updates: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
    };

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
        oldStatusKey: oldStatus || null,
        newStatusKey: newStatus,
    });

    logAdminAudit({
        entity: "customer_subscriptions",
        id,
        changed_fields: Object.keys(updates),
        actor_user_id: auth.user.id,
        role: auth.role,
    });

    const subDefs = await fetchEffectiveStatusDefinitions(supabase, orgId, "subscriptions", { activeOnly: true });
    const labelByKey = displayLabelsFromDefinitions(subDefs);
    const out: Record<string, unknown> = { ...(updated as Record<string, unknown>) };
    out._status_display = resolveDisplayFromLabelMap(labelByKey, newStatus, newStatus);
    return NextResponse.json(out);
}
