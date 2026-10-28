import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { assertAllowedStatusKey, fetchEffectiveStatusDefinitions, inferDocumentStatusFromStored } from "@/lib/admin/statusDefinitionsResolve";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { documentSubjectInActorScope, requireDocumentWrite } from "@/lib/documents/assertDocumentAccess";
import { canonicalDocumentEntityType } from "@/lib/documents/documentEntityTypes";
import { UNAVAILABLE_DOCUMENT_STATUSES } from "@/lib/documents/documentAvailability";
import { disclosableDocumentIds } from "@/lib/documents/documentMetadataDisclosure";

/**
 * PATCH: update document workflow status. Persists to `documents.status` (text); there is no documents.status_key column.
 *
 * D1a: requires `documents.write` (was `ctx.role !== "admin"`, the compatibility projection), and the
 * document's subject must be inside the caller's department/site scope — the same predicate as the
 * list and the signer — so a writer cannot change by id a document their list does not show them.
 *
 * EN-FI-01: and the caller must clear the document's sensitivity (the read gates: admission, scope, clearance).
 *
 * D2: the lifecycle statuses (`deleted`, `quarantined`, `restricted`) are neither set nor left here. Each has its own
 * audited path: the document delete, the D1c-1 screening release (reviewer capability + written reason). Before this, a
 * `documents.write` holder could move a quarantined file to `uploaded` and skip the release review entirely.
 */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const writeDenied = requireDocumentWrite(ctx);
    if (writeDenied) return writeDenied;
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return NextResponse.json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, { status: access.status });
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
        .select("id, org_id, status, entity_type, entity_id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const subject = existing as { entity_type?: string | null; entity_id?: string | null };
    const inScope = await documentSubjectInActorScope(supabase, ctx.orgId, scopeDimensionsFromAccess(access), {
        entityType: canonicalDocumentEntityType(subject.entity_type),
        entityId: subject.entity_id ?? null,
    });
    if (!inScope) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    // EN-FI-01: the response is the whole row; a writer without the document's sensitivity clearance (health.view for a
    // medical document) may neither change it nor read it back. Same answer as out of scope — no existence oracle.
    const readable = await disclosableDocumentIds(supabase, ctx.orgId, {
        roleKeys: access.roleKeys,
        permissionKeys: access.permissionKeys,
        scope: scopeDimensionsFromAccess(access),
    }, [id]);
    if (!readable.has(id)) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const oldStored = (existing as { status?: string | null }).status ?? null;
    const docDefs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "documents", { activeOnly: true });
    const oldInfer = inferDocumentStatusFromStored(docDefs, oldStored);
    const oldKeyForEvent = oldInfer.inferredKey ?? oldStored;

    const newSk =
        body.status_key === "" || body.status_key == null ? null : String(body.status_key).trim() || null;

    if ((oldStored && UNAVAILABLE_DOCUMENT_STATUSES.includes(oldStored)) || (newSk && UNAVAILABLE_DOCUMENT_STATUSES.includes(newSk))) {
        return NextResponse.json(
            { error: "This status is changed only through its own audited action.", code: "LIFECYCLE_STATUS" },
            { status: 409 },
        );
    }

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
