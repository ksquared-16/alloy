/**
 * Section-level refresh after inquiry-child mutations (Add Child / OCM link).
 *
 * Patches only `_inquiry_children` on the in-memory VM record — no full drawer
 * reload, no layout-body hold/refetch, no header/lifecycle/tab remount.
 */

import { logAddChildDevTrace } from "@/lib/admin/actions/logAddChildDevTrace";
import { mergeInquiryChildrenPreservingOptimistic } from "@/lib/admin/mergeInquiryChildrenPreservingOptimistic";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { unwrapEntityRecord } from "@/lib/api/unwrapEntityRecord";

export type RefreshOpportunityInquiryChildrenResult = {
    ok: boolean;
    inquiryChildren?: unknown[];
};

export type PatchOpportunityDrawerRecordFn = (
    patchFn: (prev: Record<string, unknown>) => Record<string, unknown>,
) => void;

/** Fetch authoritative inquiry children and merge onto the open drawer VM only. */
export async function refreshOpportunityDrawerInquiryChildren(
    opportunityId: string,
    patchRecord?: PatchOpportunityDrawerRecordFn,
): Promise<RefreshOpportunityInquiryChildrenResult> {
    const id = opportunityId.trim();
    if (!id || typeof window === "undefined") return { ok: false };

    const res = await fetch(
        `/api/admin/entity/opportunities/${encodeURIComponent(id)}?surface=drawer_visible`,
        workspaceDataFetchInit(),
    );
    if (!res.ok) return { ok: false };

    // API contract: { ok, data: { entity }, correlation_id }.
    const record = unwrapEntityRecord(await res.json().catch(() => null));
    if (!record) return { ok: false };

    const inquiryChildren = Array.isArray(record._inquiry_children) ? record._inquiry_children : [];

    if (patchRecord) {
        patchRecord((prev) => {
            const prevChildren = Array.isArray(prev._inquiry_children) ? prev._inquiry_children : [];
            const merged = mergeInquiryChildrenPreservingOptimistic(prevChildren, inquiryChildren);
            logAddChildDevTrace("[action.add_child:drawer_patch]", {
                opportunityId: id,
                serverCount: inquiryChildren.length,
                prevCount: prevChildren.length,
                mergedCount: merged.length,
                preservedOptimistic: merged.length > inquiryChildren.length,
            });
            logAddChildDevTrace("[action.add_child:child_visible_in_record]", {
                opportunityId: id,
                inquiryChildrenCount: merged.length,
                childNames: merged
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
            return {
                ...prev,
                _inquiry_children: merged,
            };
        });
    }

    dispatchOpportunityQueueUpdated(id, "inquiry_children_refresh");

    return { ok: true, inquiryChildren };
}
