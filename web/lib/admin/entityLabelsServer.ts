import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveAdminAccessCore } from "@/lib/admin/resolveAdminAccessCore";
import { resolveEntityLabelsForOrgCached } from "@/lib/admin/entityLabelsResolve";

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

const ENTITY_LABELS_TIMEOUT_SENTINEL = Symbol("entity-labels-timeout");

/**
 * Server-only: org-scoped label map with a short in-process TTL (layout + routes).
 *
 * `timeoutMs` bounds how long a caller on a first-paint critical path (the workspace layout) will
 * WAIT for a cold resolve. Labels are org-stable terminology, so on timeout we return the last-known
 * (stale) map — or an empty map for a genuinely cold org — and let the real resolution finish in the
 * background to warm the cache for the next render. Entity labels therefore NEVER block first
 * composition; a slow industry lookup degrades to known/default labels instead of holding the page.
 */
export async function loadEntityLabelsMapForOrgId(
    orgId: string,
    opts?: { timeoutMs?: number }
): Promise<EntityLabelsBootstrapMap> {
    const key = orgId.trim();
    if (!key) return {};
    const now = Date.now();
    const hit = ORG_ENTITY_LABELS_SERVER_CACHE.get(key);
    if (hit && now - hit.at < ORG_ENTITY_LABELS_TTL_MS) {
        return hit.map;
    }

    const fallbackMap: EntityLabelsBootstrapMap = hit?.map ?? {};
    const supabase = createAdminClient();
    // Never rejects: a failed resolve degrades to the last-known/default map (labels must not throw
    // out of first composition). A success also warms the process cache for the next render.
    const resolvePromise: Promise<EntityLabelsBootstrapMap> = resolveEntityLabelsForOrgCached(supabase, key)
        .then(({ effective }) => {
            const map = entityLabelsMapFromEffective(effective);
            ORG_ENTITY_LABELS_SERVER_CACHE.set(key, { at: Date.now(), map });
            return map;
        })
        .catch(() => fallbackMap);

    const timeoutMs = opts?.timeoutMs;
    if (typeof timeoutMs === "number" && timeoutMs > 0) {
        const raced = await Promise.race([
            resolvePromise,
            new Promise<typeof ENTITY_LABELS_TIMEOUT_SENTINEL>((resolve) =>
                setTimeout(() => resolve(ENTITY_LABELS_TIMEOUT_SENTINEL), timeoutMs)
            ),
        ]);
        if (raced === ENTITY_LABELS_TIMEOUT_SENTINEL) {
            void resolvePromise; // keeps warming in the background (already catch-guarded)
            return fallbackMap; // stale-while-revalidate: last known, else empty (client uses defaults)
        }
        return raced;
    }

    return resolvePromise;
}

/** Server-only: hydrated label map for admin shell (no raw entity_type flash on first paint). */
export async function loadEntityLabelsMapForUser(userId: string): Promise<EntityLabelsBootstrapMap> {
    const orgId = await getAdminOrgIdForUser(userId);
    if (!orgId) return {};
    return loadEntityLabelsMapForOrgId(orgId);
}
