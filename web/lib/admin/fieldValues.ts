import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Persist custom field values from a PATCH body. Keys in body that are not in systemKeys
 * and that exist in field_definitions (org, entity_type, is_system=false) are upserted to field_values.
 */
export async function upsertFieldValuesFromBody(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    entityId: string,
    body: Record<string, unknown>,
    systemKeys: readonly string[]
): Promise<void> {
    const systemSet = new Set(systemKeys as string[]);
    const customKeys = Object.keys(body).filter(
        (k) => !systemSet.has(k) && !k.startsWith("_") && body[k] !== undefined
    );
    if (customKeys.length === 0) return;

    const { data: defRows } = await supabase
        .from("field_definitions")
        .select("id, field_key")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("is_system", false)
        .in("field_key", customKeys);
    const defsByKey = new Map((defRows ?? []).map((r: { id: string; field_key: string }) => [r.field_key, r.id]));

    for (const field_key of customKeys) {
        const defId = defsByKey.get(field_key);
        if (!defId) continue;
        const value = body[field_key] == null ? "" : String(body[field_key]).trim();
        const { data: existing } = await supabase
            .from("field_values")
            .select("id")
            .eq("entity_type", entityType)
            .eq("entity_id", entityId)
            .eq("field_definition_id", defId)
            .maybeSingle();
        if (existing) {
            await supabase
                .from("field_values")
                .update({ value, updated_at: new Date().toISOString() })
                .eq("entity_type", entityType)
                .eq("entity_id", entityId)
                .eq("field_definition_id", defId);
        } else {
            await supabase.from("field_values").insert({
                org_id: orgId,
                entity_type: entityType,
                entity_id: entityId,
                field_definition_id: defId,
                value,
            });
        }
    }
}
