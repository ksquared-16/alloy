/**
 * Shared field_values upserts for public book-v2 flows (quote-start, quote-refine, service-details).
 */

import type { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { payloadFromFieldType } from "@/lib/admin/typedFieldValues";

export type FieldDefMeta = { id: string; field_type: string };

export async function getFieldDefinitionMeta(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  entityType: string,
  fieldKey: string
): Promise<FieldDefMeta | null> {
  const { data, error } = await supabase
    .from("field_definitions")
    .select("id, field_type")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("field_key", fieldKey)
    .eq("is_active", true)
    .limit(1);
  if (error) {
    console.error("[BOOK_V2_FIELD_VALUES] field_definitions lookup failed", {
      org_id: orgId,
      entity_type: entityType,
      field_key: fieldKey,
      error: error.message,
    });
    return null;
  }
  const row = (data as FieldDefMeta[] | null)?.[0];
  return row ?? null;
}

export async function upsertTypedFieldValue(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  entityType: string,
  entityId: string,
  def: FieldDefMeta,
  rawDisplay: string
): Promise<void> {
  const typed = payloadFromFieldType(def.field_type, rawDisplay);
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("field_values")
    .select("id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("field_definition_id", def.id)
    .maybeSingle();
  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from("field_values")
      .update({ ...typed, updated_at: now })
      .eq("id", (existing as { id: string }).id);
    if (updateErr) {
      console.error("[BOOK_V2_FIELD_VALUES] update failed", {
        entity_type: entityType,
        entity_id: entityId,
        field_definition_id: def.id,
        error: updateErr.message,
      });
    }
  } else {
    const { error: insertErr } = await supabase.from("field_values").insert({
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      field_definition_id: def.id,
      ...typed,
    });
    if (insertErr) {
      console.error("[BOOK_V2_FIELD_VALUES] insert failed", {
        entity_type: entityType,
        entity_id: entityId,
        field_definition_id: def.id,
        error: insertErr.message,
      });
    }
  }
}

/** Serialize raw square_footage from the request for field_values (source of truth). */
export function serializeSquareFootageForFieldValue(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "number" && !Number.isNaN(raw)) return String(raw);
  return String(raw).trim();
}
