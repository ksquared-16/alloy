/**
 * Collection iteration context - explicit contexts available inside a repeatable collection section.
 */

import { collectionRequiredContextForProvider } from "@/lib/fields/collection/canonicalCollectionProviderRegistry";

export type AvailableContextEntry = {
    entity_type: string;
    qualifier?: string;
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
    includeCustomerRoot?: boolean;
    supplementalContexts?: readonly AvailableContextEntry[];
};

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
    contexts.push({ entity_type: input.itemEntityType.trim(), source: "collection_item" });
    for (const extra of input.supplementalContexts ?? []) {
        if (!contexts.some((c) => c.entity_type === extra.entity_type && (c.qualifier ?? "") === (extra.qualifier ?? "") && c.source === extra.source)) {
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

export function withSupplementalIterationContexts(
    base: CollectionIterationContext,
    supplemental: readonly AvailableContextEntry[],
): CollectionIterationContext {
    return buildCollectionIterationContext({
        collectionProviderRef: base.collection_provider_ref,
        itemEntityType: base.item_entity_type,
        includeCustomerRoot: base.available_contexts.some((c) => c.entity_type === "customer" && c.source === "collection_root"),
        supplementalContexts: [...base.available_contexts, ...supplemental],
    });
}
