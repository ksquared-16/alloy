import { NextRequest, NextResponse } from "next/server";

import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { assertExistingOpportunityMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { isUuidLike } from "@/lib/admin/overviewRelationshipLabels";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * PATCH — Change lead location (Manage command).
 *
 * Updates `opportunities.location_id` only. Intentionally does **not** run full
 * drawer field-policy enforcement (required custom fields elsewhere on the lead
 * must not block this targeted site change).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: opportunityId } = await context.params;
    const id = opportunityId?.trim() ?? "";
    if (!id) {
        return NextResponse.json({ error: "Missing opportunity id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { location_id?: unknown };
    const locationId = typeof body.location_id === "string" ? body.location_id.trim() : "";
    if (!locationId) {
        return NextResponse.json({ error: "Select a location." }, { status: 400 });
    }
    if (!isUuidLike(locationId)) {
        return NextResponse.json({ error: "Invalid location_id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", id, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const scopeDim = scopeDimensionsFromAccess(access);
    if (!(await assertExistingOpportunityMutableInAdminScope(supabase, ctx.orgId, scopeDim, id))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: locationRow } = await supabase
        .from("locations")
        .select("id")
        .eq("id", locationId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!locationRow?.id) {
        return NextResponse.json({ error: "Location not found" }, { status: 400 });
    }

    const { error } = await supabase
        .from("opportunities")
        .update({ location_id: locationId })
        .eq("id", id)
        .eq("org_id", ctx.orgId);

    if (error) {
        return NextResponse.json({ error: error.message || "Could not update lead location" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, location_id: locationId });
}
