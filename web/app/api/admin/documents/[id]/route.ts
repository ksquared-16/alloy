import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { assertAllowedStatusKey, resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";

/** PATCH: update document status_key. Org-scoped. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (body.status_key === undefined) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("documents")
        .select("id, org_id, status_key, status")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const oldSk = (existing as { status_key?: string | null }).status_key ?? null;
    const newSk =
        body.status_key === "" || body.status_key == null ? null : String(body.status_key).trim() || null;

    const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "documents", newSk);
    if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: 400 });

    const updates: Record<string, unknown> = { status_key: newSk };
    if (newSk != null) {
        const label = await resolveStatusLabel(supabase, ctx.orgId, "documents", newSk);
        updates.status = label ?? newSk;
    }

    const { data: updated, error: updateErr } = await supabase
        .from("documents")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select("*")
        .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    await emitStatusChangedEvent({
        supabase,
        orgId: ctx.orgId,
        entityType: "documents",
        entityId: id,
        oldStatusKey: oldSk,
        newStatusKey: newSk,
    });

    logAdminAudit({
        entity: "documents",
        id,
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    const out = { ...(updated as Record<string, unknown>) };
    const sk = (out.status_key as string | null) ?? null;
    out._status_display = await resolveStatusLabel(supabase, ctx.orgId, "documents", sk);
    return NextResponse.json(out);
}
