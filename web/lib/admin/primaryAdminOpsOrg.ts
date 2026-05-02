import type { SupabaseClient } from "@supabase/supabase-js";
import { withDbTiming } from "@/lib/admin/dbQueryTiming";

const ADMIN_OPS_ROLES = ["admin", "ops"] as const;

export type PrimaryAdminOpsMembership = { orgId: string; role: string };

/**
 * Single org + role for admin API scoping when the user has `user_roles` rows.
 * Ordered by `org_id` so multi-org users get a stable choice (matches list/query behavior).
 */
export async function fetchPrimaryAdminOpsMembershipForUser(
    admin: SupabaseClient,
    userId: string
): Promise<PrimaryAdminOpsMembership | null> {
    return withDbTiming("user_roles.primary_admin_ops_membership", { userId }, async () => {
        const { data, error } = await admin
            .from("user_roles")
            .select("org_id, role")
            .eq("user_id", userId)
            .in("role", [...ADMIN_OPS_ROLES])
            .order("org_id", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("[fetchPrimaryAdminOpsMembershipForUser] user_roles error:", error);
            return null;
        }

        const row = data as { org_id?: unknown; role?: unknown } | null;
        if (!row || typeof row.org_id !== "string" || !row.org_id || typeof row.role !== "string") {
            return null;
        }
        if (!ADMIN_OPS_ROLES.includes(row.role as (typeof ADMIN_OPS_ROLES)[number])) {
            return null;
        }
        return { orgId: row.org_id, role: row.role };
    });
}
