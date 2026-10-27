import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationRead, requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { deleteRequirement, getRequirement, setRequirementStatus } from "@/lib/documents/requirements/documentRequirementConfigService";

/**
 * D6 — one document requirement.
 *
 * GET     the requirement and every version, newest first (its history). `documents.read` or `processing.documents.manage`.
 * PATCH   { action: "archive" | "activate" }. An archived requirement stops applying: its work disappears and it can no
 *         longer be waived; its identity, versions and waiver history are kept. `processing.documents.manage`.
 * DELETE  only a requirement never published and never waived; otherwise archive it. `processing.documents.manage`.
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
    const got = await getRequirement(createAdminClient(), ctx.orgId, id);
    if (!got.ok) return NextResponse.json({ ok: false, error: "Requirement not found", code: got.code }, { status: got.status });
    return NextResponse.json({ ok: true, ...got.value });
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
    const supabase = createAdminClient();
    const got = await getRequirement(supabase, ctx.orgId, id);
    if (!got.ok) return NextResponse.json({ ok: false, error: "Requirement not found", code: got.code }, { status: got.status });

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_requirement_changed",
        subject: { type: "document_requirements", id },
        route: "admin/documents/configuration/requirements",
        detail: { action: body.action, key: got.value.requirement.key },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const changed = await setRequirementStatus(supabase, { orgId: ctx.orgId, requirementId: id, status: body.action === "archive" ? "archived" : "active", actorUserId: ctx.userId });
    if (!changed.ok) return NextResponse.json({ ok: false, error: "The requirement could not be changed.", code: changed.code }, { status: changed.status });
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
        event: "document_requirement_changed",
        subject: { type: "document_requirements", id },
        route: "admin/documents/configuration/requirements",
        detail: { action: "delete" },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const removed = await deleteRequirement(createAdminClient(), ctx.orgId, id);
    if (!removed.ok) return NextResponse.json({ ok: false, error: "The requirement could not be deleted.", code: removed.code }, { status: removed.status });
    return NextResponse.json({ ok: true, deleted: true, id });
}
