import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requirementSubjectReadable, requireRequirementWaiver, SENSITIVE_REQUIREMENT } from "@/lib/documents/requirements/documentRequirementAuthority";
import { getWaiver, revokeRequirementWaiver } from "@/lib/documents/requirements/documentRequirementConfigService";
import { actorMaySeeRequirement, loadRequirementTypes } from "@/lib/documents/requirements/documentRequirementService";

/**
 * PATCH { action: "revoke", reason } — D6: revoke an active waiver. The requirement applies again from the next read
 * (its work reappears unless evidence now satisfies it). The waiver row is kept as history. Same authority as granting:
 * `processing.documents.manage`, the subject in scope (else 404), clearance for the requirement's class (else 403).
 * `document_requirement_waiver_revoked` is recorded first.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireRequirementWaiver(ctx);
    if (denied) return denied;
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const { id: rawId } = await context.params;
    const id = parseUuidParam(rawId, "id");
    if (id instanceof NextResponse) return id;
    const body = (await request.json().catch(() => ({}))) as { action?: unknown; reason?: unknown };
    if (body.action !== "revoke") return NextResponse.json({ error: "Unsupported action", code: "BAD_REQUEST" }, { status: 400 });
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 3) return NextResponse.json({ error: "A revocation needs a reason.", code: "REASON_REQUIRED" }, { status: 400 });

    const supabase = createAdminClient();
    const waiver = await getWaiver(supabase, ctx.orgId, id);
    if (!waiver || !(await requirementSubjectReadable(supabase, ctx.orgId, scopeDimensionsFromAccess(access), waiver))) {
        return NextResponse.json({ ok: false, error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const [types, { data: version }] = await Promise.all([
        loadRequirementTypes(supabase, ctx.orgId),
        supabase.from("document_requirement_versions").select("document_type_key").eq("org_id", ctx.orgId).eq("id", waiver.requirement_version_id).maybeSingle(),
    ]);
    const typeKey = (version as { document_type_key?: string } | null)?.document_type_key ?? "";
    if (!types || !actorMaySeeRequirement(access, types, typeKey)) return NextResponse.json(SENSITIVE_REQUIREMENT.body, { status: SENSITIVE_REQUIREMENT.status });

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_requirement_waiver_revoked",
        subject: { type: "document_requirement_waivers", id },
        route: "admin/documents/requirements/waivers",
        detail: { requirement_id: waiver.requirement_id, subject_type: waiver.subject_type, subject_id: waiver.subject_id, reason },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const revoked = await revokeRequirementWaiver(supabase, { orgId: ctx.orgId, waiverId: id, reason, actorUserId: ctx.userId });
    if (!revoked.ok) return NextResponse.json({ ok: false, error: "The waiver could not be revoked.", code: revoked.code }, { status: revoked.status });
    return NextResponse.json({ ok: true, ...revoked.value, state: "revoked" });
}
