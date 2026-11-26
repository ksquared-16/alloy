/**
 * Canonical operational work refresh — one contract for queue, drawer, Current Work, Processing.
 */

import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH } from "@/lib/adminV2/opportunityDrawerTaskEvents";
import { prefetchCommandCenterConversations } from "@/lib/communications/v2/commandCenterPrefetchCache";
import { warmAllProcessingQueueScopes } from "@/lib/pos/processingQueueWarmCache";

export const ADMIN_V2_PROCESSING_QUEUE_REFRESH = "adminv2:processing-queue-refresh" as const;

export const ADMIN_V2_COMMUNICATIONS_QUEUE_REFRESH = "adminv2:communications-queue-refresh" as const;

export type OperationalWorkRefreshDetail = {
    opportunity_id?: string | null;
    processing_case_id?: string | null;
    communication_thread_id?: string | null;
    task_id?: string | null;
    kind?: "mutation" | "complete" | "processing_review" | "communications_reply";
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

    if (detail.communication_thread_id?.trim() || detail.kind === "communications_reply") {
        void prefetchCommandCenterConversations({ force: true });
        window.dispatchEvent(
            new CustomEvent(ADMIN_V2_COMMUNICATIONS_QUEUE_REFRESH, {
                detail: { communication_thread_id: detail.communication_thread_id ?? null },
            }),
        );
    }

    if (detail.processing_case_id?.trim() || detail.kind === "processing_review") {
        /*
         * BOTH scopes. The Work rail reads the browse page and the Work Items projection reads the
         * actionable cohort; refreshing only one of them is how a case that was just archived stays
         * on the other surface. Convergence after a decision is the whole point of this event.
         */
        void warmAllProcessingQueueScopes({ force: true });
        window.dispatchEvent(
            new CustomEvent(ADMIN_V2_PROCESSING_QUEUE_REFRESH, {
                detail: { processing_case_id: detail.processing_case_id ?? null },
            }),
        );
    }
}
