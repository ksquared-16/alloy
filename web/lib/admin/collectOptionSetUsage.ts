import { createAdminClient } from "@/lib/supabaseAdmin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type OptionSetUsageBlocker =
    | { kind: "field_definition"; id: string; entity_type: string; field_key: string }
    | { kind: "pricing_dimension"; id: string; dimension_key: string };

/**
 * References that prevent deleting an option set (field_definitions.config.option_set_key,
 * pricing_dimensions.source_option_set_key for the same org).
 */
export async function collectOptionSetUsage(
    supabase: AdminClient,
    orgId: string,
    setKey: string
): Promise<OptionSetUsageBlocker[]> {
    const key = setKey.trim();
    if (!key) return [];

    const blockers: OptionSetUsageBlocker[] = [];

    const { data: defs } = await supabase
        .from("field_definitions")
        .select("id, entity_type, field_key, field_type, config")
        .eq("org_id", orgId)
        .in("field_type", ["select", "multiselect"]);

    for (const row of defs ?? []) {
        const cfg = row.config as Record<string, unknown> | null | undefined;
        const ref =
            cfg && typeof cfg.option_set_key === "string" ? cfg.option_set_key.trim() : "";
        if (ref === key) {
            blockers.push({
                kind: "field_definition",
                id: String(row.id),
                entity_type: String(row.entity_type),
                field_key: String(row.field_key),
            });
        }
    }

    const { data: dims } = await supabase
        .from("pricing_dimensions")
        .select("id, dimension_key")
        .eq("org_id", orgId)
        .eq("source_option_set_key", key);

    for (const d of dims ?? []) {
        blockers.push({
            kind: "pricing_dimension",
            id: String(d.id),
            dimension_key: String(d.dimension_key),
        });
    }

    return blockers;
}
