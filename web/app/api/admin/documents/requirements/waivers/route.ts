import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireDocumentRead } from "@/lib/documents/assertDocumentAccess";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requirementSubjectReadable, requireRequirementWaiver, SENSITIVE_REQUIREMENT } from "@/lib/documents/requirements/documentRequirementAuthority";
import { grantRequirementWaiver, WAIVER_COLUMNS, type DocumentRequirementWaiver } from "@/lib/documents/requirements/documentRequirementConfigService";
import { REQUIREMENT_SUBJECT_TYPES } from "@/lib/documents/requirements/documentRequirementPolicy";
import { actorMaySeeRequirement, loadLiveRequirements, loadRequirementTypes } from "@/lib/documents/requirements/documentRequirementService";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isSubjectType = (v: unknown): v is (typeof REQUIREMENT_SUBJECT_TYPES)[number] => typeof v === "string" && (REQUIREMENT_SUBJECT_TYPES as readonly string[]).includes(v);

/**
 * D6 — Documents-owned document requirement waivers.
 *
 * GET   `?subject_type&subject_id` — the subject's waiver history (active and revoked) for requirements the actor may
 *       see. The subject must be readable in the actor's scope (else 404). `documents.read`.
 * POST  { requirement_id, subject_type, subject_id, reason, effective_until? } — waive ONE live requirement for ONE
 *       subject. `processing.documents.manage`, the subject in scope (else 404), clearance for the requirement's
 *       document class (else 403). `document_requirement_waiver_granted` is recorded first; the database then refuses a
 *       requirement whose policy does not allow waivers, a wrong grain, a foreign subject or a second active waiver.
 *       A waiver is not evidence: it grants access to no document and never touches a document's status.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const denied = requireDocumentRead(access);
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const subjectType = params.get("subject_type")?.trim() ?? "";
    const subjectId = params.get("subject_id")?.trim() ?? "";
    if (!isSubjectType(subjectType) || !UUID.test(subjectId)) return NextResponse.json({ error: "Expected subject_type and subject_id.", code: "BAD_REQUEST" }, { status: 400 });
    const supabase = createAdminClient();
    if (!(await requirementSubjectReadable(supabase, ctx.orgId, scopeDimensionsFromAccess(access), { subject_type: subjectType, subject_id: subjectId }))) {
        return NextResponse.json({ ok: false, error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const [{ data, error }, types, { data: reqs }] = await Promise.all([
        supabase.from("document_requirement_waivers").select(WAIVER_COLUMNS).eq("org_id", ctx.orgId).eq("subject_type", subjectType).eq("subject_id", subjectId).order("granted_at", { ascending: false }),
        loadRequirementTypes(supabase, ctx.orgId),
        supabase.from("document_requirement_versions").select("requirement_id, document_type_key, status").eq("org_id", ctx.orgId),
    ]);
    if (error || !types) return NextResponse.json({ ok: false, error: "Waivers could not be read.", code: "WAIVERS_UNAVAILABLE" }, { status: 500 });
    // A waiver is shown only when the actor may see EVERY version's type of its requirement (fail closed).
    const typesByReq = new Map<string, string[]>();
    for (const v of (reqs ?? []) as Array<{ requirement_id: string; document_type_key: string }>) typesByReq.set(v.requirement_id, [...(typesByReq.get(v.requirement_id) ?? []), v.document_type_key]);
    const waivers = ((data ?? []) as DocumentRequirementWaiver[]).filter((w) => (typesByReq.get(w.requirement_id) ?? [""]).every((k) => actorMaySeeRequirement(access, types, k)));
    return NextResponse.json({ ok: true, waivers });
}

export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireRequirementWaiver(ctx);
    if (denied) return denied;
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requirementId = typeof body.requirement_id === "string" ? body.requirement_id : "";
    const subjectType = body.subject_type;
    const subjectId = typeof body.subject_id === "string" ? body.subject_id : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const effectiveUntil = typeof body.effective_until === "string" && DATE.test(body.effective_until) ? body.effective_until : null;
    if (!UUID.test(requirementId) || !isSubjectType(subjectType) || !UUID.test(subjectId)) {
        return NextResponse.json({ error: "Expected requirement_id, subject_type and subject_id.", code: "BAD_REQUEST" }, { status: 400 });
    }
    if (reason.length < 3) return NextResponse.json({ error: "A waiver needs a reason.", code: "REASON_REQUIRED" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await requirementSubjectReadable(supabase, ctx.orgId, scopeDimensionsFromAccess(access), { subject_type: subjectType, subject_id: subjectId }))) {
        return NextResponse.json({ ok: false, error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const [live, types] = await Promise.all([loadLiveRequirements(supabase, ctx.orgId), loadRequirementTypes(supabase, ctx.orgId)]);
    if (!live || !types) return NextResponse.json({ ok: false, error: "The requirement could not be read.", code: "REQUIREMENT_UNAVAILABLE" }, { status: 500 });
    const requirement = live.find((r) => r.requirement_id === requirementId);
    // An archived or unpublished requirement is refused by the database with its own code; clearance is checked when known.
    if (requirement && !actorMaySeeRequirement(access, types, requirement.document_type_key)) {
        return NextResponse.json(SENSITIVE_REQUIREMENT.body, { status: SENSITIVE_REQUIREMENT.status });
    }

    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_requirement_waiver_granted",
        subject: { type: "document_requirements", id: requirementId },
        route: "admin/documents/requirements/waivers",
        detail: { requirement_key: requirement?.requirement_key ?? null, subject_type: subjectType, subject_id: subjectId, reason, effective_until: effectiveUntil },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const granted = await grantRequirementWaiver(supabase, { orgId: ctx.orgId, requirementId, subjectType, subjectId, reason, effectiveUntil, actorUserId: ctx.userId });
    if (!granted.ok) return NextResponse.json({ ok: false, error: "The waiver could not be granted.", code: granted.code }, { status: granted.status });
    return NextResponse.json({ ok: true, ...granted.value });
}
