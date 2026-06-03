import { buildAccessScopeCacheFingerprint, type AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

/** Stable scope key for WU queue caches — never JSON.stringify full constraint objects (order/unstable). */
export function buildWorkUnitQueueScopeCacheKey(params: {
    accessDim: AdminAccessScopeDimensions;
    workspaceSiteId: string | null | undefined;
    recordScopeImpossible: boolean;
}): string {
    const fp = buildAccessScopeCacheFingerprint(params.accessDim);
    const view = params.workspaceSiteId?.trim() || "_all";
    const imp = params.recordScopeImpossible ? "imp" : "ok";
    return `${fp}|view:${view}|${imp}`;
}

export function buildWorkUnitBootstrapLoaderCacheKey(params: {
    orgId: string;
    departmentId: string;
    workUnitId: string;
    queueScopeKey: string;
    summariesLimit: number;
    primaryRowLimit: number;
    omitTotalCount: boolean;
    focusQueue: string;
    attentionBucketKey: string;
    deferPrimaryLaneRows: boolean;
    deferLifecycleSiblings: boolean;
    viewerTimezoneIana: string;
    /** e.g. priority:6 — must match loader summaryMode. */
    summariesModeKey: string;
}): string {
    const parts = [
        params.orgId,
        params.departmentId,
        params.workUnitId,
        params.queueScopeKey,
        `sum:${params.summariesModeKey}`,
        `lim:${params.summariesLimit}`,
        `rows:${params.primaryRowLimit}`,
        params.omitTotalCount ? "omit1" : "omit0",
        `fq:${params.focusQueue.trim() || "_"}`,
        `ab:${params.attentionBucketKey.trim() || "_"}`,
        params.deferPrimaryLaneRows ? "defer1" : "defer0",
        params.deferLifecycleSiblings ? "lsib_defer1" : "lsib_defer0",
        `tz:${params.viewerTimezoneIana.trim() || "UTC"}`,
    ];
    return parts.join("\u0001");
}

export function wuBootstrapCacheKeyDigest(cacheKey: string): string {
    let h = 0;
    for (let i = 0; i < cacheKey.length; i++) {
        h = (h * 31 + cacheKey.charCodeAt(i)) | 0;
    }
    return `wu${Math.abs(h).toString(36)}`;
}
