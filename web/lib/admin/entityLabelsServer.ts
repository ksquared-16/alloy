import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveAdminAccessCore } from "@/lib/admin/resolveAdminAccessCore";
import { resolveEntityLabelsForOrg } from "@/lib/admin/entityLabelsResolve";

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
    const core = await resolveAdminAccessCore(supabase, userId);
    if (!core?.portalEligible) {
        return null;
    }
    return core.orgId;
}

const ORG_ENTITY_LABELS_SERVER_CACHE = new Map<string, { at: number; map: EntityLabelsBootstrapMap }>();
const ORG_ENTITY_LABELS_TTL_MS = 90_000;

/** Server-only: org-scoped label map with short in-process TTL (layout + routes). */
export async function loadEntityLabelsMapForOrgId(orgId: string): Promise<EntityLabelsBootstrapMap> {
    const key = orgId.trim();
    if (!key) return {};
    const now = Date.now();
    const hit = ORG_ENTITY_LABELS_SERVER_CACHE.get(key);
    if (hit && now - hit.at < ORG_ENTITY_LABELS_TTL_MS) {
        return hit.map;
    }
    const supabase = createAdminClient();
    const { effective } = await resolveEntityLabelsForOrg(supabase, key);
    const map = entityLabelsMapFromEffective(effective);
    ORG_ENTITY_LABELS_SERVER_CACHE.set(key, { at: now, map });
    return map;
}

/** Server-only: hydrated label map for admin shell (no raw entity_type flash on first paint). */
export async function loadEntityLabelsMapForUser(userId: string): Promise<EntityLabelsBootstrapMap> {
    const orgId = await getAdminOrgIdForUser(userId);
    if (!orgId) return {};
    return loadEntityLabelsMapForOrgId(orgId);
}
