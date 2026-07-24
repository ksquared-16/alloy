import type { FormField, FormFieldSource } from "@/lib/forms/schema";
import { findFormsRelationshipProvider } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import { relationshipProviderToFormFieldSource } from "@/lib/fields/formsRelationshipFieldSourceBinding";
import {
    EMAIL_PATTERN,
    PHONE_PATTERN,
    linesToStaticOptions,
    type SystemFieldRegistryEntry,
} from "@/lib/forms/systemFieldRegistry";
import { systemFieldIdToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";

function sourceFromEntry(entry: SystemFieldRegistryEntry): FormFieldSource {
    if (entry.id.startsWith("rel:")) {
        const provider = findFormsRelationshipProvider(entry.id.slice(4));
        if (provider) return relationshipProviderToFormFieldSource(provider);
    }
    // Adult/guardian fields are stored in "guardian" vocabulary in the registry, but the
    // Processing identity engine (extractBoundPerson) only maps fields whose field_source is
    // a canonical PERSON binding ({entity_type: "person", field_key: "email" | "first_name" |
    // "last_name" | "phone"}). Normalize adult fields to that person binding at author time —
    // reusing the reference matrix as the single source of truth — so a public lead-capture
    // form's parent fields resolve to a person instead of yielding `missing_identifiers`.
    // The field id (entry.field_key, e.g. "guardian_email") is unchanged, so intake-meta
    // resolution by field id is unaffected. Child/enrollment fields keep their storage
    // vocabulary, which downstream resolution already handles.
    const canonical = systemFieldIdToCanonicalRef(entry.id);
    if (canonical?.entity_type === "person") {
        return {
            entity_type: "person",
            field_key: canonical.field_key,
            ...(entry.shared_value_key ? { shared_value_key: entry.shared_value_key } : {}),
            ...(entry.crm_mapping_key ? { crm_mapping_key: entry.crm_mapping_key } : {}),
        };
    }
    return {
        entity_type: entry.entity_type,
        field_key: entry.field_key,
        ...(entry.shared_value_key ? { shared_value_key: entry.shared_value_key } : {}),
        ...(entry.crm_mapping_key ? { crm_mapping_key: entry.crm_mapping_key } : {}),
    };
}

type Overrides = {
    label?: string;
    description?: string;
    required?: boolean;
    placeholder?: string;
    static_options_lines?: string;
};

/** Build a `FormSchemaV1` field from a registry row (IDs are stable system keys — not user-typed). */
export function formFieldFromRegistryEntry(entry: SystemFieldRegistryEntry, o: Overrides = {}): FormField {
    const label = o.label?.trim() || entry.default_label;
    const description = o.description !== undefined ? o.description.trim() || undefined : entry.default_description;
    const required = o.required !== undefined ? o.required : entry.default_required;
    const placeholder = o.placeholder?.trim() || undefined;
    const src = sourceFromEntry(entry);
    const id = entry.field_key;

    const baseCommon = { id, label, required, description, placeholder, field_source: src, read_only: entry.id.startsWith("rel:") ? true : undefined };

    switch (entry.suggested_kind) {
        case "text":
            return { ...baseCommon, type: "text" };
        case "textarea":
            return { ...baseCommon, type: "text", multiline: true };
        case "email":
            return { ...baseCommon, type: "text", validate: { pattern: EMAIL_PATTERN } };
        case "phone":
            return { ...baseCommon, type: "text", validate: { pattern: PHONE_PATTERN } };
        case "number":
            return { ...baseCommon, type: "number" };
        case "date":
            return { ...baseCommon, type: "date" };
        case "checkbox":
            return { ...baseCommon, type: "boolean" };
        case "select": {
            const optionSetKey = (entry.default_option_set_key ?? "").trim();
            if (optionSetKey) {
                return { ...baseCommon, type: "select", option_set_key: optionSetKey };
            }
            const lines = o.static_options_lines ?? entry.select_options_lines;
            if (lines?.trim()) {
                return {
                    ...baseCommon,
                    type: "select",
                    static_options: linesToStaticOptions(lines),
                };
            }
            return { ...baseCommon, type: "select" };
        }
        case "signature":
            return { ...baseCommon, type: "signature", signature: {} };
        default:
            return { ...baseCommon, type: "text" };
    }
}

/** Admin-only helper copy for custom unmapped fields — never shown on public embed runtime. */
export const CUSTOM_UNMAPPED_FIELD_ADMIN_DESCRIPTION =
    "Custom / unmapped — values are stored on the submission only; they are not automatically linked to CRM or enrollment entities.";

/** Freeform text not tied to registry / CRM hints (explicitly labeled in UI). */
export function customUnmappedTextField(): FormField {
    const suffix =
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 10) : `${Date.now()}`;
    const id = `custom_${suffix}`;
    return {
        id,
        type: "text",
        label: "Custom question",
        required: false,
        description: CUSTOM_UNMAPPED_FIELD_ADMIN_DESCRIPTION,
        field_source: { entity_type: "custom", field_key: "unmapped" },
    };
}
