import type { SupabaseClient } from "@supabase/supabase-js";
import { payloadFromFieldType } from "@/lib/admin/typedFieldValues";

export type PublicFieldDefRow = {
    id: string;
    field_key: string;
    field_type: string;
};

/**
 * Upsert field_values for org-visible public definitions, reading raw values from a bag (e.g. request body).
 * Skips undefined / null / empty string (use explicit false for booleans).
 */
export async function upsertConfigurableFieldValuesForEntity(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    entityId: string,
    defs: PublicFieldDefRow[],
    rawByKey: Record<string, unknown>
): Promise<void> {
    const now = new Date().toISOString();
    for (const def of defs) {
        const raw = rawByKey[def.field_key];
        if (raw === undefined || raw === null) continue;
        if (typeof raw === "string" && raw.trim() === "") continue;
        const typed = payloadFromFieldType(def.field_type, raw);
        const { data: existing } = await supabase
            .from("field_values")
            .select("id")
            .eq("entity_type", entityType)
            .eq("entity_id", entityId)
            .eq("field_definition_id", def.id)
            .maybeSingle();
        if (existing?.id) {
            await supabase
                .from("field_values")
                .update({ ...typed, updated_at: now })
                .eq("id", (existing as { id: string }).id);
        } else {
            await supabase.from("field_values").insert({
                org_id: orgId,
                entity_type: entityType,
                entity_id: entityId,
                field_definition_id: def.id,
                ...typed,
            });
        }
    }
}
