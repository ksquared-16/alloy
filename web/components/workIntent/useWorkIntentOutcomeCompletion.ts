"use client";

import { useCallback, useState } from "react";
import {
    dispatchOpportunityDrawerOperationalTasksRefresh,
} from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { completeStageWorkWithSelectedOutcome } from "@/lib/lifecycle/stageWorkOutcomePickerClient";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";
import { useOpportunityDrawerVmPayload } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmPayload";

export function useWorkIntentOutcomeCompletion(opportunityId: string) {
    const { reloadOpportunityDisplayVm } = useOpportunityDrawerVmPayload();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const completeOutcome = useCallback(
        async (projection: WorkIntentRuntimeProjection, outcomeKey: string) => {
            if (projection.state !== "open" || !projection.work_id) return;
            if (!projection.outcomes.length) return;
            const { execution, stage_key: stageKey, work_id: workId } = projection;

            setBusy(true);
            setError(null);
            try {
                const result = await completeStageWorkWithSelectedOutcome({
                    departmentId: execution.department_id,
                    stageKey,
                    workId,
                    outcomeKey,
                    subject: execution.subject,
                });
                if (!result.ok) {
                    throw new Error(result.error ?? "Failed to complete work");
                }

                dispatchOpportunityDrawerOperationalTasksRefresh(opportunityId);
                if (result.queue_refresh_opportunity_id) {
                    dispatchOpportunityQueueUpdated(result.queue_refresh_opportunity_id, "stage_work_outcome");
                }
                await reloadOpportunityDisplayVm();
            } catch (e: unknown) {
                setError((e as Error).message || "Failed to complete work");
            } finally {
                setBusy(false);
            }
        },
        [opportunityId, reloadOpportunityDisplayVm],
    );

    return { completeOutcome, busy, error, clearError: () => setError(null) };
}
