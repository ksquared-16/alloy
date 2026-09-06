/**
 * SHADOW MODE, TESTED AS BEHAVIOUR.
 *
 * `shadow_mode` is the single boolean that decides whether the waitlist is ordered at all:
 * `sortPlacementCandidateQueueRows` consults the priority tuple only when shadow is OFF, and only
 * then does it hand rows to `applyCohortLocalManualPositions`. So shadow ON means "preview the
 * evaluation without letting it move anything".
 *
 * This was previously guarded in `waitlistRegressionInvariants.test.ts` by substring checks against
 * the implementation text — `toContain("shadow_mode: true")`, a `not.toMatch(/shadow_mode:\s*false/)`,
 * and an assertion on an exact ternary source expression. Those pass on any behavioural change that
 * preserves the characters and fail on a reformat that changes nothing. These assert the behaviour
 * instead, and each carries a positive control: the shadow-ON expectations fail if shadow stops
 * suppressing reordering, and the shadow-OFF expectations fail if ordering stops applying.
 */
import { describe, expect, it } from "vitest";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";

type Row = Record<string, unknown>;

/** A candidate row in the shape the canonical sorter consumes. */
function row(name: string, cohort: string, tuple: Array<string | number>, pinOrdinal?: number): Row {
    return {
        id: `row-${name}`,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            placement_candidate_id: `pc-${name}`,
            child_display_name: name,
            program_room_cohort_key: cohort,
            program_room_group_label: cohort,
            placement_priority_v2: {
                placement_candidate_id: `pc-${name}`,
                program_room_cohort_key: cohort,
                active_override_kinds: pinOrdinal == null ? [] : ["pin"],
                ...(pinOrdinal == null ? {} : { manual_pin_ordinal: pinOrdinal }),
                sort_tuple: tuple,
            },
        },
        __placement_v2_sort_tuple: tuple,
    };
}

const names = (rows: Row[]) =>
    rows.map((r) => String((r._placement_waitlist_row as { child_display_name: string }).child_display_name));

const INFANT = "infant_0_18_months";

/**
 * Deliberately supplied WORST-first so any real ordering is visible as a change.
 *
 * Ids are chosen so the shadow-mode tiebreak (`row-early` < `row-late` < `row-middle`) differs from
 * BOTH the input order and the tuple order — otherwise a passing test could not tell the three apart.
 */
const unordered = (): Row[] => [
    row("late", INFANT, [INFANT, 50, 3000]),
    row("middle", INFANT, [INFANT, 50, 2000]),
    row("early", INFANT, [INFANT, 50, 1000]),
];

describe("shadow OFF — the evaluation orders the queue", () => {
    it("reorders by the priority tuple", () => {
        const out = sortPlacementCandidateQueueRows(unordered(), false, null);
        expect(names(out)).toEqual(["early", "middle", "late"]);
    });

    it("applies cohort-local manual positions", () => {
        const rows = [
            row("a", INFANT, [INFANT, 50, 1000]),
            row("b", INFANT, [INFANT, 50, 2000]),
            row("target", INFANT, [INFANT, 50, 3000], 1),
        ];
        expect(names(sortPlacementCandidateQueueRows(rows, false, null))).toEqual(["target", "a", "b"]);
    });

    it("a middle ordinal lands mid-cohort, not merely ahead of everything", () => {
        const rows = [
            row("a", INFANT, [INFANT, 50, 1000]),
            row("b", INFANT, [INFANT, 50, 2000]),
            row("c", INFANT, [INFANT, 50, 3000]),
            row("target", INFANT, [INFANT, 50, 4000], 3),
        ];
        expect(names(sortPlacementCandidateQueueRows(rows, false, null))).toEqual(["a", "b", "target", "c"]);
    });
});

describe("shadow ON — the evaluation is a preview and moves nothing", () => {
    it("does NOT order by the priority tuple — it falls back to the deterministic id tiebreak", () => {
        /*
         * Shadow is not "leave the array alone". The sorter still groups by section and cohort and
         * still applies its final `id.localeCompare` tiebreak; what it skips is the PRIORITY TUPLE
         * and the manual-position pass. So the contract is a stable, evaluation-independent order.
         *
         * (Written after the first version of this test asserted input order and failed: the real
         * behaviour is the id tiebreak. That correction is the whole argument for testing behaviour
         * rather than asserting substrings of the implementation.)
         */
        const out = sortPlacementCandidateQueueRows(unordered(), true, null);
        expect(names(out)).toEqual(["early", "late", "middle"]); // row-early < row-late < row-middle
        // Positive control: the tuple order is genuinely different, so this proves shadow suppressed it.
        expect(names(sortPlacementCandidateQueueRows(unordered(), false, null))).toEqual(["early", "middle", "late"]);
        expect(names(out)).not.toEqual(names(sortPlacementCandidateQueueRows(unordered(), false, null)));
    });

    it("is stable: the same rows in a different input order give the same shadow output", () => {
        const a = sortPlacementCandidateQueueRows(unordered(), true, null);
        const b = sortPlacementCandidateQueueRows([...unordered()].reverse(), true, null);
        expect(names(a)).toEqual(names(b));
    });

    it("does NOT apply a manual position", () => {
        const rows = [
            row("a", INFANT, [INFANT, 50, 1000]),
            row("b", INFANT, [INFANT, 50, 2000]),
            row("target", INFANT, [INFANT, 50, 3000], 1),
        ];
        const shadow = names(sortPlacementCandidateQueueRows(rows, true, null));
        expect(shadow[0]).not.toBe("target");
        expect(names(sortPlacementCandidateQueueRows(rows, false, null))[0]).toBe("target");
    });

    it("still returns every row exactly once — a preview is not a filter", () => {
        const out = sortPlacementCandidateQueueRows(unordered(), true, null);
        expect(names(out).sort()).toEqual(["early", "late", "middle"]);
    });
});

describe("shadow mode does not change membership or payload either way", () => {
    it("is a permutation in both modes, and never mutates the caller's array", () => {
        for (const shadow of [true, false]) {
            const input = unordered();
            const snapshot = names(input);
            const out = sortPlacementCandidateQueueRows(input, shadow, null);
            expect(out).toHaveLength(input.length);
            expect(names(out).sort()).toEqual([...snapshot].sort());
            expect(names(input)).toEqual(snapshot); // caller's array untouched
        }
    });
});
