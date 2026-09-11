/**
 * ONE OPERATOR WAITLIST RANK.
 *
 * The position a row displays, the position the Adjust control opens on, the position the operator
 * requests, and the position the row ends up at are one number in one scope: the waitlist SECTION.
 *
 * ── WHAT THIS REPLACES ──
 *
 * This file previously asserted the opposite — that the control is "bounded by the group, not the
 * section" — and it was right about the implementation. A pin was scoped to the row's own
 * `program_room_cohort_key` while the queue counted positions across the section, so an operator
 * read `2/12` and edited `1/11`.
 *
 * Worse, it made positions unreachable. `program_room_cohort_key` is a slugified program/room
 * LABEL, not a controlled vocabulary, so one program drifts into several spellings: the deployed
 * Firefly INFANT section holds twelve candidates, eleven under `infant_0_18_months` and one under a
 * degraded `infant`. The natural sort groups cohorts into contiguous blocks, so the `infant` row
 * held section position 1 and nothing the operator did to the other eleven could reach it.
 *
 * The fixtures below keep that exact mixed-cohort shape ON PURPOSE. The point is not that the data
 * gets cleaned — normalizing degraded keys is separate hygiene — it is that the ranking model is
 * correct while the drift is still there.
 */
import { describe, expect, it } from "vitest";
import {
    isValidWaitlistAdjustPosition,
    waitlistAdjustListedCount,
    waitlistAdjustPositionModel,
    WAITLIST_ADJUST_FULL_LIST_MAX,
    WAITLIST_ADJUST_MAX_LISTED,
} from "@/lib/ui-v2/waitlistAdjustPositionOptions";
import { assignWaitlistCandidateRuntimePositions } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";
import { applySectionManualPositions } from "@/lib/orchestration/placement/applySectionManualPositions";

/** The measured deployed shape: one section, two cohort spellings of one program. */
function row(name: string, cohort: string, pin?: number) {
    return {
        id: `row-${name}`,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            placement_candidate_id: `pc-${name}`,
            child_display_name: name,
            program_room_cohort_key: cohort,
            program_room_group_label: cohort,
            placement_priority_v2: {
                active_override_kinds: pin == null ? [] : ["pin"],
                sort_tuple: [cohort, 0],
                ...(pin == null ? {} : { manual_pin_ordinal: pin }),
            },
        },
    } as Record<string, unknown>;
}
const proj = (r: Record<string, unknown>) => r._placement_waitlist_row as Record<string, unknown>;
const nameOf = (r: Record<string, unknown>) => String(proj(r).child_display_name);
/** The section every fixture row belongs to — one ranked universe, drift and all. */
const oneSection = () => "infant";

/** PassA Kid in the degraded `infant`; eleven others in canonical `infant_0_18_months`. */
function infantSection(pins: Record<string, number> = {}) {
    return [
        row("PassA Kid", "infant", pins["PassA Kid"]),
        ...Array.from({ length: 11 }, (_, i) =>
            row(`Infant${i + 1}`, "infant_0_18_months", pins[`Infant${i + 1}`]),
        ),
    ];
}

/** Rank the section the way the queue does: place manual pins, then number 1..N. */
function ranked(rows: Record<string, unknown>[]) {
    const placed = applySectionManualPositions(rows, oneSection);
    assignWaitlistCandidateRuntimePositions(placed, false, null);
    return placed.map((r) => ({
        name: nameOf(r),
        position: Number(proj(r).runtime_position),
        total: Number(proj(r).runtime_position_total),
        label: String(proj(r).runtime_position_label),
    }));
}

describe("a section with several cohort spellings is ONE ranked universe", () => {
    const natural = ranked(infantSection());

    it("counts every candidate in the section, whatever its cohort key", () => {
        expect(natural).toHaveLength(12);
        expect(natural.every((r) => r.total === 12)).toBe(true);
        expect(natural.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it("offers every one of those positions to every candidate", () => {
        for (const r of natural) {
            const m = waitlistAdjustPositionModel(r.label);
            expect(m.total, r.name).toBe(12);
            expect(m.options, r.name).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
            expect(m.current, r.name).toBe(r.position);
        }
    });

    it("displayed rank IS the adjustable rank, and the denominator IS the range max", () => {
        const second = natural[1]!;
        const m = waitlistAdjustPositionModel(second.label);
        expect(second.label).toBe("2/12");
        expect(m.current).toBe(2); // what the control opens on — never 1
        expect(m.total).toBe(12); // what it may address — never 11
        expect(Math.max(...m.options)).toBe(12);
    });

    it("no position in the ranked set is unreachable", () => {
        for (let target = 1; target <= 12; target += 1) {
            const moved = ranked(infantSection({ Infant1: target }));
            expect(moved.find((r) => r.name === "Infant1")!.position, `target ${target}`).toBe(target);
        }
    });
});

describe("moves resolve to the requested visible position", () => {
    const natural = ranked(infantSection());
    const at = (list: ReturnType<typeof ranked>, n: number) => list.find((r) => r.position === n)!.name;

    it("2 -> 4 lands at 4 and the rows between close up", () => {
        expect(at(natural, 2)).toBe("Infant1");
        const moved = ranked(infantSection({ Infant1: 4 }));
        expect(moved.find((r) => r.name === "Infant1")!.position).toBe(4);
        // Everyone the mover passed shifts up by exactly one; the head is untouched.
        expect(at(moved, 1)).toBe(at(natural, 1));
        expect(at(moved, 2)).toBe(at(natural, 3));
        expect(at(moved, 3)).toBe(at(natural, 4));
        expect(moved.every((r) => r.total === 12)).toBe(true);
    });

    it("2 -> 1 crosses the former cohort block, which used to be impossible", () => {
        // `Infant1` is `infant_0_18_months`; position 1 is held by `PassA Kid` in `infant`. Under
        // cohort-scoped pinning this move had no expressible form at all.
        const moved = ranked(infantSection({ Infant1: 1 }));
        expect(moved.find((r) => r.name === "Infant1")!.position).toBe(1);
        expect(moved.find((r) => r.name === "PassA Kid")!.position).toBe(2);
    });

    it("1 -> N moves the head of a different cohort to the tail", () => {
        const moved = ranked(infantSection({ "PassA Kid": 12 }));
        expect(moved.find((r) => r.name === "PassA Kid")!.position).toBe(12);
        expect(at(moved, 1)).toBe(at(natural, 2));
    });

    it("N -> 1 moves the tail to the head", () => {
        const tail = at(natural, 12);
        const moved = ranked(infantSection({ [tail]: 1 }));
        expect(moved.find((r) => r.name === tail)!.position).toBe(1);
        expect(moved.find((r) => r.name === "PassA Kid")!.position).toBe(2);
    });

    it("current -> current is a no-op", () => {
        const moved = ranked(infantSection({ Infant1: 2 }));
        expect(moved.map((r) => r.name)).toEqual(natural.map((r) => r.name));
    });

    it("every position label reprojects, not just the mover's", () => {
        const moved = ranked(infantSection({ Infant1: 4 }));
        expect(moved.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect(new Set(moved.map((r) => r.label)).size).toBe(12);
    });
});

describe("clearing the adjustment restores the natural order exactly", () => {
    it("returns the pre-adjustment ranking, row for row", () => {
        const natural = ranked(infantSection());
        const moved = ranked(infantSection({ Infant1: 9 }));
        expect(moved.map((r) => r.name)).not.toEqual(natural.map((r) => r.name));
        // A released override never reaches the projection, so "cleared" IS "no pin present".
        const cleared = ranked(infantSection());
        expect(cleared.map((r) => r.name)).toEqual(natural.map((r) => r.name));
        expect(cleared.map((r) => r.position)).toEqual(natural.map((r) => r.position));
    });
});

describe("sections are isolated from one another", () => {
    it("a pin in one section never reorders another", () => {
        const toddlers = [row("Tod1", "toddler"), row("Tod2", "toddler"), row("Tod3", "toddler")];
        const sectionOf = (r: Record<string, unknown>) =>
            String(proj(r).program_room_cohort_key).startsWith("infant") ? "infant" : "toddler";
        const all = [...infantSection({ Infant1: 12 }), ...toddlers];
        const placed = applySectionManualPositions(all, sectionOf);
        const toddlerOrder = placed.filter((r) => sectionOf(r) === "toddler").map(nameOf);
        expect(toddlerOrder).toEqual(["Tod1", "Tod2", "Tod3"]);
        // And the infant pin still took effect in its own section.
        const infantOrder = placed.filter((r) => sectionOf(r) === "infant").map(nameOf);
        expect(infantOrder[infantOrder.length - 1]).toBe("Infant1");
    });
});

describe("the listed range still scales (PR #817 behaviour is not regressed)", () => {
    it("lists every position for an ordinary section", () => {
        for (const total of [1, 9, 11, 12, 20, WAITLIST_ADJUST_FULL_LIST_MAX]) {
            const m = waitlistAdjustPositionModel(`1/${total}`);
            expect(m.options, `total ${total}`).toEqual(Array.from({ length: total }, (_, i) => i + 1));
            expect(m.customReachesFurther, `total ${total}`).toBe(false);
        }
    });

    it("keeps a bounded window plus Custom past the full-list bound", () => {
        const total = WAITLIST_ADJUST_FULL_LIST_MAX + 1;
        const m = waitlistAdjustPositionModel(`1/${total}`);
        expect(m.options).toEqual(Array.from({ length: WAITLIST_ADJUST_MAX_LISTED }, (_, i) => i + 1));
        expect(m.customReachesFurther).toBe(true);
        expect(isValidWaitlistAdjustPosition(total, m)).toBe(true);
        expect(isValidWaitlistAdjustPosition(total + 1, m)).toBe(false);
    });

    it("keeps a current position outside the window selectable", () => {
        const m = waitlistAdjustPositionModel("30/40");
        expect(m.options).toContain(30);
        expect(m.current).toBe(30);
    });

    it("says nothing when the engine ranked nothing", () => {
        const none = waitlistAdjustPositionModel(null);
        expect(none.options).toEqual([]);
        expect(none.total).toBeNull();
        expect(waitlistAdjustListedCount(12)).toBe(12);
    });
});

/**
 * CONTENDED ORDINALS — what happens when several candidates are pinned to the same number.
 *
 * This is not hypothetical. A census of the deployed org found FIVE active pins in one cohort:
 * three at ordinal 2, one at 3, one at 4. An operator asking for 4 landed at 5, because seats are
 * filled in ascending ordinal and never move backwards — three rows contending for 2 occupy 2, 3
 * and 4, so the pin at 3 is pushed down and the pin at 4 after it.
 *
 * That rule predates section scoping and is deliberate: it is what makes two operators pinning the
 * same number produce a stable answer instead of an arbitrary one. It is recorded here because the
 * alternative reading — "the move silently failed" — is the one a reader reaches for first, and it
 * is wrong. An UNCONTENDED ordinal is always honoured exactly, which is the case that matters and
 * the one the operator contract is written about.
 */
describe("pins contending for the same ordinal seat deterministically", () => {
    it("honours an uncontended ordinal exactly, whatever else is pinned", () => {
        // Three rivals parked on 2, as found in the deployed data.
        const pins = { Infant2: 2, Infant3: 2, Infant4: 2 };
        for (const target of [1, 6, 8, 12]) {
            const out = ranked(infantSection({ ...pins, Infant1: target }));
            expect(out.find((r) => r.name === "Infant1")!.position, `target ${target}`).toBe(target);
        }
    });

    it("seats rivals in arrival order and pushes later ordinals down, never backwards", () => {
        const out = ranked(infantSection({ Infant2: 2, Infant3: 2, Infant4: 2, Infant5: 3 }));
        const posOf = (n: string) => out.find((r) => r.name === n)!.position;
        expect([posOf("Infant2"), posOf("Infant3"), posOf("Infant4")]).toEqual([2, 3, 4]);
        // The pin at 3 cannot reclaim a seat already taken, so it follows the contended block.
        expect(posOf("Infant5")).toBe(5);
        // Still one ranked universe: twelve rows, positions 1..12, nothing lost.
        expect(out.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it("clearing a contended pin returns the rest to their own requested seats", () => {
        const withAll = ranked(infantSection({ Infant2: 2, Infant3: 2, Infant4: 2 }));
        const withoutOne = ranked(infantSection({ Infant2: 2, Infant3: 2 }));
        expect(withAll.find((r) => r.name === "Infant4")!.position).toBe(4);
        expect(withoutOne.find((r) => r.name === "Infant4")!.position).not.toBe(4);
        expect(withoutOne.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });
});
