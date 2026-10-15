/**
 * Forms adapter - build collection iteration context from form group bindings.
 */

import type { FormGroupCollectionBinding } from "@/lib/forms/schema";
import {
    buildCollectionIterationContext,
    type AvailableContextEntry,
    type CollectionIterationContext,
} from "@/lib/fields/collection/collectionIterationContext";
import { relationshipDefinitionForRef } from "@/lib/fields/relationship/relationshipDefinitions";

export function iterationContextFromCollectionBinding(
    binding: FormGroupCollectionBinding,
    options?: { supplementalContexts?: readonly AvailableContextEntry[] },
): CollectionIterationContext {
    /*
     * A RELATIONSHIP COLLECTION'S MEMBER IS A PERSON AND THE EDGE THAT LINKS THEM.
     *
     * Each Emergency Contact row is one person AND one person-child relationship, and the relationship
     * definition stores edge-owned answers (Relationship type) on that edge
     * (`relationshipNestedFieldSource`). Declaring only the person made every edge-owned line
     * "unavailable" in the row, so a family who answered "Relationship type" was refused at submit for
     * a line the definition itself puts there.
     */
    const edge: AvailableContextEntry[] = relationshipDefinitionForRef(binding.collection_provider_ref)
        ? [{ entity_type: "person_child_relationship", source: "collection_item_edge" }]
        : [];
    return buildCollectionIterationContext({
        collectionProviderRef: binding.collection_provider_ref,
        itemEntityType: binding.iteration_entity_type,
        supplementalContexts: [...edge, ...(options?.supplementalContexts ?? [])],
    });
}
