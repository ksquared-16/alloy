import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { isSelfAuthorityMutation, selfAuthorityMutationResponse } from "@/lib/admin/selfAuthorityMutation";
import {
    chooseOrgAndRoleKeysFromMembershipRows,
    readLegacyAdminOpsAuthority,
    type LegacyAdminOpsAuthorityRead,
} from "@/lib/admin/resolveAdminAccessCore";
import {
    removalRefusal,
    removalResidualAuthority,
    residualAuthorityReport,
} from "@/lib/access/membershipRemovalResidual";

/**
 * POST: remove user from org (delete user_roles row). Requires org admin or `settings.users_roles`.
 * Does not delete auth.users.
 *
 * **W-20 / `T-19` (§48).** Deleting the membership row does not necessarily revoke the principal's
 * authority: the resolver falls through to the legacy identity tables for a principal with no
 * membership row anywhere, and those tables grant `admin`/`ops` outright. So this route used to
 * return `{ ok: true }` for an operation that could **promote** the person it claimed to remove.
 * The removal is now checked before it is performed, refused when it would silently revoke nothing,
 * and reports the residual when an operator has confirmed it anyway. See
 * {@link removalResidualAuthority} for why the fallback's *deletion* stays gated on census `Q15`
 * while this half does not.
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

    const body = (await request.json().catch(() => ({}))) as {
        acknowledge_residual_authority?: unknown;
    };
    const acknowledged = body?.acknowledge_residual_authority === true;

    const supabase = createAdminClient();

    // W-20 — what will admit this principal once the row is gone? The read is error-checked rather
    // than defaulted: an unreadable membership set treated as empty would send the guard down the
    // legacy path for a principal who is not on it, and an unreadable legacy answer treated as
    // absent would restore the very false success this guard exists to remove.
    const { data: membershipRows, error: membershipErr } = await supabase
        .from("user_roles")
        .select("org_id, role")
        .eq("user_id", userId);
    if (membershipErr) {
        return NextResponse.json(
            { error: "Could not read this member's other memberships; nothing was changed." },
            { status: 500 },
        );
    }

    // The fallback fires only when NO membership row remains anywhere. Asked with the resolver's own
    // predicate over the rows that would survive this delete, so the guard cannot hold a second
    // opinion about when the legacy path is consulted.
    const surviving = (Array.isArray(membershipRows) ? membershipRows : [])
        .filter((r) => r && typeof (r as { org_id?: unknown }).org_id === "string" && typeof (r as { role?: unknown }).role === "string")
        .map((r) => r as { org_id: string; role: string })
        .filter((r) => r.org_id !== orgId);
    const fallbackWouldBeConsulted = chooseOrgAndRoleKeysFromMembershipRows(surviving) === null;

    let legacyRead: LegacyAdminOpsAuthorityRead | null = null;
    if (fallbackWouldBeConsulted) {
        legacyRead = await readLegacyAdminOpsAuthority(supabase, userId);
    }

    const residual = removalResidualAuthority({ fallbackWouldBeConsulted, legacyRead });
    const refusal = removalRefusal({ residual, acknowledged });
    if (refusal) {
        return NextResponse.json(
            {
                error: refusal.message,
                residual_authority: residualAuthorityReport(residual),
                acknowledgeable: refusal.acknowledgeable,
            },
            { status: 409 },
        );
    }

    const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("org_id", orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // A removal that left authority in place says so, so the roster's disappearance of the row is
    // not read as a revocation that did not happen.
    const report = residualAuthorityReport(residual);
    return NextResponse.json(
        report ? { ok: true, revoked_access: false, residual_authority: report } : { ok: true, revoked_access: true },
    );
}
