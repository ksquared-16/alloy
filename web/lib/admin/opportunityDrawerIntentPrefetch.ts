import { scheduleDeferredCommunicationsDrawerPrefetch } from "@/lib/admin/communications/communicationsDrawerPrefetch";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { dedupeAdminFetch, dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";

export type OpportunityDrawerIntentContext = {
    work_unit_id: string;
    department_id: string;
};

/**
 * Intent-time prefetch for opportunity drawer (row mousedown / focus).
 * Uses in-flight dedupe — drawer open reuses the same GETs when still pending.
 */
export function prefetchOpportunityDrawerOnRowIntent(
    opportunityId: string,
    workspaceContext?: OpportunityDrawerIntentContext | null
): void {
    const id = opportunityId.trim();
    if (!id || typeof window === "undefined") return;

    scheduleDeferredCommunicationsDrawerPrefetch("opportunities", id);

    const url = `/api/admin/entity/opportunities/${encodeURIComponent(id)}?surface=drawer_visible`;
    void dedupeAdminFetch(url, workspaceDataFetchInit()).catch(() => {
        /* non-fatal — drawer open will retry */
    });

    const wu = workspaceContext?.work_unit_id?.trim() ?? "";
    const dept = workspaceContext?.department_id?.trim() ?? "";
    if (!wu || !dept) return;

    const qs = new URLSearchParams({
        surface: "record_header",
        entity_type: "opportunity",
        entity_id: id,
        work_unit_id: wu,
        department_id: dept,
    });
    void dedupeAdminFetchWithTtl(`/api/admin/actions?${qs.toString()}`, workspaceDataFetchInit(), 1500).catch(() => {
        /* non-fatal */
    });
}
