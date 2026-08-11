import type { SupabaseClient } from "@supabase/supabase-js";
import {
    chooseOrgAndRoleKeysFromMembershipRows,
    normalizeRoleKey,
    type ResolvedAdminAccessCore,
} from "@/lib/admin/resolveAdminAccessCore";

const PORTAL_ROLES = new Set(["admin", "ops"]);

/**
 * W-43 (`I-30`ᴬ) — read failures deny here too.
 *
 * This is the THIRD resolver, and this helper is a byte-for-byte duplicate of the one in
 * `resolveAdminAccessCore`. The duplication is `W-41`'s to remove (it needs `AD-12`), so it is
 * hardened in place rather than refactored away here — fixing a fail-open and performing a
 * consolidation are different changes and only one of them is safe to do without the decision.
 *
 * The two copies are kept honest structurally rather than by intention:
 * `tests/access/resolverReadErrorHandlingScan.test.ts` discovers the reads in BOTH modules from
 * source, so a copy that drifts back to an undestructured error fails.
 */
async function fetchLegacyAdminOpsOrgAndRole(
    supabase: SupabaseClient,
    userId: string
): Promise<{ orgId: string; role: "admin" | "ops" } | null> {
    const { data: profile, error: profileErr } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
    if (profileErr) {
        logPortalReadFailure("user_profiles", userId, profileErr.message);
        return null;
    }
    const pr = normalizeRoleKey((profile as { role?: unknown } | null)?.role);
    if (pr === "admin" || pr === "ops") {
        const orgFromAu = await fetchOrgIdFromAppUsers(supabase, userId);
        if (orgFromAu) return { orgId: orgFromAu, role: pr };
    }

    const { data: au, error: auErr } = await supabase
        .from("app_users")
        .select("role, org_id")
        .eq("id", userId)
        .maybeSingle();
    if (auErr) {
        logPortalReadFailure("app_users", userId, auErr.message);
        return null;
    }
    const auRow = au as { role?: unknown; org_id?: unknown } | null;
    const ar = normalizeRoleKey(auRow?.role);
    const oid = auRow && typeof auRow.org_id === "string" ? auRow.org_id : "";
    if ((ar === "admin" || ar === "ops") && oid) {
        return { orgId: oid, role: ar };
    }

    const { data: au2, error: au2Err } = await supabase
        .from("app_users")
        .select("role, org_id")
        .eq("auth_user_id", userId)
        .maybeSingle();
    if (au2Err) {
        logPortalReadFailure("app_users", userId, au2Err.message);
        return null;
    }
    const au2Row = au2 as { role?: unknown; org_id?: unknown } | null;
    const ar2 = normalizeRoleKey(au2Row?.role);
    const oid2 = au2Row && typeof au2Row.org_id === "string" ? au2Row.org_id : "";
    if ((ar2 === "admin" || ar2 === "ops") && oid2) {
        return { orgId: oid2, role: ar2 };
    }

    return null;
}

/** W-43 — same channel and same shape as the enforcing resolver's read-failure record. */
function logPortalReadFailure(table: string, userId: string, message: string): void {
    console.error(
        `[access-identity][W-43][read-failure] where=resolveAdminPortalOrgCore table=${table} ` +
            `user_id=${userId} org_id=unresolved outcome=deny reason=read_error message=${message}`
    );
}

async function fetchOrgIdFromAppUsers(supabase: SupabaseClient, userId: string): Promise<string | null> {
    const { data: au, error: auErr } = await supabase
        .from("app_users")
        .select("org_id")
        .eq("id", userId)
        .maybeSingle();
    if (auErr) {
        logPortalReadFailure("app_users", userId, auErr.message);
        return null;
    }
    const o = (au as { org_id?: string | null } | null)?.org_id ?? null;
    if (typeof o === "string" && o.length > 0) return o;

    const { data: auAuth, error: auAuthErr } = await supabase
        .from("app_users")
        .select("org_id")
        .eq("auth_user_id", userId)
        .maybeSingle();
    if (auAuthErr) {
        logPortalReadFailure("app_users", userId, auAuthErr.message);
        return null;
    }
    const o2 = (auAuth as { org_id?: string | null } | null)?.org_id ?? null;
    return typeof o2 === "string" && o2.length > 0 ? o2 : null;
}

export type ResolvedAdminPortalOrgCore = Pick<
    ResolvedAdminAccessCore,
    "orgId" | "roleKeys" | "portalEligible"
>;

/**
 * Portal org + role_keys only — skips permission grants and department/site scope tables.
 * Same primary-org and legacy resolution rules as {@link resolveAdminAccessCore}.
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

    let orgId: string;
    let roleKeys: string[];

    const picked = chooseOrgAndRoleKeysFromMembershipRows(rows);
    if (picked) {
        orgId = picked.orgId;
        roleKeys = picked.roleKeys;
    } else {
        const legacy = await fetchLegacyAdminOpsOrgAndRole(supabase, userId);
        if (!legacy) return null;
        orgId = legacy.orgId;
        roleKeys = [legacy.role];
    }

    const portalEligible = roleKeys.some((r) => PORTAL_ROLES.has(r));
    return { orgId, roleKeys, portalEligible };
}
