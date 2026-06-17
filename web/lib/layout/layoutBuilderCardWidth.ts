/**
 * Operator-facing card width presets — maps to 12-column span metadata (presentation only).
 */

import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import {
    LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY,
    LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY,
    readSectionRowGroup,
    readSectionRowSpan,
} from "@/lib/layout/layoutEditorSectionLayout";
import { patchSection } from "@/lib/layout/builderOps";

export const CARD_WIDTH_FRACTION_KEYS = [
    "full",
    "quarter",
    "third",
    "half",
    "two_thirds",
    "three_quarter",
] as const;

export type CardWidthFractionKey = (typeof CARD_WIDTH_FRACTION_KEYS)[number];

export const CARD_WIDTH_FRACTIONS: Record<CardWidthFractionKey, { label: string; span: number }> = {
    full: { label: "Full width", span: 12 },
    quarter: { label: "1/4", span: 3 },
    third: { label: "1/3", span: 4 },
    half: { label: "1/2", span: 6 },
    two_thirds: { label: "2/3", span: 8 },
    three_quarter: { label: "3/4", span: 9 },
};

export function readCardWidthFraction(section: LayoutSection): CardWidthFractionKey {
    const span = readSectionRowSpan(section);
    const match = CARD_WIDTH_FRACTION_KEYS.find((key) => CARD_WIDTH_FRACTIONS[key].span === span);
    return match ?? "full";
}

function patchSectionMetadata(
    doc: LayoutDoc,
    sectionKey: string,
    patch: (metadata: Record<string, unknown>) => Record<string, unknown>,
): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const section = doc.sections[sIdx]!;
    const metadata = patch({ ...(section.metadata ?? {}) });
    return patchSection(doc, sIdx, { metadata });
}

/** Set operator-facing width on a single card (no row-group pairing). */
export function setCardWidthFraction(
    doc: LayoutDoc,
    sectionKey: string,
    widthKey: CardWidthFractionKey,
): LayoutDoc {
    if (widthKey === "full") {
        return patchSectionMetadata(doc, sectionKey, (metadata) => {
            const next = { ...metadata };
            delete next[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
            delete next[LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY];
            return next;
        });
    }
    const span = CARD_WIDTH_FRACTIONS[widthKey].span;
    return patchSectionMetadata(doc, sectionKey, (metadata) => {
        const next = { ...metadata };
        delete next[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
        next[LAYOUT_EDITOR_SECTION_ROW_SPAN_METADATA_KEY] = span;
        return next;
    });
}

export function cardWidthStackStyle(section: LayoutSection): { maxWidth: string } | undefined {
    if (readSectionRowGroup(section)) return undefined;
    const span = readSectionRowSpan(section);
    if (span >= 12) return undefined;
    return { maxWidth: `${(span / 12) * 100}%` };
}
