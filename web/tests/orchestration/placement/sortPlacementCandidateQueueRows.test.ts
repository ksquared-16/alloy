import { describe, expect, it } from "vitest";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";

function candidateRow(id: string, cohortKey: string, sortFirst: string | number) {
    return {
        id,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            program_room_cohort_key: cohortKey,
            program_room_group_label: cohortKey,
        },
        __placement_v2_sort_tuple: [cohortKey, sortFirst],
    };
}

describe("sortPlacementCandidateQueueRows", () => {
    it("groups rows by cohort so UI does not repeat section headers", () => {
        const rows = [
            candidateRow("pcrow:1:a", "preschool_3_4", 10),
            candidateRow("pcrow:1:b", "young_toddler", 5),
            candidateRow("pcrow:1:c", "preschool_3_4", 20),
            candidateRow("pcrow:1:d", "pre_k_4_5", 15),
        ];
        const sorted = sortPlacementCandidateQueueRows(rows, true);
        const keys = sorted.map(
            (r) =>
                (r._placement_waitlist_row as { program_room_cohort_key: string }).program_room_cohort_key
        );
        expect(keys).toEqual(["pre_k_4_5", "preschool_3_4", "preschool_3_4", "young_toddler"]);
    });
});
