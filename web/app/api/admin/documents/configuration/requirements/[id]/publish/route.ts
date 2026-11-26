import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { getRequirement, publishRequirementVersion } from "@/lib/documents/requirements/documentRequirementConfigService";

/**
 * POST { version_id, expected_published_version_id } — D6: publish a validated requirement version
 * (`document_requirement_publish`). Compare-and-swap: refused (409 PUBLISH_CONFLICT) if the published version is not
 * the one the editor opened. The database re-validates, supersedes the previous version and makes this one apply from
 * the next read (readiness, work and Business Process). `processing.documents.manage`; audited first.
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
    const got = await getRequirement(supabase, ctx.orgId, id);
    if (!got.ok) return NextResponse.json({ ok: false, error: "Requirement not found", code: got.code }, { status: got.status });
    const target = got.value.versions.find((v) => v.id === versionId);
    if (!target) return NextResponse.json({ ok: false, error: "Version not found", code: "NOT_FOUND" }, { status: 404 });
    const current = got.value.versions.find((v) => v.status === "published") ?? null;

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_requirement_changed",
        subject: { type: "document_requirements", id },
        route: "admin/documents/configuration/requirements/publish",
        detail: {
            action: "publish",
            key: got.value.requirement.key,
            version_id: versionId,
            version_number: target.version_number,
            superseded_version_id: current?.id ?? null,
            document_type_key: target.document_type_key,
            subject_type: target.subject_type,
            policy: target.policy,
            waivable: target.waivable,
        },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const published = await publishRequirementVersion(supabase, { orgId: ctx.orgId, requirementId: id, versionId, expectedPublishedVersionId: expected, actorUserId: ctx.userId });
    if (!published.ok) return NextResponse.json({ ok: false, error: "The version could not be published.", code: published.code }, { status: published.status });
    return NextResponse.json({ ok: true, ...published.value });
}
