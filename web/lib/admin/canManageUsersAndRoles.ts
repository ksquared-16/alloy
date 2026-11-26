import { NextResponse } from "next/server";
import {
    getAdminAccessContextCached,
    loadAdminAccessBundleCached,
    type AdminAccessContextSuccess,
} from "@/lib/admin/getAdminAccessContext";

/*
 * `settings.users_roles` and `settings.users_roles.read` USED TO BE EXPORTED FROM HERE.
 *
 * They are retired — `20260915140000_access_administration_split.sql` sets both `is_active = false`
 * and deletes every grant of them. The constants are gone rather than deprecated because a name that
 * still resolves is a name that gets reused: a route importing the umbrella today would compile,
 * pass review, and then refuse every caller in production, since no role holds an inactive key.
 *
 * The authorities that replaced them are declared below.
 */

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

/*
 * `requireUsersRolesManageAuth`, `canReadUsersAndRolesCatalog` and
 * `requirePortalOrUsersRolesManageAuth` WERE HERE, and are deleted rather than left unused.
 *
 * All three decided authority by asking for `settings.users_roles` (or its read companion). With the
 * umbrella retired those are keys no role holds, so each function had become a gate that refuses
 * everyone — the most expensive kind of dead code, because it still typechecks, still reads like a
 * working gate, and fails only against a real database. Every route that called them now names the
 * one authority its own operation needs, through {@link requireAccessAdministration}.
 */
