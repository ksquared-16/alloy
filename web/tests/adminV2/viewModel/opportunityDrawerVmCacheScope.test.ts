import { describe, expect, it } from "vitest";

import { buildPrepareParamsFromOpenDrawer } from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { drawerViewModelSwapCacheKey } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import {
    buildOpportunityDrawerVmCacheKey,
    resolveOpportunityDrawerVmCacheContext,
    resolveOpportunityDrawerVmCacheKey,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmCacheScope";

const workspaceContext = {
    department_id: "dept-1",
    work_unit_id: "wu-1",
};

describe("opportunityDrawerVmCacheScope", () => {
    it("uses explicit context scope when provided", () => {
        const context = resolveOpportunityDrawerVmCacheContext({
            workspaceContext,
            context: { orgId: "org-1", departmentId: "dept-1", workUnitId: "wu-1" },
        });
        expect(context).toEqual({
            orgId: "org-1",
            departmentId: "dept-1",
            workUnitId: "wu-1",
        });
        expect(buildOpportunityDrawerVmCacheKey("opp-1", context)).toBe(
            "drawerVm:opportunities:opp-1:opportunity:org-1:dept-1:wu-1"
        );
    });

    it("derives dept/wu scope from workspace context when explicit scope is absent", () => {
        const context = resolveOpportunityDrawerVmCacheContext({ workspaceContext });
        expect(context).toEqual({
            orgId: null,
            departmentId: "dept-1",
            workUnitId: "wu-1",
        });
        expect(buildOpportunityDrawerVmCacheKey("opp-1", context)).toBe(
            "drawerVm:opportunities:opp-1:opportunity:_:dept-1:wu-1"
        );
    });

    it("falls back to unscoped _ key when no workspace or explicit scope exists", () => {
        const context = resolveOpportunityDrawerVmCacheContext({});
        expect(context).toBeNull();
        expect(buildOpportunityDrawerVmCacheKey("opp-1", context)).toBe(
            "drawerVm:opportunities:opp-1:opportunity:_:_:_"
        );
    });

    it("matches row prefetch, row open peek, and prepare dedupe keys", () => {
        const prefetchParams = {
            entityType: "opportunities" as const,
            entityId: "opp-1",
            context: {
                departmentId: workspaceContext.department_id,
                workUnitId: workspaceContext.work_unit_id,
            },
            opportunityWorkspaceContext: workspaceContext,
        };
        const openParams = buildPrepareParamsFromOpenDrawer({
            type: "opportunities",
            id: "opp-1",
            source: "queue_row_open",
            opportunityWorkspaceContext: workspaceContext,
        });

        const prefetchKey = drawerViewModelSwapCacheKey(prefetchParams);
        const openKey = drawerViewModelSwapCacheKey(openParams);
        const loadKey = resolveOpportunityDrawerVmCacheKey({
            opportunityId: "opp-1",
            workspaceContext,
        }).cacheKey;

        expect(prefetchKey).toBe(openKey);
        expect(openKey).toBe(loadKey);
        expect(openKey).toBe("drawerVm:opportunities:opp-1:opportunity:_:dept-1:wu-1");
    });

    it("matches back-to-lead restore peek key when workspace context is preserved", () => {
        const backParams = buildPrepareParamsFromOpenDrawer({
            type: "opportunities",
            id: "opp-1",
            source: "drawer_back_to_lead",
            opportunityWorkspaceContext: workspaceContext,
        });
        const warmKey = resolveOpportunityDrawerVmCacheKey({
            opportunityId: "opp-1",
            workspaceContext,
        }).cacheKey;

        expect(drawerViewModelSwapCacheKey(backParams)).toBe(warmKey);
    });
});
