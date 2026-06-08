/**
 * Canonical CRM access resolver: org, role_keys, permission grants, department/site scope.
 * Request-scoped memoization matches `getAdminContextCached` / `getAdminAuthCached`.
 */

import { cache } from "react";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getCachedAuthUserId } from "@/lib/admin/cachedAuthSession";
import { resolveAdminAccessCore } from "@/lib/admin/resolveAdminAccessCore";
import type { DepartmentScopeMode, SiteScopeMode } from "@/lib/admin/resolveAdminAccessCore";
import {
    readAdminShellContextCache,
    writeAdminShellContextCache,
} from "@/lib/adminV2/adminShellContextCache";

export type { DepartmentScopeMode, SiteScopeMode };

export type AdminAccessContextSuccess = {
    ok: true;
    userId: string;
    orgId: string;
    roleKeys: string[];
    permissionKeys: string[];
    departmentScope: DepartmentScopeMode;
    allowedDepartmentIds: string[] | null;
    siteScope: SiteScopeMode;
    allowedSiteLocationIds: string[] | null;
};

export type AdminAccessContextFailure = {
    ok: false;
    status: 401 | 403;
};

export type AdminAccessContextResult = AdminAccessContextSuccess | AdminAccessContextFailure;

/** Internal bundle includes portal eligibility for `getAdminAuth` / `getAdminContext` adapters. */
export type AdminAccessBundle = AdminAccessContextFailure | (AdminAccessContextSuccess & { portalEligible: boolean });

const loadAdminAccessBundleOnce = cache(async (): Promise<AdminAccessBundle> => {
    const t0 = Date.now();
    try {
        const userId = await getCachedAuthUserId();
        if (!userId) {
            return { ok: false, status: 401 };
        }

        const shellHit = readAdminShellContextCache(userId);
        if (shellHit) {
            return shellHit;
        }

        const admin = createAdminClient();
        const core = await resolveAdminAccessCore(admin, userId);
        if (!core) {
            return { ok: false, status: 403 };
        }

        const { portalEligible, ...rest } = core;
        const bundle: AdminAccessBundle = {
            ok: true,
            userId,
            orgId: rest.orgId,
            roleKeys: rest.roleKeys,
            permissionKeys: rest.permissionKeys,
            departmentScope: rest.departmentScope,
            allowedDepartmentIds: rest.allowedDepartmentIds,
            siteScope: rest.siteScope,
            allowedSiteLocationIds: rest.allowedSiteLocationIds,
            portalEligible,
        };
        if (portalEligible) {
            writeAdminShellContextCache(bundle);
        }
        const totalMs = Date.now() - t0;
        if (totalMs > 400) {
            console.warn("[admin-context-perf] resolveAdminAccessBundle", {
                total_ms: totalMs,
                user_id: userId,
                org_id: rest.orgId,
                shell_cache: "miss",
            });
        }
        return bundle;
    } catch (e) {
        console.error("[loadAdminAccessBundleOnce] unexpected:", e);
        return { ok: false, status: 403 };
    }
});

/**
 * Full bundle including `portalEligible` (admin or ops role_key present).
 * Shared by `getAdminAuthCached` and `getAdminContextCached`.
 */
export async function loadAdminAccessBundleCached(): Promise<AdminAccessBundle> {
    return loadAdminAccessBundleOnce();
}

/**
 * Public access context for handlers that need scope dimensions (no `portalEligible` flag).
 */
export async function getAdminAccessContextCached(): Promise<AdminAccessContextResult> {
    const b = await loadAdminAccessBundleOnce();
    if (!b.ok) return b;
    return {
        ok: true,
        userId: b.userId,
        orgId: b.orgId,
        roleKeys: b.roleKeys,
        permissionKeys: b.permissionKeys,
        departmentScope: b.departmentScope,
        allowedDepartmentIds: b.allowedDepartmentIds,
        siteScope: b.siteScope,
        allowedSiteLocationIds: b.allowedSiteLocationIds,
    };
}

/** @deprecated Prefer `getAdminAccessContextCached` — identical behavior (cached). */
export const getAdminAccessContext = getAdminAccessContextCached;
