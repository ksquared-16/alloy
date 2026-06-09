/**
 * Structured trace for layout-runtime child link pipeline.
 */

import type { LayoutRuntimeChildOpenTarget } from "./resolveLayoutRuntimeChildOpenTarget";
import type { LayoutRuntimeOpenDrawerDispatchResult } from "./dispatchLayoutRuntimeOpenDrawer";

export type LayoutRuntimeChildLinkTrace = {
    surface: "queue" | "drawer";
    clickedRowKey: string | null;
    customerMemberId: string | null;
    personId: string | null;
    childId: string | null;
    resolvedTargetId: string | null;
    resolvedFrom: string | null;
    drawerRoute: string | null;
    result: "opened" | "failed" | "missing_target";
    failurePoint?: string;
};

export function buildLayoutRuntimeChildLinkTrace(input: {
    surface: "queue" | "drawer";
    openTarget: LayoutRuntimeChildOpenTarget;
    rowRecord?: Record<string, unknown>;
    dispatchResult: LayoutRuntimeOpenDrawerDispatchResult;
    resolvedTargetId?: string | null;
}): LayoutRuntimeChildLinkTrace {
    const row = input.rowRecord;
    const resolvedTargetId = input.resolvedTargetId ?? input.openTarget.personId;
    const result =
        input.dispatchResult.ok ? "opened"
        : input.dispatchResult.step === "missing_entity_id" ? "missing_target"
        :   "failed";

    return {
        surface: input.surface,
        clickedRowKey: row?.id != null ? String(row.id) : null,
        customerMemberId: input.openTarget.customerMemberId,
        personId: input.openTarget.personId,
        childId: row?.["child.id"] != null ? String(row["child.id"]) : null,
        resolvedTargetId,
        resolvedFrom: input.openTarget.resolvedFrom,
        drawerRoute: input.dispatchResult.ok ? input.dispatchResult.route : (input.dispatchResult.route ?? null),
        result,
        failurePoint: input.dispatchResult.ok ? undefined : input.dispatchResult.step,
    };
}

export function logLayoutRuntimeChildLinkTrace(trace: LayoutRuntimeChildLinkTrace): void {
    if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
        console.info("[layout-runtime][child-link]", trace);
    }
}

/** @deprecated use logLayoutRuntimeChildLinkTrace */
export function logLayoutRuntimeOpenDrawerTrace(trace: unknown): void {
    if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
        console.info("[layout-runtime][open_drawer]", trace);
    }
}
