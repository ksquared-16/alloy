/**
 * Reports whether the current user can see a department on workspace —
 * same allow-list GET /api/admin/departments uses (no global permission loosening).
 *
 * W-8 (I-20) — this module used to *provision* `user_department_access` for the caller. The subject
 * was always `currentUserId`, so the write was self-authority: a department-restricted principal
 * could hand itself a department it was configured not to see, one request per department, and
 * `refreshDepartmentScopeDimensions` folded the new row into that same request's live allow-list.
 * The `portalAdminBypassesDepartmentScope` gate kept it latent only because admin/ops never reached
 * the restricted branch; deleting that bypass without this would have armed the path W-8 exists to
 * close. The insert is gone: this module now reads scope, it never widens it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { departmentIdAllowed } from "@/lib/admin/accessScope";

/**
 * Refusal returned when a department-restricted principal asks for a department outside its own
 * allow-list. Parallel to `SELF_AUTHORITY_MUTATION_MESSAGE` — the caller may not be the grantor of
 * its own scope, so the remedy is another administrator, never a retry.
 */
export const SELF_DEPARTMENT_PROVISIONING_MESSAGE =
    "This department is outside your department scope, and you cannot grant yourself access to it. Ask another administrator to add it to your department scope.";

export type EnsureLifecycleDepartmentWorkspaceAccessParams = {
    orgId: string;
    departmentId: string;
    currentUserId: string;
    supabase: SupabaseClient;
};

export type EnsureLifecycleDepartmentWorkspaceAccessResult =
    | {
          ok: true;
          department_scope: "all" | "restricted";
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
    departmentId: string
): Promise<LifecycleDepartmentWorkspaceAccessState> {
    const deptId = departmentId.trim();
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
 * Reports whether the caller already holds workspace access to this department. Never grants it:
 * the subject is always the caller, so an insert here would be a principal widening its own scope.
 */
export async function ensureLifecycleDepartmentWorkspaceAccess(
    params: EnsureLifecycleDepartmentWorkspaceAccessParams
): Promise<EnsureLifecycleDepartmentWorkspaceAccessResult> {
    const { orgId, departmentId, currentUserId, supabase } = params;
    const deptId = departmentId.trim();
    const userId = currentUserId.trim();
    if (!deptId || !userId) {
        return { ok: false, error: "orgId, departmentId, and currentUserId are required." };
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
        return { ok: true, department_scope: "all", already_had_access: true };
    }

    const { data: existing } = await supabase
        .from("user_department_access")
        .select("id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("department_id", deptId)
        .maybeSingle();

    if (existing) {
        return { ok: true, department_scope: "restricted", already_had_access: true };
    }

    // W-8: the caller is department-restricted and this department is not in its allow-list. The
    // former behaviour inserted the row here — self-granting the very scope the profile withholds.
    // Refuse instead; only another administrator can widen this principal's department scope.
    return { ok: false, error: SELF_DEPARTMENT_PROVISIONING_MESSAGE };
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
