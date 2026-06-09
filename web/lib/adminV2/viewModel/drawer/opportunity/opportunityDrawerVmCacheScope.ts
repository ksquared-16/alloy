import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import {
    buildDrawerViewModelCacheKey,
    type DrawerViewModelCacheContext,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";

function trim(value: string | null | undefined): string {
    return typeof value === "string" ? value.trim() : "";
}

function hasScopedFields(context: DrawerViewModelCacheContext | null | undefined): boolean {
    if (!context) return false;
    return Boolean(trim(context.orgId) || trim(context.departmentId) || trim(context.workUnitId));
}

/**
 * Single scope resolver for opportunity drawer VM session cache keys.
 * Explicit `context` wins when it carries org/dept/wu; otherwise derive from workspace context.
 */
export function resolveOpportunityDrawerVmCacheContext(input: {
    workspaceContext?: OpportunityWorkspaceContext | null;
    context?: DrawerViewModelCacheContext | null;
}): DrawerViewModelCacheContext | null {
    if (hasScopedFields(input.context)) {
        return {
            orgId: trim(input.context?.orgId) || null,
            departmentId: trim(input.context?.departmentId) || null,
            workUnitId: trim(input.context?.workUnitId) || null,
        };
    }

    const departmentId = trim(input.workspaceContext?.department_id);
    const workUnitId = trim(input.workspaceContext?.work_unit_id);
    if (!departmentId && !workUnitId) return null;

    return {
        orgId: trim(input.context?.orgId) || null,
        departmentId: departmentId || null,
        workUnitId: workUnitId || null,
    };
}

export function buildOpportunityDrawerVmCacheKey(
    opportunityId: string,
    context: DrawerViewModelCacheContext | null
): string {
    return buildDrawerViewModelCacheKey({
        entityType: "opportunities",
        entityId: opportunityId.trim(),
        surface: "opportunity",
        context,
    });
}

export function resolveOpportunityDrawerVmCacheKey(input: {
    opportunityId: string;
    workspaceContext?: OpportunityWorkspaceContext | null;
    context?: DrawerViewModelCacheContext | null;
}): { cacheKey: string; context: DrawerViewModelCacheContext | null } {
    const context = resolveOpportunityDrawerVmCacheContext(input);
    return {
        context,
        cacheKey: buildOpportunityDrawerVmCacheKey(input.opportunityId, context),
    };
}
