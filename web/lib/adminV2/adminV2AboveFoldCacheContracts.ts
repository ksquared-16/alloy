/**
 * Platform-level above-fold cache key contracts for AdminV2 workspace navigation.
 * See docs/sprints/05_2026/adminv2_reveal_doctrine.md and adminv2_above_fold_cache.md.
 */

export const ADMINV2_ABOVE_FOLD_CACHE_TTL_MS = {
    /** Workspace root shell + quick rollup (sessionStorage). */
    workspace_above_fold: 15 * 60 * 1000,
    /** Department page shell + oper bootstrap dedupe. */
    dept_above_fold: 15 * 1000,
    /** Work-unit operational-bootstrap session dedupe. */
    work_unit_above_fold: 15 * 1000,
    /** Drawer primary open gate (dedupe TTL in drawer primary prefetch module). */
    drawer_primary: 30 * 1000,
} as const;

export const ADMINV2_ABOVE_FOLD_CACHE_LIMITS = {
    /** Max department bootstrap prefetches kicked off from workspace idle. */
    workspace_visible_dept_prefetch: 3,
    /** Max drawer_primary idle prefetches per work-unit page (future). */
    work_unit_visible_drawer_prefetch: 5,
} as const;

export type AdminV2AboveFoldCacheKind =
    | "workspace_above_fold"
    | "dept_above_fold"
    | "work_unit_above_fold"
    | "drawer_primary";

export function workspaceAboveFoldCacheKey(params: {
    orgId: string;
    principalUserId: string | null;
    accessScopeFingerprint: string;
}): string {
    const u = (params.principalUserId ?? "").trim() || "__anon__";
    const fp = (params.accessScopeFingerprint ?? "").trim() || "scope:unknown";
    return `workspace_above_fold:${params.orgId}:${u}:${fp}`;
}

export function deptAboveFoldCacheKey(params: {
    orgId: string;
    departmentId: string;
    principalUserId: string | null;
    accessScopeFingerprint: string;
    selectedSiteId?: string | null;
}): string {
    const u = (params.principalUserId ?? "").trim() || "__anon__";
    const fp = (params.accessScopeFingerprint ?? "").trim() || "scope:unknown";
    const site = (params.selectedSiteId ?? "").trim() || "";
    return `dept_above_fold:${params.orgId}:${params.departmentId}:${u}:${fp}:${site}`;
}

export function workUnitAboveFoldCacheKey(params: {
    orgId: string;
    departmentId: string;
    workUnitId: string;
    principalUserId: string | null;
    accessScopeFingerprint: string;
    selectedSiteId?: string | null;
}): string {
    const u = (params.principalUserId ?? "").trim() || "__anon__";
    const fp = (params.accessScopeFingerprint ?? "").trim() || "scope:unknown";
    const site = (params.selectedSiteId ?? "").trim() || "";
    return `work_unit_above_fold:${params.orgId}:${params.departmentId}:${params.workUnitId}:${u}:${fp}:${site}`;
}

export function drawerPrimaryCacheKey(entityType: string, recordId: string): string {
    return `drawer_primary:${entityType}:${recordId}`;
}

/** Safe to cache in sessionStorage / dedupe GET caches. */
export const ADMINV2_CACHEABLE_ABOVE_FOLD_FIELDS = [
    "department list rows",
    "work unit list rows",
    "queue summaries",
    "primary_lane first page (capped)",
    "right_rail_actions",
    "kpi_placements",
    "drawer_primary record shell",
    "workspace quick rollup tile stats",
] as const;

/** Must not be prefetched or cached without strict TTL + invalidation. */
export const ADMINV2_NON_CACHEABLE_ABOVE_FOLD = [
    "surface=full hydrate payloads",
    "workflow automation telemetry",
    "mutation-sensitive policy results",
    "every work unit in large org",
    "every record drawer in a queue page",
    "below-fold automation KPI panels",
] as const;
