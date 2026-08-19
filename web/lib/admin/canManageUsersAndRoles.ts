import { NextResponse } from "next/server";
import {
    getAdminAccessContextCached,
    loadAdminAccessBundleCached,
    type AdminAccessContextSuccess,
} from "@/lib/admin/getAdminAccessContext";

/** Permission key seeded in migration `20260505120100_settings_users_roles_permission.sql`. */
export const SETTINGS_USERS_ROLES_PERMISSION = "settings.users_roles" as const;

/**
 * The weaker key admitting the RBAC catalog READS — see {@link requirePortalOrUsersRolesManageAuth}.
 * Seeded for every org by `20260818120000_w13_collapse_portal_eligible_fifth_layer_grants.sql`.
 */
export const SETTINGS_USERS_ROLES_READ_PERMISSION = "settings.users_roles.read" as const;

/**
 * True when the caller may manage Users & Roles in Settings (invite users, change roles, access scope,
 * role definitions, permission grants).
 *
 * **W-13 / AD-22 — this reads a capability and nothing else.** It previously opened with
 * `if (access.roleKeys.includes("admin")) return true`, which is the fifth authority layer recorded as
 * `A2-8` in `04-authentication-model.md §3.6`: a role literal, stored in no table and scoped to no org,
 * satisfying a capability check on its own. The operator's standing directive is to reduce the hierarchy
 * to four layers, and this is the most consequential of the two sites where the literal conferred
 * authority rather than merely filtering admission.
 *
 * **Admission is preserved, not narrowed.** Every org `admin` holds `settings.users_roles`:
 * `20260505120100` backfilled it for every org then existing, `seed_default_rbac` enumerates it for new
 * orgs (`20260807170000`), and `20260811120000` re-asserts it for every `role_definitions` row so the
 * guarantee does not rest on either of those having been applied. That migration MUST land before this
 * code does — W-8 is this initiative's own record of what an unannounced narrowing costs.
 */
export function canManageUsersAndRoles(access: Pick<AdminAccessContextSuccess, "roleKeys" | "permissionKeys">): boolean {
    return access.permissionKeys.includes(SETTINGS_USERS_ROLES_PERMISSION);
}

export type UsersRolesManageAuth =
    | { ok: true; access: AdminAccessContextSuccess }
    | { ok: false; response: NextResponse };

/** Use on Settings / RBAC mutation routes; returns 401/403 JSON when denied. */
export async function requireUsersRolesManageAuth(): Promise<UsersRolesManageAuth> {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: access.status === 401 ? "Unauthorized" : "Forbidden" },
                { status: access.status }
            ),
        };
    }
    if (!canManageUsersAndRoles(access)) {
        return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { ok: true, access };
}

/**
 * True when the caller may READ the RBAC catalog (roles, permissions, grants).
 *
 * **W-13 / AD-22 — the second of the two sites where `portalEligible` conferred authority.** The gate
 * previously admitted any portal-eligible principal, which is `roleKeys` containing `admin` or `ops`
 * evaluated against a literal set in application code. It now reads capabilities.
 *
 * The read admits the WEAKER key as well as the managing one, and that asymmetry is the point.
 * `ops` is portal-eligible, so it reads the catalog today; granting it `settings.users_roles` to
 * preserve that would also hand it the MUTATION capability, because {@link canManageUsersAndRoles}
 * accepts that single key. `settings.users_roles.read` preserves the read and confers nothing else.
 */
export function canReadUsersAndRolesCatalog(
    access: Pick<AdminAccessContextSuccess, "roleKeys" | "permissionKeys">
): boolean {
    return (
        canManageUsersAndRoles(access)
        || access.permissionKeys.includes(SETTINGS_USERS_ROLES_READ_PERMISSION)
    );
}

/**
 * Read RBAC catalog (roles, permissions, grants) for principals granted the catalog read **or** Users &
 * Roles managers. Mutations still use {@link requireUsersRolesManageAuth} only.
 */
export async function requirePortalOrUsersRolesManageAuth(): Promise<UsersRolesManageAuth> {
    const b = await loadAdminAccessBundleCached();
    if (!b.ok) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: b.status === 401 ? "Unauthorized" : "Forbidden" },
                { status: b.status }
            ),
        };
    }
    const { portalEligible: _portalEligible, ...access } = b;
    if (!canReadUsersAndRolesCatalog(access)) {
        return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { ok: true, access };
}
