import {
    parseWorkspaceSiteIdFromSearchParams,
    WORKSPACE_SITE_QUERY_PARAM,
} from "@/lib/admin/resolveQueueRecordScopeConstraints";

export { WORKSPACE_SITE_QUERY_PARAM };

const SESSION_SCHEMA_V = 1 as const;

export type WorkspaceSiteFilterPersistenceScope = {
    orgId: string | null;
    principalUserId: string | null;
    accessScopeFingerprint: string;
};

let registeredPersistenceScope: WorkspaceSiteFilterPersistenceScope | null = null;
let liveStickyWorkspaceSiteId: string | null = null;

/** Called from workspace layout (under `WorkspaceOrgProvider`) so session keys are principal-scoped. */
export function registerWorkspaceSiteFilterPersistenceScope(scope: WorkspaceSiteFilterPersistenceScope): void {
    registeredPersistenceScope = {
        orgId: scope.orgId?.trim() || null,
        principalUserId: scope.principalUserId?.trim() || null,
        accessScopeFingerprint:
            typeof scope.accessScopeFingerprint === "string" && scope.accessScopeFingerprint.trim()
                ? scope.accessScopeFingerprint.trim()
                : "scope:unknown",
    };
}

/** In-memory sticky site for navigation between full reloads (mirrors context). */
export function setLiveStickyWorkspaceSiteId(siteId: string | null): void {
    liveStickyWorkspaceSiteId = siteId?.trim() || null;
}

export function getLiveStickyWorkspaceSiteId(): string | null {
    return liveStickyWorkspaceSiteId;
}

export function workspaceSiteSessionKey(scope: WorkspaceSiteFilterPersistenceScope): string | null {
    const orgId = scope.orgId?.trim();
    if (!orgId) return null;
    const u = scope.principalUserId?.trim() || "__anon__";
    const fp = scope.accessScopeFingerprint?.trim() || "scope:unknown";
    return `alloy:v${SESSION_SCHEMA_V}:admV2:ws:viewSite:${orgId}:${u}:${fp}`;
}

function readJsonSession(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(key);
        if (raw == null || raw === "") return null;
        const parsed = JSON.parse(raw) as { siteId?: unknown };
        const id = typeof parsed.siteId === "string" ? parsed.siteId.trim() : "";
        return id.length > 0 ? id : null;
    } catch {
        return null;
    }
}

export function readWorkspaceSiteSession(scope: WorkspaceSiteFilterPersistenceScope | null): string | null {
    if (!scope) return null;
    const key = workspaceSiteSessionKey(scope);
    if (!key) return null;
    return readJsonSession(key);
}

export function writeWorkspaceSiteSession(
    scope: WorkspaceSiteFilterPersistenceScope | null,
    siteId: string | null
): void {
    if (typeof window === "undefined" || !scope) return;
    const key = workspaceSiteSessionKey(scope);
    if (!key) return;
    const id = siteId?.trim() || "";
    if (!id) {
        sessionStorage.removeItem(key);
        return;
    }
    sessionStorage.setItem(key, JSON.stringify({ siteId: id, savedAtMs: Date.now() }));
}

export function clearWorkspaceSiteSession(scope: WorkspaceSiteFilterPersistenceScope | null): void {
    writeWorkspaceSiteSession(scope, null);
}

/** Normalize legacy `/admin/v2` paths to `/adminV2`. */
export function normalizeAdminV2Path(pathname: string): string {
    if (pathname === "/admin/v2" || pathname.startsWith("/admin/v2/")) {
        if (pathname === "/admin/v2") return "/adminV2/workspace";
        return `/adminV2${pathname.slice("/admin/v2".length)}`;
    }
    if (pathname === "/adminv2" || pathname.startsWith("/adminv2/")) {
        return `/adminV2${pathname.slice("/adminv2".length)}`;
    }
    return pathname;
}

export function isWorkspaceAreaPath(pathname: string): boolean {
    const p = normalizeAdminV2Path(pathname);
    return p === "/adminV2/workspace" || p.startsWith("/adminV2/workspace/");
}

export function readWorkspaceSiteFromLocationSearch(search: string): string | null {
    if (!search) return null;
    const qs = search.startsWith("?") ? search.slice(1) : search;
    return parseWorkspaceSiteIdFromSearchParams(new URLSearchParams(qs));
}

export function readWorkspaceSiteFromHref(href: string): string | null {
    const qIdx = href.indexOf("?");
    if (qIdx < 0) return null;
    const hashIdx = href.indexOf("#", qIdx);
    const qs = href.slice(qIdx + 1, hashIdx >= 0 ? hashIdx : undefined);
    return readWorkspaceSiteFromLocationSearch(qs);
}

function splitHrefParts(href: string): { path: string; search: string; hash: string } {
    const hashIdx = href.indexOf("#");
    const beforeHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
    const qIdx = beforeHash.indexOf("?");
    if (qIdx < 0) {
        return { path: beforeHash, search: "", hash };
    }
    return {
        path: beforeHash.slice(0, qIdx),
        search: beforeHash.slice(qIdx + 1),
        hash,
    };
}

/** Set or remove `workspace_site_id` on a relative href; preserves other query keys and hash. */
export function appendWorkspaceSiteToPath(path: string, selectedSiteId: string | null | undefined): string {
    const trimmed = path.trim();
    if (!trimmed || trimmed.startsWith("http")) return path;

    const { path: pathname, search, hash } = splitHrefParts(trimmed);
    if (!isWorkspaceAreaPath(pathname)) return path;

    const params = new URLSearchParams(search);
    const siteId = selectedSiteId?.trim() || "";
    if (siteId) {
        params.set(WORKSPACE_SITE_QUERY_PARAM, siteId);
    } else {
        params.delete(WORKSPACE_SITE_QUERY_PARAM);
    }
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ""}${hash}`;
}

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

export function isAllowedWorkspaceSiteId(
    siteId: string | null | undefined,
    allowedSites: Array<{ id: string }>
): boolean {
    const id = siteId?.trim() || "";
    if (!id) return false;
    return allowedSites.some((s) => String(s.id) === id);
}

/** Locked precedence: valid URL → valid session → null. */
export function resolveStickyWorkspaceSiteId(args: {
    urlSiteId: string | null;
    sessionSiteId: string | null;
    allowedSites: Array<{ id: string }>;
}): string | null {
    const allowed = args.allowedSites ?? [];
    const url = args.urlSiteId?.trim() || "";
    if (url && isAllowedWorkspaceSiteId(url, allowed)) return url;
    const session = args.sessionSiteId?.trim() || "";
    if (session && isAllowedWorkspaceSiteId(session, allowed)) return session;
    return null;
}

/**
 * Sticky site for `adminV2CommitNavigation` — URL on workspace path, then live module state, then session.
 */
export function readStickyWorkspaceSiteIdForNavigation(opts?: {
    href?: string;
    explicitSiteId?: string | null;
}): string | null {
    if (opts && "explicitSiteId" in opts && opts.explicitSiteId !== undefined) {
        const explicit = opts.explicitSiteId?.trim() || "";
        return explicit.length > 0 ? explicit : null;
    }
    if (typeof window !== "undefined" && window.location) {
        const fromHref = opts?.href ? readWorkspaceSiteFromHref(opts.href) : null;
        if (fromHref) return fromHref;
        if (isWorkspaceAreaPath(window.location.pathname)) {
            const fromUrl = readWorkspaceSiteFromLocationSearch(window.location.search);
            if (fromUrl) return fromUrl;
        }
    }
    const live = getLiveStickyWorkspaceSiteId();
    if (live) return live;
    return readWorkspaceSiteSession(registeredPersistenceScope);
}

/** Update browser URL without navigation (workspace paths only). */
export function replaceWorkspaceSiteInBrowserUrl(siteId: string | null): void {
    if (typeof window === "undefined") return;
    const pathname = normalizeAdminV2Path(window.location.pathname);
    if (!isWorkspaceAreaPath(pathname)) return;
    const next = appendWorkspaceSiteToPath(`${pathname}${window.location.search}${window.location.hash}`, siteId);
    const nextPath = next.split("#")[0] ?? next;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === nextPath) return;
    window.history.replaceState(window.history.state, "", next);
}
