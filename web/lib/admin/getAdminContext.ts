/**
 * Resolve admin org context from public.user_roles (membership scoping).
 * Use in admin API routes that need org_id and role.
 */

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

/**
 * Get current user and their org + role from user_roles.
 * Returns { ok: true, orgId, role, userId } or { ok: false, status: 401 | 403 }.
 */
export async function getAdminContext(): Promise<AdminContextResult> {
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

/** JSON error for `getAdminContext` failure (401 / 403). */
export function adminContextFailureResponse(failure: AdminContextFailure): NextResponse {
    const message = failure.status === 401 ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error: message }, { status: failure.status });
}
