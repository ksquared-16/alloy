/**
 * Safe fallback when org-published layout docs are empty or non-renderable.
 */

import { buildLeadDrawerDefaultDoc, buildLeadQueueDefaultDoc } from "../defaultLeadLayouts";
import { buildPersonDrawerDefaultDoc } from "../defaultPersonLayouts";
import { buildChildDrawerDefaultDoc } from "../defaultChildLayouts";
import type { LayoutDoc, LayoutSurface } from "../layoutV2";
import { isLayoutDocRenderableForProduction } from "./isLayoutDocRenderableForProduction";
import { shouldFallbackToDefaultLayoutDoc } from "./layoutRuntimeEvidence";

export type EffectiveLayoutDocResolution = {
    doc: LayoutDoc;
    source: string;
    layoutKey?: string;
    usedFallback: boolean;
    fallbackReason?: string;
};

function defaultDocFor(entityType: string, surface: LayoutSurface, isWaitlist?: boolean): LayoutDoc | null {
    if (entityType === "opportunities" && surface === "drawer") return buildLeadDrawerDefaultDoc();
    if (entityType === "person" && surface === "drawer") return buildPersonDrawerDefaultDoc();
    if (entityType === "child" && surface === "drawer") return buildChildDrawerDefaultDoc();
    if (entityType === "opportunities" && surface === "queue") {
        return isWaitlist ? null : buildLeadQueueDefaultDoc();
    }
    return null;
}

/** Resolve production layout doc, falling back to platform default when org doc is malformed. */
export function resolveEffectiveProductionLayoutDoc(input: {
    doc: LayoutDoc | null | undefined;
    source: string;
    layoutKey?: string;
    entityType: string;
    surface: LayoutSurface;
    isWaitlist?: boolean;
}): EffectiveLayoutDocResolution {
    const candidate = input.doc;
    if (
        candidate &&
        candidate.sections?.length &&
        isLayoutDocRenderableForProduction(candidate) &&
        !shouldFallbackToDefaultLayoutDoc(candidate)
    ) {
        return {
            doc: candidate,
            source: input.source,
            layoutKey: input.layoutKey,
            usedFallback: false,
        };
    }

    const fallback = defaultDocFor(input.entityType, input.surface, input.isWaitlist);
    if (fallback && isLayoutDocRenderableForProduction(fallback)) {
        return {
            doc: fallback,
            source: "builtin_fallback",
            layoutKey: (fallback.metadata as { template?: string } | undefined)?.template,
            usedFallback: true,
            fallbackReason:
                !candidate?.sections?.length ? "empty_published_doc"
                : !isLayoutDocRenderableForProduction(candidate) ? "unrenderable_published_doc"
                :   "zero_production_items",
        };
    }

    return {
        doc: candidate ?? { formatVersion: 1, surface: input.surface, entityType: input.entityType, sections: [] },
        source: input.source,
        layoutKey: input.layoutKey,
        usedFallback: false,
    };
}
