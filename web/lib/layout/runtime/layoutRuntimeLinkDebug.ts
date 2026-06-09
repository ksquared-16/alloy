/**
 * Visible in-app diagnostics for layout-runtime person/child drawer links.
 * Enable with NEXT_PUBLIC_LAYOUT_RUNTIME_LINK_DEBUG=1
 */

import { isSyntheticLayoutRuntimeRowId } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import type { LayoutRuntimeChildOpenTarget } from "@/lib/layout/runtime/resolveLayoutRuntimeChildOpenTarget";

export function isLayoutRuntimeLinkDebugEnabled(): boolean {
    return process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_LINK_DEBUG === "1";
}

export type LayoutRuntimeLinkSurface = "queue" | "drawer";

export type LayoutRuntimeLinkEntityType = "person" | "child";

export type LayoutRuntimeLinkTargetIdType =
    | "person_id"
    | "customer_member_id"
    | "synthetic"
    | "missing";

export type LayoutRuntimeLinkClickResult =
    | "not_clicked"
    | "clicked"
    | "resolving"
    | "drawer_state_updated"
    | "rendered"
    | "failed";

export type LayoutRuntimeChildRowDebugSummary = {
    id: string | null;
    "child.id": string | null;
    person_id: string | null;
    customer_member_id: string | null;
    ocm_id: string | null;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    mapperSource: string | null;
    collectionKey: string | null;
    rowJson: string | null;
};

export type LayoutRuntimeLinkDebugEntry = {
    debugKey: string;
    surface: LayoutRuntimeLinkSurface;
    entityType: LayoutRuntimeLinkEntityType;
    linkable: boolean;
    handlerAttached: boolean;
    targetId: string | null;
    targetIdType: LayoutRuntimeLinkTargetIdType;
    routeMethod: string;
    lastClickResult: LayoutRuntimeLinkClickResult;
    failureReason: string | null;
    componentName: string;
    rowKey: string | null;
    childRowSummary: LayoutRuntimeChildRowDebugSummary | null;
    updatedAt: number;
};

export function buildLayoutRuntimeLinkDebugKey(input: {
    surface: LayoutRuntimeLinkSurface;
    entityType: LayoutRuntimeLinkEntityType;
    rowKey?: string | null;
    refKey?: string;
    componentName: string;
}): string {
    const rowPart = input.rowKey?.trim() || input.refKey?.trim() || "anchor";
    return `${input.surface}:${input.entityType}:${rowPart}:${input.componentName}`;
}

export function resolveLayoutRuntimeLinkRouteMethod(
    surface: LayoutRuntimeLinkSurface,
    entityType: LayoutRuntimeLinkEntityType,
): string {
    if (entityType === "child") {
        return surface === "queue"
            ? "dispatchLayoutRuntimeOpenDrawer → queueAdapter.onOpenChild → openWorkUnitQueueChildDrawer"
            : "dispatchLayoutRuntimeOpenDrawer → useAdminDrawer.openDrawer → openViewPersonFromOpportunity:child";
    }
    return surface === "queue"
        ? "dispatchLayoutRuntimeOpenDrawer → queueAdapter.onOpenPerson → openWorkUnitQueuePersonDrawer"
        : "dispatchLayoutRuntimeOpenDrawer → useAdminDrawer.openDrawer → openViewPersonFromOpportunity:person";
}

export function classifyLayoutRuntimeLinkTargetIdType(input: {
    entityType: LayoutRuntimeLinkEntityType;
    targetId: string | null;
    childOpenTarget?: LayoutRuntimeChildOpenTarget | null;
}): LayoutRuntimeLinkTargetIdType {
    const targetId = input.targetId?.trim() ?? "";
    const personId = input.childOpenTarget?.personId?.trim() ?? "";
    const memberId = input.childOpenTarget?.customerMemberId?.trim() ?? "";

    if (input.entityType === "person") {
        if (!targetId) return "missing";
        if (isSyntheticLayoutRuntimeRowId(targetId)) return "synthetic";
        return "person_id";
    }

    if (personId && !isSyntheticLayoutRuntimeRowId(personId)) return "person_id";
    if (targetId && !isSyntheticLayoutRuntimeRowId(targetId)) {
        if (memberId && targetId === memberId) return "customer_member_id";
        return "person_id";
    }
    if (memberId) return "customer_member_id";
    if (targetId && isSyntheticLayoutRuntimeRowId(targetId)) return "synthetic";
    return "missing";
}

export function formatLayoutRuntimeLinkClickResult(entry: LayoutRuntimeLinkDebugEntry): string {
    if (entry.lastClickResult === "failed") {
        return entry.failureReason ? `failed: ${entry.failureReason}` : "failed";
    }
    return entry.lastClickResult;
}

type Listener = () => void;

const entries = new Map<string, LayoutRuntimeLinkDebugEntry>();
const listeners = new Set<Listener>();
let activeDebugKey: string | null = null;

function emit(): void {
    for (const listener of listeners) listener();
}

function clientDebugEnabled(): boolean {
    if (!isLayoutRuntimeLinkDebugEnabled()) return false;
    if (typeof window !== "undefined") return true;
    return process.env.NODE_ENV === "test";
}

export function registerLayoutRuntimeLinkDebug(
    entry: Omit<LayoutRuntimeLinkDebugEntry, "updatedAt" | "lastClickResult" | "failureReason"> & {
        lastClickResult?: LayoutRuntimeLinkClickResult;
        failureReason?: string | null;
    },
): void {
    if (!clientDebugEnabled()) return;
    entries.set(entry.debugKey, {
        ...entry,
        childRowSummary: entry.childRowSummary ?? null,
        lastClickResult: entry.lastClickResult ?? "not_clicked",
        failureReason: entry.failureReason ?? null,
        updatedAt: Date.now(),
    });
    emit();
}

export function setActiveLayoutRuntimeLinkDebugKey(debugKey: string | null): void {
    if (!clientDebugEnabled()) return;
    activeDebugKey = debugKey;
}

export function getActiveLayoutRuntimeLinkDebugKey(): string | null {
    return activeDebugKey;
}

export function reportLayoutRuntimeLinkDebugProgress(
    result: LayoutRuntimeLinkClickResult,
    reason?: string | null,
    debugKey?: string | null,
): void {
    if (!clientDebugEnabled()) return;
    const key = debugKey ?? activeDebugKey;
    if (!key) return;
    const existing = entries.get(key);
    if (!existing) return;

    entries.set(key, {
        ...existing,
        lastClickResult: result,
        failureReason:
            result === "failed" ? (reason ?? existing.failureReason ?? "unknown") :
            result === "rendered" ? null
            : existing.failureReason,
        updatedAt: Date.now(),
    });

    if (result === "rendered" || result === "failed") {
        activeDebugKey = null;
    }
    emit();
}

export function subscribeLayoutRuntimeLinkDebug(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getLayoutRuntimeLinkDebugEntry(debugKey: string): LayoutRuntimeLinkDebugEntry | undefined {
    return entries.get(debugKey);
}

export function getLayoutRuntimeLinkDebugSnapshot(): LayoutRuntimeLinkDebugEntry[] {
    return [...entries.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
