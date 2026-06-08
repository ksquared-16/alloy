import type { SupabaseClient } from "@supabase/supabase-js";
import {
    chooseOrgAndRoleKeysFromMembershipRows,
    type ResolvedAdminAccessCore,
} from "@/lib/admin/resolveAdminAccessCore";

const PORTAL_ROLES = new Set(["admin", "ops"]);

async function fetchLegacyAdminOpsOrgAndRole(
    supabase: SupabaseClient,
    userId: string
): Promise<{ orgId: string; role: "admin" | "ops" } | null> {
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", userId).maybeSingle();
    const pr =
        profile && typeof (profile as { role?: unknown }).role === "string"
            ? ((profile as { role: string }).role as string).trim()
            : "";
    if (pr === "admin" || pr === "ops") {
        const orgFromAu = await fetchOrgIdFromAppUsers(supabase, userId);
        if (orgFromAu) return { orgId: orgFromAu, role: pr };
    }

    const { data: au } = await supabase.from("app_users").select("role, org_id").eq("id", userId).maybeSingle();
    const auRow = au as { role?: unknown; org_id?: unknown } | null;
    const ar = auRow && typeof auRow.role === "string" ? auRow.role.trim() : "";
    const oid = auRow && typeof auRow.org_id === "string" ? auRow.org_id : "";
    if ((ar === "admin" || ar === "ops") && oid) {
        return { orgId: oid, role: ar };
    }

    const { data: au2 } = await supabase.from("app_users").select("role, org_id").eq("auth_user_id", userId).maybeSingle();
    const au2Row = au2 as { role?: unknown; org_id?: unknown } | null;
    const ar2 = au2Row && typeof au2Row.role === "string" ? au2Row.role.trim() : "";
    const oid2 = au2Row && typeof au2Row.org_id === "string" ? au2Row.org_id : "";
    if ((ar2 === "admin" || ar2 === "ops") && oid2) {
        return { orgId: oid2, role: ar2 };
    }

    return null;
}

async function fetchOrgIdFromAppUsers(supabase: SupabaseClient, userId: string): Promise<string | null> {
    const { data: au } = await supabase.from("app_users").select("org_id").eq("id", userId).maybeSingle();
    const o = (au as { org_id?: string | null } | null)?.org_id ?? null;
    if (typeof o === "string" && o.length > 0) return o;

    const { data: auAuth } = await supabase.from("app_users").select("org_id").eq("auth_user_id", userId).maybeSingle();
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
