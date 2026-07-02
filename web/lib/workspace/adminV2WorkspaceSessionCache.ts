/**
 * Session-scoped (sessionStorage) cache for Admin V2 workspace navigation.
 * Intended for shell/stability wins on dept ↔ workspace revisit — always revalidated over the network silently.
 */

import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceRootMetrics } from "@/lib/workspace/workspaceRootMetrics";
import type { WorkspaceRootDepartmentRow, WorkspaceRootDeptTileStats } from "@/lib/workspace/workspaceRootDepartmentTypes";

const SCHEMA_V = 6 as const;

export type CachedWorkspaceRoot = {
    v: typeof SCHEMA_V;
    savedAtMs: number;
    departments: WorkspaceRootDepartmentRow[];
    deptTileStats: WorkspaceRootDeptTileStats;
    metrics: WorkspaceRootMetrics;
    orgOpportunityKpis: KPIVm[] | null;
    /** Serialized undefined as missing key uses `undefined` on read. */
    workspaceKpiStrip?: KPIVm[] | undefined;
    kpiPlacementPending: boolean;
    rollupRefined: boolean;
    /** Lifecycle landing cards — instant /workspace return without tile skeleton. */
    lifecycleCards?: OperatorLifecycleLandingCard[];
};

export type WritableWorkspaceRootSnapshot = Omit<CachedWorkspaceRoot, "v" | "savedAtMs">;

/**
 * Minimal attention bucket shape stored in the dept session cache.
 * Intentionally avoids importing the DeptAttentionBucket component type to keep this module
 * infrastructure-only and free of page-level type coupling.
 */
export type CachedDeptAttentionBucket = {
    key: string;
    label: string;
    description: string | null;
    count: number;
    reason_codes: string[];
    order?: number;
    priority?: number;
    icon?: string | null;
};

export type CachedDepartmentPage = {
    v: typeof SCHEMA_V;
    savedAtMs: number;
    dept: { id: string; name: string | null; key: string | null };
    workUnits: Array<{
        id: string;
        name: string | null;
        key: string | null;
        sort_order?: number | null;
        metadata?: unknown;
    }>;
    workUnitSummaries: Record<string, { total: number; needs_attention: number | null }>;
    summariesComplete: boolean;
    /**
     * Attention buckets from the last bootstrap. Stored for immediate first-paint on warm
     * navigation — avoids loading-gate while waiting for the operational bootstrap to re-fetch.
     */
    attentionBuckets?: CachedDeptAttentionBucket[] | null;
    attentionPreviewTotal?: number | null;
    /**
     * KPI placement rows from the last bootstrap. Stored so `deptPlacementRows !== undefined`
     * is satisfied immediately from cache, allowing the KPI strip to render without a network round-trip.
     */
    kpiPlacementRows?: unknown[] | null;
    kpiScopeHasPlacements?: boolean;
};

export type CachedWorkUnitPage = {
    v: typeof SCHEMA_V;
    savedAtMs: number;
    departmentId: string;
    dept: { id: string; name: string | null; key: string | null };
    workUnit: {
        id: string;
        name: string | null;
        key: string | null;
        department_id: string;
        queue_definition?: unknown;
        metadata?: unknown;
    };
};

function workspaceRootKey(orgId: string, principalUserId: string | null, accessScopeFingerprint: string): string {
    const u = (principalUserId ?? "").trim() || "__anon__";
    const fp = (accessScopeFingerprint ?? "").trim() || "scope:unknown";
    return `alloy:v${SCHEMA_V}:admV2:ws:root:${orgId}:${u}:${fp}`;
}

function departmentPageKey(
    orgId: string,
    departmentId: string,
    principalUserId: string | null,
    accessScopeFingerprint: string
): string {
    const u = (principalUserId ?? "").trim() || "__anon__";
    const fp = (accessScopeFingerprint ?? "").trim() || "scope:unknown";
    return `alloy:v${SCHEMA_V}:admV2:ws:dept:${orgId}:${departmentId}:${u}:${fp}`;
}

function workUnitPageKey(
    orgId: string,
    departmentId: string,
    workUnitId: string,
    principalUserId: string | null,
    accessScopeFingerprint: string
): string {
    const u = (principalUserId ?? "").trim() || "__anon__";
    const fp = (accessScopeFingerprint ?? "").trim() || "scope:unknown";
    return `alloy:v${SCHEMA_V}:admV2:ws:wu:${orgId}:${departmentId}:${workUnitId}:${u}:${fp}`;
}

function readJson(raw: string | null): unknown {
    if (raw == null || raw === "") return null;
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

export function readWorkspaceRootCache(
    orgId: string | null,
    principalUserId: string | null,
    accessScopeFingerprint: string
): CachedWorkspaceRoot | null {
    if (!orgId || typeof window === "undefined") return null;
    const fp = (accessScopeFingerprint ?? "").trim() || "scope:unknown";
    const data = readJson(sessionStorage.getItem(workspaceRootKey(orgId, principalUserId, fp)));
    if (!data || typeof data !== "object") return null;
    const row = data as Partial<CachedWorkspaceRoot>;
    if (row.v !== SCHEMA_V || !Array.isArray(row.departments)) return null;
    return row as CachedWorkspaceRoot;
}

/** First matching workspace root snapshot for this org + principal (any access-scope key). */
export function findWorkspaceRootCacheForPrincipal(
    orgId: string | null,
    principalUserId: string | null
): CachedWorkspaceRoot | null {
    if (!orgId || typeof window === "undefined") return null;
    const u = (principalUserId ?? "").trim() || "__anon__";
    const prefix = `alloy:v${SCHEMA_V}:admV2:ws:root:${orgId}:${u}:`;
    try {
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (!k?.startsWith(prefix)) continue;
            const data = readJson(sessionStorage.getItem(k));
            if (!data || typeof data !== "object") continue;
            const row = data as Partial<CachedWorkspaceRoot>;
            if (row.v !== SCHEMA_V || !Array.isArray(row.departments)) continue;
            return row as CachedWorkspaceRoot;
        }
    } catch {
        /* ignore */
    }
    return null;
}

export function writeWorkspaceRootCache(
    orgId: string | null,
    principalUserId: string | null,
    accessScopeFingerprint: string,
    snapshot: WritableWorkspaceRootSnapshot
): void {
    if (!orgId || typeof window === "undefined") return;
    const fp = (accessScopeFingerprint ?? "").trim() || "scope:unknown";
    try {
        const body: CachedWorkspaceRoot = {
            ...snapshot,
            v: SCHEMA_V,
            savedAtMs: Date.now(),
        };
        sessionStorage.setItem(workspaceRootKey(orgId, principalUserId, fp), JSON.stringify(body));
    } catch {
        /* quota / privacy mode */
    }
}

export type WritableDepartmentPageSnapshot = Omit<CachedDepartmentPage, "v" | "savedAtMs">;

/**
 * Read department page session cache.
 * Pass `workspaceViewCacheFingerprint(accessScopeFingerprint, selectedSiteId)` so
 * `workUnitSummaries` match the active workspace site filter.
 */
export function readDepartmentPageCache(
    orgId: string | null,
    departmentId: string,
    principalUserId: string | null,
    accessScopeFingerprint: string
): CachedDepartmentPage | null {
    if (!orgId || !departmentId || typeof window === "undefined") return null;
    const fp = (accessScopeFingerprint ?? "").trim() || "scope:unknown";
    const data = readJson(sessionStorage.getItem(departmentPageKey(orgId, departmentId, principalUserId, fp)));
    if (!data || typeof data !== "object") return null;
    const row = data as Partial<CachedDepartmentPage>;
    if (row.v !== SCHEMA_V || !row.dept?.id || !Array.isArray(row.workUnits)) return null;
    return row as CachedDepartmentPage;
}

export type WritableWorkUnitPageSnapshot = Omit<CachedWorkUnitPage, "v" | "savedAtMs">;

export function readWorkUnitPageCache(
    orgId: string | null,
    departmentId: string,
    workUnitId: string,
    principalUserId: string | null,
    accessScopeFingerprint: string
): CachedWorkUnitPage | null {
    if (!orgId || !departmentId || !workUnitId || typeof window === "undefined") return null;
    const fp = (accessScopeFingerprint ?? "").trim() || "scope:unknown";
    const data = readJson(sessionStorage.getItem(workUnitPageKey(orgId, departmentId, workUnitId, principalUserId, fp)));
    if (!data || typeof data !== "object") return null;
    const row = data as Partial<CachedWorkUnitPage>;
    if (row.v !== SCHEMA_V || row.departmentId !== departmentId || row.workUnit?.id !== workUnitId) return null;
    return row as CachedWorkUnitPage;
}

export function writeWorkUnitPageCache(
    orgId: string | null,
    principalUserId: string | null,
    accessScopeFingerprint: string,
    payload: WritableWorkUnitPageSnapshot
): void {
    if (!orgId || !payload.departmentId || !payload.workUnit?.id || typeof window === "undefined") return;
    const fp = (accessScopeFingerprint ?? "").trim() || "scope:unknown";
    try {
        const body: CachedWorkUnitPage = {
            ...payload,
            v: SCHEMA_V,
            savedAtMs: Date.now(),
        };
        sessionStorage.setItem(
            workUnitPageKey(orgId, payload.departmentId, payload.workUnit.id, principalUserId, fp),
            JSON.stringify(body)
        );
    } catch {
        /* quota / privacy mode */
    }
}

/**
 * Write department page session cache.
 * Pass `workspaceViewCacheFingerprint(accessScopeFingerprint, selectedSiteId)` so
 * `workUnitSummaries` are not shared across site selections.
 */
export function writeDepartmentPageCache(
    orgId: string | null,
    principalUserId: string | null,
    accessScopeFingerprint: string,
    payload: WritableDepartmentPageSnapshot
): void {
    if (!orgId || !payload.dept?.id || typeof window === "undefined") return;
    const fp = (accessScopeFingerprint ?? "").trim() || "scope:unknown";
    try {
        const body: CachedDepartmentPage = {
            ...payload,
            v: SCHEMA_V,
            savedAtMs: Date.now(),
        };
        sessionStorage.setItem(departmentPageKey(orgId, payload.dept.id, principalUserId, fp), JSON.stringify(body));
    } catch {
        /* quota / privacy mode */
    }
}

export function invalidateAdminV2WorkspaceSessionCache(
    orgId: string | null,
    principalUserId: string | null = null,
    accessScopeFingerprint?: string | null
): void {
    if (!orgId || typeof window === "undefined") return;
    try {
        if (accessScopeFingerprint != null && String(accessScopeFingerprint).trim()) {
            sessionStorage.removeItem(workspaceRootKey(orgId, principalUserId, String(accessScopeFingerprint).trim()));
            return;
        }
        const prefix = `alloy:v${SCHEMA_V}:admV2:ws:root:${orgId}:`;
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith(prefix)) sessionStorage.removeItem(k);
        }
    } catch {
        /* ignore */
    }
}

export function invalidateAdminV2DepartmentSessionCache(
    orgId: string | null,
    departmentId: string,
    principalUserId: string | null = null,
    accessScopeFingerprint?: string | null
): void {
    const did = (departmentId ?? "").trim();
    if (!orgId || !did || typeof window === "undefined") return;
    try {
        if (accessScopeFingerprint != null && String(accessScopeFingerprint).trim()) {
            sessionStorage.removeItem(
                departmentPageKey(orgId, did, principalUserId, String(accessScopeFingerprint).trim())
            );
            return;
        }
        const prefix = `alloy:v${SCHEMA_V}:admV2:ws:dept:${orgId}:${did}:`;
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith(prefix)) sessionStorage.removeItem(k);
        }
    } catch {
        /* ignore */
    }
}

export { perfDeptLoad, perfWorkspaceLoad } from "@/lib/perf/adminV2PerfLog";
