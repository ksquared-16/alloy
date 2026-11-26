/**
 * Cross-request cache for stable admin access bundle (read/navigation routes).
 * Per-request dedupe remains in `loadAdminAccessBundleOnce` (React cache).
 *
 * One entry per userId (latest resolved portal session). Mutations must not rely
 * on this cache for authorization; call `invalidateAdminShellContextCache` on logout/org switch.
 */

import type { AdminAccessBundle } from "@/lib/admin/getAdminAccessContext";
import { logAdminContextCache } from "@/lib/adminV2/adminContextCacheInstrumentation";
import { processMap } from "@/lib/perf/processCache";

export const ADMIN_SHELL_CONTEXT_CACHE_TTL_MS = 120_000;

type CacheEntry = {
    atMs: number;
    bundle: AdminAccessBundle & { ok: true };
    scopeKey: string;
};

/**
 * Process-wide, not module-scope. This cache exists to span requests (120s TTL), and a module-level
 * Map in a Next production build is per-route-bundle — so each server route kept its own copy and
 * missed the first time it ran. Measured over one session: 15 misses against 103 hits, each miss
 * paying `resolveAdminAccessCore` at ~1.1s, which is the dominant term inside route_meta.
 *
 * Same pattern already corrected for the JWKS, timezone, status-definition and queue-definition
 * caches; see `lib/perf/processCache.ts`.
 */
const cache = processMap<string, CacheEntry>("admin_shell_context");

function userCacheKey(userId: string): string {
    return `shell:${userId}`;
}

/** Scope fingerprint for logs/tests — not the storage key (one bundle per user). */
export function buildAdminShellContextCacheKey(params: {
    userId: string;
    orgId: string;
    roleKeys: string[];
    departmentScope: string;
    siteScope: string;
    allowedDepartmentIds: string[] | null;
    allowedSiteLocationIds: string[] | null;
}): string {
    const dept =
        params.allowedDepartmentIds?.length && params.departmentScope === "restricted"
            ? [...params.allowedDepartmentIds].sort().join(",")
            : "*";
    const sites =
        params.allowedSiteLocationIds?.length && params.siteScope === "restricted"
            ? [...params.allowedSiteLocationIds].sort().join(",")
            : "*";
    const roles = [...params.roleKeys].sort().join(",");
    return `${params.userId}:${params.orgId}:${roles}:${params.departmentScope}:${dept}:${params.siteScope}:${sites}`;
}

export function readAdminShellContextCache(userId: string): (AdminAccessBundle & { ok: true }) | null {
    const entry = cache.get(userCacheKey(userId));
    if (!entry) return null;
    if (Date.now() - entry.atMs > ADMIN_SHELL_CONTEXT_CACHE_TTL_MS) {
        cache.delete(userCacheKey(userId));
        return null;
    }
    logAdminContextCache("hit", {
        cache_key: entry.scopeKey,
        user_id: userId,
        org_id: entry.bundle.orgId,
        age_ms: Date.now() - entry.atMs,
    });
    return entry.bundle;
}

export function writeAdminShellContextCache(bundle: AdminAccessBundle & { ok: true }): void {
    const scopeKey = buildAdminShellContextCacheKey({
        userId: bundle.userId,
        orgId: bundle.orgId,
        roleKeys: bundle.roleKeys,
        departmentScope: bundle.departmentScope,
        siteScope: bundle.siteScope,
        allowedDepartmentIds: bundle.allowedDepartmentIds,
        allowedSiteLocationIds: bundle.allowedSiteLocationIds,
    });
    cache.set(userCacheKey(bundle.userId), { atMs: Date.now(), bundle, scopeKey });
    if (cache.size > 128) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
    }
    logAdminContextCache("miss", { cache_key: scopeKey, user_id: bundle.userId, org_id: bundle.orgId, reason: "resolved_and_stored" });
}

/** Drop cached bundle for a user (logout / org switch hooks). */
export function invalidateAdminShellContextCache(userId?: string): void {
    if (!userId) {
        cache.clear();
        logAdminContextCache("skipped", { reason: "invalidate_all" });
        return;
    }
    cache.delete(userCacheKey(userId));
    logAdminContextCache("skipped", { reason: "invalidate_user", user_id: userId });
}

export function resetAdminShellContextCacheForTests(): void {
    cache.clear();
}
