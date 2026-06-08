import { NextResponse } from "next/server";
import {
    getAdminAccessContextCached,
    loadAdminAccessBundleCached,
    type AdminAccessContextSuccess,
} from "@/lib/admin/getAdminAccessContext";

/** Permission key seeded in migration `20260505120100_settings_users_roles_permission.sql`. */
export const SETTINGS_USERS_ROLES_PERMISSION = "settings.users_roles" as const;

/**
 * True when the caller may manage Users & Roles in Settings (invite users, change roles, access scope,
 * role definitions, permission grants). Org `admin` role_key always qualifies; otherwise requires grant.
 */
export function canManageUsersAndRoles(access: Pick<AdminAccessContextSuccess, "roleKeys" | "permissionKeys">): boolean {
    if (access.roleKeys.includes("admin")) return true;
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
 * Read RBAC catalog (roles, permissions, grants) for portal users (admin/ops) **or** Users & Roles managers.
 * Mutations still use {@link requireUsersRolesManageAuth} only.
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
    const { portalEligible, ...access } = b;
    if (!portalEligible && !canManageUsersAndRoles(access)) {
        return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { ok: true, access };
}
