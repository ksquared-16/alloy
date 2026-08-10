/**
 * Resolve the operator Work Unit Focus Panel route for a newly created process record.
 *
 * Prefers the configured Work View handoff (label-derived route slug + work_view_id lens),
 * matching workspace nav (`/workspace/work-unit/leads?work_view_id=new_leads&subject_id=…`).
 * Falls back to the work unit key only when no Work View was resolved.
 */
import {
    operatorWorkUnitHrefFromWorkViewSlug,
    resolveCreatedLeadFocusPanelHref,
} from "@/lib/admin/canonicalOperatorRoutes";

export function resolveCreatedRecordProcessContextHref(args: {
    recordId: string;
    workUnitKey?: string | null;
    workViewId?: string | null;
    /** Label-derived route key (`Leads` → `leads`). Prefer over raw view id for path slug. */
    workViewRouteKey?: string | null;
}): string {
    const recordId = args.recordId.trim();
    const workViewId = args.workViewId?.trim() || "";
    const routeKey = args.workViewRouteKey?.trim() || workViewId;

    if (routeKey) {
        const base = operatorWorkUnitHrefFromWorkViewSlug(routeKey);
        const params = new URLSearchParams();
        if (workViewId) params.set("work_view_id", workViewId);
        if (recordId) params.set("subject_id", recordId);
        const q = params.toString();
        return q ? `${base}?${q}` : base;
    }

    return resolveCreatedLeadFocusPanelHref({
        recordId,
        currentWorkUnitKey: args.workUnitKey ?? null,
    });
}
