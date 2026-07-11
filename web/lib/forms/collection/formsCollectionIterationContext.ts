/**
 * Forms adapter - build collection iteration context from form group bindings.
 */

import type { FormGroupCollectionBinding } from "@/lib/forms/schema";
import {
    buildCollectionIterationContext,
    type AvailableContextEntry,
    type CollectionIterationContext,
} from "@/lib/fields/collection/collectionIterationContext";

export function iterationContextFromCollectionBinding(
    binding: FormGroupCollectionBinding,
    options?: { supplementalContexts?: readonly AvailableContextEntry[] },
): CollectionIterationContext {
    return buildCollectionIterationContext({
        collectionProviderRef: binding.collection_provider_ref,
        itemEntityType: binding.iteration_entity_type,
        supplementalContexts: options?.supplementalContexts,
    });
}
