/**
 * Temporary dev-only browser trace for child/person layout-runtime link pipeline.
 * Compare `[person-link:*]` vs `[child-link:*]` in console for the same queue row.
 */

import type { LayoutRuntimeChildOpenTarget } from "./resolveLayoutRuntimeChildOpenTarget";

export type ChildLinkSurface = "queue" | "opportunity_drawer";

export type ChildLinkTraceStep =
    | "click"
    | "row"
    | "resolved-target"
    | "dispatch"
    | "open-drawer-called"
    | "drawer-state-updated"
    | "vm-request-start"
    | "vm-request-result"
    | "rendered";

export type PersonLinkTraceStep =
    | "click"
    | "row"
    | "resolved-target"
    | "dispatch"
    | "open-drawer-called"
    | "drawer-state-updated"
    | "vm-request-start"
    | "vm-request-result"
    | "rendered";

function shouldLogLinkTrace(): boolean {
    return typeof window !== "undefined" && process.env.NODE_ENV !== "production";
}

if (shouldLogLinkTrace()) {
    console.info("[child-link:instrumentation-loaded]", { module: "childLinkBrowserTrace" });
}

export function logChildLinkInstrumentationMounted(
    componentName: string,
    meta?: Record<string, unknown>,
): void {
    if (!shouldLogLinkTrace()) return;
    console.info("[child-link:instrumentation-mounted]", { componentName, ...meta });
}

export function logPersonLinkInstrumentationMounted(
    componentName: string,
    meta?: Record<string, unknown>,
): void {
    if (!shouldLogLinkTrace()) return;
    console.info("[person-link:instrumentation-mounted]", { componentName, ...meta });
}

export function summarizeLayoutRuntimeLinkRow(row?: Record<string, unknown> | null) {
    if (!row) {
        return {
            id: null,
            "child.id": null,
            person_id: null,
            "child.person_id": null,
            customer_member_id: null,
            ocm_id: null,
        };
    }
    return {
        id: row.id ?? null,
        "child.id": row["child.id"] ?? null,
        person_id: row.person_id ?? null,
        "child.person_id": row["child.person_id"] ?? null,
        customer_member_id: row.customer_member_id ?? null,
        ocm_id: row.ocm_id ?? null,
    };
}

export function logChildLinkStep(step: ChildLinkTraceStep, data: Record<string, unknown>): void {
    if (!shouldLogLinkTrace()) return;
    console.info(`[child-link:${step}]`, data);
}

export function logPersonLinkStep(step: PersonLinkTraceStep, data: Record<string, unknown>): void {
    if (!shouldLogLinkTrace()) return;
    console.info(`[person-link:${step}]`, data);
}

export function logChildLinkResolvedTarget(input: {
    surface: ChildLinkSurface;
    rowKey: string | null;
    rowRecord?: Record<string, unknown>;
    openTarget: LayoutRuntimeChildOpenTarget;
    resolvedTargetId: string | null;
}) {
    logChildLinkStep("resolved-target", {
        surface: input.surface,
        rowKey: input.rowKey,
        row: summarizeLayoutRuntimeLinkRow(input.rowRecord),
        resolvedTargetId: input.resolvedTargetId,
        targetEntityType: "person",
        resolvedFrom: input.openTarget.resolvedFrom,
        customerMemberId: input.openTarget.customerMemberId,
        ocmId: input.openTarget.ocmId,
    });
}

export function logChildLinkDispatch(input: {
    surface: ChildLinkSurface;
    rowKey: string | null;
    openMethod: string;
    ok: boolean;
    failureReason?: string;
    entityId?: string | null;
}) {
    logChildLinkStep("dispatch", {
        surface: input.surface,
        rowKey: input.rowKey,
        openMethod: input.openMethod,
        success: input.ok,
        failureReason: input.failureReason ?? null,
        resolvedTargetId: input.entityId ?? null,
    });
}
