/**
 * R12 evidence — does the EXISTING precedence note reach the reproduced case?
 *
 * Exercises the real `assignWaitlistCandidateRuntimePositions`, in both shadow states, for the shape
 * measured live: a pinned row ranked below an UNPINNED row in the same program section.
 */
import { describe, expect, it } from "vitest";
import { assignWaitlistCandidateRuntimePositions } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";

function row(name: string, cohort: string, pinned: boolean, tuple: Array<string | number | null>) {
    return {
        id: name,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            child_display_name: name,
            program_room_cohort_key: cohort,
            program_room_group_label: cohort,
            placement_priority_v2: {
                active_override_kinds: pinned ? ["pin"] : [],
                sort_tuple: tuple,
            },
        },
    } as Record<string, unknown>;
}

describe("R12 — reach of the existing precedence note", () => {
    // Measured live: PassA Kid (cohort `infant`, NOT pinned) at 1/12; Wrigley (cohort
    // `infant_0_18_months`, pinned ordinal 1) at 2/12; both in the `infant` section.
    const reproduced = () => [
        row("PassA Kid", "infant", false, ["infant", 1, 0]),
        row("Wrigley", "infant_0_18_months", true, ["infant_0_18_months", 1, 0]),
    ];

    it("LIVE (shadow off): no precedence note is produced at all", () => {
        const rows = reproduced();
        assignWaitlistCandidateRuntimePositions(rows, false, null);
        const notes = rows.map((r) => (r._placement_waitlist_row as Record<string, unknown>).runtime_position_precedence_note);
        expect(notes).toEqual([undefined, undefined]);
    });

    it("SHADOW on: the note STILL does not reach the pinned row, because the winner is not pinned", () => {
        const rows = reproduced();
        assignWaitlistCandidateRuntimePositions(rows, true, null);
        const pinnedRow = rows.find((r) => (r.id as string) === "Wrigley")!;
        const note = (pinnedRow._placement_waitlist_row as Record<string, unknown>).runtime_position_precedence_note;
        // The existing note explains "you lost to someone's PIN". Here the winner has no pin, so
        // ungating shadow mode would not explain this case.
        expect(note).toBeUndefined();
    });

    it("the note only ever fires when a HIGHER row is pinned — it explains the winner, not the loser's pin", () => {
        const rows = [
            row("Winner", "a_cohort", true, ["a_cohort", 1, 0]),
            row("Loser", "a_cohort", false, ["a_cohort", 2, 0]),
        ];
        assignWaitlistCandidateRuntimePositions(rows, true, null);
        const loser = rows.find((r) => (r.id as string) === "Loser")!;
        const note = (loser._placement_waitlist_row as Record<string, unknown>).runtime_position_precedence_note;
        expect(note).toBe("Ranked below manually adjusted row(s) in this program section.");
    });
});
