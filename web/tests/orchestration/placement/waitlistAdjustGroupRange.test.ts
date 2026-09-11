/**
 * THE ADJUST CONTROL IS BOUNDED BY THE GROUP, NOT THE SECTION.
 *
 * `position_label` answers "where am I in the list I am reading" — section-scoped. A pin answers
 * "where should I sit inside my own cohort" — cohort-scoped. A section can hold several cohorts, so
 * the two numbers differ, and bounding the control on the section total offered positions the write
 * could only clamp: the operator's number silently became a different number.
 *
 * Measured on deployed staging bcd20f004: the Waitlist section showed 12 while the target's cohort
 * `infant_0_18_months` held 11, because PassA Kid sits in cohort `infant`. The control offered "12".
 *
 * The range now comes from the placement engine (`runtime_group_position` / `runtime_group_total`).
 * Nothing is recomputed in the client — one placement authority.
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

/** The measured deployed shape: one section, two cohorts. */
function row(name: string, cohort: string) {
    return {
        id: `row-${name}`,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            placement_candidate_id: `pc-${name}`,
            child_display_name: name,
            program_room_cohort_key: cohort,
            program_room_group_label: cohort,
            placement_priority_v2: { active_override_kinds: [], sort_tuple: [cohort, 0] },
        },
    } as Record<string, unknown>;
}
const proj = (r: Record<string, unknown>) => r._placement_waitlist_row as Record<string, unknown>;

describe("placement engine publishes the group-local range", () => {
    // PassA Kid in `infant`; eleven others in `infant_0_18_months` — the deployed mixed-cohort case.
    const rows = [
        row("PassA Kid", "infant"),
        ...Array.from({ length: 11 }, (_, i) => row(`Infant${i + 1}`, "infant_0_18_months")),
    ];
    assignWaitlistCandidateRuntimePositions(rows, false, null);

    it("section total and group total genuinely differ", () => {
        const target = proj(rows[1]!); // first infant_0_18_months row
        expect(target.runtime_position_total).toBe(12); // section
        expect(target.runtime_group_total).toBe(11); // cohort — the legal range
    });

    it("the single-member cohort gets a group total of 1, not the section total", () => {
        const passA = proj(rows[0]!);
        expect(passA.runtime_position_total).toBe(12);
        expect(passA.runtime_group_total).toBe(1);
        expect(passA.runtime_group_position).toBe(1);
    });

    it("group position counts within the cohort, not the section", () => {
        expect(proj(rows[1]!).runtime_group_position).toBe(1); // section rank 2, group rank 1
        expect(proj(rows[2]!).runtime_group_position).toBe(2); // section rank 3, group rank 2
        expect(proj(rows[1]!).runtime_position).toBe(2);
    });
});

describe("the control bounds itself on the published group range", () => {
    it("offers only legal cohort positions, never the section total", () => {
        const m = waitlistAdjustPositionModel("2/12", "pin_scoped_to_cohort", { position: 1, total: 11 });
        expect(m.total).toBe(11);
        expect(m.current).toBe(1);
        expect(Math.max(...m.options)).toBeLessThanOrEqual(11);
        expect(m.options).not.toContain(12);
    });

    it("the pre-fix bound offered a position the command could not mean (positive control)", () => {
        const sectionOnly = waitlistAdjustPositionModel("2/12", "pin_scoped_to_cohort");
        expect(sectionOnly.total).toBe(12); // section total — one past the cohort's 11
        expect(isValidWaitlistAdjustPosition(12, sectionOnly)).toBe(true); // used to be accepted
        const grouped = waitlistAdjustPositionModel("2/12", "pin_scoped_to_cohort", { position: 1, total: 11 });
        expect(isValidWaitlistAdjustPosition(12, grouped)).toBe(false); // now refused
    });

    it("Custom max uses the same authoritative range", () => {
        const m = waitlistAdjustPositionModel("2/12", null, { position: 1, total: 11 });
        expect(isValidWaitlistAdjustPosition(11, m)).toBe(true);
        expect(isValidWaitlistAdjustPosition(12, m)).toBe(false);
        expect(isValidWaitlistAdjustPosition(0, m)).toBe(false);
    });

    it("a long cohort still lists a bounded window and reaches the rest via Custom", () => {
        const m = waitlistAdjustPositionModel("3/40", null, { position: 30, total: 40 });
        expect(m.options.length).toBeLessThanOrEqual(WAITLIST_ADJUST_MAX_LISTED + 1);
        expect(m.customReachesFurther).toBe(true);
        expect(m.options).toContain(30); // current stays selectable even outside the window
    });

    it("falls back to the section label only when no group range is published", () => {
        const m = waitlistAdjustPositionModel("2/12", null, { position: null, total: null });
        expect(m.total).toBe(12);
        const none = waitlistAdjustPositionModel(null, null, null);
        expect(none.total).toBeNull();
        expect(none.options).toEqual([]);
    });

    it("displayed section rank stays section-scoped — the control does not restate it", () => {
        const m = waitlistAdjustPositionModel("3/12", "pin_scoped_to_cohort", { position: 2, total: 11 });
        expect(m.current).toBe(2); // group ordinal, what the command takes
        expect(m.total).toBe(11);
        expect(m.scopedToGroup).toBe(true); // label says "Group position"
    });
});

/**
 * EVERY LEGAL POSITION IS A CLICK, NOT A DISCOVERY.
 *
 * The control listed ten positions whatever the cohort held. Measured on the deployed Firefly
 * INFANT section: twelve candidates across two cohorts, so the pinned cohort `infant_0_18_months`
 * holds eleven — and position 11, an entirely ordinary move inside that operator's own group, could
 * be reached only by finding "Custom…". The bound on a move has NOT changed; only how many of the
 * legal positions are offered directly.
 */
describe("the listed range covers the cohort, not a fixed ten", () => {
    it("an eleven-member cohort offers 1..11 directly, including 11", () => {
        const m = waitlistAdjustPositionModel("2/12", "pin_scoped_to_cohort", { position: 1, total: 11 });
        expect(m.options).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        expect(m.options).toContain(11);
        expect(m.customReachesFurther).toBe(false); // nothing left that only Custom can reach
    });

    it("still refuses the section total — the bound is the cohort", () => {
        const m = waitlistAdjustPositionModel("2/12", "pin_scoped_to_cohort", { position: 1, total: 11 });
        expect(m.options).not.toContain(12);
        expect(m.total).toBe(11);
        expect(isValidWaitlistAdjustPosition(12, m)).toBe(false);
    });

    it("lists every position for cohort sizes up to the full-list bound", () => {
        for (const total of [1, 2, 9, 10, 11, 12, 20, WAITLIST_ADJUST_FULL_LIST_MAX]) {
            const m = waitlistAdjustPositionModel(null, null, { position: 1, total });
            expect(m.options, `total ${total}`).toEqual(Array.from({ length: total }, (_, i) => i + 1));
            expect(m.customReachesFurther, `total ${total}`).toBe(false);
        }
    });

    it("keeps a bounded window past the full-list bound, with Custom for the rest", () => {
        const total = WAITLIST_ADJUST_FULL_LIST_MAX + 1;
        const m = waitlistAdjustPositionModel(null, null, { position: 1, total });
        expect(m.options).toEqual(Array.from({ length: WAITLIST_ADJUST_MAX_LISTED }, (_, i) => i + 1));
        expect(m.customReachesFurther).toBe(true);
        expect(isValidWaitlistAdjustPosition(total, m)).toBe(true); // still legal, just typed
    });

    it("there is no fixed ten in the listed count for an ordinary cohort", () => {
        expect(waitlistAdjustListedCount(11)).toBe(11);
        expect(waitlistAdjustListedCount(12)).toBe(12);
        // The window only returns for cohorts larger than a room's waitlist.
        expect(waitlistAdjustListedCount(100)).toBe(WAITLIST_ADJUST_MAX_LISTED);
    });

    it("a current position beyond the window stays selectable", () => {
        const m = waitlistAdjustPositionModel(null, null, { position: 30, total: 40 });
        expect(m.options).toContain(30);
        expect(m.current).toBe(30);
    });
});

/**
 * THE TWO NUMBERS ARE DIFFERENT ON PURPOSE, AND THIS IS THE MEASURED CASE.
 *
 * Reported as a defect: the queue reads `2/12` and Adjust opens on `1 (current)`. Reproduced on the
 * running app at a later cohort state — queue `6/12`, Adjust `5 (current)` — and again at `2/12`
 * after the override was cleared. It is the same 1-off every time, and it is correct: PassA Kid
 * occupies section rank 1 from the OTHER cohort, so every `infant_0_18_months` row reads one higher
 * in the section than in its own group. The pin command takes the group number.
 */
describe("section rank and group rank differ by the cohorts ahead", () => {
    const rows = [
        row("PassA Kid", "infant"),
        ...Array.from({ length: 11 }, (_, i) => row(`Infant${i + 1}`, "infant_0_18_months")),
    ];
    assignWaitlistCandidateRuntimePositions(rows, false, null);

    it("the first cohort member reads 2 in the section and 1 in its group", () => {
        const first = proj(rows[1]!);
        expect(first.runtime_position).toBe(2);
        expect(first.runtime_group_position).toBe(1);
        const m = waitlistAdjustPositionModel(
            String(first.runtime_position_label),
            String(first.runtime_position_precedence_reason ?? ""),
            { position: Number(first.runtime_group_position), total: Number(first.runtime_group_total) },
        );
        // What the operator is offered is the number the command will act on.
        expect(m.current).toBe(1);
        expect(m.total).toBe(11);
    });

    it("the offset holds down the whole cohort", () => {
        for (let i = 1; i <= 11; i += 1) {
            const p = proj(rows[i]!);
            expect(Number(p.runtime_position) - Number(p.runtime_group_position), `row ${i}`).toBe(1);
        }
    });
});
