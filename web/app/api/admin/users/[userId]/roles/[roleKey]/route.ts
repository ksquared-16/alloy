import { NextRequest, NextResponse } from "next/server";

import { accessMutationAudit } from "@/lib/access/accessMutationAudit";
import { removeMemberRole } from "@/lib/admin/memberRoleAssignmentWrite";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { isSelfAuthorityMutation, selfAuthorityMutationResponse } from "@/lib/admin/selfAuthorityMutation";
import { invalidateAdminShellContextCache } from "@/lib/adminV2/adminShellContextCache";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * DELETE: remove ONE role from this membership, leaving the others alone.
 *
 * W-17. Targeted rather than "write the set back without this one", so a concurrent assignment of a
 * different role cannot be erased by this removal.
 *
 * Removing the LAST role is not removing the person. The membership's access profile has no foreign
 * key to `user_roles`, so it and the configured scope survive; the principal resolves to no
 * capabilities and portal admission fails for want of `portal.access`. Ending a membership remains
 * its own action, with its own audit.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ userId: string; roleKey: string }> }) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { userId, roleKey: rawRoleKey } = await context.params;
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const roleKey = decodeURIComponent(rawRoleKey ?? "").trim();
    if (!roleKey) return NextResponse.json({ error: "roleKey required" }, { status: 400 });

    // Self-elevation ban — an administrator may not change their own authority here either. Removing
    // one's own role is a reduction, but the ban is about who may act on whom, not about direction.
    if (isSelfAuthorityMutation({ callerUserId: access.userId, targetUserId: userId })) {
        return selfAuthorityMutationResponse();
    }

    const result = await removeMemberRole({
        supabase: createAdminClient(),
        orgId: access.orgId,
        userId,
        roleKey,
        audit: accessMutationAudit(access),
    });
    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.kind === "unknown_role" ? 400 : 500 });
    }

    invalidateAdminShellContextCache(userId);

    return NextResponse.json({ role_key: result.roleKey, changed: result.changed, role_keys: result.roleKeys });
}
