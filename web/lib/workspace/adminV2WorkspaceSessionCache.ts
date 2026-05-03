/**
 * Session-scoped (sessionStorage) cache for Admin V2 workspace navigation.
 * Intended for shell/stability wins on dept ↔ workspace revisit — always revalidated over the network silently.
 */

import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceRootMetrics } from "@/components/admin/workspace/WorkspaceRootShell";
import type { WorkspaceRootDepartmentRow, WorkspaceRootDeptTileStats } from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";

const SCHEMA_V = 2 as const;

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
};

export type WritableWorkspaceRootSnapshot = Omit<CachedWorkspaceRoot, "v" | "savedAtMs">;

export type CachedDepartmentPage = {
    v: typeof SCHEMA_V;
    savedAtMs: number;
    dept: { id: string; name: string | null; key: string | null };
    workUnits: Array<{ id: string; name: string | null; key: string | null }>;
    workUnitSummaries: Record<string, { total: number; needs_attention: number | null }>;
    summariesComplete: boolean;
};

function workspaceRootKey(orgId: string): string {
    return `alloy:v${SCHEMA_V}:admV2:ws:root:${orgId}`;
}

function departmentPageKey(orgId: string, departmentId: string): string {
    return `alloy:v${SCHEMA_V}:admV2:ws:dept:${orgId}:${departmentId}`;
}

function readJson(raw: string | null): unknown {
    if (raw == null || raw === "") return null;
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

export function readWorkspaceRootCache(orgId: string | null): CachedWorkspaceRoot | null {
    if (!orgId || typeof window === "undefined") return null;
    const data = readJson(sessionStorage.getItem(workspaceRootKey(orgId)));
    if (!data || typeof data !== "object") return null;
    const row = data as Partial<CachedWorkspaceRoot>;
    if (row.v !== SCHEMA_V || !Array.isArray(row.departments)) return null;
    return row as CachedWorkspaceRoot;
}

export function writeWorkspaceRootCache(orgId: string | null, snapshot: WritableWorkspaceRootSnapshot): void {
    if (!orgId || typeof window === "undefined") return;
    try {
        const body: CachedWorkspaceRoot = {
            ...snapshot,
            v: SCHEMA_V,
            savedAtMs: Date.now(),
        };
        sessionStorage.setItem(workspaceRootKey(orgId), JSON.stringify(body));
    } catch {
        /* quota / privacy mode */
    }
}

export type WritableDepartmentPageSnapshot = Omit<CachedDepartmentPage, "v" | "savedAtMs">;

export function readDepartmentPageCache(orgId: string | null, departmentId: string): CachedDepartmentPage | null {
    if (!orgId || !departmentId || typeof window === "undefined") return null;
    const data = readJson(sessionStorage.getItem(departmentPageKey(orgId, departmentId)));
    if (!data || typeof data !== "object") return null;
    const row = data as Partial<CachedDepartmentPage>;
    if (row.v !== SCHEMA_V || !row.dept?.id || !Array.isArray(row.workUnits)) return null;
    return row as CachedDepartmentPage;
}

export function writeDepartmentPageCache(orgId: string | null, payload: WritableDepartmentPageSnapshot): void {
    if (!orgId || !payload.dept?.id || typeof window === "undefined") return;
    try {
        const body: CachedDepartmentPage = {
            ...payload,
            v: SCHEMA_V,
            savedAtMs: Date.now(),
        };
        sessionStorage.setItem(departmentPageKey(orgId, payload.dept.id), JSON.stringify(body));
    } catch {
        /* quota / privacy mode */
    }
}

export function invalidateAdminV2WorkspaceSessionCache(orgId: string | null): void {
    if (!orgId || typeof window === "undefined") return;
    try {
        sessionStorage.removeItem(workspaceRootKey(orgId));
    } catch {
        /* ignore */
    }
}

export function invalidateAdminV2DepartmentSessionCache(orgId: string | null, departmentId: string): void {
    const did = (departmentId ?? "").trim();
    if (!orgId || !did || typeof window === "undefined") return;
    try {
        sessionStorage.removeItem(departmentPageKey(orgId, did));
    } catch {
        /* ignore */
    }
}

export { perfDeptLoad, perfWorkspaceLoad } from "@/lib/perf/adminV2PerfLog";
