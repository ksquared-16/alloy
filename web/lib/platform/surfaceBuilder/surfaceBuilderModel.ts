/**
 * Platform Surface Builder — pure engine.
 *
 * Generic document operations + a reducer. No React, no surface-specific logic, no
 * `surfaceType` branching. The same engine drives every surface; consumers differ only
 * in their `SurfaceDefinition`. Callers supply new instance/section ids (deterministic,
 * testable). All operations are immutable.
 */

import type {
    SurfaceDoc,
    SurfaceSectionInstance,
    SurfaceCardInstance,
    SectionMode,
} from "@/lib/platform/surfaceBuilder/surfaceDefinition";

export const IMPLICIT_SECTION_ID = "__surface__";

/** An empty document. A single implicit section unless the surface authors sections. */
export function emptyDoc(sectionMode: SectionMode): SurfaceDoc {
    if (sectionMode === "none") {
        return { sections: [{ sectionId: IMPLICIT_SECTION_ID, title: "", cards: [] }] };
    }
    return { sections: [] };
}

export type CardLocation = { sectionIndex: number; cardIndex: number };

export function findCard(doc: SurfaceDoc, instanceId: string): CardLocation | null {
    for (let s = 0; s < doc.sections.length; s++) {
        const c = doc.sections[s].cards.findIndex((card) => card.instanceId === instanceId);
        if (c !== -1) return { sectionIndex: s, cardIndex: c };
    }
    return null;
}

export function getCard(doc: SurfaceDoc, instanceId: string): SurfaceCardInstance | null {
    const loc = findCard(doc, instanceId);
    return loc ? doc.sections[loc.sectionIndex].cards[loc.cardIndex] : null;
}

export function countCards(doc: SurfaceDoc): number {
    return doc.sections.reduce((n, s) => n + s.cards.length, 0);
}

function mapSection(
    doc: SurfaceDoc,
    sectionId: string,
    fn: (section: SurfaceSectionInstance) => SurfaceSectionInstance,
): SurfaceDoc {
    return { sections: doc.sections.map((s) => (s.sectionId === sectionId ? fn(s) : s)) };
}

/** Insert a card instance into a section at an index (clamped). */
export function insertCard(
    doc: SurfaceDoc,
    sectionId: string,
    index: number,
    instance: SurfaceCardInstance,
): SurfaceDoc {
    return mapSection(doc, sectionId, (s) => {
        const at = Math.max(0, Math.min(index, s.cards.length));
        const cards = [...s.cards.slice(0, at), instance, ...s.cards.slice(at)];
        return { ...s, cards };
    });
}

export function removeCard(doc: SurfaceDoc, instanceId: string): SurfaceDoc {
    return { sections: doc.sections.map((s) => ({ ...s, cards: s.cards.filter((c) => c.instanceId !== instanceId) })) };
}

/** Move a card to a target section + index (cross-section aware). */
export function moveCard(doc: SurfaceDoc, instanceId: string, toSectionId: string, toIndex: number): SurfaceDoc {
    const card = getCard(doc, instanceId);
    if (!card) return doc;
    const without = removeCard(doc, instanceId);
    return insertCard(without, toSectionId, toIndex, card);
}

export type CardPatch = Partial<Pick<SurfaceCardInstance, "contentId" | "span" | "promotedTo">> & {
    /** Merged into the instance config. */
    config?: Record<string, unknown>;
};

/** Patch one card instance (content / span / promotion / config-merge). */
export function updateCard(doc: SurfaceDoc, instanceId: string, patch: CardPatch): SurfaceDoc {
    return {
        sections: doc.sections.map((s) => ({
            ...s,
            cards: s.cards.map((c) =>
                c.instanceId === instanceId
                    ? {
                          ...c,
                          ...(patch.contentId !== undefined ? { contentId: patch.contentId } : {}),
                          ...(patch.span !== undefined ? { span: patch.span } : {}),
                          ...(patch.promotedTo !== undefined ? { promotedTo: patch.promotedTo } : {}),
                          ...(patch.config ? { config: { ...c.config, ...patch.config } } : {}),
                      }
                    : c,
            ),
        })),
    };
}

/* ---- Sections (authorable surfaces) ---- */

export function addSection(doc: SurfaceDoc, section: SurfaceSectionInstance, index?: number): SurfaceDoc {
    const at = index == null ? doc.sections.length : Math.max(0, Math.min(index, doc.sections.length));
    return { sections: [...doc.sections.slice(0, at), section, ...doc.sections.slice(at)] };
}

export function removeSection(doc: SurfaceDoc, sectionId: string): SurfaceDoc {
    return { sections: doc.sections.filter((s) => s.sectionId !== sectionId) };
}

export function renameSection(doc: SurfaceDoc, sectionId: string, title: string): SurfaceDoc {
    return mapSection(doc, sectionId, (s) => ({ ...s, title }));
}

export function moveSection(doc: SurfaceDoc, sectionId: string, toIndex: number): SurfaceDoc {
    const from = doc.sections.findIndex((s) => s.sectionId === sectionId);
    if (from === -1) return doc;
    const rest = doc.sections.filter((s) => s.sectionId !== sectionId);
    const at = Math.max(0, Math.min(toIndex, rest.length));
    return { sections: [...rest.slice(0, at), doc.sections[from], ...rest.slice(at)] };
}

/* ---------------------------------------------------------------------------
 * Reducer — what the React builder dispatches. Mutations mark the doc dirty.
 * ------------------------------------------------------------------------- */

export type BuilderState = {
    doc: SurfaceDoc;
    selectedInstanceId: string | null;
    dirty: boolean;
};

export type BuilderAction =
    | { type: "load"; doc: SurfaceDoc }
    | { type: "replaceDoc"; doc: SurfaceDoc }
    | { type: "select"; instanceId: string | null }
    | { type: "insertCard"; sectionId: string; index: number; instance: SurfaceCardInstance }
    | { type: "removeCard"; instanceId: string }
    | { type: "moveCard"; instanceId: string; toSectionId: string; toIndex: number }
    | { type: "updateCard"; instanceId: string; patch: CardPatch }
    | { type: "addSection"; section: SurfaceSectionInstance; index?: number }
    | { type: "removeSection"; sectionId: string }
    | { type: "renameSection"; sectionId: string; title: string }
    | { type: "moveSection"; sectionId: string; toIndex: number }
    | { type: "markSaved" };

export function surfaceBuilderReducer(state: BuilderState, action: BuilderAction): BuilderState {
    switch (action.type) {
        case "load":
            return { doc: action.doc, selectedInstanceId: null, dirty: false };
        case "replaceDoc":
            // Template / blank / reset — a deliberate edit, so the surface is dirty.
            return { doc: action.doc, selectedInstanceId: null, dirty: true };
        case "select":
            return { ...state, selectedInstanceId: action.instanceId };
        case "markSaved":
            return { ...state, dirty: false };
        case "insertCard":
            return {
                doc: insertCard(state.doc, action.sectionId, action.index, action.instance),
                selectedInstanceId: action.instance.instanceId,
                dirty: true,
            };
        case "removeCard":
            return {
                doc: removeCard(state.doc, action.instanceId),
                selectedInstanceId: state.selectedInstanceId === action.instanceId ? null : state.selectedInstanceId,
                dirty: true,
            };
        case "moveCard":
            return { ...state, doc: moveCard(state.doc, action.instanceId, action.toSectionId, action.toIndex), dirty: true };
        case "updateCard":
            return { ...state, doc: updateCard(state.doc, action.instanceId, action.patch), dirty: true };
        case "addSection":
            return { ...state, doc: addSection(state.doc, action.section, action.index), dirty: true };
        case "removeSection":
            return { ...state, doc: removeSection(state.doc, action.sectionId), dirty: true };
        case "renameSection":
            return { ...state, doc: renameSection(state.doc, action.sectionId, action.title), dirty: true };
        case "moveSection":
            return { ...state, doc: moveSection(state.doc, action.sectionId, action.toIndex), dirty: true };
        default:
            return state;
    }
}
