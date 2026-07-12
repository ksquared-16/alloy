/**
 * Repository helpers for Person ↔ Child relationships (read paths).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY } from "./personChildRelationshipEntity";
import type { OptionSetItemRow } from "./personChildRelationshipValidation";
import type {
    PersonChildRelationshipRecord,
    PersonChildRelationshipRoleAssignment,
} from "./personChildRelationshipEntity";

export async function loadPersonChildRelationshipOptionSetItems(
    supabase: SupabaseClient,
    orgId: string,
): Promise<OptionSetItemRow[]> {
    const { data: sets } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", orgId)
        .eq("set_key", PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY)
        .limit(1);
    const setId = (sets?.[0] as { id: string } | undefined)?.id;
    if (!setId) return [];
    const { data: items } = await supabase
        .from("option_set_items")
        .select("item_key, label")
        .eq("option_set_id", setId)
        .order("sort_order", { ascending: true });
    return (items ?? []) as OptionSetItemRow[];
}

export async function loadRelationshipsForCustomerMember(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
): Promise<PersonChildRelationshipRecord[]> {
    const { data, error } = await supabase
        .from("person_child_relationships")
        .select("*")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId);
    if (error) throw new Error(error.message);
    return (data ?? []) as PersonChildRelationshipRecord[];
}

export async function loadRoleAssignmentsForRelationships(
    supabase: SupabaseClient,
    orgId: string,
    relationshipIds: readonly string[],
): Promise<PersonChildRelationshipRoleAssignment[]> {
    if (relationshipIds.length === 0) return [];
    const { data, error } = await supabase
        .from("person_child_relationship_roles")
        .select("id, org_id, relationship_id, role_key, is_active")
        .eq("org_id", orgId)
        .in("relationship_id", relationshipIds);
    if (error) throw new Error(error.message);
    return (data ?? []) as PersonChildRelationshipRoleAssignment[];
}

export async function loadCustomFieldValuesForRelationships(
    supabase: SupabaseClient,
    orgId: string,
    relationshipIds: readonly string[],
): Promise<Map<string, Record<string, unknown>>> {
    const map = new Map<string, Record<string, unknown>>();
    if (relationshipIds.length === 0) return map;
    const { data: defs } = await supabase
        .from("field_definitions")
        .select("id, field_key")
        .eq("org_id", orgId)
        .eq("entity_type", "person_child_relationship")
        .eq("is_system", false);
    if (!defs?.length) return map;
    const defById = new Map((defs as { id: string; field_key: string }[]).map((d) => [d.id, d.field_key]));
    const { data: values } = await supabase
        .from("field_values")
        .select("entity_id, field_definition_id, value_text, value_number, value_boolean, value_date, value_json")
        .eq("org_id", orgId)
        .eq("entity_type", "person_child_relationship")
        .in("entity_id", relationshipIds);
    for (const row of values ?? []) {
        const rec = row as Record<string, unknown>;
        const relId = String(rec.entity_id);
        const fieldKey = defById.get(String(rec.field_definition_id));
        if (!fieldKey) continue;
        const bucket = map.get(relId) ?? {};
        bucket[fieldKey] = rec.value_text ?? rec.value_number ?? rec.value_boolean ?? rec.value_date ?? rec.value_json ?? null;
        map.set(relId, bucket);
    }
    return map;
}
