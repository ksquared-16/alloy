import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { isSelfAuthorityMutation, selfAuthorityMutationResponse } from "@/lib/admin/selfAuthorityMutation";
import { replaceMembershipWithAccessProfile } from "@/lib/admin/membershipWithProfile";

/**
 * PATCH: replace **all** role rows for this user in this org with a single role_key.
 * Multi-role personas (e.g. ops + regional_lead) must be re-added via seed or a future additive API.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { userId } = await context.params;
    if (!userId) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // Self-elevation ban — denied before the body is read, so no write can be reached.
    if (isSelfAuthorityMutation({ callerUserId: access.userId, targetUserId: userId })) {
        return selfAuthorityMutationResponse();
    }

    const body = await request.json().catch(() => ({}));
    const role = typeof body.role === "string" ? body.role.trim() : "";
    if (!role) {
        return NextResponse.json({ error: "role is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: roleRow } = await supabase.from("role_definitions").select("role_key").eq("org_id", access.orgId).eq("role_key", role).eq("is_active", true).maybeSingle();
    if (!roleRow) {
        return NextResponse.json({ error: "Invalid or inactive role for this org" }, { status: 400 });
    }

    // W-5/G4: the replacement and the access profile are one transaction. This was
    // delete-then-insert as two statements, so a failed insert left the user with
    // no membership at all; the RPC either lands the replacement or moves nothing.
    const membership = await replaceMembershipWithAccessProfile(supabase, {
        userId,
        orgId: access.orgId,
        role,
    });
    if (!membership.ok) {
        if (membership.kind === "not_found") {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json({ error: membership.error }, { status: 500 });
    }

    return NextResponse.json({
        ...membership.row,
        role_keys: [role],
    });
}
