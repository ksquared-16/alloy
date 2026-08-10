import { NextResponse } from "next/server";
import {
    adminContextFailureResponse,
    type AdminContextFailure,
} from "@/lib/admin/getAdminContext";
import {
    getAdminAccessContextCached,
    loadAdminAccessBundleCached,
    type AdminAccessContextFailure,
    type AdminAccessContextSuccess,
} from "@/lib/admin/getAdminAccessContext";
import { compatibilityPortalRole } from "@/lib/admin/adminPortalRolePick";
import {
    scopeDimensionsFromAccess,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";

export type AdminRouteGateSuccess = {
    ok: true;
    orgId: string;
    userId: string;
    role: string;
    roleKeys: string[];
    access: AdminAccessContextSuccess;
    /** Department scope after portal admin/ops bypass (used by workspace + departments APIs). */
    dim: AdminAccessScopeDimensions;
    /** Profile-derived scope before bypass (debug / audit). */
    /**
     * W-8 removed the raw/effective split: no role widens a scope dimension, so the stored
     * dimensions *are* the enforced ones and there is no second answer to report.
     */
};

export type AdminRouteGateFailure = AdminContextFailure | AdminAccessContextFailure;

export type AdminRouteGateResult = AdminRouteGateSuccess | AdminRouteGateFailure;

/**
 * One access-bundle resolution per HTTP request — use instead of separate
 * `getAdminContextCached` + `getAdminAccessContextCached` at route entry.
 */
export async function loadAdminRouteGate(): Promise<AdminRouteGateResult> {
    const bundle = await loadAdminAccessBundleCached();
    if (!bundle.ok) return bundle;
    if (!bundle.portalEligible) {
        return { ok: false, status: 403 };
    }
    const access: AdminAccessContextSuccess = {
        ok: true,
        userId: bundle.userId,
        orgId: bundle.orgId,
        roleKeys: bundle.roleKeys,
        permissionKeys: bundle.permissionKeys,
        departmentScope: bundle.departmentScope,
        allowedDepartmentIds: bundle.allowedDepartmentIds,
        siteScope: bundle.siteScope,
        allowedSiteLocationIds: bundle.allowedSiteLocationIds,
    };
    return {
        ok: true,
        orgId: access.orgId,
        userId: access.userId,
        role: compatibilityPortalRole(access.roleKeys),
        roleKeys: access.roleKeys,
        access,
        dim: scopeDimensionsFromAccess(access),
    };
}

export function adminRouteGateFailureResponse(failure: AdminRouteGateFailure): NextResponse {
    return adminContextFailureResponse(failure);
}
