import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import {
    discardRequirementDraft,
    getRequirement,
    previewRequirementProblems,
    saveRequirementDraft,
} from "@/lib/documents/requirements/documentRequirementConfigService";
import { parseDocumentRequirementDraft } from "@/lib/documents/requirements/documentRequirementPolicy";

/**
 * D6 — a requirement's draft.
 *
 * PUT     saves the open draft, or opens a new revision (n+1) when only published versions exist. A published version
 *         is never edited; nothing applies until validated and published. Returns the editor's problems (the
 *         database's validation, mirrored). `processing.documents.manage`; audited first.
 * DELETE  discards the unpublished draft or validated version. `processing.documents.manage`; audited first.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;
    const { id: rawId } = await context.params;
    const id = parseUuidParam(rawId, "id");
    if (id instanceof NextResponse) return id;
    const draft = parseDocumentRequirementDraft(await request.json().catch(() => null));
    if (!draft.label) return NextResponse.json({ error: "A requirement needs a name.", code: "LABEL_REQUIRED" }, { status: 400 });

    const supabase = createAdminClient();
    const got = await getRequirement(supabase, ctx.orgId, id);
    if (!got.ok) return NextResponse.json({ ok: false, error: "Requirement not found", code: got.code }, { status: got.status });

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_requirement_changed",
        subject: { type: "document_requirements", id },
        route: "admin/documents/configuration/requirements/draft",
        detail: { action: "save_draft", key: got.value.requirement.key, document_type_key: draft.document_type_key, subject_type: draft.subject_type, policy: draft.policy, waivable: draft.waivable },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const saved = await saveRequirementDraft(supabase, { orgId: ctx.orgId, requirementId: id, draft, actorUserId: ctx.userId });
    if (!saved.ok) return NextResponse.json({ ok: false, error: "The draft could not be saved.", code: saved.code }, { status: saved.status });
    const problems = await previewRequirementProblems(supabase, { orgId: ctx.orgId, requirementId: id, draft });
    return NextResponse.json({ ok: true, ...saved.value, problems });
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
        route: "admin/documents/configuration/requirements/draft",
        detail: { action: "discard_draft" },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const discarded = await discardRequirementDraft(createAdminClient(), { orgId: ctx.orgId, requirementId: id });
    if (!discarded.ok) return NextResponse.json({ ok: false, error: "The draft could not be discarded.", code: discarded.code }, { status: discarded.status });
    return NextResponse.json({ ok: true, ...discarded.value });
}
