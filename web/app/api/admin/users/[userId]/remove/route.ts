import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { isSelfAuthorityMutation, selfAuthorityMutationResponse } from "@/lib/admin/selfAuthorityMutation";

/**
 * POST: remove user from org (delete user_roles row). Requires org admin or `settings.users_roles`.
 * Does not delete auth.users.
 *
 * **W-20 / `T-19` (§48) — closed by deletion, not by a guard.**
 *
 * `01…§49`: *"The failure mode is not 'removal is slow' — it is 'removal is inverted.' … Removing a
 * `school_director` who has an old `app_users.role = 'admin'` row **promotes them**."* The resolver
 * fell through to the legacy identity tables for a principal with no membership row anywhere, so
 * this route could return `{ ok: true }` for an operation that promoted the person it claimed to
 * remove.
 *
 * `T-19` closed the live half first (§1.6) with a guard: read the legacy tables before deleting,
 * refuse a removal that would revoke nothing, report the residual when an operator confirmed it
 * anyway. That guard is **gone**, because what it guarded against is gone. `W-20` deleted the
 * fallback once `Q15-A1` proved the lockout population empty on the deployed tenant, and
 * `resolveAdminAccessCore` now answers from `user_roles` alone. Deleting the last membership row
 * revokes the principal's operator authority, unconditionally — so `revoked_access: true` is a
 * fact about the system's structure rather than a claim this route has to check.
 *
 * Keeping the guard would have been worse than redundant. A refusal path that can never fire reads
 * to the next author as evidence that a second authority source still exists, and `T-6`'s rule
 * about controls that change nothing applies to guards as much as to radios. `RL-12`
 * (`membershipRevocationTruthScan`) is what holds the premise: no authority path reads
 * `user_profiles.role` or `app_users.role`, so removal cannot be inverted again without failing it.
 */
export async function POST(
    request: Request,
    context: { params: Promise<{ userId: string }> }
) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { orgId, userId: callerUserId } = auth.access;

    const { userId } = await context.params;
    if (!userId) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // Self-elevation ban — deleting your own membership is an authority change (and a self-lockout).
    if (isSelfAuthorityMutation({ callerUserId, targetUserId: userId })) {
        return selfAuthorityMutationResponse();
    }

    const supabase = createAdminClient();

    const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("org_id", orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // W-20: membership was the only source, so the row's deletion IS the revocation. The field is
    // kept — clients read it — and it is now true by construction rather than by inspection.
    return NextResponse.json({ ok: true, revoked_access: true });
}
