import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveEntityLabelsForOrg } from "@/lib/admin/entityLabelsResolve";
import { fetchPrimaryAdminOpsMembershipForUser } from "@/lib/admin/primaryAdminOpsOrg";

/** Same shape as EntityLabelsContext labels map (kept here so server code never imports the client context file). */
export type EntityLabelsBootstrapMap = Record<string, { singular: string | null; plural: string | null }>;

export function entityLabelsMapFromEffective(
    effective: { entity_type: string; singular: string | null; plural: string | null }[]
): EntityLabelsBootstrapMap {
    const map: EntityLabelsBootstrapMap = {};
    for (const row of effective) {
        map[row.entity_type] = { singular: row.singular ?? null, plural: row.plural ?? null };
    }
    return map;
}

export async function getAdminOrgIdForUser(userId: string): Promise<string | null> {
    const supabase = createAdminClient();
    const membership = await fetchPrimaryAdminOpsMembershipForUser(supabase, userId);
    if (membership) return membership.orgId;

    const { data: au } = await supabase.from("app_users").select("org_id").eq("id", userId).maybeSingle();
    const fromAppUser = (au as { org_id?: string | null } | null)?.org_id ?? null;
    if (fromAppUser) return fromAppUser;

    const { data: auAuth } = await supabase
        .from("app_users")
        .select("org_id")
        .eq("auth_user_id", userId)
        .maybeSingle();
    return (auAuth as { org_id?: string | null } | null)?.org_id ?? null;
}

/** Server-only: hydrated label map for admin shell (no raw entity_type flash on first paint). */
export async function loadEntityLabelsMapForUser(userId: string): Promise<EntityLabelsBootstrapMap> {
    const orgId = await getAdminOrgIdForUser(userId);
    if (!orgId) return {};
    const supabase = createAdminClient();
    const { effective } = await resolveEntityLabelsForOrg(supabase, orgId);
    return entityLabelsMapFromEffective(effective);
}
