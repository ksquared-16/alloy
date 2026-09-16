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
 * The subject of attention for a cache scope, from whichever side named one.
 *
 * An explicit context wins where it speaks, exactly as the org/dept/work-unit fields do; otherwise
 * the workspace context — which is what the Focus Panel transport populates — answers.
 */
function attentionOf(input: {
    workspaceContext?: OpportunityWorkspaceContext | null;
    context?: DrawerViewModelCacheContext | null;
}): string | null {
    return (
        trim(input.context?.attentionSubjectId) ||
        trim(input.workspaceContext?.attention_subject_id) ||
        null
    );
}

/**
 * Single scope resolver for opportunity drawer VM session cache keys.
 * Explicit `context` wins when it carries org/dept/wu; otherwise derive from workspace context.
 */
export function resolveOpportunityDrawerVmCacheContext(input: {
    workspaceContext?: OpportunityWorkspaceContext | null;
    context?: DrawerViewModelCacheContext | null;
}): DrawerViewModelCacheContext | null {
    const attentionSubjectId = attentionOf(input);

    if (hasScopedFields(input.context)) {
        return {
            orgId: trim(input.context?.orgId) || null,
            departmentId: trim(input.context?.departmentId) || null,
            workUnitId: trim(input.context?.workUnitId) || null,
            attentionSubjectId,
        };
    }

    const departmentId = trim(input.workspaceContext?.department_id);
    const workUnitId = trim(input.workspaceContext?.work_unit_id);
    /*
     * ATTENTION ALONE IS A SCOPE.
     *
     * Returning null here used to mean "no scope", and a null context keys every child of a record
     * to the SAME cache entry. The Focus Panel's transport names an attention subject without
     * necessarily naming a department or work unit, so without this a Child A view model would be
     * served for Child B — the exact reuse the attention segment was added to prevent.
     */
    if (!departmentId && !workUnitId && !attentionSubjectId) return null;

    return {
        orgId: trim(input.context?.orgId) || null,
        departmentId: departmentId || null,
        workUnitId: workUnitId || null,
        attentionSubjectId,
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
