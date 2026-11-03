import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireDocumentRead } from "@/lib/documents/assertDocumentAccess";
import { buildDocumentLibrary, isLibrarySubjectType, type LibrarySubjectRef } from "@/lib/documents/library/documentLibrary";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function subjectParam(params: URLSearchParams, typeKey: string, idKey: string): LibrarySubjectRef | null | "invalid" {
    const type = params.get(typeKey)?.trim() || "";
    const id = params.get(idKey)?.trim() || "";
    if (!type && !id) return null;
    if (!isLibrarySubjectType(type) || !UUID.test(id)) return "invalid";
    return { subject_type: type, subject_id: id };
}

/**
 * GET — D9.3: the ARCHIVED documents of a household library, so staff can find what was archived and restore it.
 *
 * Same parameters, admission and disclosure as `GET /api/admin/documents/library` (`documents.read`; the anchor must be
 * readable; every document passes primary-owner scope and sensitivity before it is listed), but only `archived` rows,
 * each with its archive record (when, why, by an application or staff, the status it had). Quarantined, deleted,
 * restricted and superseded documents never appear here. Until the archive migration is applied no document can be
 * `archived`, so the list is empty.
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

    const built = await buildDocumentLibrary(
        createAdminClient(),
        { orgId: ctx.orgId, scope: scopeDimensionsFromAccess(access), roleKeys: access.roleKeys, permissionKeys: access.permissionKeys },
        { anchor, focus, listing: "archived" },
    );
    if (!built.ok) {
        const error = built.status === 404 ? "Not found" : "The archived documents could not be read.";
        return NextResponse.json({ ok: false, error, code: built.code }, { status: built.status });
    }
    return NextResponse.json({ ok: true, documents: built.value.documents, truncated: built.value.truncated });
}
