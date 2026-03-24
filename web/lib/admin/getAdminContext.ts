/**
 * Resolve admin org context from public.user_roles (membership scoping).
 * Use in admin API routes that need org_id and role.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { createAdminClient } from "@/lib/supabaseAdmin";

const ALLOWED_ROLES = ["admin", "ops"] as const;

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

type UserRoleRow = { org_id?: string | null; role?: string | null };

function pickMembershipRow(rows: UserRoleRow[]): UserRoleRow | null {
    if (!rows.length) return null;
    const allowedWithOrg = rows.filter(
        (r) =>
            r &&
            typeof r.org_id === "string" &&
            r.org_id.length > 0 &&
            typeof r.role === "string" &&
            ALLOWED_ROLES.includes(r.role as (typeof ALLOWED_ROLES)[number])
    );
    return allowedWithOrg[0] ?? null;
}

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
        const rolesRes = await admin.from("user_roles").select("org_id, role").eq("user_id", user.id);

        const roleRows = (Array.isArray(rolesRes.data) ? rolesRes.data : []) as UserRoleRow[];
        if (rolesRes.error) {
            console.error("[getAdminContext] user_roles error:", rolesRes.error);
            return { ok: false, status: 403 };
        }

        const row = pickMembershipRow(roleRows);
        const orgId = row && typeof row.org_id === "string" ? row.org_id : "";
        const role = row && typeof row.role === "string" ? row.role : "";

        if (!row || !orgId) {
            return { ok: false, status: 403 };
        }

        if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
            return { ok: false, status: 403 };
        }

        return {
            ok: true,
            orgId,
            role,
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
