"use client";

import { useCallback, useState } from "react";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import {
    dispatchOpportunityDrawerOperationalTasksRefresh,
} from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { completeStageWorkWithSelectedOutcome } from "@/lib/lifecycle/stageWorkOutcomePickerClient";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";
import { fetchFreshOpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/fetchFreshOpportunityDrawerViewModel";
import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { putDrawerViewModelCacheEntry } from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { pinFocusRecordOutOfView } from "@/lib/presentation/runtime/focusRecordOutOfViewPin";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";

export function useWorkIntentOutcomeCompletion(opportunityId: string) {
    const drawerCtx = useAdminDrawerOptional();
    const { orgId } = useWorkspaceOrg();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reloadOpportunityDisplayVm = useCallback(async () => {
        if (!drawerCtx) return;
        const vm = await fetchFreshOpportunityDrawerViewModel(drawerCtx.drawer);
        if (!vm) return;
        putDrawerViewModelCacheEntry(
            {
                entityType: "opportunities",
                entityId: vm.entity.id,
                surface: "opportunity",
                preload: buildOpportunityDrawerOpenPreloadFromViewModel(vm),
                generation: vm.generation,
                cachedAt: Date.now(),
            },
            {
                departmentId: drawerCtx.drawer.opportunityWorkspaceContext?.department_id ?? null,
                workUnitId: drawerCtx.drawer.opportunityWorkspaceContext?.work_unit_id ?? null,
            },
        );
        drawerCtx.completeDrawerRuntimeTransition();
    }, [drawerCtx]);

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

                // Keep Focus Panel on this record after membership refresh (no auto-nav to destination view).
                pinFocusRecordOutOfView({
                    orgId,
                    workUnitId: drawerCtx?.drawer.opportunityWorkspaceContext?.work_unit_id ?? null,
                    recordId: opportunityId,
                });

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
        [opportunityId, reloadOpportunityDisplayVm, orgId, drawerCtx],
    );

    return { completeOutcome, busy, error, clearError: () => setError(null) };
}
