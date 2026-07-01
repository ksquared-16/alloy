import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { displayRoleForAdminPicker, groupSortedRoleKeysByUserId } from "@/lib/admin/userRolesMembership";

export const dynamic = "force-dynamic";

export type UsersRolesMemberRow = {
    user_id: string;
    email: string | null;
    display_name: string | null;
    role_keys: string[];
    primary_role: string;
    department_scope: "all" | "restricted";
    site_scope: "all" | "restricted";
    department_ids: string[];
    site_location_ids: string[];
};

/**
 * GET — org members with roles + CRM access profile summary for Settings → Users & Roles.
 * Requires org admin or `settings.users_roles` permission (server-enforced).
 */
export async function GET() {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;

    const { access } = auth;
    const supabase = createAdminClient();
    const orgId = access.orgId;

    const { data: roleRows, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("org_id", orgId)
        .order("user_id", { ascending: true });

    if (rolesError) {
        return NextResponse.json({ error: rolesError.message }, { status: 500 });
    }

    const byUser = groupSortedRoleKeysByUserId((roleRows ?? []) as { user_id: string; role: string }[]);
    const userIds = [...byUser.keys()].sort();

    const profileByUser = new Map<
        string,
        { department_scope: "all" | "restricted"; site_scope: "all" | "restricted" }
    >();
    const deptByUser = new Map<string, string[]>();
    const siteByUser = new Map<string, string[]>();

    if (userIds.length) {
        const { data: profiles, error: profErr } = await supabase
            .from("user_access_profiles")
            .select("user_id, department_scope, site_scope")
            .eq("org_id", orgId)
            .in("user_id", userIds);
        if (profErr) {
            return NextResponse.json({ error: profErr.message }, { status: 500 });
        }
        for (const p of profiles ?? []) {
            const row = p as { user_id: string; department_scope?: string | null; site_scope?: string | null };
            profileByUser.set(row.user_id, {
                department_scope: (row.department_scope ?? "all") === "restricted" ? "restricted" : "all",
                site_scope: (row.site_scope ?? "all") === "restricted" ? "restricted" : "all",
            });
        }

        const { data: deptAccess, error: daErr } = await supabase
            .from("user_department_access")
            .select("user_id, department_id")
            .eq("org_id", orgId)
            .in("user_id", userIds);
        if (daErr) {
            return NextResponse.json({ error: daErr.message }, { status: 500 });
        }
        for (const row of deptAccess ?? []) {
            const r = row as { user_id: string; department_id: string };
            const cur = deptByUser.get(r.user_id) ?? [];
            cur.push(r.department_id);
            deptByUser.set(r.user_id, cur);
        }

        const { data: siteAccess, error: saErr } = await supabase
            .from("user_site_access")
            .select("user_id, location_id")
            .eq("org_id", orgId)
            .in("user_id", userIds);
        if (saErr) {
            return NextResponse.json({ error: saErr.message }, { status: 500 });
        }
        for (const row of siteAccess ?? []) {
            const r = row as { user_id: string; location_id: string };
            const cur = siteByUser.get(r.user_id) ?? [];
            cur.push(r.location_id);
            siteByUser.set(r.user_id, cur);
        }
    }

    const members: UsersRolesMemberRow[] = [];

    for (const user_id of userIds) {
        const role_keys = byUser.get(user_id) ?? [];
        const primary = displayRoleForAdminPicker(role_keys);

        let email: string | null = null;
        let display_name: string | null = null;
        try {
            const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
            if (authUser?.user) {
                email = authUser.user.email ?? null;
                const meta = authUser.user.user_metadata as Record<string, unknown> | undefined;
                const full =
                    meta && typeof meta.full_name === "string" ? meta.full_name.trim()
                    : meta && typeof meta.name === "string" ? (meta.name as string).trim()
                    : "";
                display_name = full || null;
            }
        } catch {
            /* ignore */
        }

        const prof = profileByUser.get(user_id);
        const department_scope = prof?.department_scope ?? "all";
        const site_scope = prof?.site_scope ?? "all";
        const department_ids = department_scope === "restricted" ? deptByUser.get(user_id) ?? [] : [];
        const site_location_ids = site_scope === "restricted" ? siteByUser.get(user_id) ?? [] : [];

        members.push({
            user_id,
            email,
            display_name,
            role_keys,
            primary_role: primary,
            department_scope,
            site_scope,
            department_ids,
            site_location_ids,
        });
    }

    const { data: deptRows, error: dErr } = await supabase
        .from("departments")
        .select("id, name, key")
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true });
    if (dErr) {
        return NextResponse.json({ error: dErr.message }, { status: 500 });
    }

    const { data: locRows, error: lErr } = await supabase
        .from("locations")
        .select("id, label, location_type")
        .eq("org_id", orgId)
        .eq("location_type", "site")
        .or("is_active.is.null,is_active.eq.true")
        .order("label", { ascending: true });
    if (lErr) {
        return NextResponse.json({ error: lErr.message }, { status: 500 });
    }

    return NextResponse.json({
        members,
        departments: (deptRows ?? []).map((d) => ({
            id: (d as { id: string }).id,
            name: (d as { name?: string | null }).name ?? null,
            key: (d as { key?: string | null }).key ?? null,
        })),
        site_locations: (locRows ?? []).map((l) => ({
            id: (l as { id: string }).id,
            label: (l as { label?: string | null }).label ?? null,
        })),
    });
}
