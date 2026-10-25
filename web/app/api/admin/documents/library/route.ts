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
 * GET — D4: the household document library for a household, adult, child or case.
 *
 * `?subject_type=household|person|child|opportunity&subject_id=<uuid>` names the record the operator opened; the
 * library resolves its household. `&focus_type=…&focus_id=…` narrows it to one member of that household on the
 * server. `documents.read`. A record outside the actor's organization or scope is 404, as is a focus outside the
 * household. Every document passes the canonical disclosure (availability, primary-owner scope, sensitivity) before it
 * is listed or counted.
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
        { anchor, focus },
    );
    if (!built.ok) {
        const error = built.status === 404 ? "Not found" : "The document library could not be read.";
        return NextResponse.json({ ok: false, error, code: built.code }, { status: built.status });
    }
    return NextResponse.json({ ok: true, library: built.value });
}
