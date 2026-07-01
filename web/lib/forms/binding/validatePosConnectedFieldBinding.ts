/**
 * POS-FP0 — POS-connected field-registry binding validator (pure).
 *
 * Enforces the existing `FormField.field_source.field_key` seam for POS-connected
 * surfaces: every value-bearing field must bind to an active `field_definitions`
 * row (by `entity_type` + `field_key`). This is the rule that prevents POS from
 * deepening the Forms JSON-field divergence (see docs/product/pos/POS-F04).
 *
 * Pure: takes a parsed schema and the set of available registry keys; performs no
 * I/O. The DB load of available keys lives in `loadOrgFieldDefinitionKeySet.ts`.
 *
 * Scope (FP0): value-bearing leaf types require binding. Structural `group` is
 * recursed into; artifact-producing `signature` / `file_ref` are NOT required to
 * bind (they do not promote a field value). Legacy forms are never validated here
 * — enforcement is gated on the POS-connected marker upstream.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

/** Leaf field types that promote a value and therefore must bind to the registry. */
export const BINDING_REQUIRED_FIELD_TYPES = [
    "text",
    "number",
    "date",
    "boolean",
    "select",
    "multiselect",
] as const;

/** Canonical composite key for a registry field: `${entity_type}::${field_key}`. */
export function fieldDefinitionKey(entityType: string, fieldKey: string): string {
    return `${entityType}::${fieldKey}`;
}

export type FieldBindingViolationReason = "missing_field_source" | "unresolved_field_key";

export interface FieldBindingViolation {
    field_id: string;
    reason: FieldBindingViolationReason;
    entity_type?: string;
    field_key?: string;
    message: string;
}

export interface PosConnectedFieldBindingResult {
    ok: boolean;
    violations: FieldBindingViolation[];
}

function requiresBinding(field: FormField): boolean {
    return (BINDING_REQUIRED_FIELD_TYPES as readonly string[]).includes(field.type);
}

/**
 * Validate that every value-bearing field in a POS-connected schema binds to an
 * active registry field. Returns the full list of violations (does not short-circuit).
 */
export function validatePosConnectedFieldBinding(
    schema: Pick<FormSchemaV1, "fields">,
    availableFieldKeys: ReadonlySet<string>
): PosConnectedFieldBindingResult {
    const violations: FieldBindingViolation[] = [];

    const walk = (fields: readonly FormField[]): void => {
        for (const field of fields) {
            if (field.type === "group") {
                walk(field.fields);
                continue;
            }
            if (!requiresBinding(field)) continue;

            const source = field.field_source;
            const fieldKey = source?.field_key?.trim() ?? "";
            const entityType = source?.entity_type?.trim() ?? "";

            if (!source || !fieldKey) {
                violations.push({
                    field_id: field.id,
                    reason: "missing_field_source",
                    message: `Field "${field.id}" must bind to a registry field (field_source.field_key) for POS-connected surfaces.`,
                });
                continue;
            }

            if (!entityType || !availableFieldKeys.has(fieldDefinitionKey(entityType, fieldKey))) {
                violations.push({
                    field_id: field.id,
                    reason: "unresolved_field_key",
                    entity_type: entityType || undefined,
                    field_key: fieldKey,
                    message: `Field "${field.id}" binds to "${fieldDefinitionKey(entityType, fieldKey)}", which is not an active field definition for this organization.`,
                });
            }
        }
    };

    walk(schema.fields);
    return { ok: violations.length === 0, violations };
}
