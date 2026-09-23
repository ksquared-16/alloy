/**
 * END_RESTRICTION — the named intent that lifts a safeguarding restriction.
 *
 * A separate endpoint rather than a status field an operator could set to anything: `revoked` is
 * the only end this surface can produce, and `expired` / `superseded` stay reachable only through
 * the paths that genuinely cause them. The row is retained — deleting it would erase that the child
 * was ever protected, which is the fact a later review most needs.
 *
 * Lifting a restriction is the moment a barred adult becomes collectable again, so it takes the
 * same manage authority as creating one, and records who did it (`updated_by`).
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { loadAdminAccessBundleCached } from "@/lib/admin/getAdminAccessContext";
import { logAdminAudit } from "@/lib/admin/adminAuditLog";
import { requireCrmPeopleCapability, CRM_CUSTOMERS_WRITE } from "@/lib/access/crmPeopleAuthority";
import { canManageSafeguarding } from "@/lib/safeguarding/safeguardingAuthority";
import { endChildSafeguardingRestriction } from "@/lib/safeguarding/childSafeguardingRestrictionService";

type RouteParams = { params: Promise<{ childId: string; restrictionId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
    const bundle = await loadAdminAccessBundleCached();
    if (!bundle.ok) return adminContextFailureResponse(bundle);
    const capDenied = requireCrmPeopleCapability(bundle, CRM_CUSTOMERS_WRITE);
    if (capDenied) return capDenied;
    if (!canManageSafeguarding(bundle.roleKeys)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { restrictionId } = await params;

    let endedOn: string | null = null;
    try {
        const body = (await request.json()) as { ended_on?: string };
        if (typeof body?.ended_on === "string" && body.ended_on.trim()) endedOn = body.ended_on.trim();
    } catch { /* a body is optional; the end defaults to today */ }

    const result = await endChildSafeguardingRestriction(createAdminClient(), {
        orgId: bundle.orgId,
        actorUserId: bundle.userId,
        restrictionId,
        endedOn,
    });

    if (!result.ok) {
        const status = result.code === "restriction_not_found" ? 404 : 400;
        return NextResponse.json({ error: result.error }, { status });
    }

    logAdminAudit({
        entity: "child_safeguarding_restriction",
        id: String(result.value.id ?? ""),
        changed_fields: ["status:revoked"],
        actor_user_id: bundle.userId,
        role: "safeguarding.manage",
    });

    return NextResponse.json({ restriction: result.value });
}
