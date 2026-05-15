import { WORKSPACE_SITE_QUERY_PARAM } from "@/lib/admin/resolveQueueRecordScopeConstraints";

/** Append view-site filter to an admin API URL (null/empty = all allowed sites). */
export function appendWorkspaceSiteToUrl(url: string, selectedSiteId: string | null | undefined): string {
    const siteId = selectedSiteId?.trim() || "";
    if (!siteId) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}${WORKSPACE_SITE_QUERY_PARAM}=${encodeURIComponent(siteId)}`;
}

/** Extend access-scope cache fingerprint with optional view-site selection. */
export function workspaceViewCacheFingerprint(
    accessScopeFingerprint: string,
    selectedSiteId: string | null | undefined
): string {
    const siteId = selectedSiteId?.trim() || "";
    if (!siteId) return accessScopeFingerprint;
    return `${accessScopeFingerprint};view:${siteId}`;
}
