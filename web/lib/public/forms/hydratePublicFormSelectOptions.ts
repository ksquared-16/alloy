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
            const hasStatic = Array.isArray(f.static_options) && f.static_options.length > 0;
            const key = f.option_set_key?.trim();
            if (!hasStatic && key) {
                out.push({ fieldId: f.id, optionSetKey: key });
            }
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
    const option_values_by_field_id: Record<string, string[]> = {};
    const option_choices_by_field_id: Record<string, PublicFormOptionChoice[]> = {};

    function applyStaticFromTree(fields: FormField[]) {
        for (const f of fields) {
            if ((f.type === "select" || f.type === "multiselect") && f.static_options?.length) {
                const choices = f.static_options.map((o) => ({
                    value: String(o.value).trim(),
                    label: (o.label && String(o.label).trim()) || String(o.value).trim(),
                }));
                option_choices_by_field_id[f.id] = choices;
                option_values_by_field_id[f.id] = choices.map((c) => c.value);
            }
            if (f.type === "group") applyStaticFromTree(f.fields);
        }
    }
    applyStaticFromTree(schema.fields);

    const bindings = collectSelectFieldBindings(schema.fields);
    const setKeys = [...new Set(bindings.map((b) => b.optionSetKey.trim()).filter(Boolean))];
    const bySetKey = await resolveOptionSetsForOrg(supabase, orgId, setKeys);

    for (const { fieldId, optionSetKey } of bindings) {
        if (option_choices_by_field_id[fieldId]?.length) continue;
        const choices = bySetKey[optionSetKey] ?? [];
        option_choices_by_field_id[fieldId] = choices;
        option_values_by_field_id[fieldId] = choices.map((c) => c.value);
    }

    return { option_values_by_field_id, option_choices_by_field_id };
}
