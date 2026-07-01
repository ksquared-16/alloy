/**
 * Provisions user_department_access when department_scope is restricted —
 * same allow-list GET /api/admin/departments uses (no global permission loosening).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { departmentIdAllowed, portalAdminBypassesDepartmentScope } from "@/lib/admin/accessScope";

export type EnsureLifecycleDepartmentWorkspaceAccessParams = {
    orgId: string;
    departmentId: string;
    currentUserId: string;
    supabase: SupabaseClient;
    /** When portal admin/ops, UDA rows are not required for workspace list APIs. */
    roleKeys?: readonly string[];
};

export type EnsureLifecycleDepartmentWorkspaceAccessResult =
    | {
          ok: true;
          department_scope: "all" | "restricted";
          inserted: boolean;
          already_had_access: boolean;
      }
    | { ok: false; error: string };

export type LifecycleDepartmentWorkspaceAccessState = {
    department_scope: "all" | "restricted";
    /** Row exists in user_department_access when restricted. */
    membership_provisioned: boolean;
    /** Same rule as GET /api/admin/departments + departmentIdAllowed. */
    visible_in_departments_api: boolean;
};

/** Whether current user can see departmentId on workspace (DB truth, not stale dim). */
export async function resolveLifecycleDepartmentWorkspaceAccess(
    supabase: SupabaseClient,
    orgId: string,
    currentUserId: string,
    departmentId: string,
    options?: { roleKeys?: readonly string[] }
): Promise<LifecycleDepartmentWorkspaceAccessState> {
    const deptId = departmentId.trim();
    if (options?.roleKeys?.length && portalAdminBypassesDepartmentScope(options.roleKeys)) {
        const { data: dept } = await supabase
            .from("departments")
            .select("id, is_active")
            .eq("id", deptId)
            .eq("org_id", orgId)
            .maybeSingle();
        const active = Boolean(dept && (dept as { is_active?: boolean }).is_active !== false);
        return {
            department_scope: "all",
            membership_provisioned: true,
            visible_in_departments_api: active,
        };
    }
    const { data: dept } = await supabase
        .from("departments")
        .select("id, is_active")
        .eq("id", deptId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (!dept || (dept as { is_active?: boolean }).is_active === false) {
        return {
            department_scope: "all",
            membership_provisioned: false,
            visible_in_departments_api: false,
        };
    }

    const { data: profile } = await supabase
        .from("user_access_profiles")
        .select("department_scope")
        .eq("user_id", currentUserId)
        .eq("org_id", orgId)
        .maybeSingle();

    const department_scope =
        profile && String((profile as { department_scope?: unknown }).department_scope).trim() === "restricted"
            ? "restricted"
            : "all";

    if (department_scope === "all") {
        return {
            department_scope: "all",
            membership_provisioned: true,
            visible_in_departments_api: true,
        };
    }

    const { data: accessRow } = await supabase
        .from("user_department_access")
        .select("id")
        .eq("user_id", currentUserId)
        .eq("org_id", orgId)
        .eq("department_id", deptId)
        .maybeSingle();

    const membership_provisioned = Boolean(accessRow);
    return {
        department_scope: "restricted",
        membership_provisioned,
        visible_in_departments_api: membership_provisioned,
    };
}

/**
 * Inserts user_department_access when the user has department_scope=restricted and lacks this department.
 */
export async function ensureLifecycleDepartmentWorkspaceAccess(
    params: EnsureLifecycleDepartmentWorkspaceAccessParams
): Promise<EnsureLifecycleDepartmentWorkspaceAccessResult> {
    const { orgId, departmentId, currentUserId, supabase, roleKeys } = params;
    const deptId = departmentId.trim();
    const userId = currentUserId.trim();
    if (!deptId || !userId) {
        return { ok: false, error: "orgId, departmentId, and currentUserId are required." };
    }

    if (roleKeys?.length && portalAdminBypassesDepartmentScope(roleKeys)) {
        return { ok: true, department_scope: "all", inserted: false, already_had_access: true };
    }

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id")
        .eq("id", deptId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr) return { ok: false, error: deptErr.message };
    if (!dept) return { ok: false, error: "Department not found in org." };

    const { data: profile, error: profileErr } = await supabase
        .from("user_access_profiles")
        .select("department_scope")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (profileErr) return { ok: false, error: profileErr.message };

    const department_scope =
        profile && String((profile as { department_scope?: unknown }).department_scope).trim() === "restricted"
            ? "restricted"
            : "all";

    if (department_scope === "all") {
        return { ok: true, department_scope: "all", inserted: false, already_had_access: true };
    }

    const { data: existing } = await supabase
        .from("user_department_access")
        .select("id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("department_id", deptId)
        .maybeSingle();

    if (existing) {
        return { ok: true, department_scope: "restricted", inserted: false, already_had_access: true };
    }

    const { error: insErr } = await supabase.from("user_department_access").insert({
        user_id: userId,
        org_id: orgId,
        department_id: deptId,
    });
    if (insErr) return { ok: false, error: insErr.message };

    return { ok: true, department_scope: "restricted", inserted: true, already_had_access: false };
}

/** Rebuild allowedDepartmentIds after provisioning (repair/validate must not use stale dim). */
export async function refreshDepartmentScopeDimensions(
    supabase: SupabaseClient,
    orgId: string,
    currentUserId: string,
    dim: AdminAccessScopeDimensions
): Promise<AdminAccessScopeDimensions> {
    if (dim.departmentScope !== "restricted") return dim;

    const { data: deptRows, error } = await supabase
        .from("user_department_access")
        .select("department_id")
        .eq("user_id", currentUserId)
        .eq("org_id", orgId);
    if (error) {
        console.error("[refreshDepartmentScopeDimensions]", error.message);
        return { ...dim, allowedDepartmentIds: [] };
    }
    const allowedDepartmentIds = [
        ...new Set((deptRows ?? []).map((r) => (r as { department_id: string }).department_id)),
    ];
    return { ...dim, allowedDepartmentIds };
}

export async function departmentVisibleInWorkspaceApi(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    dim: AdminAccessScopeDimensions
): Promise<boolean> {
    if (!departmentIdAllowed(dim, departmentId)) return false;
    const { data } = await supabase
        .from("departments")
        .select("id, is_active")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    return Boolean(data && (data as { is_active?: boolean }).is_active !== false);
}
