/**
 * Waitlist queue section keys + operator-facing category labels (pilot QA).
 *
 * Sections group by **org-level program/category** (Infant, Toddler, Preschool, Pre-K).
 * Location filter narrows candidate rows inside those sections; it does not split sections by site.
 * Classroom/room assignment is location-level and deferred — not used for waitlist section keys.
 */

import { resolveOrgProgramCategoryForWaitlist } from "@/lib/orchestration/placement/orgProgramCategory";
import { UNKNOWN_PROGRAM_ROOM_GROUP_LABEL } from "@/lib/orchestration/placement/resolveProgramRoomCohort";

export const UNSPECIFIED_WAITLIST_CATEGORY_LABEL = "Unspecified category";

/** Stable org-level section partition key (one bucket per program/category). */
export function waitlistQueueSectionKey(categoryKey: string): string {
    return categoryKey.trim() || "unspecified";
}

/** Operator-facing section title, e.g. `Infant waitlist` (sentence case). */
export function formatWaitlistCategorySectionTitle(categoryLabel: string): string {
    const raw = categoryLabel.trim();
    if (!raw || raw === UNKNOWN_PROGRAM_ROOM_GROUP_LABEL) {
        return `${UNSPECIFIED_WAITLIST_CATEGORY_LABEL} waitlist`;
    }
    if (/\bwaitlist$/i.test(raw)) return raw;
    return `${raw} waitlist`;
}

export function resolveWaitlistQueueSection(params: {
    cohortKey?: string | null;
    cohortLabel?: string | null;
    legacyProgramGroupLabel?: string | null;
}): {
    sectionKey: string;
    categoryLabel: string;
    sectionTitle: string;
} {
    const orgCategory = resolveOrgProgramCategoryForWaitlist({
        cohortKey: params.cohortKey,
        cohortLabel: params.cohortLabel ?? params.legacyProgramGroupLabel,
    });
    return {
        sectionKey: waitlistQueueSectionKey(orgCategory.categoryKey),
        categoryLabel: orgCategory.categoryLabel,
        sectionTitle: formatWaitlistCategorySectionTitle(orgCategory.categoryLabel),
    };
}

export function buildWaitlistQueueGroupHeadersFromSections(
    sections: ReadonlyArray<{ sectionKey: string; sectionTitle: string }>
): Record<string, { label: string }> {
    const out: Record<string, { label: string }> = {};
    for (const s of sections) {
        const key = s.sectionKey.trim();
        const title = s.sectionTitle.trim();
        if (!key || !title) continue;
        if (!out[key]) out[key] = { label: title };
    }
    return out;
}
