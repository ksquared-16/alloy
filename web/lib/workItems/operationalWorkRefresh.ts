/**
 * Canonical operational work refresh — one contract for queue, drawer, Current Work, Processing.
 */

import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH } from "@/lib/adminV2/opportunityDrawerTaskEvents";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";

export const ADMIN_V2_PROCESSING_QUEUE_REFRESH = "adminv2:processing-queue-refresh" as const;

export type OperationalWorkRefreshDetail = {
    opportunity_id?: string | null;
    processing_case_id?: string | null;
    task_id?: string | null;
    kind?: "mutation" | "complete" | "processing_review";
};

export function dispatchOperationalWorkRefresh(detail: OperationalWorkRefreshDetail = {}): void {
    if (typeof window === "undefined") return;

    const opportunityId = detail.opportunity_id?.trim() || "";
    if (opportunityId) {
        window.dispatchEvent(
            new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, {
                detail: { opportunity_id: opportunityId, task_id: detail.task_id ?? null },
            }),
        );
        dispatchOpportunityQueueUpdated(opportunityId, detail.kind ?? "mutation");
    } else {
        window.dispatchEvent(
            new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, {
                detail: { opportunity_id: "", task_id: detail.task_id ?? null },
            }),
        );
    }

    if (detail.processing_case_id?.trim() || detail.kind === "processing_review") {
        void warmProcessingQueueCache({ force: true });
        window.dispatchEvent(
            new CustomEvent(ADMIN_V2_PROCESSING_QUEUE_REFRESH, {
                detail: { processing_case_id: detail.processing_case_id ?? null },
            }),
        );
    }
}
