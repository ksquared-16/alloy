/**
 * Order layout sections by their position in LayoutDoc.sections (Phase 5).
 *
 * Used when entity_layouts section order should drive runtime composition within a zone.
 */

import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";

export function sectionOrderIndexInDoc(doc: LayoutDoc, sectionKey: string): number {
    const idx = doc.sections.findIndex((s) => s.key === sectionKey);
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
}

/** Stable sort: doc.sections index ascending, then key. */
export function sortLayoutSectionsByDocPosition(doc: LayoutDoc, sections: LayoutSection[]): LayoutSection[] {
    return [...sections].sort((a, b) => {
        const ia = sectionOrderIndexInDoc(doc, a.key);
        const ib = sectionOrderIndexInDoc(doc, b.key);
        if (ia !== ib) return ia - ib;
        return a.key.localeCompare(b.key);
    });
}
