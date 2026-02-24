/**
 * Resolve admin org context from public.user_roles (membership scoping).
 * Use in admin API routes and page components that need org_id.
 */

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

/**
 * Get current user and their org + role from user_roles.
 * Returns a result object: { ok: true, orgId, role, userId } or { ok: false, status: 401 | 403 }.
 */
export async function getAdminContext(): Promise<AdminContextResult> {
    const supabaseAuth = await createClient();
    const {
        data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
        return { ok: false, status: 401 };
    }

    const admin = createAdminClient();
    const { data: row, error } = await admin
        .from("user_roles")
        .select("org_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("[getAdminContext] user_roles error:", error);
        return { ok: false, status: 403 };
    }
    if (!row || !(row as { org_id?: string }).org_id) {
        return { ok: false, status: 403 };
    }

    const role = (row as { role?: string }).role ?? "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
        return { ok: false, status: 403 };
    }

    return {
        ok: true,
        orgId: (row as { org_id: string }).org_id,
        role,
        userId: user.id,
    };
}
