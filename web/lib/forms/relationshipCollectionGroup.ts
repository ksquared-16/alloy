/**
 * REPEATABLE PEOPLE, FROM THE CANONICAL RELATIONSHIP DEFINITIONS.
 *
 * "Emergency contacts — + Add another", "Physicians", "Authorized pickup people": each is a repeatable
 * group bound to a relationship collection. The definitions in `relationshipDefinitions.ts` are the one
 * authority for which relationships exist, what they are called, how many there may be and what is
 * asked about each person. Nothing here names a relationship.
 *
 * The importer's projected collections and a group an operator adds in Forms Studio are built by the
 * same function, so an imported "Emergency Contacts" and a hand-added one are the same group.
 */
import {
    collectableRelationshipDefinitions,
    RELATIONSHIP_DEFINITIONS,
} from "@/lib/fields/relationship/relationshipDefinitions";
import {
    relationshipNestedFieldLabel,
    relationshipNestedFieldSource,
    relationshipNestedFieldType,
} from "@/lib/fields/relationship/relationshipNestedFields";
import type { FormField, FormFieldSource } from "@/lib/forms/schema";

export type CollectionGroupSpec = {
    readonly id: string;
    readonly label: string;
    readonly cardinality: "one" | "many";
    readonly collection_provider_ref: string;
    readonly item_entity_type: string;
    readonly iteration_alias?: string | null;
    readonly nested_fields: ReadonlyArray<{
        readonly id: string;
        readonly label: string;
        readonly type: string;
        readonly required?: boolean;
        readonly field_source?: FormFieldSource;
    }>;
};

/** The form group for one relationship collection. Role, scope and apply command are NOT carried. */
export function collectionGroupField(spec: CollectionGroupSpec): FormField {
    return {
        id: spec.id,
        type: "group",
        label: spec.label,
        required: false,
        // Cardinality comes from the definition; a minimum is an authoring decision made in Studio.
        repeat: spec.cardinality === "many" ? { min: 0 } : { min: 0, max: 1 },
        collection_binding: {
            collection_provider_ref: spec.collection_provider_ref,
            iteration_entity_type: spec.item_entity_type,
            ...(spec.iteration_alias ? { iteration_alias: spec.iteration_alias } : {}),
        },
        fields: spec.nested_fields.map((n) => ({
            id: n.id,
            type: n.type === "boolean" ? "boolean" : n.type === "date" ? "date" : n.type === "number" ? "number" : "text",
            label: n.label,
            required: Boolean(n.required),
            ...(n.field_source ? { field_source: n.field_source } : {}),
        })) as FormField[],
    } as FormField;
}

export type PeopleGroupOption = {
    readonly definitionKey: string;
    readonly label: string;
    /** What is asked about each person, in the operator's words. */
    readonly asks: readonly string[];
    readonly repeats: boolean;
};

/** Every relationship an operator can collect on a form, in business language. */
export function peopleGroupOptions(): PeopleGroupOption[] {
    return collectableRelationshipDefinitions().map((def) => ({
        definitionKey: def.definition_key,
        label: def.label,
        asks: def.nested_field_keys.map(relationshipNestedFieldLabel),
        repeats: def.cardinality === "many",
    }));
}

/** Build the repeatable group for a relationship definition, or null when it is not collectable. */
export function relationshipCollectionGroupField(definitionKey: string, groupId: string): FormField | null {
    const def = RELATIONSHIP_DEFINITIONS.find((d) => d.definition_key === definitionKey && d.collectable);
    if (!def) return null;
    return collectionGroupField({
        id: groupId,
        label: def.label,
        cardinality: def.cardinality,
        collection_provider_ref: def.provider_ref,
        item_entity_type: def.item_entity_type,
        iteration_alias: def.iteration_alias,
        nested_fields: def.nested_field_keys.map((key) => ({
            id: `${groupId}__${key}`,
            label: relationshipNestedFieldLabel(key),
            type: relationshipNestedFieldType(key),
            required: false,
            field_source: relationshipNestedFieldSource(key, def),
        })),
    });
}

/** The relationship a group collects, by its binding — for the inspector to name it. */
export function relationshipLabelForGroup(field: FormField): string | null {
    const ref = (field as { collection_binding?: { collection_provider_ref?: string } }).collection_binding
        ?.collection_provider_ref;
    if (!ref) return null;
    return RELATIONSHIP_DEFINITIONS.find((d) => d.provider_ref === ref)?.label ?? null;
}
