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

export type WaitlistQueueItemSectionInput = {
    groupKey?: string | null;
    groupLabel?: string | null;
    placementWaitlistCandidate?: { cohortKey: string; cohortLabel: string } | null;
    placementPriorityV2?: {
        primaryCohortLabel?: string | null;
        primaryCohortSectionTitle?: string | null;
        showPlacementV2Badge?: boolean;
    } | null;
    placementPriority?: { programGroupSectionTitle?: string } | null;
};

/** Canonical org-level section key + operator title for one waitlist queue row. */
export function resolveWaitlistQueueItemSection(
    item: WaitlistQueueItemSectionInput
): { sectionKey: string; sectionTitle: string } | null {
    if (item.placementWaitlistCandidate) {
        const s = resolveWaitlistQueueSection({
            cohortKey: item.placementWaitlistCandidate.cohortKey,
            cohortLabel: item.placementWaitlistCandidate.cohortLabel,
        });
        return { sectionKey: s.sectionKey, sectionTitle: s.sectionTitle };
    }
    if (item.placementPriorityV2?.showPlacementV2Badge) {
        const s = resolveWaitlistQueueSection({
            cohortLabel: item.placementPriorityV2.primaryCohortLabel,
            legacyProgramGroupLabel: item.placementPriorityV2.primaryCohortSectionTitle,
        });
        return { sectionKey: s.sectionKey, sectionTitle: s.sectionTitle };
    }
    if (item.placementPriority?.programGroupSectionTitle) {
        const s = resolveWaitlistQueueSection({
            legacyProgramGroupLabel: item.placementPriority.programGroupSectionTitle,
        });
        return { sectionKey: s.sectionKey, sectionTitle: s.sectionTitle };
    }
    if (item.groupKey?.trim() || item.groupLabel?.trim()) {
        const s = resolveWaitlistQueueSection({
            cohortKey: item.groupKey,
            cohortLabel: item.groupLabel,
            legacyProgramGroupLabel: item.groupLabel,
        });
        return { sectionKey: s.sectionKey, sectionTitle: s.sectionTitle };
    }
    return null;
}

export function resolveWaitlistQueueItemSectionKey(item: WaitlistQueueItemSectionInput): string | undefined {
    return resolveWaitlistQueueItemSection(item)?.sectionKey;
}

export function waitlistQueueItemGrouping(
    item: WaitlistQueueItemSectionInput
): { groupKey: string; groupLabel: string } | Record<string, never> {
    const section = resolveWaitlistQueueItemSection(item);
    if (!section) return {};
    return { groupKey: section.sectionKey, groupLabel: section.sectionTitle };
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
