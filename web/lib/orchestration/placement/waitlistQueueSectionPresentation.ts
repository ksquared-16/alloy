/**
 * Waitlist queue section keys + operator-facing category labels (pilot QA).
 *
 * Sections group by stable program category keys (Infant, Toddler, Preschool, Pre-K).
 * Labels and sort order prefer `location_program_categories` when site context exists;
 * org-level classification is fallback/analytics only.
 * Location filter narrows candidate rows inside sections; it does not split sections by site.
 */

import { UNKNOWN_PROGRAM_ROOM_GROUP_LABEL } from "@/lib/orchestration/placement/resolveProgramRoomCohort";
import {
    resolveWaitlistProgramCategorySection,
    type WaitlistProgramCategoryContext,
} from "@/lib/orchestration/placement/waitlistProgramCategoryResolution";

export type { WaitlistProgramCategoryContext } from "@/lib/orchestration/placement/waitlistProgramCategoryResolution";

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
    siteId?: string | null;
    desiredProgramType?: string | null;
    desiredProgramCategoryId?: string | null;
    locationCategoryContext?: WaitlistProgramCategoryContext | null;
}): {
    sectionKey: string;
    categoryLabel: string;
    sectionTitle: string;
} {
    const resolved = resolveWaitlistProgramCategorySection(
        {
            cohortKey: params.cohortKey,
            cohortLabel: params.cohortLabel ?? params.legacyProgramGroupLabel,
            siteId: params.siteId,
            desiredProgramType: params.desiredProgramType,
            desiredProgramCategoryId: params.desiredProgramCategoryId,
        },
        params.locationCategoryContext
    );
    return {
        sectionKey: resolved.sectionKey,
        categoryLabel: resolved.categoryLabel,
        sectionTitle: formatWaitlistCategorySectionTitle(resolved.categoryLabel),
    };
}

export type WaitlistQueueItemSectionInput = {
    groupKey?: string | null;
    groupLabel?: string | null;
    placementWaitlistCandidate?: {
        cohortKey: string;
        cohortLabel: string;
        siteId?: string | null;
        desiredProgramType?: string | null;
        desiredProgramCategoryId?: string | null;
    } | null;
    placementPriorityV2?: {
        primaryCohortLabel?: string | null;
        primaryCohortSectionTitle?: string | null;
        showPlacementV2Badge?: boolean;
    } | null;
    placementPriority?: { programGroupSectionTitle?: string; evaluateError?: boolean } | null;
};

/** Canonical section key + operator title for one waitlist queue row. */
export function resolveWaitlistQueueItemSection(
    item: WaitlistQueueItemSectionInput,
    context?: WaitlistProgramCategoryContext | null
): { sectionKey: string; sectionTitle: string } | null {
    if (item.placementWaitlistCandidate) {
        const c = item.placementWaitlistCandidate;
        const s = resolveWaitlistQueueSection({
            cohortKey: c.cohortKey,
            cohortLabel: c.cohortLabel,
            siteId: c.siteId,
            desiredProgramType: c.desiredProgramType,
            desiredProgramCategoryId: c.desiredProgramCategoryId,
            locationCategoryContext: context,
        });
        return { sectionKey: s.sectionKey, sectionTitle: s.sectionTitle };
    }
    if (item.placementPriorityV2?.showPlacementV2Badge) {
        const s = resolveWaitlistQueueSection({
            cohortLabel: item.placementPriorityV2.primaryCohortLabel,
            legacyProgramGroupLabel: item.placementPriorityV2.primaryCohortSectionTitle,
            locationCategoryContext: context,
        });
        return { sectionKey: s.sectionKey, sectionTitle: s.sectionTitle };
    }
    if (item.placementPriority?.programGroupSectionTitle) {
        const s = resolveWaitlistQueueSection({
            legacyProgramGroupLabel: item.placementPriority.programGroupSectionTitle,
            locationCategoryContext: context,
        });
        return { sectionKey: s.sectionKey, sectionTitle: s.sectionTitle };
    }
    if (item.groupKey?.trim() || item.groupLabel?.trim()) {
        const s = resolveWaitlistQueueSection({
            cohortKey: item.groupKey,
            cohortLabel: item.groupLabel,
            legacyProgramGroupLabel: item.groupLabel,
            locationCategoryContext: context,
        });
        return { sectionKey: s.sectionKey, sectionTitle: s.sectionTitle };
    }
    return null;
}

export function resolveWaitlistQueueItemSectionKey(
    item: WaitlistQueueItemSectionInput,
    context?: WaitlistProgramCategoryContext | null
): string | undefined {
    return resolveWaitlistQueueItemSection(item, context)?.sectionKey;
}

export function waitlistQueueItemGrouping(
    item: WaitlistQueueItemSectionInput,
    context?: WaitlistProgramCategoryContext | null
): { groupKey: string; groupLabel: string } | Record<string, never> {
    const section = resolveWaitlistQueueItemSection(item, context);
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
