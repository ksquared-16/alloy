import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { discardDraft, getType, previewProblems, saveDraft } from "@/lib/documents/configuration/documentConfigurationService";
import { parseDocumentTypeDraft } from "@/lib/documents/configuration/documentTypePolicy";

/**
 * PUT — D3: save a type's draft. `processing.documents.manage`.
 *
 * Edits the open draft, or opens a new revision when only published versions exist: a published version is never
 * edited. Saving does not make anything live, and an edited validated draft returns to draft. The response carries the
 * problems validation would report, so the editor can show them; the database decides on validate and on publish.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;
    const { id: rawId } = await context.params;
    const id = parseUuidParam(rawId, "id");
    if (id instanceof NextResponse) return id;

    const draft = parseDocumentTypeDraft(await request.json().catch(() => null));
    if (!draft) return NextResponse.json({ error: "Expected a type draft.", code: "BAD_REQUEST" }, { status: 400 });
    const supabase = createAdminClient();
    const got = await getType(supabase, ctx.orgId, id);
    if (!got.ok) return NextResponse.json({ ok: false, error: "Type not found", code: got.code }, { status: got.status });
    const published = got.value.versions.find((v) => v.status === "published") ?? null;

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_type_changed",
        subject: { type: "document_types", id },
        route: "admin/documents/configuration/types/draft",
        detail: { action: "save_draft", key: got.value.type.key, default_sensitivity: draft.default_sensitivity },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const saved = await saveDraft(supabase, { orgId: ctx.orgId, typeId: id, draft, actorUserId: ctx.userId });
    if (!saved.ok) return NextResponse.json({ ok: false, error: "The draft could not be saved.", code: saved.code }, { status: saved.status });
    const problems = await previewProblems(supabase, {
        orgId: ctx.orgId,
        typeKey: got.value.type.key,
        draft,
        publishedSensitivity: published?.default_sensitivity ?? null,
    });
    return NextResponse.json({ ok: true, ...saved.value, status: "draft", problems });
}

/**
 * DELETE — discard the type's unpublished draft (draft or validated). `processing.documents.manage`.
 *
 * The published version, if any, stays live and unchanged; a published or superseded version is never removed. A type
 * whose only version is the draft is deleted as a type instead (`ONLY_VERSION`). Audited before it happens.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;
    const { id: rawId } = await context.params;
    const id = parseUuidParam(rawId, "id");
    if (id instanceof NextResponse) return id;

    const supabase = createAdminClient();
    const got = await getType(supabase, ctx.orgId, id);
    if (!got.ok) return NextResponse.json({ ok: false, error: "Type not found", code: got.code }, { status: got.status });
    const open = got.value.versions.find((v) => v.status === "draft" || v.status === "validated") ?? null;
    if (!open) return NextResponse.json({ ok: false, error: "The type has no unpublished draft.", code: "NO_OPEN_DRAFT" }, { status: 404 });

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_type_changed",
        subject: { type: "document_types", id },
        route: "admin/documents/configuration/types/draft",
        detail: { action: "discard_draft", key: got.value.type.key, version_id: open.id, version_number: open.version_number },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const discarded = await discardDraft(supabase, { orgId: ctx.orgId, typeId: id });
    if (!discarded.ok) return NextResponse.json({ ok: false, error: "The draft could not be discarded.", code: discarded.code }, { status: discarded.status });
    return NextResponse.json({ ok: true, discarded: true, ...discarded.value });
}
