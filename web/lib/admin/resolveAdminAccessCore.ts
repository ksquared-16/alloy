import type { SupabaseClient } from "@supabase/supabase-js";

export type DepartmentScopeMode = "all" | "restricted";
export type SiteScopeMode = "all" | "restricted";

export type ResolvedAdminAccessCore = {
    orgId: string;
    roleKeys: string[];
    permissionKeys: string[];
    departmentScope: DepartmentScopeMode;
    allowedDepartmentIds: string[] | null;
    siteScope: SiteScopeMode;
    allowedSiteLocationIds: string[] | null;
    /** True when role_keys for this org include admin or ops (admin shell / legacy PATCH gate). */
    portalEligible: boolean;
};

const PORTAL_ROLES = new Set(["admin", "ops"]);

/**
 * Pure helper: primary org + role_keys[] for that org from membership rows.
 * Primary org rule — preserve CRM semantics:
 * - If any admin/ops rows exist, choose lexicographically smallest org_id among those rows only.
 * - Else choose smallest org_id among all membership rows (custom roles).
 */
export function chooseOrgAndRoleKeysFromMembershipRows(
    rows: { org_id: string; role: string }[]
): { orgId: string; roleKeys: string[] } | null {
    if (!rows?.length) return null;
    const adminOpsRows = rows.filter((r) => PORTAL_ROLES.has(r.role));
    const pool = adminOpsRows.length > 0 ? adminOpsRows : rows;
    const chosenOrg = [...new Set(pool.map((r) => r.org_id))].sort()[0];
    if (!chosenOrg) return null;
    const roleKeys = [
        ...new Set(rows.filter((r) => r.org_id === chosenOrg).map((r) => r.role)),
    ].sort();
    return roleKeys.length ? { orgId: chosenOrg, roleKeys } : null;
}

async function fetchLegacyAdminOpsOrgAndRole(
    supabase: SupabaseClient,
    userId: string
): Promise<{ orgId: string; role: "admin" | "ops" } | null> {
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", userId).maybeSingle();
    const pr =
        profile && typeof (profile as { role?: unknown }).role === "string"
            ? ((profile as { role: string }).role as string).trim()
            : "";
    if (pr === "admin" || pr === "ops") {
        const orgFromAu = await fetchOrgIdFromAppUsers(supabase, userId);
        if (orgFromAu) return { orgId: orgFromAu, role: pr };
    }

    const { data: au } = await supabase.from("app_users").select("role, org_id").eq("id", userId).maybeSingle();
    const auRow = au as { role?: unknown; org_id?: unknown } | null;
    const ar = auRow && typeof auRow.role === "string" ? auRow.role.trim() : "";
    const oid = auRow && typeof auRow.org_id === "string" ? auRow.org_id : "";
    if ((ar === "admin" || ar === "ops") && oid) {
        return { orgId: oid, role: ar };
    }

    const { data: au2 } = await supabase.from("app_users").select("role, org_id").eq("auth_user_id", userId).maybeSingle();
    const au2Row = au2 as { role?: unknown; org_id?: unknown } | null;
    const ar2 = au2Row && typeof au2Row.role === "string" ? au2Row.role.trim() : "";
    const oid2 = au2Row && typeof au2Row.org_id === "string" ? au2Row.org_id : "";
    if ((ar2 === "admin" || ar2 === "ops") && oid2) {
        return { orgId: oid2, role: ar2 };
    }

    return null;
}

async function fetchOrgIdFromAppUsers(supabase: SupabaseClient, userId: string): Promise<string | null> {
    const { data: au } = await supabase.from("app_users").select("org_id").eq("id", userId).maybeSingle();
    const o = (au as { org_id?: string | null } | null)?.org_id ?? null;
    if (typeof o === "string" && o.length > 0) return o;

    const { data: auAuth } = await supabase.from("app_users").select("org_id").eq("auth_user_id", userId).maybeSingle();
    const o2 = (auAuth as { org_id?: string | null } | null)?.org_id ?? null;
    return typeof o2 === "string" && o2.length > 0 ? o2 : null;
}

async function fetchPermissionKeys(
    supabase: SupabaseClient,
    orgId: string,
    roleKeys: string[]
): Promise<string[]> {
    if (!roleKeys.length) return [];
    const { data, error } = await supabase
        .from("role_permission_grants")
        .select("permission_key")
        .eq("org_id", orgId)
        .in("role_key", roleKeys)
        .eq("allowed", true);
    if (error) {
        console.error("[resolveAdminAccessCore] role_permission_grants error:", error.message);
        return [];
    }
    const keys = [...new Set((data ?? []).map((r) => (r as { permission_key: string }).permission_key).filter(Boolean))];
    return keys.sort();
}

/**
 * Resolve org, roles, grants, and scope dimensions for a user (service-role client).
 * Returns null when the user has no org membership and no legacy admin/ops path.
 */
export async function resolveAdminAccessCore(
    supabase: SupabaseClient,
    userId: string
): Promise<ResolvedAdminAccessCore | null> {
    const { data: urRows, error: urErr } = await supabase
        .from("user_roles")
        .select("org_id, role")
        .eq("user_id", userId);

    if (urErr) {
        console.error("[resolveAdminAccessCore] user_roles error:", urErr.message);
        return null;
    }

    const rows = Array.isArray(urRows)
        ? urRows.filter((r) => r && typeof (r as { org_id?: unknown }).org_id === "string" && typeof (r as { role?: unknown }).role === "string") as {
              org_id: string;
              role: string;
          }[]
        : [];

    let orgId: string;
    let roleKeys: string[];

    const picked = chooseOrgAndRoleKeysFromMembershipRows(rows);
    if (picked) {
        orgId = picked.orgId;
        roleKeys = picked.roleKeys;
    } else {
        const legacy = await fetchLegacyAdminOpsOrgAndRole(supabase, userId);
        if (!legacy) return null;
        orgId = legacy.orgId;
        roleKeys = [legacy.role];
    }

    const portalEligible = roleKeys.some((r) => PORTAL_ROLES.has(r));
    const permissionKeys = await fetchPermissionKeys(supabase, orgId, roleKeys);

    const { data: profileRow } = await supabase
        .from("user_access_profiles")
        .select("department_scope, site_scope")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();

    let departmentScope: DepartmentScopeMode = "all";
    let siteScope: SiteScopeMode = "all";

    if (profileRow) {
        const ds = String((profileRow as { department_scope?: unknown }).department_scope ?? "").trim();
        const ss = String((profileRow as { site_scope?: unknown }).site_scope ?? "").trim();
        if (ds === "restricted") departmentScope = "restricted";
        if (ss === "restricted") siteScope = "restricted";
    }
    /** Missing profile row ⇒ department_scope/site_scope stay `all` (legacy transition until profiles always exist). */

    let allowedDepartmentIds: string[] | null = null;
    if (departmentScope === "restricted") {
        const { data: deptRows, error: deptErr } = await supabase
            .from("user_department_access")
            .select("department_id")
            .eq("user_id", userId)
            .eq("org_id", orgId);
        if (deptErr) {
            console.error("[resolveAdminAccessCore] user_department_access error:", deptErr.message);
            allowedDepartmentIds = [];
        } else {
            allowedDepartmentIds = [...new Set((deptRows ?? []).map((r) => (r as { department_id: string }).department_id))];
        }
    }

    let allowedSiteLocationIds: string[] | null = null;
    if (siteScope === "restricted") {
        const { data: siteRows, error: siteErr } = await supabase
            .from("user_site_access")
            .select("location_id")
            .eq("user_id", userId)
            .eq("org_id", orgId);
        if (siteErr) {
            console.error("[resolveAdminAccessCore] user_site_access error:", siteErr.message);
            allowedSiteLocationIds = [];
        } else {
            allowedSiteLocationIds = [...new Set((siteRows ?? []).map((r) => (r as { location_id: string }).location_id))];
        }
    }

    return {
        orgId,
        roleKeys,
        permissionKeys,
        departmentScope,
        allowedDepartmentIds,
        siteScope,
        allowedSiteLocationIds,
        portalEligible,
    };
}

/**
 * Scope dimensions for a specific `(user_id, org_id)` membership row — admin settings preview only.
 * Does not apply primary-org picking across multiple orgs.
 */
export async function resolveAdminAccessDimensionsForOrgMember(
    supabase: SupabaseClient,
    userId: string,
    orgId: string
): Promise<{
    roleKeys: string[];
    permissionKeys: string[];
    departmentScope: DepartmentScopeMode;
    siteScope: SiteScopeMode;
    allowedDepartmentIds: string[] | null;
    allowedSiteLocationIds: string[] | null;
    portalEligible: boolean;
} | null> {
    const { data: urRows, error: urErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", orgId);

    if (urErr || !urRows?.length) return null;

    const roleKeys = [...new Set(urRows.map((r) => String((r as { role: string }).role).trim()).filter(Boolean))].sort();
    if (!roleKeys.length) return null;

    const portalEligible = roleKeys.some((r) => PORTAL_ROLES.has(r));
    const permissionKeys = await fetchPermissionKeys(supabase, orgId, roleKeys);

    const { data: profileRow } = await supabase
        .from("user_access_profiles")
        .select("department_scope, site_scope")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();

    let departmentScope: DepartmentScopeMode = "all";
    let siteScope: SiteScopeMode = "all";

    if (profileRow) {
        const ds = String((profileRow as { department_scope?: unknown }).department_scope ?? "").trim();
        const ss = String((profileRow as { site_scope?: unknown }).site_scope ?? "").trim();
        if (ds === "restricted") departmentScope = "restricted";
        if (ss === "restricted") siteScope = "restricted";
    }

    let allowedDepartmentIds: string[] | null = null;
    if (departmentScope === "restricted") {
        const { data: deptRows, error: deptErr } = await supabase
            .from("user_department_access")
            .select("department_id")
            .eq("user_id", userId)
            .eq("org_id", orgId);
        if (deptErr) {
            console.error("[resolveAdminAccessDimensionsForOrgMember] user_department_access error:", deptErr.message);
            allowedDepartmentIds = [];
        } else {
            allowedDepartmentIds = [...new Set((deptRows ?? []).map((r) => (r as { department_id: string }).department_id))];
        }
    }

    let allowedSiteLocationIds: string[] | null = null;
    if (siteScope === "restricted") {
        const { data: siteRows, error: siteErr } = await supabase
            .from("user_site_access")
            .select("location_id")
            .eq("user_id", userId)
            .eq("org_id", orgId);
        if (siteErr) {
            console.error("[resolveAdminAccessDimensionsForOrgMember] user_site_access error:", siteErr.message);
            allowedSiteLocationIds = [];
        } else {
            allowedSiteLocationIds = [...new Set((siteRows ?? []).map((r) => (r as { location_id: string }).location_id))];
        }
    }

    return {
        roleKeys,
        permissionKeys,
        departmentScope,
        siteScope,
        allowedDepartmentIds,
        allowedSiteLocationIds,
        portalEligible,
    };
}
