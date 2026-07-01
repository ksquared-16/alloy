/**
 * Report visible link-debug progress from dispatch / drawer open pipeline.
 */

import type { LayoutRuntimeOpenDrawerDispatchResult } from "@/lib/layout/runtime/dispatchLayoutRuntimeOpenDrawer";
import { reportLayoutRuntimeLinkDebugProgress } from "@/lib/layout/runtime/layoutRuntimeLinkDebug";

export function reportLayoutRuntimeLinkDispatchDebug(
    dispatchResult: LayoutRuntimeOpenDrawerDispatchResult,
    opts?: { asyncResolving?: boolean },
): void {
    if (dispatchResult.ok) {
        reportLayoutRuntimeLinkDebugProgress("resolving");
        return;
    }
    if (opts?.asyncResolving || dispatchResult.step === "resolving_person_id") {
        reportLayoutRuntimeLinkDebugProgress("resolving");
        return;
    }
    reportLayoutRuntimeLinkDebugProgress("failed", dispatchResult.step ?? "dispatch_failed");
}

export function reportLayoutRuntimeLinkOpenDrawerCalledDebug(): void {
    reportLayoutRuntimeLinkDebugProgress("drawer_state_updated");
}

export function reportLayoutRuntimeLinkAsyncResultDebug(opened: boolean, reason?: string): void {
    if (opened) {
        reportLayoutRuntimeLinkDebugProgress("drawer_state_updated");
        return;
    }
    reportLayoutRuntimeLinkDebugProgress("failed", reason ?? "async_open_failed");
}

export function reportLayoutRuntimeLinkRenderedDebug(entityType: "person" | "child", personId: string): void {
    void entityType;
    void personId;
    reportLayoutRuntimeLinkDebugProgress("rendered");
}
