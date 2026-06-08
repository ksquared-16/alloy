import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

/** Canonical URLs — all callers must use these strings so TTL + inflight dedupe share one cache key. */
export const WORKSPACE_OPTION_SET_CHILDCARE_PROGRAM_URL = "/api/admin/option-sets/childcare_program_type";
export const WORKSPACE_OPTION_SET_CHILDCARE_SCHEDULE_URL = "/api/admin/option-sets/childcare_schedule_type";
export const WORKSPACE_INQUIRY_CHILD_LOCATIONS_URL = "/api/admin/locations?hierarchy=1";

const OPTION_SET_TTL_MS = 1500;

/**
 * Loads childcare inquiry option sets used by the opportunity inquiry-children section.
 * Uses `dedupeAdminFetchWithTtl` (URL-keyed inflight coalescing + short cache) so parallel mounts,
 * prefetch, and the section share one network round-trip per set when possible.
 */
export async function loadWorkspaceChildcareInquiryOptionSets(init?: RequestInit): Promise<{
    programRes: Response;
    scheduleRes: Response;
    locationsRes: Response;
}> {
    const i = init ?? workspaceDataFetchInit();
    const [programRes, scheduleRes, locationsRes] = await Promise.all([
        dedupeAdminFetchWithTtl(WORKSPACE_OPTION_SET_CHILDCARE_PROGRAM_URL, i, OPTION_SET_TTL_MS),
        dedupeAdminFetchWithTtl(WORKSPACE_OPTION_SET_CHILDCARE_SCHEDULE_URL, i, OPTION_SET_TTL_MS),
        dedupeAdminFetchWithTtl(WORKSPACE_INQUIRY_CHILD_LOCATIONS_URL, i, OPTION_SET_TTL_MS),
    ]);
    return { programRes, scheduleRes, locationsRes };
}

/** Fire-and-forget prefetch (e.g. when opportunity drawer record is ready) to warm dedupe cache. */
export function prefetchWorkspaceChildcareInquiryOptionSets(init?: RequestInit): void {
    void loadWorkspaceChildcareInquiryOptionSets(init);
}
