/**
 * Resolve the operator Work Unit Focus Panel route for a newly created process record.
 * Config-driven: prefers a matching Work View route slug when provided, else the work unit key.
 */
import {
    operatorWorkUnitHrefFromKey,
    resolveCreatedLeadFocusPanelHref,
} from "@/lib/admin/canonicalOperatorRoutes";

export function resolveCreatedRecordProcessContextHref(args: {
    recordId: string;
    workUnitKey?: string | null;
    workViewId?: string | null;
}): string {
    const recordId = args.recordId.trim();
    const workViewId = args.workViewId?.trim();
    if (workViewId) {
        return operatorWorkUnitHrefFromKey(workViewId, recordId || null);
    }
    return resolveCreatedLeadFocusPanelHref({
        recordId,
        currentWorkUnitKey: args.workUnitKey ?? null,
    });
}
