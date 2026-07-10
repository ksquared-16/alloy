/**
 * Collection-bound repeatable section model for Forms / Documents.
 */

import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import type { FormField, FormGroupCollectionBinding, FormIterationContext } from "@/lib/forms/schema";
import {
    findFormsCollectionBindingProvider,
    type FormsRepeatableCollectionRef,
} from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import { fieldDefinitionEntityTypeFromFormsEntity, systemFieldIdToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";
import { FORMS_COLLECTION_BINDING_AUTHORING_ENABLED } from "@/lib/fields/formsRelationshipOperationalSupport";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

export const FORMS_MAX_COLLECTION_NESTING_DEPTH = 1;

/** Map collection provider ref → iteration entity for nested scalar validation. */
export const FORMS_COLLECTION_ITERATION_ENTITY: Readonly<Record<FormsRepeatableCollectionRef, string>> = {
    children: "customer_member",
    household_members: "customer_member",
};

/** Inquiry/enrollment fields require explicit packet or form subject context — not implied by household child iteration. */
export const FORMS_INQUIRY_CHILD_FIELD_KEYS = new Set([
    "program_category_id",
    "schedule_type",
    "start_date",
    "program_room_cohort_key",
    "location_id",
    "status_key",
]);

export function collectionRefFromProvider(provider: CanonicalDataProvider): FormsRepeatableCollectionRef | null {
    const fromProjection = provider.collectionProjection?.collection_ref?.trim();
    if (fromProjection === "children" || fromProjection === "household_members") return fromProjection;
    if (provider.refKey === "children") return "children";
    if (provider.refKey === "household.members") return "household_members";
    return null;
}

export function isWholeCollectionProvider(provider: CanonicalDataProvider): boolean {
    return provider.kind === "collection" && provider.outputShape === "collection";
}

export function collectionBindingFromProvider(provider: CanonicalDataProvider): FormGroupCollectionBinding {
    const collectionRef = collectionRefFromProvider(provider);
    const iterationEntity =
        (collectionRef ? FORMS_COLLECTION_ITERATION_ENTITY[collectionRef] : null)
        ?? provider.settingsEntity
        ?? "customer_member";
    return {
        collection_provider_ref: provider.refKey,
        iteration_entity_type: iterationEntity,
        iteration_alias: collectionRef === "children" ? "child" : collectionRef === "household_members" ? "member" : undefined,
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

export function nestedFieldRequiresEnrollmentContext(field: FormField): boolean {
    if (field.type === "group") return false;
    const fieldKey = field.field_source?.field_key?.trim().toLowerCase() ?? "";
    if (FORMS_INQUIRY_CHILD_FIELD_KEYS.has(fieldKey)) return true;
    const entity = field.field_source?.entity_type?.trim().toLowerCase() ?? "";
    return entity === "enrollment" || entity === "opportunity";
}

export function validateNestedFieldForIterationEntity(field: FormField, iterationEntityType: string): boolean {
    if (field.type === "group") return false;
    const source = field.field_source;
    if (!source || source.entity_type === "custom") return true;

    if (nestedFieldRequiresEnrollmentContext(field)) return false;

    const entity = source.entity_type?.trim().toLowerCase() ?? "";
    const fieldKey = source.field_key?.trim() ?? "";

    const legacyEntry = OPERATIONAL_FORM_SYSTEM_FIELDS.find(
        (e) => e.entity_type === source.entity_type && e.field_key === source.field_key,
    );
    const legacyCanonical = legacyEntry ? systemFieldIdToCanonicalRef(legacyEntry.id) : null;

    const defEntity =
        legacyCanonical?.entity_type
        ?? fieldDefinitionEntityTypeFromFormsEntity(entity);
    if (!defEntity) return false;

    if (iterationEntityType === "customer_member") {
        return defEntity === "customer_member";
    }
    return defEntity === iterationEntityType;
}

export function resolveCollectionBindingProvider(refKey: string): CanonicalDataProvider | undefined {
    return findFormsCollectionBindingProvider(refKey);
}

export function collectionBindingAuthoringEnabled(): boolean {
    return FORMS_COLLECTION_BINDING_AUTHORING_ENABLED;
}
