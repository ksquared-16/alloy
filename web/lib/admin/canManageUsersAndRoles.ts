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
 * Seeded for every org by `20260818170000_w13_collapse_portal_eligible_fifth_layer_grants.sql`.
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
    /*
     * THE CHAPTER GATE, NOT A ROUTE GATE.
     *
     * This decides whether `/organization/access` opens at all; every route inside still asks for
     * the specific authority its own operation needs. Before the split one key answered both
     * questions, so the page gate and the write gate were the same check — which is why retiring the
     * umbrella without changing this would have closed the Access chapter to everyone, including a
     * user administrator who can legitimately work there.
     *
     * So the page opens for anyone holding ANY Access-administration authority, read or write, and
     * what they can actually do inside is decided one operation at a time.
     */
    return (
        access.permissionKeys.includes(ADMIN_USERS_READ)
        || access.permissionKeys.includes(ADMIN_USERS_WRITE)
        || access.permissionKeys.includes(ADMIN_ROLES_READ)
        || access.permissionKeys.includes(ADMIN_ROLES_WRITE)
        || access.permissionKeys.includes(ADMIN_ACCESS_SCOPE_WRITE)
    );
}

/*
 * ── THE FOUR ACCESS-ADMINISTRATION AUTHORITIES ─────────────────────────────
 *
 * `settings.users_roles` authorized all of it: creating users, assigning roles, defining roles,
 * granting arbitrary capabilities, changing where someone may operate, and registering attendance
 * kiosks. One permission, six materially different powers, and a site director who needed to
 * register a kiosk had to be given the power to rewrite the access model.
 *
 * `admin.users.*` and `admin.roles.*` are NOT new. They have been catalogued and granted since the
 * permission grid, with a package the umbrella then contradicted: read to admin AND ops, write to
 * admin ALONE. The umbrella handed ops the write half anyway. Activating the intended vocabulary is
 * therefore a narrowing, not an invention — the split restores a decision the catalog already
 * recorded.
 *
 * Two keys are genuinely new, because nothing truthful owned their operations:
 *
 *   - `admin.access_scope.write` — where a person may operate is not who they are or what job they
 *     hold, and bundling it with role assignment made "move this person to Site B" require the
 *     authority to invent roles.
 *   - `attendance.devices.manage` — a kiosk is an Attendance concern. It lived here only because the
 *     screen did.
 *
 * ROLE DEFINITION AND CAPABILITY GRANTS STAY TOGETHER under `admin.roles.write`: a role definition
 * without its package authorizes nothing, so splitting them would produce two keys neither of which
 * is independently useful. What makes that safe is W-18 — a holder may delegate only capabilities
 * within their own effective authority — which is enforced in the grants transaction owner and is
 * not weakened here.
 */
export const ADMIN_USERS_READ = "admin.users.read" as const;
export const ADMIN_USERS_WRITE = "admin.users.write" as const;
export const ADMIN_ROLES_READ = "admin.roles.read" as const;
export const ADMIN_ROLES_WRITE = "admin.roles.write" as const;
export const ADMIN_ACCESS_SCOPE_WRITE = "admin.access_scope.write" as const;
export const ATTENDANCE_DEVICES_MANAGE = "attendance.devices.manage" as const;

export type AccessAdministrationCapability =
    | typeof ADMIN_USERS_READ
    | typeof ADMIN_USERS_WRITE
    | typeof ADMIN_ROLES_READ
    | typeof ADMIN_ROLES_WRITE
    | typeof ADMIN_ACCESS_SCOPE_WRITE
    | typeof ATTENDANCE_DEVICES_MANAGE;

export type AccessAdministrationAuth =
    | { ok: true; access: AdminAccessContextSuccess }
    | { ok: false; response: NextResponse };

/**
 * The gate for every Access-administration route after the split.
 *
 * It answers the capability question ONLY. The self-authority ban, the W-18 delegation ceiling, org
 * scoping and resource existence all remain the handler's and the transaction owner's to enforce —
 * a capability has never been permission to reach across an organization, nor to raise yourself.
 */
export async function requireAccessAdministration(
    capability: AccessAdministrationCapability,
): Promise<AccessAdministrationAuth> {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: access.status === 401 ? "Unauthorized" : "Forbidden" },
                { status: access.status },
            ),
        };
    }
    if (!access.permissionKeys.includes(capability)) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Forbidden", required_permission: capability }, { status: 403 }),
        };
    }
    return { ok: true, access };
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
