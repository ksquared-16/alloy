/**
 * Admin API org gate: resolves org_id + compatibility `role` for routes that historically required admin/ops.
 * Builds on `loadAdminAccessBundleCached` so layout/auth/org resolution stay aligned with `getAdminAccessContext`.
 */

import { cache } from "react";
import { NextResponse } from "next/server";
import type { AdminAccessContextFailure } from "@/lib/admin/getAdminAccessContext";
import { logPortalDenied } from "@/lib/admin/portalAdmission";
import { loadAdminAccessBundleCached } from "@/lib/admin/getAdminAccessContext";
import { compatibilityPortalRole } from "@/lib/admin/adminPortalRolePick";

export type AdminContextSuccess = {
    ok: true;
    orgId: string;
    /**
     * Legacy compatibility projection of the role union. It is OUTPUT, never authority.
     *
     * `compatibilityPortalRole` answers `admin` or `ops` and nothing else, so it cannot describe a
     * custom role at all. Any handler deciding what a caller MAY DO reads {@link permissionKeys}.
     */
    role: string;
    /**
     * The caller's effective capabilities — the same union `portalEligible` was resolved from.
     *
     * Carried here so a handler can authorize without asking a second question and getting a second
     * answer, and without a per-request permission query: the bundle already resolved this.
     */
    permissionKeys: string[];
    userId: string;
};

export type AdminContextFailure = {
    ok: false;
    status: 401 | 403;
};

export type AdminContextResult = AdminContextSuccess | AdminContextFailure;

async function loadAdminContext(): Promise<AdminContextResult> {
    try {
        const t0 = Date.now();
        const bundle = await loadAdminAccessBundleCached();
        const authMs = Date.now() - t0;
        if (!bundle.ok) {
            if (bundle.status === 401 && authMs > 400) {
                console.warn("[admin-context-perf] getAdminContext (unauthenticated)", { auth_ms: authMs });
            }
            return bundle;
        }

        if (!bundle.portalEligible) {
            // W-13 — see `loadAdminRouteGate`: reaching here means the grant read succeeded.
            logPortalDenied("getAdminContext", bundle.userId, bundle.orgId, "no-capability");
            return { ok: false, status: 403 };
        }

        const totalMs = Date.now() - t0;
        if (totalMs > 400) {
            console.warn("[admin-context-perf] getAdminContext", {
                total_ms: totalMs,
            });
        }

        return {
            ok: true,
            orgId: bundle.orgId,
            role: compatibilityPortalRole(bundle.roleKeys),
            permissionKeys: bundle.permissionKeys,
            userId: bundle.userId,
        };
    } catch (e) {
        console.error("[getAdminContext] unexpected:", e);
        return { ok: false, status: 403 };
    }
}

const resolveAdminContextOnce = cache(async (): Promise<AdminContextResult> => {
    return loadAdminContext();
});

/**
 * Request-scoped: repeated calls in the same request return the same result with one DB/auth pass.
 */
export async function getAdminContextCached(): Promise<AdminContextResult> {
    return resolveAdminContextOnce();
}

/** @deprecated Use `getAdminContextCached` in new code — behavior is identical (cached). */
export const getAdminContext = getAdminContextCached;

/** JSON error for `getAdminContext` / `getAdminAccessContext` failure (401 / 403). */
export function adminContextFailureResponse(failure: AdminContextFailure | AdminAccessContextFailure): NextResponse {
    const message = failure.status === 401 ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error: message }, { status: failure.status });
}
