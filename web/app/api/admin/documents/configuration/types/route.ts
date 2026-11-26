import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationRead, requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { createType, listTypes } from "@/lib/documents/configuration/documentConfigurationService";
import { KEY_RE, parseDocumentTypeDraft, POLICY_ENFORCEMENT, slugKey } from "@/lib/documents/configuration/documentTypePolicy";

/**
 * D3 — Document Studio types.
 *
 * GET   every type with its published version and open draft, and which policy fields are enforced versus declared.
 *       `documents.read` or `processing.documents.manage`.
 * POST  { key?, label, category_id, subject_types, allowed_formats, default_sensitivity, review_required,
 *       replacement_policy, validity_policy } creates the type and its first DRAFT. Nothing is live until the draft is
 *       validated and published. `processing.documents.manage`; `document_type_changed` is recorded first.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const access = await getAdminAccessContextCached();
    const denied = requireDocumentConfigurationRead(access.ok ? access : { roleKeys: [], permissionKeys: ctx.permissionKeys ?? [] });
    if (denied) return denied;
    const listed = await listTypes(createAdminClient(), ctx.orgId);
    if (!listed.ok) return NextResponse.json({ ok: false, error: "Types could not be read.", code: listed.code }, { status: listed.status });
    return NextResponse.json({ ok: true, types: listed.value, enforcement: POLICY_ENFORCEMENT });
}

export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const draft = parseDocumentTypeDraft(body);
    if (!draft || !draft.label) return NextResponse.json({ error: "A type needs a name.", code: "LABEL_REQUIRED" }, { status: 400 });
    const key = typeof body?.key === "string" && body.key.trim() ? body.key.trim() : slugKey(draft.label);
    if (!KEY_RE.test(key)) return NextResponse.json({ error: "A key is 2–63 lowercase letters, digits or underscores, starting with a letter.", code: "KEY_INVALID" }, { status: 400 });

    const typeId = randomUUID();
    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_type_changed",
        subject: { type: "document_types", id: typeId },
        route: "admin/documents/configuration/types",
        detail: { action: "create", key, label: draft.label, default_sensitivity: draft.default_sensitivity },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const created = await createType(createAdminClient(), { typeId, orgId: ctx.orgId, key, draft, actorUserId: ctx.userId });
    if (!created.ok) return NextResponse.json({ ok: false, error: "The type could not be created.", code: created.code }, { status: created.status });
    return NextResponse.json({ ok: true, type_id: created.value.type_id, version_id: created.value.version_id, key, status: "draft" });
}
