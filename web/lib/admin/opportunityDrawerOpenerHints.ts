import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";

/**
 * Queue opener hints carried on the `surface=drawer_primary` GET so the server can skip the
 * work_units → department lookup on the first-paint critical path. Hints are display-only: the
 * authoritative department / work-unit values are recomputed on `surface=full`. Never treat a hint
 * as truth for permissions, scoping, or persisted state.
 */
export const OPPORTUNITY_DRAWER_HINT_DEPARTMENT_ID_PARAM = "hint_department_id";
export const OPPORTUNITY_DRAWER_HINT_WORK_UNIT_ID_PARAM = "hint_work_unit_id";

export type OpportunityDrawerOpenerHints = {
    departmentId: string | null;
    workUnitId: string | null;
};

function trimToNull(value: string | null | undefined): string | null {
    const v = (value ?? "").trim();
    return v.length > 0 ? v : null;
}

/** Build the opener-hint query params from the workspace context that triggered the open. */
export function buildOpportunityDrawerOpenerHintParams(
    workspaceContext: OpportunityWorkspaceContext | null | undefined
): URLSearchParams {
    const params = new URLSearchParams();
    const departmentId = trimToNull(workspaceContext?.department_id);
    const workUnitId = trimToNull(workspaceContext?.work_unit_id);
    if (departmentId) params.set(OPPORTUNITY_DRAWER_HINT_DEPARTMENT_ID_PARAM, departmentId);
    if (workUnitId) params.set(OPPORTUNITY_DRAWER_HINT_WORK_UNIT_ID_PARAM, workUnitId);
    return params;
}

/** Append opener hints to an existing drawer_primary URL (no-op when no hints are available). */
export function appendOpportunityDrawerOpenerHintsToUrl(
    url: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined
): string {
    const params = buildOpportunityDrawerOpenerHintParams(workspaceContext);
    const query = params.toString();
    if (!query) return url;
    return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
}

/** Server-side reader: parse opener hints from the incoming request search params. */
export function readOpportunityDrawerOpenerHints(
    searchParams: URLSearchParams
): OpportunityDrawerOpenerHints {
    return {
        departmentId: trimToNull(searchParams.get(OPPORTUNITY_DRAWER_HINT_DEPARTMENT_ID_PARAM)),
        workUnitId: trimToNull(searchParams.get(OPPORTUNITY_DRAWER_HINT_WORK_UNIT_ID_PARAM)),
    };
}
