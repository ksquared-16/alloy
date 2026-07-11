/**
 * P2 publish validation — relationship leaves and collection-bound repeatable sections.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import {
    findFormsCollectionBindingProvider,
    findFormsRelationshipProvider,
} from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import {
    FORMS_MAX_COLLECTION_NESTING_DEPTH,
    collectionBindingAuthoringEnabledForRef,
    collectionContextIsValid,
    groupFieldHasCollectionBinding,
    nestedFieldAvailabilityForBinding,
} from "@/lib/fields/formsCollectionRepeatBinding";
import { evaluateFormsRelationshipProviderEligibility } from "@/lib/fields/formsProviderEligibility";
import {
    formFieldSourceHasRelationshipLineage,
    relationshipProviderRefFromFieldSource,
} from "@/lib/fields/formsRelationshipFieldSourceBinding";
import {
    formsRelationshipWriteModeForFieldSource,
    relationshipBindingMustBeReadOnlyAtPublish,
} from "@/lib/fields/formsRelationshipWriteSemantics";
import { isFormsRelationshipPublishableInP2 } from "@/lib/fields/formsRelationshipOperationalSupport";
import { roleSupportsSingularRelationshipLeaf } from "@/lib/fields/relationship/relationshipSemanticShape";
import { formsRelationshipRoleFromProvider } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import type { FieldBindingViolation } from "@/lib/forms/binding/validatePosConnectedFieldBinding";

function pushViolation(
    violations: FieldBindingViolation[],
    fieldId: string,
    reason: FieldBindingViolation["reason"],
    message: string,
): void {
    violations.push({ field_id: fieldId, reason, message });
}

function validateRelationshipLeaf(field: FormField, violations: FieldBindingViolation[]): void {
    const source = field.field_source;
    if (!source) return;
    if (!formFieldSourceHasRelationshipLineage(source)) return;

    const rel = source.relationship!;
    const providerRef = relationshipProviderRefFromFieldSource(source)!;
    const provider = findFormsRelationshipProvider(providerRef);
    if (!provider || provider.kind !== "relationship") {
        pushViolation(
            violations,
            field.id,
            "unknown_binding",
            `Field "${field.id}" relationship binding references unknown provider "${providerRef}".`,
        );
        return;
    }


    const publishRole = formsRelationshipRoleFromProvider(provider);
    if (publishRole && !roleSupportsSingularRelationshipLeaf(publishRole)) {
        pushViolation(
            violations,
            field.id,
            "unsupported_provider_kind",
            `Field "${field.id}" uses role "${publishRole}" which is collection-shaped — singular relationship leaves cannot publish until collection authoring is available.`,
        );
        return;
    }

    if (!isFormsRelationshipPublishableInP2(provider)) {
        pushViolation(
            violations,
            field.id,
            "unsupported_provider_kind",
            `Field "${field.id}" relationship role "${rel.role ?? "unknown"}" is not operational in P2.`,
        );
        return;
    }

    if (rel.relationship_id !== provider.relationship?.relationship_id) {
        pushViolation(
            violations,
            field.id,
            "unknown_binding",
            `Field "${field.id}" relationship_id does not match provider "${providerRef}".`,
        );
    }

    if (!rel.leaf_provider_ref_key?.trim()) {
        pushViolation(
            violations,
            field.id,
            "unknown_binding",
            `Field "${field.id}" relationship binding must declare leaf_provider_ref_key.`,
        );
    }

    const eligibility = evaluateFormsRelationshipProviderEligibility(provider.refKey);
    if (!eligibility.publish) {
        pushViolation(
            violations,
            field.id,
            "unsupported_provider_kind",
            `Field "${field.id}" relationship provider "${providerRef}" is not publishable for Forms / Documents.`,
        );
    }

    const writeMode = formsRelationshipWriteModeForFieldSource(rel);
    if (writeMode === "unsupported_input") {
        pushViolation(
            violations,
            field.id,
            "unsupported_provider_kind",
            `Field "${field.id}" relationship binding is not supported for submitted input in P2.`,
        );
    }

    if (!relationshipBindingMustBeReadOnlyAtPublish(rel, field.read_only)) {
        pushViolation(
            violations,
            field.id,
            "unsupported_provider_kind",
            `Field "${field.id}" relationship leaf must be read-only in P2 (prefill-only; no deterministic write target).`,
        );
    }
}

function validateCollectionGroup(field: FormField & { type: "group" }, violations: FieldBindingViolation[], depth: number): void {
    if (!groupFieldHasCollectionBinding(field)) return;

    const binding = field.collection_binding!;

    if (!collectionBindingAuthoringEnabledForRef(binding.collection_provider_ref)) {
        pushViolation(
            violations,
            field.id,
            "unsupported_provider_kind",
            `Repeatable section "${field.id}" uses collection provider "${binding.collection_provider_ref}" which is not enabled for authoring.`,
        );
        return;
    }

    if (depth > FORMS_MAX_COLLECTION_NESTING_DEPTH) {
        pushViolation(
            violations,
            field.id,
            "unsupported_output_shape",
            `Field "${field.id}" exceeds supported collection nesting depth.`,
        );
        return;
    }

    const provider = findFormsCollectionBindingProvider(binding.collection_provider_ref);
    if (!provider || provider.outputShape !== "collection") {
        pushViolation(
            violations,
            field.id,
            "unsupported_provider_kind",
            `Repeatable section "${field.id}" references unknown collection provider "${binding.collection_provider_ref}".`,
        );
        return;
    }

    if (!field.repeat) {
        pushViolation(
            violations,
            field.id,
            "unsupported_output_shape",
            `Repeatable section "${field.id}" must declare repeat rules when bound to a collection.`,
        );
    }

    for (const child of field.fields) {
        if (child.type === "group" && groupFieldHasCollectionBinding(child)) {
            pushViolation(
                violations,
                child.id,
                "unsupported_output_shape",
                `Nested collection repeaters are not supported (field "${child.id}").`,
            );
        }
        if (child.type !== "group" && child.field_source) {
            const availability = nestedFieldAvailabilityForBinding(child, binding);
            if (!availability.available) {
                pushViolation(
                    violations,
                    child.id,
                    availability.reason === "missing_required_context"
                        ? "unsupported_provider_kind"
                        : "unsupported_provider_kind",
                    availability.message
                        ?? `Field "${child.id}" is not available in collection iteration context "${binding.iteration_entity_type}".`,
                );
            }
        }
        if (child.type === "group") validateCollectionGroup(child, violations, depth + 1);
    }
}

function validateScalarNotCollectionProvider(field: FormField, violations: FieldBindingViolation[]): void {
    const ref = relationshipProviderRefFromFieldSource(field.field_source ?? null);
    if (!ref) return;
    const provider = findFormsCollectionBindingProvider(ref);
    if (provider?.outputShape === "collection") {
        pushViolation(
            violations,
            field.id,
            "unsupported_provider_kind",
            `Field "${field.id}" cannot use collection provider "${ref}" as a scalar question.`,
        );
    }
}

/**
 * Extend publish validation for P2 relationship leaves and repeatable sections.
 * Pure — no I/O.
 */
export function validateFormsDocumentsP2Bindings(
    schema: Pick<FormSchemaV1, "fields">,
): FieldBindingViolation[] {
    const violations: FieldBindingViolation[] = [];

    const walk = (fields: readonly FormField[], depth: number) => {
        for (const field of fields) {
            if (field.type === "group") {
                validateCollectionGroup(field, violations, depth);
                walk(field.fields, depth + 1);
                continue;
            }
            validateRelationshipLeaf(field, violations);
            validateScalarNotCollectionProvider(field, violations);
        }
    };

    walk(schema.fields, 0);
    return violations;
}
