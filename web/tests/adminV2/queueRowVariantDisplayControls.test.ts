/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import type { QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";
import {
    addGroupCriterion,
    addSortCriterion,
    defaultPlacementRanking,
    normalizeGroupByCriteria,
    normalizePlacementRanking,
    normalizeSortCriteria,
    patchVariantDisplayFromCriteria,
    placementRegistryGaps,
    reorderCriteria,
} from "@/lib/adminV2/settings/surfaces/queueRowVariantDisplayControls";

describe("queue row variant display controls", () => {
    it("migrates legacy single groupBy to ordered criteria", () => {
        const variant: Pick<QueueRowVariant, "groupBy" | "groupByCriteria"> = { groupBy: "program" };
        expect(normalizeGroupByCriteria(variant)).toEqual([{ key: "program" }]);
    });

    it("supports multiple ordered group criteria", () => {
        let criteria = addGroupCriterion([], "program");
        criteria = addGroupCriterion(criteria, "room");
        criteria = addGroupCriterion(criteria, "age_band");
        expect(criteria.map((c) => c.key)).toEqual(["program", "room", "age_band"]);
        expect(reorderCriteria(criteria, 2, -1).map((c) => c.key)).toEqual(["program", "age_band", "room"]);
    });

    it("supports multiple ordered sort criteria", () => {
        let criteria = addSortCriterion([], "waitlist_rank");
        criteria = addSortCriterion(criteria, "placement_score");
        criteria = addSortCriterion(criteria, "desired_start_date");
        expect(criteria.map((c) => c.key)).toEqual([
            "waitlist.position",
            "waitlist.priority",
            "child.start_date",
        ]);
    });

    it("persists arrays on variant patch helper", () => {
        const group = [{ key: "program" as const }, { key: "room" as const }];
        const sort = [{ key: "waitlist.position", direction: "asc" as const }];
        const patch = patchVariantDisplayFromCriteria(group, sort);
        expect(patch.groupByCriteria).toEqual(group);
        expect(patch.sortCriteria).toEqual(sort);
        expect(patch.groupBy).toBe("program");
        expect(patch.sort?.key).toBe("waitlist.position");
    });

    it("normalizes legacy sort into sortCriteria array", () => {
        const variant: Pick<QueueRowVariant, "sort" | "sortCriteria"> = {
            sort: { key: "waitlist.position", direction: "asc" },
        };
        expect(normalizeSortCriteria(variant)).toEqual([{ key: "waitlist.position", direction: "asc" }]);
    });

    it("placement ranking defaults include enabled registry criteria", () => {
        const ranking = defaultPlacementRanking();
        expect(ranking.some((c) => c.criterionId === "waitlist_rank" && c.enabled)).toBe(true);
        expect(ranking.find((c) => c.criterionId === "offer_status")?.enabled).toBe(false);
    });

    it("placement criteria order persists through normalize", () => {
        const custom = [
            { criterionId: "program_preference", fieldKey: "inquiry_child.program_category", enabled: true, direction: "asc" as const },
            { criterionId: "waitlist_rank", fieldKey: "waitlist.positionLabel", enabled: true, direction: "asc" as const },
        ];
        const normalized = normalizePlacementRanking({ placementRanking: custom });
        expect(normalized.map((c) => c.criterionId)).toEqual(["program_preference", "waitlist_rank"]);
    });

    it("marks unavailable placement registry gaps", () => {
        expect(placementRegistryGaps(true)).toContain("opportunity.offer_status");
    });
});
