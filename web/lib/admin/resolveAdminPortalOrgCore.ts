import type { SupabaseClient } from "@supabase/supabase-js";
import {
    chooseOrgAndRoleKeysFromMembershipRows,
    type ResolvedAdminAccessCore,
} from "@/lib/admin/resolveAdminAccessCore";
import { fetchPortalAdmission, isPortalAdmitted, type PortalAdmission } from "@/lib/admin/portalAdmission";

/*
 * `PORTAL_ROLES` STOOD HERE TOO, byte-for-byte, and that is the reason W-13 states its removal over
 * every module rather than over the file where the literal was first written. `M2-5` is the
 * precedent: `W-20` deleted the legacy fallback from `resolveAdminAccessCore` and this module's
 * re-implementation went on serving `requireAdminOrOps`. A second copy of an admission predicate is
 * not a duplicate — it is a second admission policy that nobody is watching.
 */

export type ResolvedAdminPortalOrgCore = Pick<
    ResolvedAdminAccessCore,
    "orgId" | "roleKeys" | "portalEligible"
> & {
    /**
     * Why `portalEligible` is false, preserved for the caller's diagnostics.
     *
     * `no-capability` and `unresolved` are both refusals and must not be collapsed: one is a
     * decision about this principal's grants, the other is a failure to find out. The gate treats
     * them the same — it must — and the log does not.
     */
    admission: PortalAdmission;
};

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

    /*
     * W-13 — the one place this resolver's "light" contract had to give.
     *
     * It skips the grant union and the scope tables deliberately: 22 count/summary routes pay for
     * this call, and the union fetch is the expensive half. Capability admission needs a grant row
     * nonetheless, so it reads ONE — a single indexed lookup for `portal.access` — rather than
     * resolving the union it exists to avoid. The alternative was to leave this path on the role
     * literal, which would make admission mean two different things in one product.
     */
    const admission = await fetchPortalAdmission(
        supabase,
        picked.orgId,
        picked.roleKeys,
        "resolveAdminPortalOrgCore",
        userId
    );
    return {
        orgId: picked.orgId,
        roleKeys: picked.roleKeys,
        portalEligible: isPortalAdmitted(admission),
        admission,
    };
}
