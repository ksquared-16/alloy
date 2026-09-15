import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { ADMIN_USERS_READ, ADMIN_USERS_WRITE, requireAccessAdministration } from "@/lib/admin/canManageUsersAndRoles";
import { memberDirectoryLabel, projectMemberEmail } from "@/lib/access/memberDirectoryProjection";
import { displayRoleForAdminPicker, groupSortedRoleKeysByUserId } from "@/lib/admin/userRolesMembership";
import { createMembershipWithAccessProfile } from "@/lib/admin/membershipWithProfile";
import { accessMutationAudit } from "@/lib/access/accessMutationAudit";
import { fullNameFromParts } from "@/lib/access/operatorAccountName";

export type AdminUserRow = {
    user_id: string;
    /**
     * The member's address, or `null` — withheld from callers without `settings.users_roles`.
     * See `lib/access/memberDirectoryProjection.ts` (W14-F1, disclosure half).
     */
    email: string | null;
    /** A name safe to show to any portal-admitted caller. Always present. */
    label: string;
    /** Sorted unique role_keys for this member in the current org */
    role_keys: string[];
    /**
     * Single role_key for dropdowns (admin → ops → first lexicographic).
     * PATCH /role replaces all roles for this user/org with one role_key.
     */
    role: string;
    created_at: string;
};

/**
 * GET: list org members (one row per user; roles aggregated).
 *
 * **`OD-8` / `W-15` — this gate reads a capability. It used to read admission.**
 *
 * The roster was gated on portal eligibility: `admin` OR `ops`, a role literal evaluated in
 * application code. `W-15`'s burndown converts non-capability gates to the canonical capability
 * under `OD-7`, and this handler was the one recorded exception — not for want of a decision, but
 * because it failed the no-widening test. `settings.users_roles.read` is resolved WITHOUT requiring
 * `portalEligible`, so a principal holding the key through a custom role would have gained a read
 * they did not have, and `OD-7` rule 6 forbids closing that gap with an ad-hoc secondary role check.
 *
 * **The `Q15` census answered it with real-tenant evidence, and both halves were needed.**
 *
 *   * `C1 = 0` — no deployed role outside `admin`/`ops` holds `settings.users_roles.read`. The
 *     widening population the exception was written against is EMPTY, so the conversion admits
 *     nobody new. This is the fact that could only come from the deployed database; a fixture
 *     asserting it would have been the census answering itself.
 *   * `B4` — `ops` was missing the key in 2 organizations, so converting first would have NARROWED.
 *     `20260819140000` grants it and REFUSES to complete while any org defining `ops` is uncovered.
 *
 * Hence `preserve → verify → convert`, and hence the migration lands before this code. `W-8` is this
 * initiative's own record of what an unannounced narrowing costs.
 *
 * **No secondary check survives.** `requirePortalOrUsersRolesManageAuth` resolves
 * `settings.users_roles.read` OR the managing key and consults `portalEligible` nowhere. Re-adding a
 * portal test to mimic the old shape is exactly the pattern `OD-7` rejects, and it would reinstate
 * the fifth authority layer `W-13` removed — `OD-8` states plainly that it does not reopen
 * `I-35`ᴮ.
 *
 * **Scope is unchanged and still enforced**: the query is bounded to `access.orgId`, which is the
 * membership's org. Capability decides whether the roster may be read; it does not decide whose.
 *
 * **The disclosure half is untouched, and the split nearly changed that by accident.** Addresses
 * were projected against `canManageUsersAndRoles`, which named the MANAGING key while one key
 * managed everything. That function is now the CHAPTER gate — true for any Access authority,
 * `admin.users.read` included — so leaving the call here would have started disclosing addresses to
 * every read-only principal, which is `W14-F1`'s defect restored by a rename rather than a decision.
 * The disclosure names its authority directly now: `admin.users.write`.
 */
export async function GET() {
    const auth = await requireAccessAdministration(ADMIN_USERS_READ);
    if (!auth.ok) return auth.response;
    const { access } = auth;

    // W14-F1. The MANAGING capability, read from the same resolved context the gate used — not a
    // second auth pass, and not a different predicate that happens to agree today. It is the same
    // membership test `requireAccessAdministration(ADMIN_USERS_WRITE)` applies on the POST below, so
    // "may see the address" and "may act on the person" cannot drift apart.
    const mayReadEmail = access.permissionKeys.includes(ADMIN_USERS_WRITE);

    const supabase = createAdminClient();

    const { data: rows, error: rolesError } = await supabase.from("user_roles").select("user_id, role").eq("org_id", access.orgId).order("user_id", { ascending: true });

    if (rolesError) {
        return NextResponse.json({ error: rolesError.message }, { status: 500 });
    }

    const list = (rows ?? []) as { user_id: string; role: string }[];
    const byUser = groupSortedRoleKeysByUserId(list);
    const result: AdminUserRow[] = [];

    for (const user_id of [...byUser.keys()].sort()) {
        const role_keys = byUser.get(user_id) ?? [];
        const role = displayRoleForAdminPicker(role_keys);

        let email: string | null = null;
        let created_at = "";

        try {
            const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
            if (authUser?.user) {
                email = authUser.user.email ?? null;
                created_at = (authUser.user as { created_at?: string }).created_at ?? "";
            }
        } catch (_) {
            // User may be deleted from auth; still show row with null email
        }

        result.push({
            user_id,
            email: projectMemberEmail(email, mayReadEmail),
            label: memberDirectoryLabel(email, user_id),
            role_keys,
            role,
            created_at,
        });
    }

    return NextResponse.json({ users: result });
}

/** POST: invite user to org. Requires org admin or `settings.users_roles` permission. Body: { email, role } (role = role_key from role_definitions). */
export async function POST(request: Request) {
    const auth = await requireAccessAdministration(ADMIN_USERS_WRITE);
    if (!auth.ok) return auth.response;
    const { access } = auth;

    let body: { email?: string; role?: string; first_name?: string; last_name?: string } = {};
    try {
        body = (await request.json()) as {
            email?: string;
            role?: string;
            first_name?: string;
            last_name?: string;
        };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
    if (!role) return NextResponse.json({ error: "role is required" }, { status: 400 });

    const supabase = createAdminClient();

    const { data: roleRow } = await supabase.from("role_definitions").select("role_key").eq("org_id", access.orgId).eq("role_key", role).eq("is_active", true).maybeSingle();
    if (!roleRow) {
        return NextResponse.json({ error: "Invalid or inactive role for this org" }, { status: 400 });
    }

    /**
     * The account's display name, if the operator supplied one.
     *
     * First and last are INPUTS. Only `full_name` is written, because that is the canonical
     * representation the rest of the product already reads — persisting the parts alongside it would
     * be the parallel identity store the operator decision forbids, and the two would disagree the
     * first time either was edited anywhere else.
     *
     * Absent when neither part carries anything: an invitation with no name must leave the account
     * genuinely nameless rather than seeding a blank one, so the surface can say so.
     */
    const fullName = fullNameFromParts(body.first_name, body.last_name);

    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`.trim() || undefined,
        ...(fullName ? { data: { full_name: fullName } } : {}),
    });
    if (inviteError) {
        return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }
    const user = inviteData?.user;
    if (!user?.id) {
        return NextResponse.json({ error: "Invite did not return a user" }, { status: 500 });
    }

    // W-5/G4: membership + access profile are one transaction. Never insert into
    // `user_roles` directly here — that is the fail-open path this closes.
    /*
     * THE INITIAL ROLE IS A DELEGATION, so the actor travels with it.
     *
     * Creating a member with a role confers that role's entire package. Without the actor this call
     * was the way around W-18: a user administrator who could not add one capability to a role could
     * still mint a colleague holding eighty. The RPC bounds the creation to this actor's own
     * effective authority and refuses what exceeds it, before any row is written.
     */
    const membership = await createMembershipWithAccessProfile(supabase, {
        userId: user.id,
        orgId: access.orgId,
        role,
        audit: accessMutationAudit(access),
    });
    if (!membership.ok) {
        if (membership.kind === "duplicate") {
            return NextResponse.json({ error: "This user already has this role in this org" }, { status: 409 });
        }
        // The initial role is a delegation; a ceiling refusal is about who is asking, so 403.
        if (membership.kind === "forbidden") {
            return NextResponse.json({ error: membership.error }, { status: 403 });
        }
        return NextResponse.json({ error: membership.error }, { status: 500 });
    }

    return NextResponse.json({
        user_id: user.id,
        email: user.email ?? email,
        display_name: fullName,
        role,
        role_keys: [role],
    });
}
