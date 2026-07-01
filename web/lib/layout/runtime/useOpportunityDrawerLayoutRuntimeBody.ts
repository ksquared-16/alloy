"use client";

/**
 * C1b — opportunity drawer layout runtime body hook (re-exports shared presentation helpers).
 */

import { isLayoutRuntimeOpportunityDrawerBodyEnabledClient } from "@/lib/layout/featureFlag";
import {
    DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS as OPPORTUNITY_DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS,
    resolveDrawerLayoutRuntimeBodyPresentation as resolveOpportunityOverviewBodyPresentation,
    shouldFallbackDrawerLayoutFetchOnTimeout as shouldFallbackLayoutFetchOnTimeout,
    type DrawerLayoutRuntimeBodyPhase as OpportunityLayoutRuntimeBodyPhase,
    type DrawerLayoutRuntimeBodyPresentation as OpportunityLayoutRuntimeBodyPresentation,
} from "@/lib/layout/runtime/drawerLayoutRuntimePresentation";
import { useDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";

export type UseOpportunityDrawerLayoutRuntimeBodyArgs = {
    opportunityId: string | null | undefined;
    vmReady: boolean;
    departmentId?: string | null;
    workUnitId?: string | null;
};

export {
    OPPORTUNITY_DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS,
    resolveOpportunityOverviewBodyPresentation,
    shouldFallbackLayoutFetchOnTimeout,
};
export type { OpportunityLayoutRuntimeBodyPhase, OpportunityLayoutRuntimeBodyPresentation };

export function useOpportunityDrawerLayoutRuntimeBody(args: UseOpportunityDrawerLayoutRuntimeBodyArgs) {
    return useDrawerLayoutRuntimeBody({
        cutoverEnabled: isLayoutRuntimeOpportunityDrawerBodyEnabledClient(),
        entityId: args.opportunityId,
        vmReady: args.vmReady,
        apiPath: "/api/admin/layout-runtime/opportunity-drawer-body",
        queryParams: {
            departmentId: args.departmentId,
            workUnitId: args.workUnitId,
        },
        logTag: "opportunity_drawer",
    });
}
