import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { getType, validateVersion } from "@/lib/documents/configuration/documentConfigurationService";

/**
 * POST { version_id } — D3: validate a type's open draft on the server (`document_type_validate`). A clean draft becomes
 * `validated`; otherwise it stays a draft with its problems recorded. `processing.documents.manage`.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;
    const { id: rawId } = await context.params;
    const id = parseUuidParam(rawId, "id");
    if (id instanceof NextResponse) return id;
    const body = (await request.json().catch(() => ({}))) as { version_id?: unknown };
    const versionId = typeof body.version_id === "string" ? body.version_id : "";
    const supabase = createAdminClient();
    const got = await getType(supabase, ctx.orgId, id);
    if (!got.ok) return NextResponse.json({ ok: false, error: "Type not found", code: got.code }, { status: got.status });
    if (!got.value.versions.some((v) => v.id === versionId)) return NextResponse.json({ ok: false, error: "Version not found", code: "NOT_FOUND" }, { status: 404 });

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_type_changed",
        subject: { type: "document_types", id },
        route: "admin/documents/configuration/types/validate",
        detail: { action: "validate", version_id: versionId },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const validated = await validateVersion(supabase, { orgId: ctx.orgId, versionId, actorUserId: ctx.userId });
    if (!validated.ok) return NextResponse.json({ ok: false, error: "The draft could not be validated.", code: validated.code }, { status: validated.status });
    return NextResponse.json({ ok: true, version_id: versionId, ...validated.value });
}
