import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    readEntityLabelsOrgCache,
    writeEntityLabelsOrgCache,
} from "@/lib/admin/entityLabelsOrgCache";
import { logEntityLabelsCache } from "@/lib/admin/entityLabelsCacheInstrumentation";

export type EntityLabelRow = { entity_type: string; singular: string | null; plural: string | null };

export type EntityLabelsPayload = {
    org_industry_id: string | null;
    industry: { key: string; label: string } | null;
    defaults: EntityLabelRow[];
    overrides: EntityLabelRow[];
    effective: EntityLabelRow[];
};

/**
 * Same merge as GET /api/admin/entity-labels — industry defaults + org overrides.
 */
export async function resolveEntityLabelsForOrg(supabase: SupabaseClient, orgId: string): Promise<EntityLabelsPayload> {
    const t0 = Date.now();
    const phases: Record<string, number> = {};
    let prev = t0;
    const mark = (name: string) => {
        const now = Date.now();
        phases[name] = now - prev;
        prev = now;
    };

    const { data: orgRow } = await supabase.from("orgs").select("industry_id").eq("id", orgId).maybeSingle();
    mark("org_industry_lookup_ms");

    const industryId = (orgRow as { industry_id?: string } | null)?.industry_id ?? null;

    let industry: { key: string; label: string } | null = null;
    let defaultIndustryId: string | null = industryId;

    if (industryId) {
        const { data: ind } = await supabase
            .from("industries")
            .select("key, label")
            .eq("id", industryId)
            .eq("is_active", true)
            .maybeSingle();
        if (ind) {
            industry = { key: (ind as { key: string }).key, label: (ind as { label: string }).label };
        }
    }

    if (!defaultIndustryId) {
        const { data: generic } = await supabase
            .from("industries")
            .select("id, key, label")
            .eq("key", "generic")
            .eq("is_active", true)
            .maybeSingle();
        if (generic) {
            defaultIndustryId = (generic as { id: string }).id;
            industry = {
                key: (generic as { key: string }).key,
                label: (generic as { label: string }).label,
            };
        }
    }
    mark("industry_resolve_ms");

    const defaults: EntityLabelRow[] = [];
    if (defaultIndustryId) {
        const { data: defaultRows } = await supabase
            .from("industry_default_entity_labels")
            .select("entity_type, singular, plural")
            .eq("industry_id", defaultIndustryId)
            .order("entity_type", { ascending: true });
        if (defaultRows) {
            for (const r of defaultRows as { entity_type: string; singular: string | null; plural: string | null }[]) {
                defaults.push({
                    entity_type: r.entity_type,
                    singular: r.singular ?? null,
                    plural: r.plural ?? null,
                });
            }
        }
    }
    mark("industry_defaults_ms");

    const { data: overrideRows } = await supabase
        .from("entity_labels")
        .select("entity_type, singular, plural")
        .eq("org_id", orgId)
        .order("entity_type", { ascending: true });
    mark("org_overrides_ms");

    const overrides: EntityLabelRow[] = (overrideRows ?? []).map((r) => ({
        entity_type: (r as { entity_type: string }).entity_type,
        singular: (r as { singular: string | null }).singular ?? null,
        plural: (r as { plural: string | null }).plural ?? null,
    }));

    const overrideByType: Record<string, EntityLabelRow> = {};
    for (const o of overrides) overrideByType[o.entity_type] = o;

    const effective: EntityLabelRow[] = defaults.map((d) => {
        const ov = overrideByType[d.entity_type];
        return {
            entity_type: d.entity_type,
            singular: ov?.singular ?? d.singular,
            plural: ov?.plural ?? d.plural,
        };
    });

    mark("merge_effective_ms");
    const totalMs = Date.now() - t0;
    if (totalMs > 200) {
        console.warn("[entity-labels-perf] resolveEntityLabelsForOrg", {
            org_id: orgId,
            total_ms: totalMs,
            ...phases,
            defaults_rows: defaults.length,
            overrides_rows: overrides.length,
        });
    }

    return {
        org_industry_id: industryId,
        industry,
        defaults,
        overrides,
        effective,
    };
}

const ENTITY_LABELS_NEXT_REVALIDATE_S = 300;

function entityLabelsUnstableTag(orgId: string): string {
    return `entity-labels-org:${orgId.trim()}`;
}

async function resolveEntityLabelsForOrgDataCached(orgId: string): Promise<EntityLabelsPayload> {
    const key = orgId.trim();
    if (!key) {
        return {
            org_industry_id: null,
            industry: null,
            defaults: [],
            overrides: [],
            effective: [],
        };
    }
    const fetcher = async () => {
        logEntityLabelsCache("miss", { layer: "next_data", org_id: key, reason: "fetch" });
        const supabase = createAdminClient();
        return resolveEntityLabelsForOrg(supabase, key);
    };
    if (typeof unstable_cache === "function" && process.env.NODE_ENV !== "test") {
        return unstable_cache(fetcher, [`entity-labels-v1-${key}`], {
            revalidate: ENTITY_LABELS_NEXT_REVALIDATE_S,
            tags: [entityLabelsUnstableTag(key)],
        })();
    }
    return fetcher();
}

/** Org-stable labels for shell/navigation — process + Next data cache; invalidate on label writes. */
export async function resolveEntityLabelsForOrgCached(
    supabase: SupabaseClient,
    orgId: string
): Promise<EntityLabelsPayload> {
    void supabase;
    const key = orgId.trim();
    const processHit = readEntityLabelsOrgCache(key);
    if (processHit) return processHit;

    const t0 = Date.now();
    const payload = await resolveEntityLabelsForOrgDataCached(key);
    const resolveMs = Date.now() - t0;
    writeEntityLabelsOrgCache(key, payload);
    if (resolveMs < 15) {
        logEntityLabelsCache("hit", { layer: "next_data", org_id: key, resolve_ms: resolveMs });
    } else {
        logEntityLabelsCache("miss", { layer: "next_data", org_id: key, resolve_ms: resolveMs, reason: "stored" });
    }
    return payload;
}

export function entityLabelsOrgCacheTag(orgId: string): string {
    return entityLabelsUnstableTag(orgId);
}
