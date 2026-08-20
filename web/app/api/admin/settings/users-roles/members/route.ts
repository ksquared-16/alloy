import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { displayRoleForAdminPicker, groupSortedRoleKeysByUserId } from "@/lib/admin/userRolesMembership";
import {
    projectMemberAuthentication,
    projectMemberLifecycle,
    projectMemberScope,
    type AuthUserFacts,
    type MemberAuthenticationProjection,
    type MemberLifecycleProjection,
    type MemberScopeProjection,
} from "@/lib/access/memberIdentityProjection";

export const dynamic = "force-dynamic";

/**
 * W-46 / W-47 — this projection carries the lifecycle, and it no longer defaults an absent
 * access profile to `all`.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21.
 *
 * `06…§4.2` (`IA-2`) recorded that this route **already called** `auth.admin.getUserById` and kept
 * two fields — *"the `User` object it discards carries `invited_at`, `confirmed_at`…"* and the ban
 * state. The data was fetched and thrown away, which is why the Users chapter had no status field
 * to render and asserted `Active` as a string literal in four places instead (`IA-1`). It is kept
 * now. `IA-R2`'s per-field escape hatch is honoured by the `unknown_reason` on each block: a
 * membership whose auth record cannot be read projects `unknown` **with the reason**, never
 * `active`.
 *
 * The scope fields carry three values. `unset` — no `user_access_profiles` row — was previously
 * collapsed into `all` by a `?? "all"`, which `01…§31` calls *"the fail-open in GAP-3, rendered as
 * a reassurance."* Derivation lives in `lib/access/memberIdentityProjection.ts`.
 */
export type UsersRolesMemberRow = {
    user_id: string;
    email: string | null;
    display_name: string | null;
    role_keys: string[];
    primary_role: string;
    department_scope: MemberScopeProjection["department_scope"];
    site_scope: MemberScopeProjection["site_scope"];
    has_access_profile: boolean;
    effective_department_scope: MemberScopeProjection["effective_department_scope"];
    effective_site_scope: MemberScopeProjection["effective_site_scope"];
    effective_divergence_reason: string | null;
    department_ids: string[];
    site_location_ids: string[];
    lifecycle: MemberLifecycleProjection;
    authentication: MemberAuthenticationProjection;
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

    // The row itself, not a normalized copy of it — `projectMemberScope` distinguishes an absent
    // row from a present one, and a `Map` that only ever holds normalized values cannot express
    // "absent" to it.
    const profileByUser = new Map<string, { department_scope?: unknown; site_scope?: unknown }>();
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
                department_scope: row.department_scope,
                site_scope: row.site_scope,
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
    // One instant for the whole response, so two rows in the same payload cannot disagree about
    // whether a ban had expired.
    const nowMs = Date.now();

    for (const user_id of userIds) {
        const role_keys = byUser.get(user_id) ?? [];
        const primary = displayRoleForAdminPicker(role_keys);

        let email: string | null = null;
        let display_name: string | null = null;
        // `null` means the record was not read. It is not the same as a record that was read and
        // is empty, and the projection depends on the difference: an unread record projects
        // `unknown` with a reason, which is what stops this surface asserting `Active`.
        let authFacts: AuthUserFacts | null = null;
        try {
            const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
            if (authUser?.user) {
                const u = authUser.user;
                email = u.email ?? null;
                const meta = u.user_metadata as Record<string, unknown> | undefined;
                const full =
                    meta && typeof meta.full_name === "string" ? meta.full_name.trim()
                    : meta && typeof meta.name === "string" ? (meta.name as string).trim()
                    : "";
                display_name = full || null;
                authFacts = {
                    invited_at: u.invited_at ?? null,
                    confirmed_at: u.confirmed_at ?? null,
                    email_confirmed_at: u.email_confirmed_at ?? null,
                    last_sign_in_at: u.last_sign_in_at ?? null,
                    banned_until: (u as { banned_until?: string | null }).banned_until ?? null,
                    identities: (u.identities ?? []).map((i) => ({ provider: i.provider ?? null })),
                    // `factors` absent on the record and `factors: []` are different answers;
                    // the projection reports the first as `unknown` and the second as `none`.
                    factors: u.factors ? u.factors.map((f) => ({ status: f.status ?? null })) : undefined,
                };
            }
        } catch {
            /* authFacts stays null — the projection reports it as unknown, with the reason. */
        }

        const scope = projectMemberScope({
            profileRow: profileByUser.get(user_id) ?? null,
            departmentIds: deptByUser.get(user_id) ?? [],
            siteLocationIds: siteByUser.get(user_id) ?? [],
        });

        members.push({
            user_id,
            email,
            display_name,
            role_keys,
            primary_role: primary,
            department_scope: scope.department_scope,
            site_scope: scope.site_scope,
            has_access_profile: scope.has_access_profile,
            effective_department_scope: scope.effective_department_scope,
            effective_site_scope: scope.effective_site_scope,
            effective_divergence_reason: scope.effective_divergence_reason,
            department_ids: scope.department_ids,
            site_location_ids: scope.site_location_ids,
            lifecycle: projectMemberLifecycle(authFacts, nowMs),
            authentication: projectMemberAuthentication(authFacts),
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
