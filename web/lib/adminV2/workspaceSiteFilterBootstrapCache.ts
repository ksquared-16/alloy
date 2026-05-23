import type { WorkspaceSiteFilterBootstrap } from "@/contexts/WorkspaceSiteFilterContext";
import type { WorkspaceSiteFilterPersistenceScope } from "@/lib/adminV2/workspaceSiteFilterClient";

const SCHEMA_V = 1 as const;
const TTL_MS = 15 * 60 * 1000;

type CachedBootstrap = {
    v: typeof SCHEMA_V;
    savedAtMs: number;
    bootstrap: WorkspaceSiteFilterBootstrap;
};

const memByScopeKey = new Map<string, CachedBootstrap>();

export function workspaceSiteFilterBootstrapScopeKey(
    scope: WorkspaceSiteFilterPersistenceScope | null
): string | null {
    const orgId = scope?.orgId?.trim();
    if (!orgId) return null;
    const u = scope?.principalUserId?.trim() || "__anon__";
    const fp = scope?.accessScopeFingerprint?.trim() || "scope:unknown";
    return `${orgId}|${u}|${fp}`;
}

function sessionStorageKey(scopeKey: string): string {
    return `alloy:v${SCHEMA_V}:admV2:shell:site-filter-bootstrap:${scopeKey}`;
}

function isFresh(entry: CachedBootstrap): boolean {
    return Date.now() - entry.savedAtMs < TTL_MS;
}

export function readWorkspaceSiteFilterBootstrapCache(
    scope: WorkspaceSiteFilterPersistenceScope | null
): WorkspaceSiteFilterBootstrap | null {
    const scopeKey = workspaceSiteFilterBootstrapScopeKey(scope);
    if (!scopeKey) return null;

    const mem = memByScopeKey.get(scopeKey);
    if (mem && isFresh(mem)) return mem.bootstrap;

    if (typeof window === "undefined") return mem?.bootstrap ?? null;

    try {
        const raw = sessionStorage.getItem(sessionStorageKey(scopeKey));
        if (!raw) return mem?.bootstrap ?? null;
        const parsed = JSON.parse(raw) as Partial<CachedBootstrap>;
        if (parsed.v !== SCHEMA_V || !parsed.bootstrap) return mem?.bootstrap ?? null;
        const entry = parsed as CachedBootstrap;
        if (!isFresh(entry)) return mem?.bootstrap ?? null;
        memByScopeKey.set(scopeKey, entry);
        return entry.bootstrap;
    } catch {
        return mem?.bootstrap ?? null;
    }
}

export function writeWorkspaceSiteFilterBootstrapCache(
    scope: WorkspaceSiteFilterPersistenceScope | null,
    bootstrap: WorkspaceSiteFilterBootstrap
): void {
    const scopeKey = workspaceSiteFilterBootstrapScopeKey(scope);
    if (!scopeKey) return;
    const entry: CachedBootstrap = { v: SCHEMA_V, savedAtMs: Date.now(), bootstrap };
    memByScopeKey.set(scopeKey, entry);
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(sessionStorageKey(scopeKey), JSON.stringify(entry));
    } catch {
        /* quota */
    }
}

export function clearWorkspaceSiteFilterBootstrapCacheForOrg(orgId: string): void {
    const prefix = `${orgId.trim()}|`;
    for (const key of [...memByScopeKey.keys()]) {
        if (key.startsWith(prefix)) memByScopeKey.delete(key);
    }
    if (typeof window === "undefined") return;
    try {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k?.includes(`:site-filter-bootstrap:${prefix}`)) sessionStorage.removeItem(k);
        }
    } catch {
        /* ignore */
    }
}
