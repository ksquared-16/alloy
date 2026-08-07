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
 * W-7 (I-19, lockout class L1) — absent scope denies.
 *
 * Which answer the resolver *enforces* when a membership has no `user_access_profiles` row.
 * - `legacy-all` — the historical fail-open: both dimensions resolve `all`.
 * - `deny`       — W-7's target: the membership sees nothing.
 *
 * MUST remain `legacy-all` until M1 (`20260807140000_backfill_membership_access_profiles.sql`)
 * is APPLIED on the shared target. W-0 Q4 stands at 2 `(user, org)` pairs with no profile row,
 * so flipping this ahead of the backfill locks out those 2 principals — the exact L1 outcome
 * W-7 exists to avoid. Plan §5 Q4: "W-7 cannot precede it."
 *
 * Flipping this constant to `deny` and deleting the two lines above it is the whole switch.
 */
export type AbsentProfileMode = "legacy-all" | "deny";

export const ABSENT_PROFILE_ENFORCEMENT: AbsentProfileMode = "legacy-all";

export type ProfileScopeRow = { department_scope?: unknown; site_scope?: unknown } | null | undefined;

export type ScopeAnswer = {
    departmentScope: DepartmentScopeMode;
    siteScope: SiteScopeMode;
    /**
     * True only for the absent-profile denial. Denial is `restricted` *plus explicitly empty
     * allow-lists* — never `restricted` alone. A membership with no profile row may still hold
     * `user_department_access` / `user_site_access` rows, and §5 records that table as a sixth
     * authority table with a self-authority write path W-8 arms. Letting denial fall through to
     * "restricted, then read whatever those tables hold" would let a principal grant itself the
     * departments its missing profile was supposed to withhold.
     */
    denyAll: boolean;
};

/** Pure: the scope answer a given profile row yields under a given absent-profile mode. */
export function resolveScopeAnswerFromProfile(
    profileRow: ProfileScopeRow,
    mode: AbsentProfileMode
): ScopeAnswer {
    if (profileRow) {
        const ds = String(profileRow.department_scope ?? "").trim();
        const ss = String(profileRow.site_scope ?? "").trim();
        return {
            departmentScope: ds === "restricted" ? "restricted" : "all",
            siteScope: ss === "restricted" ? "restricted" : "all",
            denyAll: false,
        };
    }
    if (mode === "deny") {
        return { departmentScope: "restricted", siteScope: "restricted", denyAll: true };
    }
    return { departmentScope: "all", siteScope: "all", denyAll: false };
}

/**
 * Step 2 of the L1 ritual: resolve BOTH answers, enforce the configured one, and report whether
 * they differ. A divergence after W-5 and W-6 means a membership was created outside the atomic
 * path — the defect worth finding before the switch rather than after.
 */
export function dualReadScopeAnswer(profileRow: ProfileScopeRow): {
    enforced: ScopeAnswer;
    shadow: ScopeAnswer;
    diverges: boolean;
} {
    const shadowMode: AbsentProfileMode = ABSENT_PROFILE_ENFORCEMENT === "deny" ? "legacy-all" : "deny";
    const enforced = resolveScopeAnswerFromProfile(profileRow, ABSENT_PROFILE_ENFORCEMENT);
    const shadow = resolveScopeAnswerFromProfile(profileRow, shadowMode);
    const diverges =
        enforced.departmentScope !== shadow.departmentScope ||
        enforced.siteScope !== shadow.siteScope ||
        enforced.denyAll !== shadow.denyAll;
    return { enforced, shadow, diverges };
}

/** Stable, greppable divergence record for W-7's observation window. Identifiers only — no free text. */
function logScopeDivergence(
    where: string,
    userId: string,
    orgId: string,
    enforced: ScopeAnswer,
    shadow: ScopeAnswer
): void {
    console.warn(
        `[access-identity][W-7][scope-divergence] where=${where} user_id=${userId} org_id=${orgId} ` +
            `enforced=${enforced.departmentScope}/${enforced.siteScope} ` +
            `shadow=${shadow.departmentScope}/${shadow.siteScope} reason=absent_profile_row`
    );
}

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

    const { enforced, shadow, diverges } = dualReadScopeAnswer(profileRow as ProfileScopeRow);
    if (diverges) logScopeDivergence("resolveAdminAccessCore", userId, orgId, enforced, shadow);

    const departmentScope: DepartmentScopeMode = enforced.departmentScope;
    const siteScope: SiteScopeMode = enforced.siteScope;

    let allowedDepartmentIds: string[] | null = null;
    if (enforced.denyAll) {
        allowedDepartmentIds = [];
    } else if (departmentScope === "restricted") {
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
    if (enforced.denyAll) {
        allowedSiteLocationIds = [];
    } else if (siteScope === "restricted") {
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

    // Same instrument and the SAME constant as the enforcement path above: this is the admin
    // settings preview, and if it kept its own fallback the switch would leave displayed authority
    // reading `all` while actual authority denied. Behaviour is unchanged today — both read
    // ABSENT_PROFILE_ENFORCEMENT, so both flip together.
    const { enforced, shadow, diverges } = dualReadScopeAnswer(profileRow as ProfileScopeRow);
    if (diverges) logScopeDivergence("resolveAdminAccessDimensionsForOrgMember", userId, orgId, enforced, shadow);

    const departmentScope: DepartmentScopeMode = enforced.departmentScope;
    const siteScope: SiteScopeMode = enforced.siteScope;

    let allowedDepartmentIds: string[] | null = null;
    if (enforced.denyAll) {
        allowedDepartmentIds = [];
    } else if (departmentScope === "restricted") {
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
    if (enforced.denyAll) {
        allowedSiteLocationIds = [];
    } else if (siteScope === "restricted") {
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
