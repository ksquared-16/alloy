import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireDocumentRead } from "@/lib/documents/assertDocumentAccess";
import { listRequirementWork } from "@/lib/documents/requirements/documentRequirementService";

/**
 * GET — D6: unmet, required document requirements as DERIVED work (Processing → Work → Documents, and Work Items).
 *
 * Every row is a fresh evaluation by the one Documents evaluator; nothing is stored, so accepted evidence or an
 * applicable waiver removes the row on the next read and a review in progress moves it to "pending review". Subjects
 * outside the actor's scope and requirements whose document class the actor is not cleared for are never listed or
 * counted. `documents.read`.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const denied = requireDocumentRead(access);
    if (denied) return denied;
    const listed = await listRequirementWork(createAdminClient(), {
        orgId: ctx.orgId,
        scope: scopeDimensionsFromAccess(access),
        roleKeys: access.roleKeys,
        permissionKeys: access.permissionKeys,
    });
    if (!listed.ok) return NextResponse.json({ ok: false, error: "Document requirement work could not be read.", code: listed.code }, { status: 500 });
    return NextResponse.json({ ok: true, rows: listed.rows, truncated: listed.truncated, today: listed.today });
}
