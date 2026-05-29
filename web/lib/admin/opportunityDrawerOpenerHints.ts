import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";

/**
 * Queue opener hints carried on the `surface=drawer_primary` GET so the server can skip the
 * work_units → department lookup on the first-paint critical path. Hints are display-only: the
 * authoritative department / work-unit values are recomputed on `surface=full`. Never treat a hint
 * as truth for permissions, scoping, or persisted state.
 */
export const OPPORTUNITY_DRAWER_HINT_DEPARTMENT_ID_PARAM = "hint_department_id";
export const OPPORTUNITY_DRAWER_HINT_WORK_UNIT_ID_PARAM = "hint_work_unit_id";
export const OPPORTUNITY_DRAWER_HINT_CUSTOMER_NAME_PARAM = "hint_customer_name";
export const OPPORTUNITY_DRAWER_HINT_PRIMARY_PERSON_NAME_PARAM = "hint_primary_person_name";
export const OPPORTUNITY_DRAWER_HINT_PRIMARY_PERSON_EMAIL_PARAM = "hint_primary_person_email";
export const OPPORTUNITY_DRAWER_HINT_PRIMARY_PERSON_PHONE_PARAM = "hint_primary_person_phone";

export type OpportunityDrawerOpenerHints = {
    departmentId: string | null;
    workUnitId: string | null;
    customerName?: string | null;
    primaryPersonName?: string | null;
    primaryPersonEmail?: string | null;
    primaryPersonPhone?: string | null;
};

function trimToNull(value: string | null | undefined): string | null {
    const v = (value ?? "").trim();
    return v.length > 0 ? v : null;
}

/** Build the opener-hint query params from the workspace context that triggered the open. */
export function buildOpportunityDrawerOpenerHintParams(
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    queuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null
): URLSearchParams {
    const params = new URLSearchParams();
    const departmentId = trimToNull(workspaceContext?.department_id);
    const workUnitId = trimToNull(workspaceContext?.work_unit_id);
    if (departmentId) params.set(OPPORTUNITY_DRAWER_HINT_DEPARTMENT_ID_PARAM, departmentId);
    if (workUnitId) params.set(OPPORTUNITY_DRAWER_HINT_WORK_UNIT_ID_PARAM, workUnitId);
    const seedTitle = trimToNull(queuePreviewSeed?.title);
    const seedSubtitle = trimToNull(queuePreviewSeed?.subtitle);
    if (seedTitle) params.set(OPPORTUNITY_DRAWER_HINT_PRIMARY_PERSON_NAME_PARAM, seedTitle);
    if (seedSubtitle) params.set(OPPORTUNITY_DRAWER_HINT_CUSTOMER_NAME_PARAM, seedSubtitle);
    return params;
}

/** Append opener hints to an existing drawer_primary URL (no-op when no hints are available). */
export function appendOpportunityDrawerOpenerHintsToUrl(
    url: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    queuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null
): string {
    const params = buildOpportunityDrawerOpenerHintParams(workspaceContext, queuePreviewSeed);
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
        customerName: trimToNull(searchParams.get(OPPORTUNITY_DRAWER_HINT_CUSTOMER_NAME_PARAM)),
        primaryPersonName: trimToNull(searchParams.get(OPPORTUNITY_DRAWER_HINT_PRIMARY_PERSON_NAME_PARAM)),
        primaryPersonEmail: trimToNull(searchParams.get(OPPORTUNITY_DRAWER_HINT_PRIMARY_PERSON_EMAIL_PARAM)),
        primaryPersonPhone: trimToNull(searchParams.get(OPPORTUNITY_DRAWER_HINT_PRIMARY_PERSON_PHONE_PARAM)),
    };
}
