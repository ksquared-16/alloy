/**
 * Admin API org gate: resolves org_id + compatibility `role` for routes that historically required admin/ops.
 * Builds on `loadAdminAccessBundleCached` so layout/auth/org resolution stay aligned with `getAdminAccessContext`.
 */

import { cache } from "react";
import { NextResponse } from "next/server";
import { loadAdminAccessBundleCached } from "@/lib/admin/getAdminAccessContext";
import { compatibilityPortalRole } from "@/lib/admin/adminPortalRolePick";

export type AdminContextSuccess = {
    ok: true;
    orgId: string;
    role: string;
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

/** JSON error for `getAdminContext` failure (401 / 403). */
export function adminContextFailureResponse(failure: AdminContextFailure): NextResponse {
    const message = failure.status === 401 ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error: message }, { status: failure.status });
}
