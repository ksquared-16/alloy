/**
 * Admin portal auth: same membership + legacy resolution path as `getAdminAccessContext`.
 * Portal shell requires admin or ops role_key (or legacy profile/app_users admin|ops without membership).
 *
 * `getAdminAuth` / `getAdminAuthCached` are request-scoped memoized (React `cache()`).
 */

import { cache } from "react";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { loadAdminAccessBundleCached } from "@/lib/admin/getAdminAccessContext";
import { compatibilityPortalRole } from "@/lib/admin/adminPortalRolePick";
import { getCachedAuthUser, getCachedAuthUserId } from "@/lib/admin/cachedAuthSession";
import {
    adminOrgContextLightFailureResponse,
    getAdminOrgContextLightCached,
} from "@/lib/admin/getAdminOrgContextLight";

const ALLOWED_ROLES = ["admin", "ops"] as const;
export type AdminRole = (typeof ALLOWED_ROLES)[number];

export interface AdminAuthResult {
    user: User;
    /** Compat role: `admin` if any membership key is `admin`, else `ops`. */
    role: string;
    /** Raw `user_roles.role` keys for the resolved org — authoritative for admin-vs-ops mutate gates. */
    roleKeys: string[];
    /** Primary org from {@link resolveAdminAccessCore} — same id used by Settings → Users & Roles members API. */
    orgId: string;
}

async function loadAdminAuth(): Promise<AdminAuthResult | null> {
    const t0 = Date.now();
    const tAuth0 = Date.now();
    const userId = await getCachedAuthUserId();
    const authUserMs = Date.now() - tAuth0;
    if (!userId) return null;

    const t1 = Date.now();
    const bundle = await loadAdminAccessBundleCached();
    const bundleMs = Date.now() - t1;

    if (!bundle.ok || !bundle.portalEligible) {
        return null;
    }

    const user = await getCachedAuthUser();
    if (!user?.id) return null;

    const role = compatibilityPortalRole(bundle.roleKeys);

    const totalMs = Date.now() - t0;
    if (totalMs > 400) {
        console.warn("[admin-context-perf] getAdminAuth", {
            auth_lookup_ms: authUserMs,
            bundle_resolve_ms: bundleMs,
            total_ms: totalMs,
        });
    }
    return { user, role, roleKeys: bundle.roleKeys, orgId: bundle.orgId };
}

const resolveAdminAuthOnce = cache(async (): Promise<AdminAuthResult | null> => {
    const t0 = Date.now();
    const result = await loadAdminAuth();
    console.log("[admin-context]", {
        cache_hit: false,
        duration_ms: Date.now() - t0,
    });
    return result;
});

const adminAuthInvocationCounter = cache(() => ({ n: 0 }));

/**
 * Request-scoped: repeated calls in the same handler request share one role resolution pass.
 */
export async function getAdminAuthCached(): Promise<AdminAuthResult | null> {
    const ctr = adminAuthInvocationCounter();
    ctr.n += 1;
    const out = await resolveAdminAuthOnce();
    if (ctr.n > 1) {
        console.log("[admin-context]", {
            cache_hit: true,
            duration_ms: 0,
        });
    }
    return out;
}

/** @deprecated Use `getAdminAuthCached` in new code — behavior is identical (cached). */
export const getAdminAuth = getAdminAuthCached;

/**
 * Use in mutation routes (POST/PATCH/DELETE). Returns a 401/403 Response if not allowed; otherwise null (caller proceeds).
 * 401 if not logged in or no valid profile; 403 if role !== admin.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
    const auth = await getAdminAuth();
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
}

/**
 * Use in PATCH routes that both admin and ops can call (opportunities, jobs, contacts, customers, schedules).
 *
 * **Does not check a role, and does not call `getAdminAuth`.** It resolves through
 * `getAdminOrgContextLightCached` → `resolveAdminPortalOrgCore` — a *different* resolver from the
 * one `requireAdmin` and `getAdminContextCached` use (`M2-13`: two gates in one request can
 * disagree about the same principal; `W-41` consolidates them and needs `AD-12`).
 *
 * Returns **401** with no session, **403** when the principal is not portal-eligible, otherwise
 * `null`. The name reflects "portal user allowed", not "verify ops" — it never branches on the
 * compatibility `role` string.
 *
 * The comment this replaces claimed "403 if role not in (admin, ops)", a gate that is nowhere in
 * this body. Prefer `loadAdminRouteGate` for new routes, which resolves capabilities and scope too.
 */
export async function requireAdminOrOps(): Promise<NextResponse | null> {
    const ctx = await getAdminOrgContextLightCached();
    if (!ctx.ok) {
        return adminOrgContextLightFailureResponse(ctx);
    }
    return null;
}

export { logAdminAudit } from "@/lib/admin/adminAuditLog";
