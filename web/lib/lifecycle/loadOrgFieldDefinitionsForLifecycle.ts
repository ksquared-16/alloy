import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { lifecycleEntityFromFieldDefinitionEntityType } from "@/lib/lifecycle/lifecycleFieldRuleBindings";

export type OrgFieldDefinitionRow = {
    field_key: string;
    label: string;
    entity_type: string;
    is_system: boolean;
    is_active: boolean;
};

const LIFECYCLE_FIELD_ENTITY_TYPES = ["person", "inquiry_child", "opportunity", "customer"] as const;

/** Load org field_definitions rows for lifecycle palette merge. */
export async function loadOrgFieldDefinitionsForLifecycle(
    supabase: SupabaseClient,
    orgId: string
): Promise<Partial<Record<LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]>>> {
    const { data, error } = await supabase
        .from("field_definitions")
        .select("field_key, label, entity_type, is_system, is_active")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .in("entity_type", [...LIFECYCLE_FIELD_ENTITY_TYPES]);

    if (error) throw new Error(error.message);

    const out: Partial<Record<LifecycleRequirementEntityKey, OrgFieldDefinitionRow[]>> = {};
    for (const row of data ?? []) {
        const r = row as {
            field_key?: string;
            label?: string | null;
            entity_type?: string;
            is_system?: boolean;
            is_active?: boolean;
        };
        const field_key = String(r.field_key ?? "").trim();
        if (!field_key) continue;
        const entity = lifecycleEntityFromFieldDefinitionEntityType(String(r.entity_type ?? ""));
        if (!entity) continue;
        const label = String(r.label ?? field_key).trim() || field_key;
        const list = out[entity] ?? [];
        list.push({
            field_key,
            label,
            entity_type: String(r.entity_type ?? ""),
            is_system: r.is_system === true,
            is_active: r.is_active !== false,
        });
        out[entity] = list;
    }
    return out;
}
