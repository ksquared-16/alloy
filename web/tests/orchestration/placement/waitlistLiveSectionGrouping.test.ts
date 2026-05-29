import { describe, expect, it } from "vitest";

import { readNormalizedCohortFromWaitlistRow } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import { resolveWaitlistQueueItemSectionKey, resolveWaitlistQueueSection } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";

function candidateRow(id: string, cohortKey: string, label: string, sortFirst: string | number) {
    return {
        id,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            program_room_cohort_key: cohortKey,
            program_room_group_label: label,
        },
        __placement_v2_sort_tuple: [cohortKey, sortFirst],
    };
}

function sectionHeadersForSortedRows(rows: Array<Record<string, unknown>>): string[] {
    let last: string | undefined;
    const headers: string[] = [];
    for (const row of rows) {
        const cohort = readNormalizedCohortFromWaitlistRow(row);
        if (!cohort) continue;
        const sk = resolveWaitlistQueueSection({
            cohortKey: cohort.cohortKey,
            cohortLabel: cohort.cohortLabel,
        }).sectionKey;
        if (sk !== last) {
            headers.push(sk);
            last = sk;
        }
    }
    return headers;
}

describe("sortPlacementCandidateQueueRows", () => {
    it("sorts by org category so toddler room variants do not repeat section headers", () => {
        const rows = [
            candidateRow("pcrow:1:a", "toddler_a", "Toddler A", 10),
            candidateRow("pcrow:1:b", "preschool_3_4", "Preschool — 3–4 years", 5),
            candidateRow("pcrow:1:c", "toddler_room_1", "Toddler Room 1", 20),
        ];
        const sorted = sortPlacementCandidateQueueRows(rows, true);
        const headers = sectionHeadersForSortedRows(sorted);
        expect(headers).toEqual(["toddler", "preschool"]);
        expect(headers.filter((h) => h === "toddler")).toHaveLength(1);
    });

    it("groups rows by cohort within org category", () => {
        const rows = [
            candidateRow("pcrow:1:a", "preschool_3_4", "Preschool", 10),
            candidateRow("pcrow:1:b", "young_toddler", "Young Toddler", 5),
            candidateRow("pcrow:1:c", "preschool_3_4", "Preschool", 20),
            candidateRow("pcrow:1:d", "pre_k_4_5", "Pre-K", 15),
        ];
        const sorted = sortPlacementCandidateQueueRows(rows, true);
        const keys = sorted.map(
            (r) =>
                (r._placement_waitlist_row as { program_room_cohort_key: string }).program_room_cohort_key
        );
        expect(keys.indexOf("young_toddler")).toBeLessThan(keys.indexOf("preschool_3_4"));
        expect(keys.lastIndexOf("preschool_3_4")).toBeGreaterThan(keys.indexOf("preschool_3_4"));
    });
});

describe("resolveWaitlistQueueItemSectionKey live path", () => {
    it("maps toddler room variants to one toddler section key", () => {
        expect(
            resolveWaitlistQueueItemSectionKey({
                groupKey: "toddler_a",
                groupLabel: "Toddler A waitlist",
            })
        ).toBe("toddler");
        expect(
            resolveWaitlistQueueItemSectionKey({
                groupKey: "toddler_room_1",
                groupLabel: "Toddler Room 1 waitlist",
            })
        ).toBe("toddler");
        expect(
            resolveWaitlistQueueItemSectionKey({
                placementWaitlistCandidate: { cohortKey: "young_toddler_18_24", cohortLabel: "Young Toddler" },
            })
        ).toBe("toddler");
    });
});
