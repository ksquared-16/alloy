/**
 * Card 2 — Extract structured capture index from form schema for lifecycle matching.
 */

import { validateFormSchema, type FormField, type FormFieldSource } from "@/lib/forms/schema";
import { SYSTEM_FIELD_BY_ID, type SystemFieldRegistryEntry } from "@/lib/forms/systemFieldRegistry";

export type FormFieldCaptureEntry = {
    id: string;
    label: string;
    fieldSource?: FormFieldSource;
    registryEntry: SystemFieldRegistryEntry | null;
    /** True when field is custom/unmapped — cannot satisfy lifecycle rules without explicit mapping. */
    isUnmappedCustom: boolean;
};

export type FormFieldCaptureIndex = {
    fields: FormFieldCaptureEntry[];
};

function flattenFields(fields: FormField[]): FormFieldCaptureEntry[] {
    const out: FormFieldCaptureEntry[] = [];
    for (const f of fields) {
        if (f.type === "group") {
            out.push(...flattenFields(f.fields));
            continue;
        }
        const id = f.id?.trim() ?? "";
        if (!id) continue;
        const src = f.field_source;
        const isUnmappedCustom =
            src?.entity_type === "custom" && src.field_key === "unmapped";
        out.push({
            id,
            label: f.label?.trim() ?? "",
            fieldSource: src,
            registryEntry: SYSTEM_FIELD_BY_ID.get(id) ?? null,
            isUnmappedCustom,
        });
    }
    return out;
}

export function buildFormFieldCaptureIndexFromFields(fields: FormField[]): FormFieldCaptureIndex {
    return { fields: flattenFields(fields) };
}

/** Parse published/draft schema_json into a field capture index. Invalid schema → empty index. */
export function buildFormFieldCaptureIndex(schemaJson: unknown): FormFieldCaptureIndex {
    try {
        const parsed = validateFormSchema(schemaJson);
        return buildFormFieldCaptureIndexFromFields(parsed.fields);
    } catch {
        return { fields: [] };
    }
}
