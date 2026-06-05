import { hasPortalAdminMutateAccess } from "@/lib/admin/adminPortalRolePick";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";

/** Same bar as {@link AdminAuthProvider} `canMutate` — portal `admin` role key or legacy role string. */
export function resolveOpportunityDrawerStatusCanMutateFromGate(params: {
    role: string;
    roleKeys: readonly string[];
}): boolean {
    const keys = params.roleKeys.map((k) => String(k).trim()).filter(Boolean);
    if (keys.length > 0) return hasPortalAdminMutateAccess(keys);
    return params.role.trim().toLowerCase() === "admin";
}

/**
 * Opportunity VM status mutation — server gate first (compose), then client auth context.
 */
export function resolveOpportunityVmStatusCanMutate(
    displayVm: OpportunityDrawerViewModel | null | undefined,
    authCanMutate: boolean
): boolean {
    if (displayVm?.header.status_can_mutate != null) {
        return displayVm.header.status_can_mutate;
    }
    return authCanMutate;
}
