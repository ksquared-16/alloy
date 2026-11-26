/**
 * POS-FP0 / Field Platform P1b — Forms field-registry binding validator (pure).
 *
 * Enforces the existing `FormField.field_source` seam for POS-connected surfaces.
 * Normalizes through fieldRegistryReferenceMatrix and canonical provider eligibility.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import {
    expandFieldDefinitionKeySetForFormsValidation,
    formFieldSourceToCanonicalProvider,
} from "@/lib/fields/formsFieldSourceBinding";
import { formsLegacyCompatibilityEntry } from "@/lib/fields/formsLegacyCompatibility";
import { evaluateFormsProviderEligibility, evaluateFormsRelationshipProviderEligibility } from "@/lib/fields/formsProviderEligibility";
import { findFormsDocumentsDataProvider } from "@/lib/fields/canonicalDataProviderRegistry";
import { validateFormsDocumentsP2Bindings } from "@/lib/forms/binding/validateFormsDocumentsP2Bindings";
import { formFieldSourceHasRelationshipLineage } from "@/lib/fields/formsRelationshipFieldSourceBinding";
import { findFormsRelationshipProvider } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";

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

export type FieldBindingViolationReason =
    | "missing_field_source"
    | "unresolved_field_key"
    | "unknown_binding"
    | "unsupported_provider_kind"
    | "unsupported_output_shape"
    | "missing_compatible_control";

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

function keyInSet(set: ReadonlySet<string>, entityType: string, fieldKey: string): boolean {
    return (
        set.has(fieldDefinitionKey(entityType, fieldKey)) ||
        set.has(`${entityType}:${fieldKey}`) ||
        set.has(`${entityType}::${fieldKey}`)
    );
}

function validateResolvedBinding(
    field: FormField,
    source: NonNullable<FormField["field_source"]>,
    expandedKeys: ReadonlySet<string>,
): FieldBindingViolation | null {
    const fieldKey = source.field_key?.trim() ?? "";
    const entityType = source.entity_type?.trim() ?? "";
    const resolution = formFieldSourceToCanonicalProvider(source);

    if (resolution.status === "custom") return null;

    if (resolution.status === "unknown") {
        return {
            field_id: field.id,
            reason: "unknown_binding",
            entity_type: entityType || undefined,
            field_key: fieldKey || undefined,
            message: `Field "${field.id}" binds to an unknown field source (${fieldDefinitionKey(entityType, fieldKey)}).`,
        };
    }

    const legacyCompat =
        resolution.legacySystemFieldId ? formsLegacyCompatibilityEntry(resolution.legacySystemFieldId) : undefined;
    if (legacyCompat && !legacyCompat.publishes) {
        return {
            field_id: field.id,
            reason: "unsupported_provider_kind",
            entity_type: entityType || undefined,
            field_key: fieldKey || undefined,
            message: `Field "${field.id}" uses a legacy binding that is no longer publishable.`,
        };
    }

    if (formFieldSourceHasRelationshipLineage(source)) {
        const providerRef = source.relationship!.provider_ref_key.trim();
        const provider = findFormsRelationshipProvider(providerRef) ?? findFormsDocumentsDataProvider(providerRef);
        if (!provider) {
            return {
                field_id: field.id,
                reason: "unknown_binding",
                entity_type: entityType || undefined,
                field_key: fieldKey || undefined,
                message: `Field "${field.id}" relationship binding references unknown provider "${providerRef}".`,
            };
        }
        const eligibility = evaluateFormsRelationshipProviderEligibility(provider.refKey);
        if (!eligibility.publish) {
            return {
                field_id: field.id,
                reason: "unsupported_provider_kind",
                entity_type: entityType || undefined,
                field_key: fieldKey || undefined,
                message: `Field "${field.id}" relationship provider "${providerRef}" is not publishable.`,
            };
        }
        return null;
    }

    const registryHit = keyInSet(expandedKeys, entityType, fieldKey);
    if (
        !registryHit &&
        resolution.status !== "legacy_load_only" &&
        resolution.status !== "legacy_alias" &&
        !legacyCompat?.publishes
    ) {
        return {
            field_id: field.id,
            reason: "unresolved_field_key",
            entity_type: entityType || undefined,
            field_key: fieldKey || undefined,
            message: `Field "${field.id}" binds to "${fieldDefinitionKey(entityType, fieldKey)}", which is not an active field definition for this organization.`,
        };
    }

    if (resolution.canonicalRef) {
        const providerRef =
            source.relationship?.provider_ref_key?.trim()
            ?? `${resolution.canonicalRef.entity_type}.${resolution.canonicalRef.field_key}`;
        const provider = findFormsDocumentsDataProvider(providerRef);
        if (provider) {
            const eligibility = evaluateFormsProviderEligibility(provider.refKey);
            if (!eligibility.publish) {
                const reason: FieldBindingViolationReason = eligibility.reasons.includes("unsupported_shape")
                    ? "unsupported_output_shape"
                    : eligibility.reasons.includes("consumer_capability_blocked")
                      ? "missing_compatible_control"
                      : "unsupported_provider_kind";
                return {
                    field_id: field.id,
                    reason,
                    entity_type: entityType || undefined,
                    field_key: fieldKey || undefined,
                    message: `Field "${field.id}" binds to provider "${provider.refKey}" which is not supported for Forms / Documents publish.`,
                };
            }
        }
    }

    return null;
}

/**
 * Validate that every value-bearing field in a POS-connected schema binds to an
 * active registry field. Returns the full list of violations (does not short-circuit).
 */
export function validatePosConnectedFieldBinding(
    schema: Pick<FormSchemaV1, "fields">,
    availableFieldKeys: ReadonlySet<string>,
): PosConnectedFieldBindingResult {
    const violations: FieldBindingViolation[] = [];
    const expandedKeys = expandFieldDefinitionKeySetForFormsValidation(availableFieldKeys);

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

            const violation = validateResolvedBinding(field, source, expandedKeys);
            if (violation) violations.push(violation);
        }
    };

    walk(schema.fields);
    violations.push(...validateFormsDocumentsP2Bindings(schema));
    return { ok: violations.length === 0, violations };
}

/** Publish-time binding validation for all Forms / Documents schemas (canonical + legacy). */
export function validateFormsDocumentsFieldBindingsAtPublish(
    schema: Pick<FormSchemaV1, "fields">,
    availableFieldKeys: ReadonlySet<string>,
): PosConnectedFieldBindingResult {
    return validatePosConnectedFieldBinding(schema, availableFieldKeys);
}
