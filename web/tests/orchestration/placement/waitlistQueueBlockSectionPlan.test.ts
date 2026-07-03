import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    buildWaitlistQueueBlockSectionPlan,
    sortWaitlistQueueItemsForDisplay,
    waitlistSectionLiveDiagAttrs,
} from "@/lib/orchestration/placement/waitlistQueueBlockSectionPlan";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";

const webRoot = resolve(__dirname, "../../..");

describe("waitlistQueueBlockSectionPlan live QueueBlock path", () => {
    it("collapses toddler room variants into one section when sorted for display", () => {
        const items = [
            {
                id: "row-a",
                groupKey: "toddler_a",
                groupLabel: "Toddler A waitlist",
                placementWaitlistCandidate: { cohortKey: "toddler_a", cohortLabel: "Toddler A" },
            },
            {
                id: "row-b",
                groupKey: "preschool",
                groupLabel: "Preschool waitlist",
                placementWaitlistCandidate: { cohortKey: "preschool_3_4", cohortLabel: "Preschool" },
            },
            {
                id: "row-c",
                groupKey: "toddler_room_1",
                groupLabel: "Toddler Room 1 waitlist",
                placementWaitlistCandidate: { cohortKey: "toddler_room_1", cohortLabel: "Toddler Room 1" },
            },
        ];

        const plan = buildWaitlistQueueBlockSectionPlan(items);
        expect(plan.headers.map((h) => h.sectionKey)).toEqual(["toddler", "preschool"]);
        expect(plan.headers[0]?.rowCount).toBe(2);
        expect(plan.headers[0]?.rawGroupKeys.sort()).toEqual(["toddler_a", "toddler_room_1"]);
        expect(plan.unsortedDuplicateSectionKeys).toContain("toddler");
    });

    it("does not treat placement evaluate-error stubs as waitlist placement rows", () => {
        const items = [
            {
                id: "err-only",
                placementPriority: { evaluateError: true, programGroupSectionTitle: "Toddler" },
            },
            { id: "plain" },
        ];
        expect(sortWaitlistQueueItemsForDisplay(items)).toEqual(items);
    });

    it("sortWaitlistQueueItemsForDisplay keeps org categories contiguous", () => {
        const items = [
            {
                id: "1",
                placementWaitlistCandidate: { cohortKey: "toddler_a", cohortLabel: "Toddler A" },
            },
            {
                id: "2",
                placementWaitlistCandidate: { cohortKey: "preschool_3_4", cohortLabel: "Preschool" },
            },
            {
                id: "3",
                placementWaitlistCandidate: { cohortKey: "toddler_room_1", cohortLabel: "Toddler Room 1" },
            },
        ];
        const sorted = sortWaitlistQueueItemsForDisplay(items);
        expect(sorted.map((i) => i.id)).toEqual(["1", "3", "2"]);
    });

    it("uses location sort order when workspace site filter is active", () => {
        const siteCategories: LocationProgramCategoryRow[] = [
            {
                id: "cat-preschool",
                org_id: "org-1",
                location_id: "site-a",
                key: "preschool",
                label: "Preschoolers",
                sort_order: 10,
                is_active: true,
            },
            {
                id: "cat-infant",
                org_id: "org-1",
                location_id: "site-a",
                key: "infant",
                label: "Babies",
                sort_order: 30,
                is_active: true,
            },
        ];
        const items = [
            {
                id: "infant-row",
                placementWaitlistCandidate: {
                    cohortKey: "infant",
                    cohortLabel: "Infant",
                    siteId: "site-a",
                    programKey: "infant",
                },
            },
            {
                id: "preschool-row",
                placementWaitlistCandidate: {
                    cohortKey: "preschool_3_4",
                    cohortLabel: "Preschool",
                    siteId: "site-a",
                    programKey: "preschool",
                },
            },
        ];
        const sorted = sortWaitlistQueueItemsForDisplay(items, {
            categories: siteCategories,
            activeSiteId: "site-a",
        });
        expect(sorted.map((i) => i.id)).toEqual(["preschool-row", "infant-row"]);
        const plan = buildWaitlistQueueBlockSectionPlan(items, {
            categories: siteCategories,
            activeSiteId: "site-a",
        });
        expect(plan.headers.map((h) => h.label)).toEqual(["Preschoolers waitlist", "Babies waitlist"]);
    });

    it("cross-site waitlist falls back to org classification sort without active site filter", () => {
        const siteCategories: LocationProgramCategoryRow[] = [
            {
                id: "cat-preschool",
                org_id: "org-1",
                location_id: "site-a",
                key: "preschool",
                label: "Preschoolers",
                sort_order: 10,
                is_active: true,
            },
            {
                id: "cat-infant",
                org_id: "org-1",
                location_id: "site-a",
                key: "infant",
                label: "Babies",
                sort_order: 30,
                is_active: true,
            },
        ];
        const items = [
            {
                id: "preschool-row",
                placementWaitlistCandidate: { cohortKey: "preschool_3_4", cohortLabel: "Preschool" },
            },
            {
                id: "infant-row",
                placementWaitlistCandidate: { cohortKey: "infant", cohortLabel: "Infant" },
            },
        ];
        const sorted = sortWaitlistQueueItemsForDisplay(items, { categories: siteCategories });
        expect(sorted.map((i) => i.id)).toEqual(["infant-row", "preschool-row"]);
    });
});

describe("QueueBlock source wiring", () => {
    it("uses live section plan + displayQueueItems sort path", () => {
        const queueBlockSrc = readFileSync(
            resolve(webRoot, "app/adminV2/components/workspace/blocks/QueueBlock.tsx"),
            "utf8"
        );
        const sectionPlanSrc = readFileSync(
            resolve(webRoot, "lib/orchestration/placement/waitlistQueueBlockSectionPlan.ts"),
            "utf8"
        );
        expect(queueBlockSrc).toContain("buildWaitlistQueueBlockSectionPlan");
        expect(queueBlockSrc).toContain("sortWaitlistQueueItemsForDisplay");
        expect(queueBlockSrc).toContain("waitlistSectionLiveDiagAttrs");
        expect(queueBlockSrc).toContain("displayQueueItems.map");
        expect(queueBlockSrc).toContain("waitlistProgramCategoryContext");
        expect(sectionPlanSrc).toContain("data-section-key");
        expect(
            waitlistSectionLiveDiagAttrs({
                sectionKey: "toddler",
                label: "Toddler waitlist",
                rowIds: ["row-1"],
                rawGroupKeys: ["toddler_a"],
                canonicalKeys: ["toddler"],
                rowCount: 1,
            })
        ).toMatchObject({ "data-section-key": "toddler" });
    });
});
