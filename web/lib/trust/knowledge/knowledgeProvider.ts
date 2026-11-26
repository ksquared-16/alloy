/**
 * Knowledge Provider interface.
 *
 * Knowledge retrieval is deterministic: reasoning requests CATEGORIES and the
 * Knowledge Platform resolves assets. The Trust Runtime never searches an
 * arbitrary repository.
 *
 * V1 ships the interface and the empty provider only. Knowledge Asset
 * persistence, versioning and authoring are Phase 4 and are explicitly out of
 * this slice — but the retrieval step exists in the pipeline so the canonical
 * ordering is proven now rather than retrofitted later.
 *
 * @see docs/platform/trust/knowledge-platform.md
 */

import type { KnowledgeReference } from "@/lib/trust/privacy/privacyEngine";

export type KnowledgeProviderV1 = {
    readonly key: string;
    /** Resolves published assets for the requested categories. Deterministic. */
    retrieve(categories: readonly string[]): Promise<readonly KnowledgeReference[]>;
};

/**
 * The V1 provider. Returns nothing, for every category, always.
 *
 * This is not a stub standing in for a missing capability — Slice 1's Decision
 * Class declares no knowledge categories. It exists so that the ordering
 * assertion (knowledge content is retrieved only AFTER privacy preparation)
 * holds against the empty set and the seam is real.
 */
export function createEmptyKnowledgeProvider(): KnowledgeProviderV1 {
    return {
        key: "empty_v1",
        async retrieve(): Promise<readonly KnowledgeReference[]> {
            return [];
        },
    };
}
