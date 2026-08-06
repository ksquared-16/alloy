/**
 * A family case must not close out from under its children.
 *
 * `update_family_case_status` writes only `opportunities` — no cascade, which is correct — but
 * until now no guard either, so closing a family while a child was waitlisted or mid-enrollment
 * succeeded silently and stranded that child under a closed case.
 *
 * Two rules these tests exist to hold:
 *
 *  1. The guard FAILS CLOSED. It refuses on anything it cannot vouch for — an unreadable list, an
 *     unrecognised state — because the alternative is guessing about a child's enrollment.
 *  2. An ENROLLED child is not merely "not terminal". A governed family close may later end a
 *     waitlisted child after naming them in a preview; it may never convert an enrolled child to
 *     `not_enrolling`. Ending an enrollment is an agreement-ending operation with its own process.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    classifyChildTrackState,
    describeFamilyCloseBlock,
    evaluateFamilyCloseGuard,
} from "@/lib/lifecycle/familyCloseGuard";

type Row = { id: string; subject_id: string; state: string | null };

const child = (id: string, state: string | null): Row => ({
    id: `pi_${id}`,
    subject_id: `cm_${id}`,
    state,
});

const okRead = (rows: Row[]) => ({ ok: true as const, rows });

describe("child track classification", () => {
    it("maps the terminal states", () => {
        expect(classifyChildTrackState("withdrawn")).toBe("terminal");
        expect(classifyChildTrackState("not_enrolling")).toBe("terminal");
    });

    it("maps the live pre-enrollment states", () => {
        expect(classifyChildTrackState("waitlisted")).toBe("active_pre_enrollment");
        expect(classifyChildTrackState("enrolling")).toBe("active_pre_enrollment");
    });

    it("treats null as in-process, because that is what null MEANS here", () => {
        // The canonical vocabulary is `null (in-process) | waitlisted | ... `. A child riding the
        // family track before any decision is live, not unknown.
        expect(classifyChildTrackState(null)).toBe("active_pre_enrollment");
        expect(classifyChildTrackState("")).toBe("active_pre_enrollment");
    });

    it("separates enrolled from the other live states", () => {
        expect(classifyChildTrackState("enrolled")).toBe("enrolled_blocking");
    });

    it("refuses to guess at an unrecognised or unread state", () => {
        expect(classifyChildTrackState("some_future_state")).toBe("unknown_blocking");
        expect(classifyChildTrackState(undefined)).toBe("unknown_blocking");
        expect(classifyChildTrackState(42 as unknown as string)).toBe("unknown_blocking");
    });
});

describe("the family close guard", () => {
    it("allows a family with no child tracks", () => {
        const decision = evaluateFamilyCloseGuard(okRead([]));
        expect(decision.allowed).toBe(true);
        if (decision.allowed) expect(decision.child_track_count).toBe(0);
    });

    it("allows when every child track is terminal", () => {
        const decision = evaluateFamilyCloseGuard(
            okRead([child("a", "withdrawn"), child("b", "not_enrolling")]),
        );
        expect(decision.allowed).toBe(true);
        if (decision.allowed) expect(decision.terminal_track_count).toBe(2);
    });

    it("blocks on one active pre-enrollment child", () => {
        const decision = evaluateFamilyCloseGuard(okRead([child("a", "waitlisted")]));
        expect(decision.allowed).toBe(false);
        if (!decision.allowed) {
            expect(decision.reasons.map((r) => r.code)).toEqual(["child_track_active_pre_enrollment"]);
        }
    });

    it("blocks on one enrolled child, under its own reason code", () => {
        // Not folded into "active": the governed cascade must be able to end the first and refuse
        // the second, which it cannot do if both arrive as one category.
        const decision = evaluateFamilyCloseGuard(okRead([child("a", "enrolled")]));
        expect(decision.allowed).toBe(false);
        if (!decision.allowed) expect(decision.reasons[0]!.code).toBe("child_track_enrolled");
    });

    it("blocks on one unknown child state", () => {
        const decision = evaluateFamilyCloseGuard(okRead([child("a", "who_knows")]));
        expect(decision.allowed).toBe(false);
        if (!decision.allowed) expect(decision.reasons[0]!.code).toBe("child_track_state_unknown");
    });

    it("BLOCKS when enumeration fails — a failed read is never zero children", () => {
        // The defect this guard was designed around: `listEnrollmentInstancesForLead` answers a
        // query error with `[]`, which a naive guard reads as "no children" and lets the close
        // through. That is the one failure mode that must be impossible.
        const decision = evaluateFamilyCloseGuard({ ok: false, error: "connection reset" });
        expect(decision.allowed).toBe(false);
        if (!decision.allowed) {
            expect(decision.reasons[0]!.code).toBe("child_track_enumeration_failed");
            expect(decision.reasons[0]!.detail).toBe("connection reset");
        }
    });

    it("blocks a mixed family and names every affected child", () => {
        const decision = evaluateFamilyCloseGuard(
            okRead([
                child("a", "waitlisted"),
                child("b", "not_enrolling"),
                child("c", "enrolled"),
                child("d", null),
            ]),
        );
        expect(decision.allowed).toBe(false);
        if (decision.allowed) return;

        // Hardest block first, so a preview reads the same way every time.
        expect(decision.reasons.map((r) => r.code)).toEqual([
            "child_track_enrolled",
            "child_track_active_pre_enrollment",
        ]);
        const enrolled = decision.reasons[0]!;
        expect(enrolled.tracks.map((t) => t.customer_member_id)).toEqual(["cm_c"]);
        // Both live children are reported together, so the preview can name them in one sentence.
        const active = decision.reasons[1]!;
        expect(active.tracks.map((t) => t.customer_member_id).sort()).toEqual(["cm_a", "cm_d"]);
        // The terminal child is not reported as a blocker at all.
        expect(
            decision.reasons.flatMap((r) => r.tracks).some((t) => t.customer_member_id === "cm_b"),
        ).toBe(false);
    });

    it("carries the identity a preview needs to name a child", () => {
        const decision = evaluateFamilyCloseGuard(okRead([child("a", "waitlisted")]));
        if (decision.allowed) throw new Error("expected block");
        expect(decision.reasons[0]!.tracks[0]).toMatchObject({
            classification: "active_pre_enrollment",
            process_instance_id: "pi_a",
            customer_member_id: "cm_a",
            state_key: "waitlisted",
        });
    });

    it("reports the raw unknown state rather than paraphrasing it", () => {
        const decision = evaluateFamilyCloseGuard(okRead([child("a", "some_future_state")]));
        if (decision.allowed) throw new Error("expected block");
        expect(decision.reasons[0]!.tracks[0]!.state_key).toBe("some_future_state");
    });
});

describe("the guard decides and nothing else", () => {
    it("does not mutate the rows it is given", () => {
        const rows = [child("a", "waitlisted"), child("b", "enrolled"), child("c", "withdrawn")];
        const before = JSON.parse(JSON.stringify(rows));
        evaluateFamilyCloseGuard(okRead(rows));
        // Byte-identical: the guard reads, classifies, and returns. It cannot touch a child.
        expect(rows).toEqual(before);
    });

    it("is pure — the same input decides the same way twice", () => {
        const rows = [child("a", "waitlisted")];
        expect(evaluateFamilyCloseGuard(okRead(rows))).toEqual(evaluateFamilyCloseGuard(okRead(rows)));
    });
});

describe("the guard is wired to the invariant-owning path", () => {
    // A STRUCTURAL assertion, in the style this suite already uses elsewhere. It proves the call
    // site's shape — guard before write, gated to closes, fail-closed read — not its runtime
    // behaviour against a live database. Runtime proof belongs to the sub-slice that builds the
    // family-close command, where a real preview exists to assert against.
    const executor = readFileSync(
        resolve(__dirname, "../../lib/lifecycle/stageOutcomeRuleTargetExecutor.ts"),
        "utf8",
    );
    const familyCase = executor.slice(
        executor.indexOf('case "update_family_case_status"'),
        executor.indexOf('case "update_child_enrollment_status"'),
    );

    it("guards the executor, not merely the close_lead command", () => {
        expect(familyCase).toContain("evaluateFamilyCloseGuard");
    });

    it("checks the guard BEFORE the status write", () => {
        // Order is the whole point: a guard after the write is not a guard.
        expect(familyCase.indexOf("evaluateFamilyCloseGuard")).toBeLessThan(
            familyCase.indexOf("updateOpportunityStatusWithEvent"),
        );
    });

    it("only guards writes that close the case", () => {
        // `reached_qualified` writes status `open` and must not pay for this.
        expect(familyCase).toContain("familyCaseStatusCloses");
        expect(familyCase.indexOf("familyCaseStatusCloses")).toBeLessThan(
            familyCase.indexOf("evaluateFamilyCloseGuard"),
        );
    });

    it("reads children through the fail-closed seam, not the lenient one", () => {
        expect(familyCase).toContain("readEnrollmentInstancesForLead");
        expect(familyCase).not.toContain("listEnrollmentInstancesForLead");
    });

    it("returns structured reasons for a later preview to translate", () => {
        expect(familyCase).toContain("blocked_reasons");
    });

    it("performs no child mutation on the blocked path", () => {
        const blocked = familyCase.slice(
            familyCase.indexOf("evaluateFamilyCloseGuard"),
            familyCase.indexOf("Read the prior value"),
        );
        for (const writer of [
            "setEnrollmentInstanceStateByScope",
            "moveEnrollmentInstanceStageByScope",
            ".update(",
            ".insert(",
        ]) {
            expect(blocked, `guard path must not call ${writer}`).not.toContain(writer);
        }
    });
});

describe("diagnostics", () => {
    it("summarises a block without inventing operator copy", () => {
        const decision = evaluateFamilyCloseGuard(okRead([child("a", "enrolled"), child("b", "waitlisted")]));
        expect(describeFamilyCloseBlock(decision)).toBe(
            "child_track_enrolled(1); child_track_active_pre_enrollment(1)",
        );
    });

    it("names the enumeration failure", () => {
        expect(describeFamilyCloseBlock(evaluateFamilyCloseGuard({ ok: false, error: "timeout" }))).toBe(
            "child_track_enumeration_failed(timeout)",
        );
    });
});
