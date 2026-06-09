/**
 * Org-level program/category registry (waitlist section classification only).
 * Settings, pickers, and lead storage use `location_program_categories` per site.
 * Do not use for operator-facing program vocabulary.
 */

import {
    ORG_PROGRAM_CATEGORY_KEYS,
    ORG_PROGRAM_CATEGORY_LABELS,
    ORG_PROGRAM_CATEGORY_SORT_ORDER,
    type OrgProgramCategoryKey,
} from "@/lib/orchestration/placement/orgProgramCategory";

export type OrgProgramCategoryRegistryEntry = {
    key: OrgProgramCategoryKey;
    label: string;
    /** Pilot: seeded org categories; future: org config table. */
    source: "platform_default";
};

export function listOrgProgramCategoriesForSettings(): OrgProgramCategoryRegistryEntry[] {
    return ORG_PROGRAM_CATEGORY_SORT_ORDER.filter((k) => k !== ORG_PROGRAM_CATEGORY_KEYS.unspecified).map(
        (key) => ({
            key,
            label: ORG_PROGRAM_CATEGORY_LABELS[key],
            source: "platform_default" as const,
        })
    );
}
