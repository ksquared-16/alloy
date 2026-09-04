/**
 * R12 — the typed `pin_scoped_to_cohort` precedence reason.
 *
 * A pin is an ordinal WITHIN ITS COHORT, but the position an operator reads is scoped to the whole
 * program section, and a section may hold several cohorts. Measured live: a candidate pinned to
 * ordinal 1 in `infant_0_18_months` shows 2/12 in the `infant` section because cohort `infant` is
 * ordered first. The pin is fully in force; it just cannot look that way.
 *
 * The reason is derived from the row's OWN pin and cohort plus the cohort keys ahead of it. Nothing
 * about the row actually in front is read, so a contested (R10) or inaccessible neighbour cannot leak.
 */
import { describe, expect, it } from "vitest";

import { assignWaitlistCandidateRuntimePositions } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";
import { waitlistPrecedenceReasonCopy } from "@/lib/ui-v2/waitlistPrecedenceReasonCopy";

function row(id: string, cohort: string, overrideKinds: string[], ordinal = 1) {
    return {
        id,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            child_display_name: id,
            program_room_cohort_key: cohort,
            program_room_group_label: "Infant",
            placement_priority_v2: { active_override_kinds: overrideKinds, sort_tuple: [cohort, ordinal, 0] },
        },
    } as Record<string, unknown>;
}
const pinned = (id: string, cohort: string) => row(id, cohort, ["pin"]);
const plain = (id: string, cohort: string) => row(id, cohort, []);

const proj = (r: Record<string, unknown>) => r._placement_waitlist_row as Record<string, unknown>;
const reasonOf = (r: Record<string, unknown>) => proj(r).runtime_position_precedence_reason;
const noteOf = (r: Record<string, unknown>) => proj(r).runtime_position_precedence_note;
const orderOf = (rows: Array<Record<string, unknown>>) => rows.map((r) => `${r.id}@${proj(r).runtime_position}`);

describe("R12 — pin_scoped_to_cohort", () => {
    it("1: a pin that is first in its cohort AND first overall gets no explanation", () => {
        const rows = [pinned("wrigley", "infant_0_18_months"), plain("other", "infant_0_18_months")];
        assignWaitlistCandidateRuntimePositions(rows, false, null);
        expect(proj(rows[0]!).runtime_position).toBe(1);
        expect(reasonOf(rows[0]!)).toBeUndefined();
    });

    it("2: a pin first in its cohort but behind an earlier cohort IS explained", () => {
        // The measured shape.
        const rows = [plain("earlier-cohort", "infant"), pinned("wrigley", "infant_0_18_months")];
        assignWaitlistCandidateRuntimePositions(rows, false, null);
        expect(proj(rows[1]!).runtime_position).toBe(2);
        expect(reasonOf(rows[1]!)).toBe("pin_scoped_to_cohort");
        // The reason code is still emitted and still typed; it simply carries no operator prose.
        // The row shows no helper sentence — scope is stated by the control's field label instead.
        expect(waitlistPrecedenceReasonCopy(reasonOf(rows[1]!) as string)).toBeNull();
    });

    it("3 + 6: a pin behind ANOTHER row of its own cohort is not a cohort-scope case", () => {
        // Single cohort: whatever is ahead, it is not cohort precedence, so this reason must not fire.
        const rows = [plain("ahead", "infant_0_18_months"), pinned("wrigley", "infant_0_18_months")];
        assignWaitlistCandidateRuntimePositions(rows, false, null);
        expect(reasonOf(rows[1]!)).toBeUndefined();
    });

    it("4: an unpinned row never receives a pin explanation", () => {
        const rows = [plain("earlier-cohort", "infant"), plain("later-cohort", "infant_0_18_months")];
        assignWaitlistCandidateRuntimePositions(rows, false, null);
        expect(reasonOf(rows[1]!)).toBeUndefined();
    });

    it("5 + 13: an inactive/expired/removed pin is not an active pin, so no explanation", () => {
        // `active_override_kinds` carries ACTIVE overrides only — an expired or removed pin is absent,
        // which is the same shape as an unpinned row. Unpin therefore clears the explanation.
        const rows = [plain("earlier-cohort", "infant"), row("wrigley", "infant_0_18_months", [])];
        assignWaitlistCandidateRuntimePositions(rows, false, null);
        expect(reasonOf(rows[1]!)).toBeUndefined();
    });

    it("a non-pin override (tier boost) does not produce a pin explanation", () => {
        const rows = [plain("earlier", "infant"), row("boosted", "infant_0_18_months", ["tier_boost"])];
        assignWaitlistCandidateRuntimePositions(rows, false, null);
        expect(reasonOf(rows[1]!)).toBeUndefined();
    });

    it("7 + 8: the reason carries no detail about the row ahead", () => {
        // The row ahead is renamed and re-keyed; the explanation must be byte-identical.
        const a = [plain("contested-passa", "infant"), pinned("wrigley", "infant_0_18_months")];
        const b = [plain("some-other-child", "infant"), pinned("wrigley", "infant_0_18_months")];
        assignWaitlistCandidateRuntimePositions(a, false, null);
        assignWaitlistCandidateRuntimePositions(b, false, null);
        expect(reasonOf(a[1]!)).toBe(reasonOf(b[1]!));
        // The reason now carries no operator prose at all, so there is trivially nothing to leak.
        // The assertion is kept in the stronger form — whatever copy a future surface attaches must
        // still name no neighbouring row, cohort or child.
        const copy = waitlistPrecedenceReasonCopy(reasonOf(a[1]!) as string) ?? "";
        for (const leak of ["contested-passa", "some-other-child", "infant_0_18_months", "infant"]) {
            expect(copy).not.toContain(leak);
        }
    });

    it("9: the explanation is present with shadow mode OFF", () => {
        const rows = [plain("earlier", "infant"), pinned("wrigley", "infant_0_18_months")];
        assignWaitlistCandidateRuntimePositions(rows, false, null);
        expect(reasonOf(rows[1]!)).toBe("pin_scoped_to_cohort");
    });

    it("10: the shadow-only diagnostic note stays shadow-only and is a different concern", () => {
        const live = [plain("earlier", "infant"), pinned("wrigley", "infant_0_18_months")];
        assignWaitlistCandidateRuntimePositions(live, false, null);
        expect(noteOf(live[1]!)).toBeUndefined();

        // The existing note answers "you were beaten by someone's pin" — the opposite direction.
        // Distinct tuples, so priority rank decides the shadow order rather than the id tiebreak.
        const shadow = [
            row("winner", "infant_0_18_months", ["pin"], 1),
            row("loser", "infant_0_18_months", [], 2),
        ];
        assignWaitlistCandidateRuntimePositions(shadow, true, null);
        expect(noteOf(shadow[1]!)).toBe("Ranked below manually adjusted row(s) in this program section.");
        expect(reasonOf(shadow[1]!)).toBeUndefined();
    });

    it("11-14: the reason is recomputed per assignment, so no explanation can go stale", () => {
        // Same row object, re-assigned in a context where it is now first overall: the previously
        // written reason must be gone, not carried over.
        const wrigley = pinned("wrigley", "infant_0_18_months");
        assignWaitlistCandidateRuntimePositions([plain("earlier", "infant"), wrigley], false, null);
        expect(reasonOf(wrigley)).toBe("pin_scoped_to_cohort");
        assignWaitlistCandidateRuntimePositions([wrigley, plain("after", "infant_0_18_months")], false, null);
        expect(reasonOf(wrigley)).toBeUndefined();
    });

    it("15: adding the reason changes no position and no order", () => {
        const build = () => [plain("earlier", "infant"), pinned("wrigley", "infant_0_18_months"), plain("third", "infant_0_18_months")];
        const withReason = build();
        assignWaitlistCandidateRuntimePositions(withReason, false, null);
        expect(orderOf(withReason)).toEqual(["earlier@1", "wrigley@2", "third@3"]);
        // The reason is additive: stripping it leaves the identical position payload.
        for (const r of withReason) delete proj(r).runtime_position_precedence_reason;
        const baseline = build();
        assignWaitlistCandidateRuntimePositions(baseline, false, null);
        for (const r of baseline) delete proj(r).runtime_position_precedence_reason;
        expect(withReason.map(proj)).toEqual(baseline.map(proj));
    });

    it("unknown reason codes resolve to no copy rather than leaking a raw code", () => {
        expect(waitlistPrecedenceReasonCopy("some_future_code")).toBeNull();
        expect(waitlistPrecedenceReasonCopy(null)).toBeNull();
    });
});
