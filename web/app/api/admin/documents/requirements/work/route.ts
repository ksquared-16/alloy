import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireDocumentRead } from "@/lib/documents/assertDocumentAccess";
import { listRequirementWork, loadRequirementTypes } from "@/lib/documents/requirements/documentRequirementService";
import { listDocumentAttention } from "@/lib/documents/validity/documentAttention";
import { resolveDocumentsClock } from "@/lib/documents/validity/documentsClock";

/**
 * GET — derived Documents work (Processing → Work → Documents, Work Items, the Focus Panel's attention).
 *
 * `rows` (D6, D7): unmet REQUIRED document requirements — missing, pending review, blocked, and (D7) expired — plus
 * renewal work (`expiring_soon`): a requirement still met today whose evidence is inside its expiring-soon window.
 * `documents` (D7): owned documents needing attention for their own validity or review — expired, expiring soon, review
 * due, expiration date missing — excluding any document a requirement row already represents.
 *
 * Every row is a fresh evaluation on the ORGANIZATION-local date by the one evaluator; nothing is stored, so accepted
 * evidence, a renewal, a recorded date or an applicable waiver removes the row on the next read. Subjects outside the
 * actor's scope, requirements whose document class the actor is not cleared for and documents the actor may not read
 * are never listed or counted. `documents.read`.
 *
 * B3: `documents` is a bounded page of a COMPLETE scan — `?documents_cursor=` (from `documents_next_cursor`) and
 * `?documents_limit=` (default 200, at most 500). `documents_complete` is true once every tracked document has been
 * considered; `truncated` now speaks only for the requirement rows.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const denied = requireDocumentRead(access);
    if (denied) return denied;
    const supabase = createAdminClient();
    const actor = { orgId: ctx.orgId, scope: scopeDimensionsFromAccess(access), roleKeys: access.roleKeys, permissionKeys: access.permissionKeys };
    const clock = await resolveDocumentsClock(supabase, ctx.orgId);
    const listed = await listRequirementWork(supabase, actor, { clock });
    if (!listed.ok) return NextResponse.json({ ok: false, error: "Document requirement work could not be read.", code: listed.code }, { status: 500 });
    const types = await loadRequirementTypes(supabase, ctx.orgId);
    const sp = request.nextUrl.searchParams;
    const attention = types
        ? await listDocumentAttention(supabase, actor, {
              types,
              clock,
              requirementRows: listed.rows,
              cursor: sp.get("documents_cursor"),
              limit: sp.get("documents_limit") ? Number(sp.get("documents_limit")) : null,
          })
        : ({ ok: false, code: "ATTENTION_UNAVAILABLE" } as const);
    if (!attention.ok) {
        const status = attention.code === "INVALID_CURSOR" ? 400 : 500;
        return NextResponse.json({ ok: false, error: "Document attention could not be read.", code: attention.code }, { status });
    }
    return NextResponse.json({
        ok: true,
        rows: listed.rows,
        documents: attention.rows,
        documents_next_cursor: attention.next_cursor,
        documents_complete: attention.complete,
        truncated: listed.truncated,
        today: listed.today,
    });
}
