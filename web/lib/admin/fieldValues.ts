import type { SupabaseClient } from "@supabase/supabase-js";
import { payloadFromFieldType } from "@/lib/admin/typedFieldValues";

/**
 * Persist custom field values from a PATCH body. Keys in body that are not in systemKeys
 * and that exist in field_definitions (org, entity_type, is_system=false) are upserted to field_values.
 *
 * REPORTS WHAT IT WROTE. A key with no matching field definition is skipped — correctly, since
 * there is nowhere to put it — but the skip used to be silent and invisible to the caller, so a
 * route could return 200 for a PATCH that persisted nothing. Returning the written and skipped
 * keys lets the caller tell the operator the truth.
 */
export async function upsertFieldValuesFromBody(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string,
  body: Record<string, unknown>,
  systemKeys: readonly string[]
): Promise<{ written: string[]; skipped: string[] }> {
  const systemSet = new Set(systemKeys as string[]);
  const customKeys = Object.keys(body).filter(
    (k) => !systemSet.has(k) && !k.startsWith("_") && body[k] !== undefined
  );
  if (customKeys.length === 0) return { written: [], skipped: [] };

  const { data: defRows } = await supabase
    .from("field_definitions")
    .select("id, field_key, field_type")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("is_system", false)
    .in("field_key", customKeys);
  const defsList = (defRows ?? []) as { id: string; field_key: string; field_type: string }[];
  const byKey = new Map(defsList.map((r) => [r.field_key, r]));

  const written: string[] = [];
  const skipped: string[] = [];
  for (const field_key of customKeys) {
    const def = byKey.get(field_key);
    if (!def) {
      skipped.push(field_key);
      continue;
    }
    const typed = payloadFromFieldType(def.field_type, body[field_key]);
    const { data: existing } = await supabase
      .from("field_values")
      .select("id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("field_definition_id", def.id)
      .maybeSingle();
    const now = new Date().toISOString();
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
    written.push(field_key);
  }
  return { written, skipped };
}
