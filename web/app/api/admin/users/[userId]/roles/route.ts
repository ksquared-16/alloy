import { NextRequest, NextResponse } from "next/server";

import { accessMutationAudit } from "@/lib/access/accessMutationAudit";
import { assignMemberRole } from "@/lib/admin/memberRoleAssignmentWrite";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { isSelfAuthorityMutation, selfAuthorityMutationResponse } from "@/lib/admin/selfAuthorityMutation";
import { invalidateAdminShellContextCache } from "@/lib/adminV2/adminShellContextCache";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST: add ONE role to this membership, leaving the others alone.
 *
 * W-17. The sibling `PATCH …/role` replaces the whole set, which is the only reason a person could
 * never hold two roles even though the resolver has always unioned them. This is the additive half:
 * it names one role and touches one row, so an operator adding "Billing Assistant" cannot silently
 * discard "Lead Teacher" — and two administrators adding different roles at the same moment cannot
 * erase each other.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { userId } = await context.params;
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    // Self-elevation ban — denied before the body is read, so no write can be reached.
    if (isSelfAuthorityMutation({ callerUserId: access.userId, targetUserId: userId })) {
        return selfAuthorityMutationResponse();
    }

    const body = await request.json().catch(() => ({}));
    const roleKey = typeof body.role === "string" ? body.role.trim() : "";
    if (!roleKey) return NextResponse.json({ error: "role is required" }, { status: 400 });

    const supabase = createAdminClient();

    /*
     * The role must be one this organization defines AND has active. The foreign key already makes
     * another organization's key unreachable, but a structural refusal reaches the operator as a
     * constraint error; this answers in the product's own words, and refuses an inactive role the
     * FK would happily accept.
     */
    const { data: roleRow } = await supabase
        .from("role_definitions")
        .select("role_key")
        .eq("org_id", access.orgId)
        .eq("role_key", roleKey)
        .eq("is_active", true)
        .maybeSingle();
    if (!roleRow) {
        return NextResponse.json({ error: "Invalid or inactive role for this org" }, { status: 400 });
    }

    const result = await assignMemberRole({
        supabase,
        orgId: access.orgId,
        userId,
        roleKey,
        audit: accessMutationAudit(access),
    });
    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.kind === "unknown_role" ? 400 : 500 });
    }

    /*
     * W-13 — this member's roles just changed, so the bundle cached against their user id is stale,
     * and since W-13 that bundle carries ADMISSION. Invalidated after the transaction committed, so
     * the next authoritative request cannot read the old union back into a fresh cache entry.
     */
    invalidateAdminShellContextCache(userId);

    return NextResponse.json({ role_key: result.roleKey, changed: result.changed, role_keys: result.roleKeys });
}
