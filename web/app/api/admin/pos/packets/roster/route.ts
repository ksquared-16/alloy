import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { loadPacketRoster } from "@/lib/pos/packet/posPacketRoster";
import { FORMS_AUTHOR, requireFormsCapability } from "@/lib/access/formsAuthority";
import { formsReadScope, formsSubjectInActorScope, namedSubject } from "@/lib/forms/formSubmissionScope";
import { isLaunchEntityType } from "@/lib/pos/packet/launchFromEntity";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/pos/packets/roster?entity_type=&entity_id= — household roster for the
 * Packet Composer: the children + parent/guardian recipients linked to an anchor record.
 * Read-only; reuses existing tables.
 *
 * R2: the roster names a household's children (with dates of birth) and its parents, so it is read only by those who
 * may compose a packet (`forms.author`, the composer's own gate) and only for an anchor inside the caller's
 * department/site scope — the same rule, and the same 404, as the compose route applies to the anchor it is given.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireFormsCapability(ctx, FORMS_AUTHOR);
    if (denied) return denied;

    const url = new URL(request.url);
    const entityType = (url.searchParams.get("entity_type") ?? "").trim();
    const entityId = (url.searchParams.get("entity_id") ?? "").trim();
    if (!isLaunchEntityType(entityType)) return jsonError("entity_type must be opportunity, customer, person, or customer_member", 400);
    if (!UUID_RE.test(entityId)) return jsonError("entity_id must be a valid id", 400);

    const supabase = createAdminClient();
    const anchorSubject = namedSubject(entityType, entityId);
    if (!anchorSubject || !(await formsSubjectInActorScope(supabase, ctx.orgId, await formsReadScope(), anchorSubject))) return jsonError("Not found", 404);
    try {
        const roster = await loadPacketRoster(supabase, ctx.orgId, entityType, entityId);
        return jsonData(roster);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load roster" }, { status: 500 });
    }
}
