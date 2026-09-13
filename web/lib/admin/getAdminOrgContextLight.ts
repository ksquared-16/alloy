/**
 * Lightweight admin portal context for count/summary routes.
 * Resolves authenticated userId + primary orgId + portal admission only —
 * no full permission grant union and no department/site scope dimensions.
 *
 * W-13: "portal eligibility" here is the `portal.access` capability, read for this org, not a role
 * name. The one grant row it costs is the price of this path answering the same question the full
 * resolver answers.
 */

import { cache } from "react";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getCachedAuthUserId } from "@/lib/admin/cachedAuthSession";
import { resolveAdminPortalOrgCore } from "@/lib/admin/resolveAdminPortalOrgCore";
import { compatibilityPortalRole } from "@/lib/admin/adminPortalRolePick";

export type AdminOrgContextLightSuccess = {
    ok: true;
    userId: string;
    orgId: string;
    /** Compat admin|ops role for mutation gates that only need portal tier. */
    role: string;
    roleKeys: string[];
};

export type AdminOrgContextLightFailure = {
    ok: false;
    status: 401 | 403;
};

export type AdminOrgContextLightResult = AdminOrgContextLightSuccess | AdminOrgContextLightFailure;

const loadAdminOrgContextLightOnce = cache(async (): Promise<AdminOrgContextLightResult> => {
    const t0 = Date.now();
    let authMs = 0;
    let portalMs = 0;

    const tAuth0 = Date.now();
    const userId = await getCachedAuthUserId();
    authMs = Date.now() - tAuth0;
    if (!userId) {
        return { ok: false, status: 401 };
    }

    try {
        const tPortal0 = Date.now();
        const admin = createAdminClient();
        const core = await resolveAdminPortalOrgCore(admin, userId);
        portalMs = Date.now() - tPortal0;

        if (!core) {
            return { ok: false, status: 403 };
        }
        if (!core.portalEligible) {
            /*
             * W-13 — both outcomes are 403, and the line below is the only place they stay apart.
             * `no-capability` is an answer about this principal's grants; `unresolved` is a failed
             * read that already logged itself through the W-43 channel. An operator debugging a
             * lockout needs to know which one they are looking at, and the HTTP status cannot tell
             * them.
             */
            console.warn(
                `[access-identity][W-13][portal-denied] where=getAdminOrgContextLight ` +
                    `user_id=${userId} org_id=${core.orgId} reason=${core.admission}`
            );
            return { ok: false, status: 403 };
        }

        const totalMs = Date.now() - t0;
        if (totalMs > 250) {
            console.warn("[admin-portal-context-perf] getAdminOrgContextLight", {
                auth_ms: authMs,
                portal_org_ms: portalMs,
                total_ms: totalMs,
                full_context_avoided: true,
            });
        }

        return {
            ok: true,
            userId,
            orgId: core.orgId,
            role: compatibilityPortalRole(core.roleKeys),
            roleKeys: core.roleKeys,
        };
    } catch (e) {
        console.error("[getAdminOrgContextLight] unexpected:", e);
        return { ok: false, status: 403 };
    }
});

/**
 * Request-scoped: one auth user lookup + portal org resolution (no permission/scope tables).
 */
export async function getAdminOrgContextLightCached(): Promise<AdminOrgContextLightResult> {
    return loadAdminOrgContextLightOnce();
}

export function adminOrgContextLightFailureResponse(failure: AdminOrgContextLightFailure): NextResponse {
    const message = failure.status === 401 ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error: message }, { status: failure.status });
}

/**
 * Single gate for lightweight routes — replaces `requireAdminOrOps` + `getAdminContextCached`.
 */
export async function requireAdminOrgContextLight(): Promise<
    AdminOrgContextLightSuccess | NextResponse
> {
    const ctx = await getAdminOrgContextLightCached();
    if (!ctx.ok) {
        return adminOrgContextLightFailureResponse(ctx);
    }
    return ctx;
}
