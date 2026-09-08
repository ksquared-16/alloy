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
    waitlistAdjustPositionModel,
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
