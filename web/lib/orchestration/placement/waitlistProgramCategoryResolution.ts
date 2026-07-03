/**
 * Location-owned program category resolution for waitlist section grouping.
 * Org-level helpers remain fallback when site/category context is missing.
 */

import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { findLocationProgramCategory } from "@/lib/locations/locationProgramCategories";
import {
    ORG_PROGRAM_CATEGORY_SORT_ORDER,
    resolveOrgProgramCategoryForWaitlist,
    type OrgProgramCategoryKey,
} from "@/lib/orchestration/placement/orgProgramCategory";
import { waitlistQueueSectionKey } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";

export type WaitlistProgramCategoryContext = {
    categories?: ReadonlyArray<LocationProgramCategoryRow>;
    /** Workspace site filter — drives sort order and labels when set. */
    activeSiteId?: string | null;
};

export type WaitlistProgramCategoryScope = {
    siteId?: string | null;
    /** Canonical program key (location_program_categories.key) derived from OCM program_category_id. */
    programKey?: string | null;
    programCategoryId?: string | null;
    cohortKey?: string | null;
    cohortLabel?: string | null;
};

export function resolveWaitlistProgramCategorySection(
    scope: WaitlistProgramCategoryScope,
    context?: WaitlistProgramCategoryContext | null
): { sectionKey: string; categoryLabel: string } {
    const categories = context?.categories ?? [];
    const siteId = (scope.siteId ?? context?.activeSiteId ?? "").trim() || null;

    if (categories.length && (siteId || scope.programCategoryId?.trim())) {
        const locRow = findLocationProgramCategory({
            categories,
            locationId: siteId,
            categoryId: scope.programCategoryId,
            key: scope.programKey,
            includeInactive: true,
        });
        if (locRow) {
            return {
                sectionKey: waitlistQueueSectionKey(locRow.key),
                categoryLabel: locRow.label,
            };
        }
    }

    const orgCategory = resolveOrgProgramCategoryForWaitlist({
        cohortKey: scope.programKey ?? scope.cohortKey,
        cohortLabel: scope.cohortLabel,
    });
    return {
        sectionKey: waitlistQueueSectionKey(orgCategory.categoryKey),
        categoryLabel: orgCategory.categoryLabel,
    };
}

/** Sort index for waitlist section headers — location `sort_order` when site filter is active. */
export function resolveWaitlistCategorySortIndex(
    sectionKey: string,
    context?: WaitlistProgramCategoryContext | null
): number {
    const key = sectionKey.trim();
    const activeSiteId = (context?.activeSiteId ?? "").trim();
    const categories = context?.categories ?? [];

    if (activeSiteId && categories.length && key) {
        const match = findLocationProgramCategory({
            categories,
            locationId: activeSiteId,
            key,
            includeInactive: true,
        });
        if (match) return match.sort_order ?? 100;
    }

    const idx = ORG_PROGRAM_CATEGORY_SORT_ORDER.indexOf(key as OrgProgramCategoryKey);
    return idx >= 0 ? idx : ORG_PROGRAM_CATEGORY_SORT_ORDER.length;
}

export function readWaitlistRowProgramCategoryScope(row: Record<string, unknown>): WaitlistProgramCategoryScope {
    const wr = row._placement_waitlist_row;
    if (wr != null && typeof wr === "object" && !Array.isArray(wr)) {
        const o = wr as Record<string, unknown>;
        return {
            siteId:
                typeof o.site_id === "string"
                    ? o.site_id.trim()
                    : typeof row.site_id === "string"
                      ? row.site_id.trim()
                      : typeof row.location_id === "string"
                        ? row.location_id.trim()
                        : null,
            programKey: typeof o.program_key === "string" ? o.program_key.trim() : null,
            programCategoryId:
                typeof o.program_category_id === "string"
                    ? o.program_category_id.trim()
                    : null,
            cohortKey:
                typeof o.program_room_cohort_key === "string" ? o.program_room_cohort_key.trim() : null,
            cohortLabel:
                typeof o.program_room_group_label === "string" ? o.program_room_group_label.trim() : null,
        };
    }
    return {
        siteId:
            typeof row.site_id === "string"
                ? row.site_id.trim()
                : typeof row.location_id === "string"
                  ? row.location_id.trim()
                  : null,
        cohortKey: null,
        cohortLabel: null,
    };
}
