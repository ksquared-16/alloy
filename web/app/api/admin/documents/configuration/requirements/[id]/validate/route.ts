import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { getRequirement, validateRequirementVersion } from "@/lib/documents/requirements/documentRequirementConfigService";

/**
 * POST { version_id } — D6: validate a requirement draft (`document_requirement_validate`). The database checks
 * compatibility with the PUBLISHED, active Studio type (it exists and accepts the subject grain), the scope, timing and
 * effective window, and that no other live requirement covers the same type, grain and scope. Validation records the
 * result on the version; it makes nothing live. `processing.documents.manage`.
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
    const supabase = createAdminClient();
    const got = await getRequirement(supabase, ctx.orgId, id);
    if (!got.ok) return NextResponse.json({ ok: false, error: "Requirement not found", code: got.code }, { status: got.status });
    const target = got.value.versions.find((v) => v.id === body.version_id);
    if (!target) return NextResponse.json({ ok: false, error: "Version not found", code: "NOT_FOUND" }, { status: 404 });
    const validated = await validateRequirementVersion(supabase, { orgId: ctx.orgId, versionId: target.id, actorUserId: ctx.userId });
    if (!validated.ok) return NextResponse.json({ ok: false, error: "The draft could not be validated.", code: validated.code }, { status: validated.status });
    return NextResponse.json({ ok: true, version_id: target.id, ...validated.value });
}
