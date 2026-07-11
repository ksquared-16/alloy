/**
 * Collection iteration context — explicit contexts available inside a repeatable collection section.
 *
 * Consumers compare provider context requirements against `available_contexts`.
 * Additional contexts may be supplied by packet/subject bindings without field-specific code.
 */

import type { FormGroupCollectionBinding } from "@/lib/forms/schema";
import { collectionRequiredContextForProvider } from "@/lib/fields/formsCollectionRepeatBinding";

export type AvailableContextEntry = {
    entity_type: string;
    qualifier?: string;
    /** Provenance label — collection_root, collection_item, packet_subject, … */
    source: string;
};

export type CollectionIterationContext = {
    root_entity_type: string;
    collection_provider_ref: string;
    item_entity_type: string;
    available_contexts: readonly AvailableContextEntry[];
};

export type BuildCollectionIterationContextInput = {
    collectionProviderRef: string;
    itemEntityType: string;
    /** When true, household/customer root context is available (required by collection binding). */
    includeCustomerRoot?: boolean;
    /** Explicit supplemental contexts — e.g. packet subject inquiry_child, active enrollment. */
    supplementalContexts?: readonly AvailableContextEntry[];
};

/** Build iteration context from collection binding semantics. */
export function buildCollectionIterationContext(
    input: BuildCollectionIterationContextInput,
): CollectionIterationContext {
    const contexts: AvailableContextEntry[] = [];

    const needsCustomerRoot =
        input.includeCustomerRoot !== false
        && collectionRequiredContextForProvider(input.collectionProviderRef).includes("customer_id");

    if (needsCustomerRoot) {
        contexts.push({ entity_type: "customer", source: "collection_root" });
    }

    contexts.push({
        entity_type: input.itemEntityType.trim(),
        source: "collection_item",
    });

    for (const extra of input.supplementalContexts ?? []) {
        if (
            !contexts.some(
                (c) =>
                    c.entity_type === extra.entity_type
                    && (c.qualifier ?? "") === (extra.qualifier ?? "")
                    && c.source === extra.source,
            )
        ) {
            contexts.push(extra);
        }
    }

    return {
        root_entity_type: needsCustomerRoot ? "customer" : input.itemEntityType.trim(),
        collection_provider_ref: input.collectionProviderRef.trim(),
        item_entity_type: input.itemEntityType.trim(),
        available_contexts: contexts,
    };
}

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

/** Extend iteration context with additional explicit bindings (immutable). */
export function withSupplementalIterationContexts(
    base: CollectionIterationContext,
    supplemental: readonly AvailableContextEntry[],
): CollectionIterationContext {
    return buildCollectionIterationContext({
        collectionProviderRef: base.collection_provider_ref,
        itemEntityType: base.item_entity_type,
        includeCustomerRoot: base.available_contexts.some(
            (c) => c.entity_type === "customer" && c.source === "collection_root",
        ),
        supplementalContexts: [...base.available_contexts, ...supplemental],
    });
}
