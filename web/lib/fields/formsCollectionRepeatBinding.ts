/**
 * Collection-bound repeatable section model for Forms / Documents.
 */

import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import type { FormField, FormGroupCollectionBinding, FormIterationContext } from "@/lib/forms/schema";
import {
    findFormsCollectionBindingProvider,
    FORMS_REPEATABLE_COLLECTION_REFS,
    type FormsRepeatableCollectionRef,
} from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import {
    collectableRelationshipDefinitions,
    relationshipDefinitionForRef,
} from "@/lib/fields/relationship/relationshipDefinitions";
import {
    collectionBindingAuthoringEnabledForProvider,
    FORMS_COLLECTION_BINDING_AUTHORING_ENABLED,
} from "@/lib/fields/formsRelationshipOperationalSupport";
import {
    buildCollectionIterationContext,
    type CollectionIterationContext,
} from "@/lib/fields/collection/collectionIterationContext";
import { iterationContextFromCollectionBinding } from "@/lib/forms/collection/formsCollectionIterationContext";
import {
    evaluateFormFieldAvailabilityForIteration,
    isFormFieldAvailableForIteration,
} from "@/lib/forms/collection/formsProviderAvailability";
import {
    collectionItemEntityTypeForProvider,
    collectionRequiredContextForProvider,
    findCanonicalCollectionProvider,
} from "@/lib/fields/collection/canonicalCollectionProviderRegistry";

export type { CollectionIterationContext };
export { iterationContextFromCollectionBinding, buildCollectionIterationContext };

export const FORMS_MAX_COLLECTION_NESTING_DEPTH = 1;

/**
 * Map collection ref → iteration entity for nested scalar validation. Natives are literal; configured
 * relationship collections derive from `RELATIONSHIP_DEFINITIONS`. Fallback only — the canonical path
 * is `collectionItemEntityTypeForProvider`.
 */
export const FORMS_COLLECTION_ITERATION_ENTITY: Readonly<Record<string, string>> = {
    children: "customer_member",
    household_members: "customer_member",
    ...Object.fromEntries(collectableRelationshipDefinitions().map((d) => [d.collection_ref, d.item_entity_type])),
};

/**
 * Required launch/source context keys per collection provider ref. Fallback only — the canonical path
 * is `collectionRequiredContextForProvider`.
 */
export const FORMS_COLLECTION_REQUIRED_CONTEXT: Readonly<Record<string, readonly string[]>> = {
    children: ["customer_id"],
    "household.members": ["customer_id"],
    ...Object.fromEntries(collectableRelationshipDefinitions().map((d) => [d.provider_ref, d.required_context_keys])),
};

/** @deprecated Use evaluateFormFieldAvailabilityForIteration — retained for transitional imports. */
export function nestedFieldRequiresEnrollmentContext(_field: FormField): boolean {
    return false;
}

/** Evaluate nested field availability using canonical context requirements. */
export function validateNestedFieldForIterationEntity(field: FormField, iterationEntityType: string): boolean {
    const ctx = buildCollectionIterationContext({
        collectionProviderRef: "collection",
        itemEntityType: iterationEntityType,
    });
    return isFormFieldAvailableForIteration(field, ctx);
}

/** Structured availability for nested fields inside a collection-bound group. */
export function nestedFieldAvailabilityForBinding(
    field: FormField,
    binding: FormGroupCollectionBinding,
) {
    return evaluateFormFieldAvailabilityForIteration(field, iterationContextFromCollectionBinding(binding));
}

export function collectionRefFromProvider(provider: CanonicalDataProvider): FormsRepeatableCollectionRef | string | null {
    const fromProjection = provider.collectionProjection?.collection_ref?.trim();
    if (fromProjection && FORMS_REPEATABLE_COLLECTION_REFS.includes(fromProjection)) {
        return fromProjection;
    }
    const canonical = findCanonicalCollectionProvider(provider.refKey);
    return canonical?.collectionRef ?? null;
}

export function isWholeCollectionProvider(provider: CanonicalDataProvider): boolean {
    return provider.kind === "collection" && provider.outputShape === "collection";
}

export function collectionBindingFromProvider(provider: CanonicalDataProvider): FormGroupCollectionBinding {
    const collectionRef = collectionRefFromProvider(provider);
    const iterationEntity =
        collectionItemEntityTypeForProvider(provider.refKey)
        ?? (collectionRef ? FORMS_COLLECTION_ITERATION_ENTITY[collectionRef] : null)
        ?? provider.settingsEntity
        ?? "customer_member";
    // Natives carry literal aliases; configured relationship collections carry theirs on the definition.
    const definitionAlias = relationshipDefinitionForRef(provider.refKey)?.iteration_alias;
    return {
        collection_provider_ref: provider.refKey,
        iteration_entity_type: iterationEntity,
        iteration_alias:
            collectionRef === "children" ? "child"
            : collectionRef === "household_members" ? "member"
            : definitionAlias,
    };
}

export function iterationContextFromGroupBinding(binding: FormGroupCollectionBinding): FormIterationContext {
    return {
        scope: "collection_item",
        collection_provider_ref: binding.collection_provider_ref,
        iteration_entity_type: binding.iteration_entity_type,
        ...(binding.iteration_alias ? { iteration_alias: binding.iteration_alias } : {}),
    };
}

export function groupFieldHasCollectionBinding(
    field: FormField,
): field is FormField & { type: "group"; collection_binding: FormGroupCollectionBinding } {
    return field.type === "group" && Boolean(field.collection_binding?.collection_provider_ref?.trim());
}

export { collectionRequiredContextForProvider };

export function collectionContextIsValid(
    refKey: string,
    launchFks: { customer_id?: string | null; customer_member_id?: string | null },
): boolean {
    const required = collectionRequiredContextForProvider(refKey);
    if (required.includes("customer_id") && !launchFks.customer_id?.trim()) return false;
    if (required.includes("customer_member_id") && !launchFks.customer_member_id?.trim()) return false;
    return true;
}

export function resolveCollectionBindingProvider(refKey: string): CanonicalDataProvider | undefined {
    return findFormsCollectionBindingProvider(refKey);
}

export function collectionBindingAuthoringEnabled(): boolean {
    return FORMS_COLLECTION_BINDING_AUTHORING_ENABLED;
}

export function collectionBindingAuthoringEnabledForRef(refKey: string): boolean {
    return collectionBindingAuthoringEnabledForProvider(refKey);
}
