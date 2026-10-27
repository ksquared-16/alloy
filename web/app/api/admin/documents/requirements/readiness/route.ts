import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireDocumentRead } from "@/lib/documents/assertDocumentAccess";
import { isLibrarySubjectType, type LibrarySubjectRef } from "@/lib/documents/library/documentLibraryModel";
import { buildSubjectReadiness } from "@/lib/documents/requirements/documentRequirementService";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function subjectParam(params: URLSearchParams, typeKey: string, idKey: string): LibrarySubjectRef | null | "invalid" {
    const type = params.get(typeKey)?.trim() || "";
    const id = params.get(idKey)?.trim() || "";
    if (!type && !id) return null;
    if (!isLibrarySubjectType(type) || !UUID.test(id)) return "invalid";
    return { subject_type: type, subject_id: id };
}

/**
 * GET — D6: document readiness for the household graph around a record (Focus Panel), or one member of it.
 *
 * `?subject_type&subject_id[&focus_type&focus_id]`, the D4 library's admission: the record must be readable in the
 * actor's scope (else 404). Every result comes from the one Documents evaluator; a subject outside scope is dropped,
 * a requirement whose document class the actor is not cleared for is not shown, and evidence is listed only when the
 * actor may read that document. `documents.read`.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const denied = requireDocumentRead(access);
    if (denied) return denied;

    const params = new URL(request.url).searchParams;
    const anchor = subjectParam(params, "subject_type", "subject_id");
    const focus = subjectParam(params, "focus_type", "focus_id");
    if (!anchor || anchor === "invalid" || focus === "invalid") {
        return NextResponse.json({ error: "Expected subject_type and subject_id.", code: "BAD_REQUEST" }, { status: 400 });
    }
    const built = await buildSubjectReadiness(
        createAdminClient(),
        { orgId: ctx.orgId, scope: scopeDimensionsFromAccess(access), roleKeys: access.roleKeys, permissionKeys: access.permissionKeys },
        { anchor, focus },
    );
    if (!built.ok) {
        const error = built.status === 404 ? "Not found" : "Document readiness could not be read.";
        return NextResponse.json({ ok: false, error, code: built.code }, { status: built.status });
    }
    return NextResponse.json({ ok: true, readiness: built.value });
}
