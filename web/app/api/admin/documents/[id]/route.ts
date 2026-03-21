import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { assertAllowedStatusKey, fetchEffectiveStatusDefinitions, inferDocumentStatusFromStored } from "@/lib/admin/statusDefinitionsResolve";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";

/** PATCH: update document workflow status. Persists to `documents.status` (text); there is no documents.status_key column. */
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
        .select("id, org_id, status")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const oldStored = (existing as { status?: string | null }).status ?? null;
    const docDefs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "documents", { activeOnly: true });
    const oldInfer = inferDocumentStatusFromStored(docDefs, oldStored);
    const oldKeyForEvent = oldInfer.inferredKey ?? oldStored;

    const newSk =
        body.status_key === "" || body.status_key == null ? null : String(body.status_key).trim() || null;

    const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "documents", newSk);
    if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: 400 });

    const updates: Record<string, unknown> = { status: newSk };

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
        oldStatusKey: oldKeyForEvent,
        newStatusKey: newSk,
    });

    logAdminAudit({
        entity: "documents",
        id,
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    const defsAfter = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "documents", { activeOnly: true });
    const ui = inferDocumentStatusFromStored(defsAfter, (updated as { status?: string | null }).status ?? null);
    const out = { ...(updated as Record<string, unknown>) };
    out.status_key = ui.inferredKey;
    out._status_display = ui.display;
    return NextResponse.json(out);
}
