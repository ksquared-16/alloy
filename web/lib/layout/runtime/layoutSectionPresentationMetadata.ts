/**
 * Layout section presentation metadata — backward-compatible optional keys on LayoutSection.metadata.
 *
 * Used by composition shell for rail priority, empty collapse, and slot placement.
 * LayoutDoc remains authoritative; these keys are presentation hints only.
 */

import type { LayoutSection } from "@/lib/layout/layoutV2";

export const LAYOUT_SECTION_PRIORITY_METADATA_KEY = "priority" as const;
export const LAYOUT_SECTION_COLLAPSE_WHEN_EMPTY_METADATA_KEY = "collapseWhenEmpty" as const;
export const LAYOUT_SECTION_SHOW_WHEN_EMPTY_METADATA_KEY = "showWhenEmpty" as const;
export const LAYOUT_SECTION_RAIL_SLOT_METADATA_KEY = "railSlot" as const;

export type LayoutSectionRailSlot = "right_rail" | "body" | "footer";

export type LayoutSectionPresentationMetadata = {
    priority: number;
    collapseWhenEmpty: boolean;
    showWhenEmpty: boolean;
    railSlot: LayoutSectionRailSlot | null;
};

const DEFAULT_SECTION_PRESENTATION: LayoutSectionPresentationMetadata = {
    priority: 50,
    collapseWhenEmpty: true,
    showWhenEmpty: false,
    railSlot: null,
};

/** Read normalized presentation metadata from a layout section (defaults when absent). */
export function readLayoutSectionPresentationMetadata(section: LayoutSection): LayoutSectionPresentationMetadata {
    const raw = section.metadata ?? {};
    const priorityRaw = raw[LAYOUT_SECTION_PRIORITY_METADATA_KEY];
    const priority =
        typeof priorityRaw === "number" && Number.isFinite(priorityRaw) ? priorityRaw
        : typeof priorityRaw === "string" && priorityRaw.trim() ? Number(priorityRaw)
        : DEFAULT_SECTION_PRESENTATION.priority;

    return {
        priority: Number.isFinite(priority) ? priority : DEFAULT_SECTION_PRESENTATION.priority,
        collapseWhenEmpty:
            raw[LAYOUT_SECTION_COLLAPSE_WHEN_EMPTY_METADATA_KEY] === false ? false : true,
        showWhenEmpty: raw[LAYOUT_SECTION_SHOW_WHEN_EMPTY_METADATA_KEY] === true,
        railSlot:
            raw[LAYOUT_SECTION_RAIL_SLOT_METADATA_KEY] === "right_rail" ? "right_rail"
            : raw[LAYOUT_SECTION_RAIL_SLOT_METADATA_KEY] === "body" ? "body"
            : raw[LAYOUT_SECTION_RAIL_SLOT_METADATA_KEY] === "footer" ? "footer"
            :   null,
    };
}

/** Attach presentation metadata to a section (immutable). */
export function withLayoutSectionPresentationMetadata(
    section: LayoutSection,
    patch: Partial<LayoutSectionPresentationMetadata>,
): LayoutSection {
    return {
        ...section,
        metadata: {
            ...(section.metadata ?? {}),
            ...(patch.priority != null ? { [LAYOUT_SECTION_PRIORITY_METADATA_KEY]: patch.priority } : {}),
            ...(patch.collapseWhenEmpty != null ?
                { [LAYOUT_SECTION_COLLAPSE_WHEN_EMPTY_METADATA_KEY]: patch.collapseWhenEmpty }
            :   {}),
            ...(patch.showWhenEmpty != null ?
                { [LAYOUT_SECTION_SHOW_WHEN_EMPTY_METADATA_KEY]: patch.showWhenEmpty }
            :   {}),
            ...(patch.railSlot != null ? { [LAYOUT_SECTION_RAIL_SLOT_METADATA_KEY]: patch.railSlot } : {}),
        },
    };
}
