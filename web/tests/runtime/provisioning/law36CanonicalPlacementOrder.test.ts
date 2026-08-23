/**
 * Law 36 — the Work View surface renders placement rows in the canonical order the placement system
 * computed and numbered them from.
 *
 * Measured on staging 7184efedf: within the `infant` section the position labels ran
 * 3, 5, 10, 1, 2, 8, 12, 6, 11, 4, 9, 7 down the screen — the operator read "1/12" on the 4th row.
 * Two independent causes were measured, and both are guarded here:
 *
 *   A. `attachChildGrainWaitlistPlacement` assigned positions from the SORTED array and returned the
 *      caller's ORIGINAL order, so the order handed to the surface was never canonical.
 *   B. the published variant sorts by `waitlist.priority`, which resolves to null on every child
 *      Waitlist row, so the comparator fell through to its `id` tiebreak and ordered the queue by
 *      participation UUID — destroying a canonical input order even after (A) was corrected.
 *
 * Ids in these fixtures are deliberately ANTI-correlated with position — id order is the exact
 * REVERSE of canonical order. The comparator's last resort is `id`, so ids that happen to ascend with
 * position let these tests pass without the fix ever running.
 */
import { describe, expect, it } from "vitest";

import { applyQueueRowVariantGroupAndSortCriteria } from "@/lib/presentation/runtime/applyQueueRowVariantGroupAndSortCriteria";
import { applyQueueRowVariantSortCriteria } from "@/lib/presentation/runtime/applyQueueRowVariantSortCriteria";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import { assignWaitlistCandidateRuntimePositions } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";

/** The published variant measured live on the child Waitlist Work View (`variant-32`). */
const LIVE_GROUP_BY = [{ key: "program" }] as never;
const LIVE_SORT_CRITERIA = [{ key: "waitlist.priority", direction: "desc", nulls: "last" }] as never;

function surfaceRow(id: string, program: string, position: number | null) {
    return {
        id,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            child_display_name: id,
            program_room_group_label: program,
            runtime_position_section_key: program.toLowerCase(),
            ...(position == null ? {} : { runtime_position: position, runtime_position_total: 3 }),
        },
    } as Record<string, unknown>;
}

const positionsOf = (rows: Array<Record<string, unknown>>) =>
    rows.map((r) => (r._placement_waitlist_row as Record<string, unknown>).runtime_position ?? null);
const idsOf = (rows: Array<Record<string, unknown>>) => rows.map((r) => r.id);

const renderLive = (rows: Array<Record<string, unknown>>) =>
    applyQueueRowVariantGroupAndSortCriteria(rows, LIVE_GROUP_BY, LIVE_SORT_CRITERIA);

describe("law 36 — canonical placement order survives to the rendered surface", () => {
    it("2: rendered order agrees with the assigned position labels", () => {
        const rendered = renderLive([
            surfaceRow("a-uuid", "Infant", 3),
            surfaceRow("z-uuid", "Infant", 1),
            surfaceRow("m-uuid", "Infant", 2),
        ]);
        expect(positionsOf(rendered)).toEqual([1, 2, 3]);
        expect(idsOf(rendered)).toEqual(["z-uuid", "m-uuid", "a-uuid"]);
    });

    it("3: a non-canonical input order does not leak through to the render", () => {
        // Same rows, three different input orders, one rendered result.
        const orders = [
            ["a-uuid", "z-uuid", "m-uuid"],
            ["m-uuid", "a-uuid", "z-uuid"],
            ["z-uuid", "m-uuid", "a-uuid"],
        ];
        const positionById: Record<string, number> = { "z-uuid": 1, "m-uuid": 2, "a-uuid": 3 };
        for (const order of orders) {
            const rendered = renderLive(order.map((id) => surfaceRow(id, "Infant", positionById[id]!)));
            expect(idsOf(rendered)).toEqual(["z-uuid", "m-uuid", "a-uuid"]);
        }
    });

    it("4: rows the placement system did not rank keep the deterministic id tiebreak", () => {
        const rendered = applyQueueRowVariantSortCriteria(
            [surfaceRow("z-uuid", "Infant", null), surfaceRow("a-uuid", "Infant", null)],
            LIVE_SORT_CRITERIA,
        );
        expect(idsOf(rendered)).toEqual(["a-uuid", "z-uuid"]);
    });

    it("4b: an unranked row never jumps ahead of a ranked one", () => {
        const rendered = applyQueueRowVariantSortCriteria(
            [surfaceRow("a-unranked", "Infant", null), surfaceRow("z-ranked", "Infant", 1)],
            LIVE_SORT_CRITERIA,
        );
        expect(idsOf(rendered)).toEqual(["z-ranked", "a-unranked"]);
    });

    it("5 + 10: membership is a permutation — no row added, dropped or resurrected by sorting", () => {
        const input = [
            surfaceRow("a-uuid", "Infant", 3),
            surfaceRow("z-uuid", "Infant", 1),
            surfaceRow("m-uuid", "Toddler", 1),
        ];
        const rendered = renderLive(input);
        expect(rendered).toHaveLength(input.length);
        expect([...idsOf(rendered)].sort()).toEqual([...idsOf(input)].sort());
    });

    it("6: row payloads are unchanged — ordering only", () => {
        const input = [surfaceRow("a-uuid", "Infant", 3), surfaceRow("z-uuid", "Infant", 1)];
        const before = JSON.parse(JSON.stringify(input));
        const rendered = renderLive(input);
        const byId = new Map(rendered.map((r) => [r.id, r]));
        for (const original of before) {
            expect(byId.get(original.id)).toEqual(original);
        }
    });

    it("11: the same input produces an identical result", () => {
        const build = () => [
            surfaceRow("a-uuid", "Infant", 3),
            surfaceRow("z-uuid", "Infant", 1),
            surfaceRow("m-uuid", "Infant", 2),
        ];
        expect(idsOf(renderLive(build()))).toEqual(idsOf(renderLive(build())));
    });

    it("12: the caller's array is not mutated in place", () => {
        const input = [surfaceRow("a-uuid", "Infant", 3), surfaceRow("z-uuid", "Infant", 1)];
        const orderBefore = idsOf(input);
        renderLive(input);
        expect(idsOf(input)).toEqual(orderBefore);
    });

    it("groups stay contiguous and section order is unchanged", () => {
        const rendered = renderLive([
            surfaceRow("t-a", "Toddler", 2),
            surfaceRow("i-a", "Infant", 2),
            surfaceRow("t-z", "Toddler", 1),
            surfaceRow("i-z", "Infant", 1),
        ]);
        // Within each group the LATER id sorts first, so only canonical rank can produce this.
        expect(idsOf(rendered)).toEqual(["i-z", "i-a", "t-z", "t-a"]);
    });
});

describe("law 36 — the placement sorter still owns precedence", () => {
    const candidate = (id: string, cohort: string, pinned: boolean, ordinal: number) =>
        ({
            id,
            _placement_waitlist_row: {
                row_projection: "placement_candidate",
                child_display_name: id,
                program_room_cohort_key: cohort,
                program_room_group_label: "Infant",
                placement_priority_v2: {
                    active_override_kinds: pinned ? ["pin"] : [],
                    sort_tuple: [cohort, ordinal, 0],
                },
            },
            __placement_v2_sort_tuple: [cohort, ordinal, 0],
        }) as Record<string, unknown>;

    it("7: a pin orders its own cohort", () => {
        const rows = sortPlacementCandidateQueueRows(
            [
                candidate("unpinned", "infant_0_18_months", false, 2),
                candidate("pinned", "infant_0_18_months", true, 1),
            ],
            false,
            null,
        );
        expect(idsOf(rows)).toEqual(["pinned", "unpinned"]);
    });

    it("8: unpinned rows keep canonical tuple ordering", () => {
        const rows = sortPlacementCandidateQueueRows(
            [candidate("second", "infant", false, 2), candidate("first", "infant", false, 1)],
            false,
            null,
        );
        expect(idsOf(rows)).toEqual(["first", "second"]);
    });

    it("cross-cohort precedence is unchanged: an earlier cohort still outranks a later cohort's pin", () => {
        const rows = sortPlacementCandidateQueueRows(
            [
                candidate("pinned-later-cohort", "infant_0_18_months", true, 1),
                candidate("unpinned-earlier-cohort", "infant", false, 9),
            ],
            false,
            null,
        );
        // `infant` sorts before `infant_0_18_months` at step 2, before the pin's tuple is consulted.
        expect(idsOf(rows)).toEqual(["unpinned-earlier-cohort", "pinned-later-cohort"]);
        assignWaitlistCandidateRuntimePositions(rows, false, null);
        expect(positionsOf(rows)).toEqual([1, 2]);
    });
});

describe("law 36 — the canonical sorter's own tie-breaking stays deterministic", () => {
    const tied = (id: string) =>
        ({
            id,
            _placement_waitlist_row: {
                row_projection: "placement_candidate",
                child_display_name: id,
                program_room_cohort_key: "infant",
                program_room_group_label: "Infant",
                placement_priority_v2: { active_override_kinds: [], sort_tuple: ["infant", 1, 0] },
            },
            __placement_v2_sort_tuple: ["infant", 1, 0],
        }) as Record<string, unknown>;

    it("6: identical tuples fall back to a stable id order, whatever the input order", () => {
        const forward = sortPlacementCandidateQueueRows([tied("b"), tied("a"), tied("c")], false, null);
        const reverse = sortPlacementCandidateQueueRows([tied("c"), tied("b"), tied("a")], false, null);
        expect(idsOf(forward)).toEqual(["a", "b", "c"]);
        expect(idsOf(reverse)).toEqual(["a", "b", "c"]);
    });
});
