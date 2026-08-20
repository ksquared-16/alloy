import type { SupabaseClient } from "@supabase/supabase-js";
import {
    chooseOrgAndRoleKeysFromMembershipRows,
    type ResolvedAdminAccessCore,
} from "@/lib/admin/resolveAdminAccessCore";

const PORTAL_ROLES = new Set(["admin", "ops"]);

export type ResolvedAdminPortalOrgCore = Pick<
    ResolvedAdminAccessCore,
    "orgId" | "roleKeys" | "portalEligible"
>;

/**
 * Portal org + role_keys only — skips permission grants and department/site scope tables.
 *
 * **W-20.** This module used to carry a byte-for-byte copy of the legacy fallback (`M2-5`): three
 * reads of `user_profiles.role` and `app_users.role` that could make someone `admin` or `ops`
 * without a membership row. It is gone, and `Q15-A1` is why it could go — on the deployed tenant no
 * principal held authority through it, so deleting it locks nobody out. Membership is the single
 * source: no `user_roles` row means no authority, here and in {@link resolveAdminAccessCore}.
 */
export async function resolveAdminPortalOrgCore(
    supabase: SupabaseClient,
    userId: string
): Promise<ResolvedAdminPortalOrgCore | null> {
    const { data: urRows, error: urErr } = await supabase
        .from("user_roles")
        .select("org_id, role")
        .eq("user_id", userId);

    if (urErr) {
        console.error("[resolveAdminPortalOrgCore] user_roles error:", urErr.message);
        return null;
    }

    const rows = Array.isArray(urRows)
        ? urRows.filter(
              (r) =>
                  r &&
                  typeof (r as { org_id?: unknown }).org_id === "string" &&
                  typeof (r as { role?: unknown }).role === "string"
          ) as { org_id: string; role: string }[]
        : [];

    // No membership is no authority. There is no second place to look.
    const picked = chooseOrgAndRoleKeysFromMembershipRows(rows);
    if (!picked) return null;

    const portalEligible = picked.roleKeys.some((r) => PORTAL_ROLES.has(r));
    return { orgId: picked.orgId, roleKeys: picked.roleKeys, portalEligible };
}
