import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { displayRoleForAdminPicker, groupSortedRoleKeysByUserId } from "@/lib/admin/userRolesMembership";
import { createMembershipWithAccessProfile } from "@/lib/admin/membershipWithProfile";

export type AdminUserRow = {
    user_id: string;
    email: string | null;
    /** Sorted unique role_keys for this member in the current org */
    role_keys: string[];
    /**
     * Single role_key for dropdowns (admin → ops → first lexicographic).
     * PATCH /role replaces all roles for this user/org with one role_key.
     */
    role: string;
    created_at: string;
};

/** GET: list org members (one row per user; roles aggregated). Admin + ops can read. */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const supabase = createAdminClient();

    const { data: rows, error: rolesError } = await supabase.from("user_roles").select("user_id, role").eq("org_id", ctx.orgId).order("user_id", { ascending: true });

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
            email,
            role_keys,
            role,
            created_at,
        });
    }

    return NextResponse.json({ users: result });
}

/** POST: invite user to org. Requires org admin or `settings.users_roles` permission. Body: { email, role } (role = role_key from role_definitions). */
export async function POST(request: Request) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    let body: { email?: string; role?: string } = {};
    try {
        body = (await request.json()) as { email?: string; role?: string };
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

    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`.trim() || undefined,
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
    const membership = await createMembershipWithAccessProfile(supabase, {
        userId: user.id,
        orgId: access.orgId,
        role,
    });
    if (!membership.ok) {
        if (membership.kind === "duplicate") {
            return NextResponse.json({ error: "This user already has this role in this org" }, { status: 409 });
        }
        return NextResponse.json({ error: membership.error }, { status: 500 });
    }

    return NextResponse.json({
        user_id: user.id,
        email: user.email ?? email,
        role,
        role_keys: [role],
    });
}
