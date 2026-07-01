/**
 * POS-FP0 — read proposed values by registry `field_key`, not by form-field `id`.
 *
 * POS doctrine: a Processing Case carries proposed values keyed by the shared
 * registry field (`entity_type` + `field_key`). The arbitrary form-field `id` is
 * retained only as provenance for locating the value in the submission payload —
 * it is never POS's identity for a value. Two different form fields bound to the
 * same `field_key` therefore resolve to the same proposed value key.
 *
 * Pure: no I/O. FP0 scope covers top-level fields; nested group/repeat payload
 * shapes are intentionally out of scope for this package.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

export interface FieldKeyRef {
    entity_type: string;
    field_key: string;
}

/** Resolve the registry key a form field binds to, or null when unbound. */
export function resolveFieldKeyForFormField(field: FormField): FieldKeyRef | null {
    const source = field.field_source;
    const fieldKey = source?.field_key?.trim() ?? "";
    const entityType = source?.entity_type?.trim() ?? "";
    if (!fieldKey || !entityType) return null;
    return { entity_type: entityType, field_key: fieldKey };
}

export interface FieldKeyProposedValue {
    entity_type: string;
    field_key: string;
    /** Provenance only — where the value came from in the payload. Never the POS identity. */
    form_field_id: string;
    value: unknown;
}

/**
 * Build proposed values keyed by registry `field_key` from a submission's top-level
 * `values` map. Skips unbound fields and structural groups. The result is keyed by
 * `field_key` (with `form_field_id` kept as provenance).
 */
export function buildFieldKeyProposedValues(
    schema: Pick<FormSchemaV1, "fields">,
    values: Record<string, unknown>
): FieldKeyProposedValue[] {
    const proposed: FieldKeyProposedValue[] = [];
    for (const field of schema.fields) {
        if (field.type === "group") continue;
        const ref = resolveFieldKeyForFormField(field);
        if (!ref) continue;
        if (!Object.prototype.hasOwnProperty.call(values, field.id)) continue;
        proposed.push({
            entity_type: ref.entity_type,
            field_key: ref.field_key,
            form_field_id: field.id,
            value: values[field.id],
        });
    }
    return proposed;
}
