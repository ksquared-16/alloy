import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { deleteCategory, updateCategory } from "@/lib/documents/configuration/documentConfigurationService";

/**
 * D3 — one Document Studio category. `processing.documents.manage`.
 *
 * PATCH  { action: "update", label?, description?, parent_id?, sort_order? } | { action: "archive" } | { action: "activate" }.
 *        The database refuses a cycle, a parent from another organization, archiving a category with active children or
 *        active types, and any change of key.
 * DELETE only a category no document type has ever used and with no children; otherwise archive it.
 * Each change is recorded (`document_category_changed`) before it is made.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;
    const { id: rawId } = await context.params;
    const id = parseUuidParam(rawId, "id");
    if (id instanceof NextResponse) return id;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action;
    let patch: Parameters<typeof updateCategory>[1]["patch"];
    if (action === "archive") patch = { status: "archived" };
    else if (action === "activate") patch = { status: "active" };
    else if (action === "update") {
        patch = {};
        if (typeof body.label === "string") {
            const label = body.label.trim();
            if (!label || label.length > 120) return NextResponse.json({ error: "A category needs a name.", code: "LABEL_REQUIRED" }, { status: 400 });
            patch.label = label;
        }
        if ("description" in body) patch.description = typeof body.description === "string" ? body.description.trim() || null : null;
        if ("parent_id" in body) patch.parent_id = typeof body.parent_id === "string" && body.parent_id.trim() ? body.parent_id.trim() : null;
        if (Number.isInteger(body.sort_order)) patch.sort_order = body.sort_order as number;
        if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to change.", code: "BAD_REQUEST" }, { status: 400 });
    } else {
        return NextResponse.json({ error: "Unsupported action", code: "BAD_REQUEST" }, { status: 400 });
    }

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_category_changed",
        subject: { type: "document_categories", id },
        route: "admin/documents/configuration/categories",
        detail: { action, ...patch },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const updated = await updateCategory(createAdminClient(), { orgId: ctx.orgId, id, patch, actorUserId: ctx.userId });
    if (!updated.ok) return NextResponse.json({ ok: false, error: "The category could not be changed.", code: updated.code }, { status: updated.status });
    return NextResponse.json({ ok: true, category: updated.value });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;
    const { id: rawId } = await context.params;
    const id = parseUuidParam(rawId, "id");
    if (id instanceof NextResponse) return id;

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_category_changed",
        subject: { type: "document_categories", id },
        route: "admin/documents/configuration/categories",
        detail: { action: "delete" },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const removed = await deleteCategory(createAdminClient(), ctx.orgId, id);
    if (!removed.ok) return NextResponse.json({ ok: false, error: "The category could not be deleted.", code: removed.code }, { status: removed.status });
    return NextResponse.json({ ok: true, deleted: true, id });
}
