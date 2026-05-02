/**
 * Resolve admin org context from public.user_roles (membership scoping).
 * Use in admin API routes that need org_id and role.
 *
 * Request-scoped memoization: `getAdminContext` and `getAdminContextCached` are the same
 * function — React `cache()` dedupes work within a single request (no cross-request leakage).
 */

import { cache } from "react";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchPrimaryAdminOpsMembershipForUser } from "@/lib/admin/primaryAdminOpsOrg";
import { getCachedAuthUserId } from "@/lib/admin/cachedAuthSession";

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
        const userId = await getCachedAuthUserId();
        const authMs = Date.now() - t0;
        if (!userId) {
            return { ok: false, status: 401 };
        }

        const t1 = Date.now();
        const admin = createAdminClient();
        const membership = await fetchPrimaryAdminOpsMembershipForUser(admin, userId);
        const membershipMs = Date.now() - t1;
        if (!membership) {
            if (authMs + membershipMs > 400) {
                console.warn("[admin-context-perf] getAdminContext (no membership)", {
                    auth_claims_or_user_ms: authMs,
                    membership_ms: membershipMs,
                });
            }
            return { ok: false, status: 403 };
        }

        const totalMs = Date.now() - t0;
        if (totalMs > 400) {
            console.warn("[admin-context-perf] getAdminContext", {
                auth_claims_or_user_ms: authMs,
                user_roles_membership_ms: membershipMs,
                total_ms: totalMs,
            });
        }

        return {
            ok: true,
            orgId: membership.orgId,
            role: membership.role,
            userId,
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
