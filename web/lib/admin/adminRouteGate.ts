import { NextResponse } from "next/server";
import {
    adminContextFailureResponse,
    type AdminContextFailure,
} from "@/lib/admin/getAdminContext";
import {
    getAdminAccessContextCached,
    type AdminAccessContextFailure,
    type AdminAccessContextSuccess,
} from "@/lib/admin/getAdminAccessContext";
import { compatibilityPortalRole } from "@/lib/admin/adminPortalRolePick";
import { scopeDimensionsFromAccess, type AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

export type AdminRouteGateSuccess = {
    ok: true;
    orgId: string;
    userId: string;
    role: string;
    roleKeys: string[];
    access: AdminAccessContextSuccess;
    dim: AdminAccessScopeDimensions;
};

export type AdminRouteGateFailure = AdminContextFailure | AdminAccessContextFailure;

export type AdminRouteGateResult = AdminRouteGateSuccess | AdminRouteGateFailure;

/**
 * One access-bundle resolution per HTTP request — use instead of separate
 * `getAdminContextCached` + `getAdminAccessContextCached` at route entry.
 */
export async function loadAdminRouteGate(): Promise<AdminRouteGateResult> {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return access;
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
