import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { getType, publishVersion } from "@/lib/documents/configuration/documentConfigurationService";

/**
 * POST { version_id, expected_published_version_id } — D3: publish a validated version (`document_type_publish`).
 *
 * Compare-and-swap: refused (409 PUBLISH_CONFLICT) if the type's published version is not the one the editor opened.
 * The database re-validates, supersedes the previous version and makes this one current. A published default
 * sensitivity applies to NEW documents of the type, raise-only; it never lowers or reclassifies an existing document,
 * and a revision may not lower it. The audit names the sensitivity before and after. `processing.documents.manage`.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;
    const { id: rawId } = await context.params;
    const id = parseUuidParam(rawId, "id");
    if (id instanceof NextResponse) return id;
    const body = (await request.json().catch(() => ({}))) as { version_id?: unknown; expected_published_version_id?: unknown };
    const versionId = typeof body.version_id === "string" ? body.version_id : "";
    const expected = typeof body.expected_published_version_id === "string" ? body.expected_published_version_id : null;

    const supabase = createAdminClient();
    const got = await getType(supabase, ctx.orgId, id);
    if (!got.ok) return NextResponse.json({ ok: false, error: "Type not found", code: got.code }, { status: got.status });
    const target = got.value.versions.find((v) => v.id === versionId);
    if (!target) return NextResponse.json({ ok: false, error: "Version not found", code: "NOT_FOUND" }, { status: 404 });
    const current = got.value.versions.find((v) => v.status === "published") ?? null;

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_type_changed",
        subject: { type: "document_types", id },
        route: "admin/documents/configuration/types/publish",
        detail: {
            action: "publish",
            key: got.value.type.key,
            version_id: versionId,
            version_number: target.version_number,
            superseded_version_id: current?.id ?? null,
            sensitivity_from: current?.default_sensitivity ?? null,
            sensitivity_to: target.default_sensitivity,
        },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const published = await publishVersion(supabase, { orgId: ctx.orgId, typeId: id, versionId, expectedPublishedVersionId: expected, actorUserId: ctx.userId });
    if (!published.ok) return NextResponse.json({ ok: false, error: "The version could not be published.", code: published.code }, { status: published.status });
    return NextResponse.json({ ok: true, ...published.value });
}
