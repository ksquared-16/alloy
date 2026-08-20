import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { isSelfAuthorityMutation, selfAuthorityMutationResponse } from "@/lib/admin/selfAuthorityMutation";
import { replaceMembershipWithAccessProfile } from "@/lib/admin/membershipWithProfile";
import {
    replacementRemovalRefusal,
    replacementRemovalRefusalMessage,
} from "@/lib/access/memberRoleAssignment";

/**
 * PATCH: replace **all** role rows for this user in this org with a single role_key.
 * Multi-role personas (e.g. ops + regional_lead) must be re-added via seed or a future additive API.
 *
 * **W-54 / `I-34`ᴬ.** The replacement is refused when it would delete a role the request did not
 * carry. Callers that can render the whole membership send `expected_role_keys`; callers that cannot
 * — the two legacy editors, which collapse the set to one value — are refused rather than allowed to
 * destroy a row they never showed. Single-role memberships are unaffected: replacing the only role
 * removes nothing but itself. See {@link replacementRemovalRefusal} for why the client-side
 * acknowledgement `IA-7` added was not sufficient on its own.
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

    // W-54/I-34ᴬ: refuse a destructive replacement submitted from a partial view. The read is
    // error-checked rather than defaulted — an unreadable membership must not be treated as an
    // empty one, because `removed` would then be empty and the guard would wave the write through.
    // That is W-43's read-failure lesson applied to a guard instead of to a resolver.
    const { data: heldRows, error: heldErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", access.orgId);
    if (heldErr) {
        return NextResponse.json(
            { error: "Could not read the member's current roles; the change was not applied." },
            { status: 500 },
        );
    }

    const refusal = replacementRemovalRefusal({
        currentRoleKeys: (heldRows ?? []).map((r) => (r as { role: string }).role),
        nextRoleKey: role,
        acknowledgedRoleKeys: Array.isArray(body.expected_role_keys) ? body.expected_role_keys : null,
    });
    if (refusal) {
        return NextResponse.json(
            {
                error: replacementRemovalRefusalMessage(refusal),
                removed_roles: refusal.removed,
                unacknowledged_roles: refusal.unacknowledged,
            },
            { status: 409 },
        );
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
