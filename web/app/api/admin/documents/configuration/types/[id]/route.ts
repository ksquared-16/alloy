import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationRead, requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { deleteType, getType, setTypeStatus } from "@/lib/documents/configuration/documentConfigurationService";
import { POLICY_ENFORCEMENT } from "@/lib/documents/configuration/documentTypePolicy";

/**
 * D3 — one Document Studio type.
 *
 * GET     the type and every version, newest first. `documents.read` or `processing.documents.manage`.
 * PATCH   { action: "archive" | "activate" }. An archived type stops applying its default to new documents; its
 *         identity, versions and every document that used it are kept. `processing.documents.manage`.
 * DELETE  only a type no document has ever used; otherwise archive it. `processing.documents.manage`.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const access = await getAdminAccessContextCached();
    const denied = requireDocumentConfigurationRead(access.ok ? access : { roleKeys: [], permissionKeys: ctx.permissionKeys ?? [] });
    if (denied) return denied;
    const { id: rawId } = await context.params;
    const id = parseUuidParam(rawId, "id");
    if (id instanceof NextResponse) return id;
    const got = await getType(createAdminClient(), ctx.orgId, id);
    if (!got.ok) return NextResponse.json({ ok: false, error: "Type not found", code: got.code }, { status: got.status });
    return NextResponse.json({ ok: true, ...got.value, enforcement: POLICY_ENFORCEMENT });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;
    const { id: rawId } = await context.params;
    const id = parseUuidParam(rawId, "id");
    if (id instanceof NextResponse) return id;
    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "archive" && body.action !== "activate") return NextResponse.json({ error: "Unsupported action", code: "BAD_REQUEST" }, { status: 400 });

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_type_changed",
        subject: { type: "document_types", id },
        route: "admin/documents/configuration/types",
        detail: { action: body.action },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const changed = await setTypeStatus(createAdminClient(), { orgId: ctx.orgId, typeId: id, status: body.action === "archive" ? "archived" : "active", actorUserId: ctx.userId });
    if (!changed.ok) return NextResponse.json({ ok: false, error: "The type could not be changed.", code: changed.code }, { status: changed.status });
    return NextResponse.json({ ok: true, ...changed.value });
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
        event: "document_type_changed",
        subject: { type: "document_types", id },
        route: "admin/documents/configuration/types",
        detail: { action: "delete" },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const removed = await deleteType(createAdminClient(), ctx.orgId, id);
    if (!removed.ok) return NextResponse.json({ ok: false, error: "The type could not be deleted.", code: removed.code }, { status: removed.status });
    return NextResponse.json({ ok: true, deleted: true, id });
}
