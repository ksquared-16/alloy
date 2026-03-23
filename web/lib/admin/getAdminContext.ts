/**
 * Resolve admin org context from public.user_roles (membership scoping).
 * Use in admin API routes that need org_id and role.
 */

import { createClient } from "@/lib/supabaseServer";
import { createAdminClient } from "@/lib/supabaseAdmin";

const ALLOWED_ROLES = ["admin", "ops"] as const;

export type AdminContextSuccess = {
    ok: true;
    orgId: string;
    role: string;
    userId: string;
};

export type AdminContextFailure = {
    ok: false;
    status: 401 | 403;
};

export type AdminContextResult = AdminContextSuccess | AdminContextFailure;

type UserRoleRow = { org_id?: string | null; role?: string | null };

function pickMembershipRow(rows: UserRoleRow[]): UserRoleRow | null {
    if (!rows.length) return null;
    const allowedWithOrg = rows.filter(
        (r) =>
            r &&
            typeof r.org_id === "string" &&
            r.org_id.length > 0 &&
            typeof r.role === "string" &&
            ALLOWED_ROLES.includes(r.role as (typeof ALLOWED_ROLES)[number])
    );
    return allowedWithOrg[0] ?? null;
}

/**
 * Get current user and their org + role from user_roles.
 * Returns { ok: true, orgId, role, userId } or { ok: false, status: 401 | 403 }.
 */
export async function getAdminContext(): Promise<AdminContextResult> {
    let authUser: { id: string; email?: string | null } | null = null;
    try {
        const supabaseAuth = await createClient();
        const { data: authData, error: authErr } = await supabaseAuth.auth.getUser();
        if (authErr) {
            console.warn("[getAdminContext] auth.getUser error:", authErr.message);
        }
        const user = authData?.user;
        if (!user?.id) {
            console.log("[getAdminContext]", {
                user: null,
                app_user: null,
                user_roles: null,
                org: null,
                permissions: null,
                outcome: "no_session",
            });
            return { ok: false, status: 401 };
        }
        authUser = { id: user.id, email: user.email };

        const admin = createAdminClient();

        const [appUserById, appUserByAuthId, rolesRes] = await Promise.all([
            admin.from("app_users").select("*").eq("id", user.id).maybeSingle(),
            admin.from("app_users").select("*").eq("auth_user_id", user.id).maybeSingle(),
            admin.from("user_roles").select("org_id, role").eq("user_id", user.id),
        ]);

        const app_user =
            appUserById.data && !appUserById.error
                ? appUserById.data
                : appUserByAuthId.data && !appUserByAuthId.error
                  ? appUserByAuthId.data
                  : null;

        if (appUserById.error) {
            console.warn("[getAdminContext] app_users by id:", appUserById.error.message);
        }
        if (appUserByAuthId.error) {
            console.warn("[getAdminContext] app_users by auth_user_id:", appUserByAuthId.error.message);
        }

        const roleRows = (Array.isArray(rolesRes.data) ? rolesRes.data : []) as UserRoleRow[];
        if (rolesRes.error) {
            console.error("[getAdminContext] user_roles error:", rolesRes.error);
            console.log("[getAdminContext]", {
                user: { id: authUser.id, email: authUser.email ?? null },
                app_user,
                user_roles: null,
                org: null,
                permissions: null,
                outcome: "user_roles_query_failed",
            });
            return { ok: false, status: 403 };
        }

        const row = pickMembershipRow(roleRows);
        const orgId = row && typeof row.org_id === "string" ? row.org_id : "";
        const role = row && typeof row.role === "string" ? row.role : "";

        let org: unknown = null;
        let permissions: { permission_key: string; allowed: boolean }[] = [];

        if (orgId) {
            const { data: orgRow, error: orgErr } = await admin
                .from("orgs")
                .select("id, name, slug")
                .eq("id", orgId)
                .maybeSingle();
            if (orgErr) {
                console.warn("[getAdminContext] org fetch:", orgErr.message);
            } else {
                org = orgRow ?? null;
            }

            if (role && ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
                const { data: grants, error: permErr } = await admin
                    .from("role_permission_grants")
                    .select("permission_key, allowed")
                    .eq("org_id", orgId)
                    .eq("role_key", role)
                    .eq("allowed", true);
                if (permErr) {
                    console.warn("[getAdminContext] role_permission_grants:", permErr.message);
                } else {
                    permissions = (grants ?? []) as { permission_key: string; allowed: boolean }[];
                }
            }
        }

        console.log("[getAdminContext]", {
            user: { id: authUser.id, email: authUser.email ?? null },
            app_user,
            user_roles: roleRows,
            org,
            permissions: permissions.map((p) => p.permission_key),
            picked: row ? { org_id: orgId || null, role: role || null } : null,
        });

        if (!row || !orgId) {
            return { ok: false, status: 403 };
        }

        if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
            return { ok: false, status: 403 };
        }

        return {
            ok: true,
            orgId,
            role,
            userId: user.id,
        };
    } catch (e) {
        console.error("[getAdminContext] unexpected:", e);
        console.log("[getAdminContext]", {
            user: authUser,
            app_user: null,
            user_roles: null,
            org: null,
            permissions: null,
            outcome: "exception",
        });
        return { ok: false, status: 403 };
    }
}
