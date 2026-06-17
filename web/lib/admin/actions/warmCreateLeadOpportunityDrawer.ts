import type { OpportunityDrawerIntentContext } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { prefetchOpportunityDrawerOnRowIntent } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import {
    fetchOpportunityDrawerPrimaryEntity,
    isOpportunityDrawerPrimaryWarm,
} from "@/lib/admin/opportunityDrawerPrimaryPrefetch";
import { prefetchOpportunityDrawerFull } from "@/lib/admin/opportunityDrawerFullPrefetch";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type WarmCreateLeadDrawerContext = {
    department_id: string | null;
    work_unit_id?: string | null;
};

const warmPromiseByOpportunityId = new Map<string, Promise<void>>();

function workspaceContextFrom(input: WarmCreateLeadDrawerContext): OpportunityDrawerIntentContext | null {
    const department_id = input.department_id?.trim() ?? "";
    if (!department_id) return null;
    return {
        department_id,
        work_unit_id: input.work_unit_id?.trim() ?? "",
    };
}

/** Reuse queue-row drawer warm paths — no duplicate fetch loader. */
export function warmCreateLeadOpportunityDrawer(
    opportunityId: string,
    context: WarmCreateLeadDrawerContext,
): Promise<void> {
    const id = opportunityId.trim();
    if (!id || typeof window === "undefined") return Promise.resolve();

    const existing = warmPromiseByOpportunityId.get(id);
    if (existing) return existing;

    const ws = workspaceContextFrom(context);
    const promise = (async () => {
        if (opportunityDrawerHardCutoverEnabled() && ws?.department_id && ws.work_unit_id) {
            await prepareDrawerViewModelDeduped({
                entityType: "opportunities",
                entityId: id,
                context: {
                    departmentId: ws.department_id,
                    workUnitId: ws.work_unit_id,
                },
                openSource: "create_lead_success_warm",
                opportunityWorkspaceContext: ws,
            }).catch(() => undefined);
            return;
        }

        prefetchOpportunityDrawerOnRowIntent(id, ws);
        await fetchOpportunityDrawerPrimaryEntity(id, workspaceDataFetchInit(), ws ?? null).catch(() => undefined);
        prefetchOpportunityDrawerFull(id);
    })();

    warmPromiseByOpportunityId.set(id, promise);
    void promise.finally(() => {
        window.setTimeout(() => {
            if (warmPromiseByOpportunityId.get(id) === promise) {
                warmPromiseByOpportunityId.delete(id);
            }
        }, 12_000);
    });

    return promise;
}

export function isCreateLeadOpportunityDrawerWarm(opportunityId: string): boolean {
    const id = opportunityId.trim();
    if (!id) return false;
    if (warmPromiseByOpportunityId.has(id)) return false;
    return isOpportunityDrawerPrimaryWarm(id);
}
