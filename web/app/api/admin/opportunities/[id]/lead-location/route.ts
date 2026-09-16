import { NextRequest, NextResponse } from "next/server";

import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import {
    assertExistingOpportunityMutableInAdminScope,
    locationAllowedUnderSiteScope,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import { ENROLLMENT_RECORD_MANAGE, requireEnrollmentCapability } from "@/lib/access/enrollmentAuthority";
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

    /*
     * ENROLLMENT RECORD AUTHORITY — this route had NO functional gate at all, not even the
     * admission check its siblings ran. Moving a Lead between sites is ordinary record
     * management, so it is `enrollment.record.manage`.
     *
     * Decided BEFORE the record is read, so an unauthorized caller cannot tell an existing lead
     * from a missing one by the difference between 404 and 403.
     */
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const capDenied = requireEnrollmentCapability(access, ENROLLMENT_RECORD_MANAGE);
    if (capDenied) return capDenied;

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", id, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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

    /*
     * THE DESTINATION IS SCOPE-BEARING, AND IT WAS NEVER CHECKED.
     *
     * The assert above proves the lead's CURRENT location is inside the caller's sites. The
     * lookup above proves the destination belongs to the org. Neither proves the DESTINATION is
     * inside the caller's sites — so a site-restricted operator could move a lead to a site they
     * cannot see, pushing it out of their own scope or pulling it into it. `location_id` is the
     * column `assertOpportunityInAccessScope` reads, so this one write could rewrite the very
     * attribute every later scope decision about this record depends on.
     *
     * `locationAllowedUnderSiteScope` is the existing site authority — the same helper the rest
     * of the estate uses, resolving a location up to its effective site. No new scope semantics.
     * A caller scoped to `all` is unaffected; a restricted caller may move a lead only to a site
     * they hold. The refusal happens BEFORE the update, so the lead's location is unchanged.
     */
    if (!(await locationAllowedUnderSiteScope(supabase, ctx.orgId, scopeDim, locationId))) {
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
