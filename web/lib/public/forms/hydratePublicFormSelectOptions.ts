import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { resolveOptionSetsForOrg } from "@/lib/fields/resolveOptionSetOptions";

export type PublicFormOptionChoice = { value: string; label: string };

export type HydratedPublicFormSelectOptions = {
    option_values_by_field_id: Record<string, string[]>;
    option_choices_by_field_id: Record<string, PublicFormOptionChoice[]>;
};

function collectSelectFieldBindings(fields: FormField[]): { fieldId: string; optionSetKey: string }[] {
    const out: { fieldId: string; optionSetKey: string }[] = [];
    for (const f of fields) {
        if (f.type === "select" || f.type === "multiselect") {
            out.push({ fieldId: f.id, optionSetKey: f.option_set_key });
        } else if (f.type === "group") {
            out.push(...collectSelectFieldBindings(f.fields));
        }
    }
    return out;
}

/**
 * Loads org option_set_items for every select/multiselect in the schema tree and maps them by field id.
 * Values are stable `item_key` strings (submit + validation); labels are for embed display.
 */
export async function hydrateSelectOptionsForSchema(
    supabase: SupabaseClient,
    orgId: string,
    schema: FormSchemaV1
): Promise<HydratedPublicFormSelectOptions> {
    const bindings = collectSelectFieldBindings(schema.fields);
    const setKeys = [...new Set(bindings.map((b) => b.optionSetKey.trim()).filter(Boolean))];
    const bySetKey = await resolveOptionSetsForOrg(supabase, orgId, setKeys);

    const option_values_by_field_id: Record<string, string[]> = {};
    const option_choices_by_field_id: Record<string, PublicFormOptionChoice[]> = {};

    for (const { fieldId, optionSetKey } of bindings) {
        const choices = bySetKey[optionSetKey] ?? [];
        option_choices_by_field_id[fieldId] = choices;
        option_values_by_field_id[fieldId] = choices.map((c) => c.value);
    }

    return { option_values_by_field_id, option_choices_by_field_id };
}
