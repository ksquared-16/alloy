import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationRead, requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { KEY_RE, slugKey } from "@/lib/documents/configuration/documentTypePolicy";
import { createRequirement, listRequirements } from "@/lib/documents/requirements/documentRequirementConfigService";
import { parseDocumentRequirementDraft } from "@/lib/documents/requirements/documentRequirementPolicy";

/**
 * D6 — Document Studio requirements.
 *
 * GET   every requirement with its published version and open draft. `documents.read` or `processing.documents.manage`.
 * POST  { key?, label, document_type_key, subject_type, scope, timing, policy, waivable, effective_from,
 *       effective_until } creates the requirement and its first DRAFT. Nothing applies until the draft is validated and
 *       published. `processing.documents.manage`; `document_requirement_changed` is recorded first.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const access = await getAdminAccessContextCached();
    const denied = requireDocumentConfigurationRead(access.ok ? access : { roleKeys: [], permissionKeys: ctx.permissionKeys ?? [] });
    if (denied) return denied;
    const listed = await listRequirements(createAdminClient(), ctx.orgId);
    if (!listed.ok) return NextResponse.json({ ok: false, error: "Requirements could not be read.", code: listed.code }, { status: listed.status });
    return NextResponse.json({ ok: true, requirements: listed.value });
}

export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const draft = parseDocumentRequirementDraft(body);
    if (!draft.label) return NextResponse.json({ error: "A requirement needs a name.", code: "LABEL_REQUIRED" }, { status: 400 });
    if (!draft.document_type_key) return NextResponse.json({ error: "A requirement names a document type.", code: "TYPE_REQUIRED" }, { status: 400 });
    const key = typeof body?.key === "string" && body.key.trim() ? body.key.trim() : slugKey(draft.label);
    if (!KEY_RE.test(key)) return NextResponse.json({ error: "A key is 2–63 lowercase letters, digits or underscores, starting with a letter.", code: "KEY_INVALID" }, { status: 400 });

    const requirementId = randomUUID();
    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_requirement_changed",
        subject: { type: "document_requirements", id: requirementId },
        route: "admin/documents/configuration/requirements",
        detail: { action: "create", key, label: draft.label, document_type_key: draft.document_type_key, subject_type: draft.subject_type },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const created = await createRequirement(createAdminClient(), { requirementId, orgId: ctx.orgId, key, draft, actorUserId: ctx.userId });
    if (!created.ok) return NextResponse.json({ ok: false, error: "The requirement could not be created.", code: created.code }, { status: created.status });
    return NextResponse.json({ ok: true, requirement_id: created.value.requirement_id, version_id: created.value.version_id, key, status: "draft" });
}
