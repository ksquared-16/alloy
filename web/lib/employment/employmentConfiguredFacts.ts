/**
 * Configured employment facts — resolves tenant/vertical staff information
 * through the existing canonical field system.
 *
 * There is no employment-specific field store. This reads `field_definitions`
 * and `field_values` exactly as every other configurable subject does, with
 * `entity_type = "employment"` and `entity_id = employments.id`, and renders
 * values through the shared `displayFromFieldValueRow`.
 *
 * Nothing here knows what industry the tenant is in. "CPR expiry" and "food
 * handler card" are rows an operator authored, not branches in this file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { displayFromFieldValueRow, type FieldValueRow } from "@/lib/admin/typedFieldValues";
import { EMPLOYMENT_ENTITY_TYPE } from "@/lib/employment/employmentFieldRegistry";
import { upsertConfigurableFieldValuesForEntity } from "@/lib/fields/upsertConfigurableFieldValues";

export type EmploymentConfiguredFact = {
    field_key: string;
    label: string;
    field_type: string;
    section_key: string | null;
    sort_order: number;
    /** Rendered for display. Empty string when the operator has not filled it in. */
    display: string;
    /** Raw typed columns, for consumers that need the value rather than the label. */
    value: FieldValueRow;
};

type DefRow = {
    id: string;
    field_key: string;
    label: string;
    field_type: string;
    section_key: string | null;
    sort_order: number;
    is_visible_in_drawer: boolean;
};

/**
 * Configured facts for one employment, in operator-authored order. Definitions
 * with no value are still returned so the composition can show the shape of what
 * the tenant asked for — the caller decides whether to render empties.
 */
export async function loadEmploymentConfiguredFacts(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string
): Promise<EmploymentConfiguredFact[]> {
    const org = String(orgId ?? "").trim();
    const id = String(employmentId ?? "").trim();
    if (!org || !id) return [];

    const { data: defData } = await supabase
        .from("field_definitions")
        .select("id, field_key, label, field_type, section_key, sort_order, is_visible_in_drawer")
        .eq("org_id", org)
        .eq("entity_type", EMPLOYMENT_ENTITY_TYPE)
        .eq("is_active", true)
        .order("sort_order")
        .order("label");

    const defs = (defData ?? []) as DefRow[];
    if (defs.length === 0) return [];

    const { data: valueData } = await supabase
        .from("field_values")
        .select("field_definition_id, value_text, value_number, value_boolean, value_date, value_json")
        .eq("org_id", org)
        .eq("entity_type", EMPLOYMENT_ENTITY_TYPE)
        .eq("entity_id", id);

    const byDef = new Map<string, FieldValueRow>();
    for (const row of (valueData ?? []) as ({ field_definition_id: string } & FieldValueRow)[]) {
        byDef.set(row.field_definition_id, row);
    }

    return defs
        .filter((d) => d.is_visible_in_drawer !== false)
        .map((d) => {
            const value = byDef.get(d.id) ?? {};
            return {
                field_key: d.field_key,
                label: d.label,
                field_type: d.field_type,
                section_key: d.section_key ?? null,
                sort_order: d.sort_order,
                display: displayFromFieldValueRow(d.field_type, value),
                value,
            };
        });
}

/**
 * Persist configured employment facts supplied by key. Delegates to the shared
 * upsert so employment writes values the same way every other subject does.
 */
export async function saveEmploymentConfiguredFacts(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string,
    rawByKey: Record<string, unknown>
): Promise<void> {
    const org = String(orgId ?? "").trim();
    const id = String(employmentId ?? "").trim();
    if (!org || !id || !rawByKey || Object.keys(rawByKey).length === 0) return;

    const { data } = await supabase
        .from("field_definitions")
        .select("id, field_key, field_type")
        .eq("org_id", org)
        .eq("entity_type", EMPLOYMENT_ENTITY_TYPE)
        .eq("is_active", true);

    const defs = (data ?? []) as { id: string; field_key: string; field_type: string }[];
    if (defs.length === 0) return;

    await upsertConfigurableFieldValuesForEntity(
        supabase,
        org,
        EMPLOYMENT_ENTITY_TYPE,
        id,
        defs,
        rawByKey
    );
}
