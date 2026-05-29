import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    buildWaitlistQueueBlockSectionPlan,
    sortWaitlistQueueItemsForDisplay,
} from "@/lib/orchestration/placement/waitlistQueueBlockSectionPlan";

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
});

describe("QueueBlock source wiring", () => {
    it("uses live section plan + displayQueueItems sort path", () => {
        const src = readFileSync(
            resolve(webRoot, "app/adminV2/components/workspace/blocks/QueueBlock.tsx"),
            "utf8"
        );
        expect(src).toContain("buildWaitlistQueueBlockSectionPlan");
        expect(src).toContain("sortWaitlistQueueItemsForDisplay");
        expect(src).toContain("displayQueueItems.map");
        expect(src).toContain("data-section-key");
    });
});
