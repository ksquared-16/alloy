import type { SupabaseClient } from "@supabase/supabase-js";

import { INQUIRY_CHILD_ENTITY_TYPE, isInquiryChildNativeFieldKey } from "@/lib/fields/inquiryChildFieldRegistry";

type FieldValueRow = {
    entity_id: string;
    field_definition_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_date: string | null;
    value_json: unknown | null;
};

type FieldDefRow = {
    id: string;
    field_key: string;
    field_type: string;
};

function readFieldValue(row: FieldValueRow, fieldType: string): unknown {
    switch (fieldType) {
        case "number":
            return row.value_number;
        case "boolean":
            return row.value_boolean;
        case "date":
            return row.value_date;
        case "multiselect":
            return row.value_json;
        default:
            return row.value_text ?? (row.value_json != null ? row.value_json : null);
    }
}

/**
 * Load custom (non-native) inquiry_child field_values keyed by OCM id → field_key.
 */
export async function loadInquiryChildCustomFieldValuesByOcmId(
    supabase: SupabaseClient,
    orgId: string,
    ocmIds: string[]
): Promise<Record<string, Record<string, unknown>>> {
    const ids = [...new Set(ocmIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return {};

    const { data: defs } = await supabase
        .from("field_definitions")
        .select("id, field_key, field_type")
        .eq("org_id", orgId)
        .eq("entity_type", INQUIRY_CHILD_ENTITY_TYPE)
        .eq("is_system", false)
        .eq("is_active", true);

    const customDefs = ((defs ?? []) as FieldDefRow[]).filter((d) => !isInquiryChildNativeFieldKey(d.field_key));
    if (customDefs.length === 0) return {};

    const defById = new Map(customDefs.map((d) => [d.id, d]));

    const { data: values } = await supabase
        .from("field_values")
        .select("entity_id, field_definition_id, value_text, value_number, value_boolean, value_date, value_json")
        .eq("org_id", orgId)
        .eq("entity_type", INQUIRY_CHILD_ENTITY_TYPE)
        .in("entity_id", ids);

    const out: Record<string, Record<string, unknown>> = {};
    for (const raw of (values ?? []) as FieldValueRow[]) {
        const def = defById.get(raw.field_definition_id);
        if (!def) continue;
        const eid = String(raw.entity_id);
        if (!out[eid]) out[eid] = {};
        out[eid][def.field_key] = readFieldValue(raw, def.field_type);
    }
    return out;
}
