/**
 * Fast in-page lifecycle work-unit switching — preserve sibling header, swap lane only.
 */

import type { LifecycleSiblingHydrationBlock } from "@/lib/lifecycle/lifecycleWorkUnitSiblingHydration";
import type { LifecycleSiblingWorkUnitNavRow } from "@/lib/lifecycle/lifecycleWorkUnitShellPills";

export type LifecycleWorkUnitSwitchSnapshot = {
    savedAtMs: number;
    work_unit: {
        id: string;
        name: string | null;
        key: string | null;
        department_id: string;
        queue_definition?: unknown;
        metadata?: unknown;
    };
    department: {
        id: string;
        name: string | null;
        key: string | null;
        metadata?: unknown;
    };
    queue_summaries: unknown[];
    work_unit_scope_total?: number | null;
    work_unit_scope_queue_key?: string | null;
    deferred_queue_keys?: string[];
    primary_queue_key?: string | null;
};

const STABLE_SIBLINGS_KEY = "lifecycle_wu_stable_siblings";
const SWITCH_SNAPSHOT_PREFIX = "lifecycle_wu_snap:";
const PRESERVE_SIBLINGS_FLAG = "lifecycle_wu_preserve_siblings";
const IN_PAGE_SWITCH_FLAG = "lifecycle_wu_in_page_switch";

export function setLifecycleInPageWorkUnitSwitchFlag(): void {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(IN_PAGE_SWITCH_FLAG, String(Date.now()));
}

export function hasLifecycleInPageWorkUnitSwitchFlag(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean(sessionStorage.getItem(IN_PAGE_SWITCH_FLAG));
}

export function consumeLifecycleInPageWorkUnitSwitchFlag(): boolean {
    if (typeof window === "undefined") return false;
    const v = sessionStorage.getItem(IN_PAGE_SWITCH_FLAG);
    sessionStorage.removeItem(IN_PAGE_SWITCH_FLAG);
    return Boolean(v);
}

/** Update URL without Next.js navigation — keeps work-unit page mounted. */
export function replaceWorkUnitLocationHref(href: string): void {
    if (typeof window === "undefined") return;
    window.history.replaceState(window.history.state, "", href);
}

function sessionKey(orgId: string, departmentId: string, fingerprint: string, suffix: string): string {
    const fp = fingerprint.trim() || "scope:unknown";
    return `alloy:lifecycle_wu:${suffix}:${orgId}:${departmentId}:${fp}`;
}

export function markLifecycleSiblingListStable(params: {
    orgId: string;
    departmentId: string;
    /** Pass `workspaceViewCacheFingerprint(accessScopeFingerprint, selectedSiteId)`. */
    accessScopeFingerprint: string;
    siblings: LifecycleSiblingWorkUnitNavRow[];
    totalsByWorkUnitId: Record<string, number>;
    hydrationBlock?: LifecycleSiblingHydrationBlock | null;
}): void {
    if (typeof window === "undefined") return;
    const key = sessionKey(params.orgId, params.departmentId, params.accessScopeFingerprint, STABLE_SIBLINGS_KEY);
    try {
        sessionStorage.setItem(
            key,
            JSON.stringify({
                savedAtMs: Date.now(),
                siblings: params.siblings,
                totalsByWorkUnitId: params.totalsByWorkUnitId,
                hydrationBlock: params.hydrationBlock ?? null,
            })
        );
    } catch {
        /* quota */
    }
}

export function readLifecycleSiblingListStable(params: {
    orgId: string;
    departmentId: string;
    /** Pass `workspaceViewCacheFingerprint(accessScopeFingerprint, selectedSiteId)`. */
    accessScopeFingerprint: string;
}): {
    siblings: LifecycleSiblingWorkUnitNavRow[];
    totalsByWorkUnitId: Record<string, number>;
    hydrationBlock: LifecycleSiblingHydrationBlock | null;
} | null {
    if (typeof window === "undefined") return null;
    const key = sessionKey(params.orgId, params.departmentId, params.accessScopeFingerprint, STABLE_SIBLINGS_KEY);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as {
            siblings?: LifecycleSiblingWorkUnitNavRow[];
            totalsByWorkUnitId?: Record<string, number>;
            hydrationBlock?: LifecycleSiblingHydrationBlock | null;
        };
        if (!parsed.siblings?.length) return null;
        return {
            siblings: parsed.siblings,
            totalsByWorkUnitId: parsed.totalsByWorkUnitId ?? {},
            hydrationBlock: parsed.hydrationBlock ?? null,
        };
    } catch {
        return null;
    }
}

export function writeLifecycleWorkUnitSwitchSnapshot(params: {
    orgId: string;
    departmentId: string;
    accessScopeFingerprint: string;
    workUnitId: string;
    snapshot: LifecycleWorkUnitSwitchSnapshot;
}): void {
    if (typeof window === "undefined") return;
    const key = sessionKey(
        params.orgId,
        params.departmentId,
        params.accessScopeFingerprint,
        `${SWITCH_SNAPSHOT_PREFIX}${params.workUnitId}`
    );
    try {
        sessionStorage.setItem(key, JSON.stringify(params.snapshot));
    } catch {
        /* quota */
    }
}

export function readLifecycleWorkUnitSwitchSnapshot(params: {
    orgId: string;
    departmentId: string;
    accessScopeFingerprint: string;
    workUnitId: string;
}): LifecycleWorkUnitSwitchSnapshot | null {
    if (typeof window === "undefined") return null;
    const key = sessionKey(
        params.orgId,
        params.departmentId,
        params.accessScopeFingerprint,
        `${SWITCH_SNAPSHOT_PREFIX}${params.workUnitId}`
    );
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as LifecycleWorkUnitSwitchSnapshot;
    } catch {
        return null;
    }
}

export function setLifecycleWorkUnitSwitchPreserveSiblingsFlag(on: boolean): void {
    if (typeof window === "undefined") return;
    if (on) sessionStorage.setItem(PRESERVE_SIBLINGS_FLAG, String(Date.now()));
    else sessionStorage.removeItem(PRESERVE_SIBLINGS_FLAG);
}

export function peekLifecycleWorkUnitSwitchPreserveSiblingsFlag(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean(sessionStorage.getItem(PRESERVE_SIBLINGS_FLAG));
}

export function consumeLifecycleWorkUnitSwitchPreserveSiblingsFlag(): boolean {
    if (typeof window === "undefined") return false;
    const v = sessionStorage.getItem(PRESERVE_SIBLINGS_FLAG);
    sessionStorage.removeItem(PRESERVE_SIBLINGS_FLAG);
    return Boolean(v);
}

export function logLifecycleWorkUnitPillClick(detail: Record<string, unknown>): void {
    logLifecycleWorkUnitPillTrace(detail);
}

/** Operator/debug trace for lifecycle sibling pill → queue load (always on in development). */
export function logLifecycleWorkUnitPillTrace(detail: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    const force =
        (window as unknown as { __LIFECYCLE_WU_TRACE__?: boolean }).__LIFECYCLE_WU_TRACE__ === true;
    if (process.env.NODE_ENV === "production" && !force) return;
    console.info("[lifecycle-wu-pill-trace]", detail);
}

export function buildWorkUnitHref(params: {
    workspaceBase: string;
    departmentId: string;
    workUnitId: string;
    selectedSiteId: string | null;
}): string {
    const path = `${params.workspaceBase}/dept/${encodeURIComponent(params.departmentId)}/work-unit/${encodeURIComponent(params.workUnitId)}`;
    if (!params.selectedSiteId?.trim()) return path;
    return `${path}?site_id=${encodeURIComponent(params.selectedSiteId.trim())}`;
}
