import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    adminRouteGateFailureResponse,
    loadAdminRouteGate,
} from "@/lib/admin/adminRouteGate";
import { compatibilityPortalRole } from "@/lib/admin/adminPortalRolePick";
import { hasPortalAdminMutateAccess } from "@/lib/admin/adminPortalRolePick";
import { portalAdminBypassesDepartmentScope } from "@/lib/admin/accessScope";

export const dynamic = "force-dynamic";

/** GET — current session access model (lifecycle + workspace debug). */
export async function GET() {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const supabase = createAdminClient();
    const { data: profile } = await supabase
        .from("user_access_profiles")
        .select("department_scope, site_scope")
        .eq("user_id", gate.userId)
        .eq("org_id", gate.orgId)
        .maybeSingle();

    const bypass = portalAdminBypassesDepartmentScope(gate.roleKeys);
    const rawAllowed = gate.dimRaw.allowedDepartmentIds ?? [];
    const effectiveAllowed = gate.dim.allowedDepartmentIds ?? [];

    return NextResponse.json({
        user_id: gate.userId,
        org_id: gate.orgId,
        role: gate.role,
        role_keys: gate.roleKeys,
        is_portal_admin_or_ops: bypass,
        is_portal_admin_mutate: hasPortalAdminMutateAccess(gate.roleKeys),
        compatibility_portal_role: compatibilityPortalRole(gate.roleKeys),
        user_access_profiles: profile
            ? {
                  department_scope: (profile as { department_scope?: string }).department_scope ?? "all",
                  site_scope: (profile as { site_scope?: string }).site_scope ?? "all",
              }
            : null,
        department_scope_raw: gate.dimRaw.departmentScope,
        department_scope_effective: gate.dim.departmentScope,
        allowed_department_ids_count_raw: gate.dimRaw.departmentScope === "restricted" ? rawAllowed.length : null,
        allowed_department_ids_count_effective:
            gate.dim.departmentScope === "restricted" ? effectiveAllowed.length : null,
        portal_admin_bypasses_department_scope: bypass,
        department_scope_rule: bypass
            ? "Portal admin/ops: all active org departments (user_department_access not required for list APIs)."
            : gate.dimRaw.departmentScope === "restricted"
              ? "Restricted: only user_department_access rows."
              : "Profile department_scope=all: all active org departments.",
        site_scope_effective: gate.dim.siteScope,
    });
}
