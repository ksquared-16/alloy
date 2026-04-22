/**
 * Resolve admin org context from public.user_roles (membership scoping).
 * Use in admin API routes that need org_id and role.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchPrimaryAdminOpsMembershipForUser } from "@/lib/admin/primaryAdminOpsOrg";

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
        const supabaseAuth = await createClient();
        const { data: authData } = await supabaseAuth.auth.getUser();
        const user = authData?.user;
        if (!user?.id) {
            return { ok: false, status: 401 };
        }

        const admin = createAdminClient();
        const membership = await fetchPrimaryAdminOpsMembershipForUser(admin, user.id);
        if (!membership) {
            return { ok: false, status: 403 };
        }

        return {
            ok: true,
            orgId: membership.orgId,
            role: membership.role,
            userId: user.id,
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
