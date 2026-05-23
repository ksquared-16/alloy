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
let lastKnownEntry: CachedBootstrap | null = null;

const SESSION_KEY_PREFIX = `alloy:v${SCHEMA_V}:admV2:shell:site-filter-bootstrap:`;

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
    return `${SESSION_KEY_PREFIX}${scopeKey}`;
}

function rememberLastKnown(entry: CachedBootstrap): void {
    lastKnownEntry = entry;
}

/** Warm navigation when scope is not registered yet (hard reload before workspace layout hydrates). */
export function readLastKnownWorkspaceSiteFilterBootstrap(): WorkspaceSiteFilterBootstrap | null {
    if (lastKnownEntry && isFresh(lastKnownEntry)) return lastKnownEntry.bootstrap;

    if (typeof window === "undefined") return lastKnownEntry?.bootstrap ?? null;

    let best: CachedBootstrap | null = null;
    try {
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (!k?.startsWith(SESSION_KEY_PREFIX)) continue;
            const raw = sessionStorage.getItem(k);
            if (!raw) continue;
            const parsed = JSON.parse(raw) as Partial<CachedBootstrap>;
            if (parsed.v !== SCHEMA_V || !parsed.bootstrap) continue;
            const entry = parsed as CachedBootstrap;
            if (!isFresh(entry)) continue;
            if (!best || entry.savedAtMs > best.savedAtMs) best = entry;
        }
    } catch {
        return lastKnownEntry?.bootstrap ?? null;
    }

    if (best) {
        rememberLastKnown(best);
        return best.bootstrap;
    }
    return lastKnownEntry?.bootstrap ?? null;
}

export function readWorkspaceSiteFilterBootstrapForShell(
    scope: WorkspaceSiteFilterPersistenceScope | null
): WorkspaceSiteFilterBootstrap | null {
    return readWorkspaceSiteFilterBootstrapCache(scope) ?? readLastKnownWorkspaceSiteFilterBootstrap();
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
    const entry: CachedBootstrap = { v: SCHEMA_V, savedAtMs: Date.now(), bootstrap };
    rememberLastKnown(entry);
    const scopeKey = workspaceSiteFilterBootstrapScopeKey(scope);
    if (!scopeKey) return;
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
    lastKnownEntry = null;
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

export function resetWorkspaceSiteFilterBootstrapCacheForTests(): void {
    memByScopeKey.clear();
    lastKnownEntry = null;
}
