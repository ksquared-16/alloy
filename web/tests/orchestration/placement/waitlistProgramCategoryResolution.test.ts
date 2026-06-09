import { describe, expect, it } from "vitest";
import {
    resolveWaitlistCategorySortIndex,
    resolveWaitlistProgramCategorySection,
    type WaitlistProgramCategoryContext,
} from "@/lib/orchestration/placement/waitlistProgramCategoryResolution";
import { resolveWaitlistQueueSection } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";

const SITE_A = "site-a";

function categoryRow(
    key: string,
    label: string,
    sort_order: number
): LocationProgramCategoryRow {
    return {
        id: `cat-${key}`,
        org_id: "org-1",
        location_id: SITE_A,
        key,
        label,
        sort_order,
        is_active: true,
    };
}

const siteCategories: LocationProgramCategoryRow[] = [
    categoryRow("infant", "Babies", 10),
    categoryRow("toddler", "Walkers", 20),
    categoryRow("preschool", "Preschoolers", 30),
];

describe("waitlistProgramCategoryResolution", () => {
    it("uses location-owned label when site + category id match", () => {
        const resolved = resolveWaitlistProgramCategorySection(
            {
                siteId: SITE_A,
                desiredProgramCategoryId: "cat-toddler",
                cohortKey: "toddler_a",
                cohortLabel: "Toddler A",
            },
            { categories: siteCategories }
        );
        expect(resolved.sectionKey).toBe("toddler");
        expect(resolved.categoryLabel).toBe("Walkers");
    });

    it("uses location sort order when workspace site filter is active", () => {
        const ctx: WaitlistProgramCategoryContext = {
            categories: siteCategories,
            activeSiteId: SITE_A,
        };
        expect(resolveWaitlistCategorySortIndex("preschool", ctx)).toBe(30);
        expect(resolveWaitlistCategorySortIndex("infant", ctx)).toBe(10);
        expect(resolveWaitlistCategorySortIndex("infant", ctx)).toBeLessThan(
            resolveWaitlistCategorySortIndex("preschool", ctx)
        );
    });

    it("falls back to org classification when location context is missing", () => {
        const resolved = resolveWaitlistProgramCategorySection({
            cohortKey: "toddler_room_1",
            cohortLabel: "Toddler Room 1",
        });
        expect(resolved.sectionKey).toBe("toddler");
        expect(resolved.categoryLabel).toBe("Toddler");
    });

    it("resolveWaitlistQueueSection threads location labels into section titles", () => {
        const section = resolveWaitlistQueueSection({
            siteId: SITE_A,
            desiredProgramType: "infant",
            locationCategoryContext: { categories: siteCategories },
        });
        expect(section.sectionTitle).toBe("Babies waitlist");
    });

    it("cross-site sort ignores location sort_order when activeSiteId is unset", () => {
        const ctx: WaitlistProgramCategoryContext = { categories: siteCategories };
        expect(resolveWaitlistCategorySortIndex("infant", ctx)).toBe(0);
        expect(resolveWaitlistCategorySortIndex("preschool", ctx)).toBe(2);
        expect(resolveWaitlistCategorySortIndex("infant", ctx)).toBeLessThan(
            resolveWaitlistCategorySortIndex("preschool", ctx)
        );
    });
});
