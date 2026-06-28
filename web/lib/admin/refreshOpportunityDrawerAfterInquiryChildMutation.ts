/**
 * Authoritative drawer refresh after Add Child — reload VM + invalidate caches.
 * Optimistic patches alone are not sufficient; child must persist after reopen.
 */

import { logAddChildDevTrace } from "@/lib/admin/actions/logAddChildDevTrace";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { refreshOpportunityDrawerInquiryChildren } from "@/lib/admin/refreshOpportunityDrawerInquiryChildren";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import { isOpportunityDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { loadOpportunityDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import { invalidateDrawerViewModelCacheForEntity } from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { dispatchDrawerLayoutRuntimeBodyInvalidate } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyInvalidate";
import { invalidateDrawerLayoutRuntimeBodyCacheForEntity } from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { unwrapEntityRecord } from "@/lib/api/unwrapEntityRecord";

export type RefreshOpportunityDrawerAfterInquiryChildInput = {
    opportunityId: string;
    workspaceContext?: OpportunityWorkspaceContext | null;
    customerMemberId: string;
    ocmId: string;
    patchRecord?: (patchFn: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
    /** Full VM reload (mirrors Legacy drawer `refetch()` after Add Child). */
    reloadDisplayVm?: () => Promise<void>;
};

export type RefreshOpportunityDrawerAfterInquiryChildResult = {
    ok: boolean;
    inquiryChildrenCount: number;
    reloadSource: "vm_compose" | "drawer_visible_fallback" | "none";
};

function logChildVisibility(opportunityId: string, record: Record<string, unknown>, source: string): void {
    const children = Array.isArray(record._inquiry_children) ? record._inquiry_children : [];
    logAddChildDevTrace("[action.add_child:child_visible_in_record]", {
        opportunityId,
        source,
        inquiryChildrenCount: children.length,
        childNames: children
            .map((row) =>
                row && typeof row === "object"
                    ? String(
                          (row as Record<string, unknown>).display_name ??
                              (row as Record<string, unknown>).first_name ??
                              "",
                      ).trim()
                    : "",
            )
            .filter(Boolean),
    });
}

/** Dev-only: confirm inquiry children count after reload (no PII in console). */
async function logDrawerVisibleInquiryChildrenAudit(opportunityId: string): Promise<number> {
    if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return -1;
    const res = await fetch(
        `/api/admin/entity/opportunities/${encodeURIComponent(opportunityId)}?surface=drawer_visible`,
        workspaceDataFetchInit(),
    );
    if (!res.ok) {
        logAddChildDevTrace("[action.add_child:drawer_patch]", {
            opportunityId,
            phase: "read_audit_failed",
            status: res.status,
        });
        return -1;
    }
    // API contract: { ok, data: { entity }, correlation_id }.
    const record = unwrapEntityRecord(await res.json().catch(() => null));
    const inquiryChildren = Array.isArray(record?._inquiry_children) ? record!._inquiry_children : [];
    logAddChildDevTrace("[action.add_child:drawer_patch]", {
        opportunityId,
        phase: "read_audit",
        inquiryChildrenCount: inquiryChildren.length,
    });
    return inquiryChildren.length;
}

export async function refreshOpportunityDrawerAfterInquiryChildMutation(
    input: RefreshOpportunityDrawerAfterInquiryChildInput,
): Promise<RefreshOpportunityDrawerAfterInquiryChildResult> {
    const opportunityId = input.opportunityId.trim();
    if (!opportunityId) return { ok: false, inquiryChildrenCount: 0, reloadSource: "none" };

    invalidateDrawerViewModelCacheForEntity("opportunities", opportunityId, {
        departmentId: input.workspaceContext?.department_id ?? null,
        workUnitId: input.workspaceContext?.work_unit_id ?? null,
    });
    invalidateDrawerLayoutRuntimeBodyCacheForEntity(
        "/api/admin/layout-runtime/opportunity-drawer-body",
        opportunityId,
    );
    dispatchDrawerLayoutRuntimeBodyInvalidate({
        entityType: "opportunities",
        entityId: opportunityId,
    });

    logAddChildDevTrace("[action.add_child:drawer_patch]", {
        opportunityId,
        phase: "reload_start",
        customerMemberId: input.customerMemberId,
        ocmId: input.ocmId,
    });

    if (input.reloadDisplayVm) {
        await input.reloadDisplayVm();
        const auditCount = await logDrawerVisibleInquiryChildrenAudit(opportunityId);
        dispatchOpportunityQueueUpdated(opportunityId, "add_child");
        return {
            ok: true,
            inquiryChildrenCount: auditCount >= 0 ? auditCount : 0,
            reloadSource: "vm_compose",
        };
    }

    const vmResult = await loadOpportunityDrawerViaViewModel(
        opportunityId,
        input.workspaceContext ?? null,
        workspaceDataFetchInit(),
    );
    if (vmResult.ok && isOpportunityDrawerViewModelPreload(vmResult.preload)) {
        const record = vmResult.preload.viewModel.above_fold.record ?? {};
        const count = Array.isArray(record._inquiry_children) ? record._inquiry_children.length : 0;
        logChildVisibility(opportunityId, record, "vm_compose_fetch");
        await logDrawerVisibleInquiryChildrenAudit(opportunityId);
        dispatchOpportunityQueueUpdated(opportunityId, "add_child");
        return { ok: true, inquiryChildrenCount: count, reloadSource: "vm_compose" };
    }

    const fallback = await refreshOpportunityDrawerInquiryChildren(opportunityId, input.patchRecord);
    const auditCount = await logDrawerVisibleInquiryChildrenAudit(opportunityId);
    const count =
        auditCount >= 0 ? auditCount : (fallback.inquiryChildren?.length ?? 0);
    dispatchOpportunityQueueUpdated(opportunityId, "add_child");
    return {
        ok: fallback.ok,
        inquiryChildrenCount: count,
        reloadSource: "drawer_visible_fallback",
    };
}
