/**
 * POS-FP0 — load the set of active registry field keys for an org.
 *
 * Returns a Set of `${entity_type}::${field_key}` for active `field_definitions`,
 * consumed by the POS-connected binding validator. Reuses the existing
 * `field_definitions` table (cf. `loadOrgFieldDefinitionsForLifecycle`); adds no
 * new field store. No migration, no new API.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fieldDefinitionKey } from "./validatePosConnectedFieldBinding";

export async function loadOrgFieldDefinitionKeySet(
    supabase: SupabaseClient,
    orgId: string
): Promise<Set<string>> {
    const { data, error } = await supabase
        .from("field_definitions")
        .select("entity_type, field_key, is_active")
        .eq("org_id", orgId)
        .eq("is_active", true);

    if (error) throw new Error(error.message);

    const keys = new Set<string>();
    for (const row of data ?? []) {
        const r = row as { entity_type?: string | null; field_key?: string | null };
        const entityType = String(r.entity_type ?? "").trim();
        const fieldKey = String(r.field_key ?? "").trim();
        if (entityType && fieldKey) keys.add(fieldDefinitionKey(entityType, fieldKey));
    }
    return keys;
}
