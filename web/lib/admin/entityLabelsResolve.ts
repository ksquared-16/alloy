import type { SupabaseClient } from "@supabase/supabase-js";

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
    const { data: orgRow } = await supabase.from("orgs").select("industry_id").eq("id", orgId).maybeSingle();

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

    const { data: overrideRows } = await supabase
        .from("entity_labels")
        .select("entity_type, singular, plural")
        .eq("org_id", orgId)
        .order("entity_type", { ascending: true });

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

    return {
        org_industry_id: industryId,
        industry,
        defaults,
        overrides,
        effective,
    };
}
