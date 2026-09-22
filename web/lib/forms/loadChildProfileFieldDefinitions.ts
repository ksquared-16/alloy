/**
 * Forms' own read of the child profile's `field_definitions` rows.
 *
 * Separate from `loadOrgFieldDefinitionsForLifecycle` on purpose: that reader feeds the Business
 * Process requirement contract, Create Lead eligibility and public-submission validation, and its
 * entity vocabulary cannot express `customer_member`. Forms needs a wider view of what a form may
 * capture than the process needs of what it may require, so it reads what it needs rather than
 * widening a contract four other surfaces depend on.
 *
 * Same table, same org scope, same active filter — one canonical field store, two readers with
 * different questions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHILD_PROFILE_ENTITY_TYPE, type ChildProfileFieldDefinitionRow } from "@/lib/forms/childProfileFieldProjection";

export async function loadChildProfileFieldDefinitions(
    supabase: SupabaseClient,
    orgId: string,
): Promise<ChildProfileFieldDefinitionRow[]> {
    const { data, error } = await supabase
        .from("field_definitions")
        .select("field_key, label, field_type, config, is_active")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .eq("entity_type", CHILD_PROFILE_ENTITY_TYPE);

    // A form is still authorable without the child profile; the picker simply offers fewer fields.
    if (error) return [];

    return (data ?? []).map((row) => {
        const r = row as ChildProfileFieldDefinitionRow;
        return {
            field_key: String(r.field_key ?? "").trim(),
            label: r.label ?? null,
            field_type: r.field_type ?? null,
            config: r.config ?? null,
            is_active: r.is_active !== false,
        };
    });
}
