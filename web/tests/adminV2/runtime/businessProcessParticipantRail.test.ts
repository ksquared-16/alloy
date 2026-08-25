/**
 * PARTICIPANT PROJECTION ON THE RAIL — placement by key, divergence made visible, and nobody
 * silently dropped.
 *
 * The hard invariant this file exists for: a participant's state must never move the case marker.
 * A family at Tour with one child at Waitlist has to show all three facts at once, or the rail is
 * lying about one of them.
 */

import { describe, expect, it } from "vitest";

import { buildBusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const STAGES = [
    { key: "lead", label: "Lead" },
    { key: "tour", label: "Tour" },
    { key: "waitlist", label: "Waitlist" },
    { key: "enrolling", label: "Enrolling" },
    { key: "enrolled", label: "Enrolled" },
];

function ctx(args: {
    caseStageKey: string;
    children: Array<{ name: string; stage_key?: string | null; outcome_status_key?: string | null }>;
}): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp_1", label: "Wright Family" },
        businessProcess: {
            key: args.caseStageKey,
            label: "Enrollment",
            stageKey: args.caseStageKey,
            stages: STAGES,
        },
        perspective: null,
        truth: {
            id: "opp_1",
            stage_key: args.caseStageKey,
            _inquiry_children: args.children.map((c, i) => ({
                id: `ocm_${i}`,
                customer_member_id: `ocm_${i}`,
                child_name: c.name,
                first_name: c.name.split(" ")[0],
                last_name: c.name.split(" ")[1] ?? "Wright",
                stage_key: c.stage_key ?? null,
                outcome_status_key: c.outcome_status_key ?? null,
            })),
        },
        signals: { work: null, attention: null, tour: null, communications: null, billing: null },
        stageWorkRuntime: null,
    } as unknown as OperationalContext;
}

describe("participant rail projection", () => {
    it("THE INVARIANT — a child's stage never moves the case marker", () => {
        // Case = Tour. Avery = Waitlist. Riley = Tour. All three must be simultaneously true.
        const ev = buildBusinessProcessCardEvidence(
            ctx({
                caseStageKey: "tour",
                children: [
                    { name: "Avery Wright", stage_key: "waitlist" },
                    { name: "Riley Wright", stage_key: "tour" },
                ],
            }),
        );

        expect(ev.caseStageKey).toBe("tour");
        expect(ev.stages.find((s) => s.key === "tour")?.state).toBe("current");
        // The child at Waitlist did NOT drag the case forward.
        expect(ev.stages.find((s) => s.key === "waitlist")?.state).toBe("future");

        const atTour = ev.stages.find((s) => s.key === "tour")!.participants.map((p) => p.firstName);
        const atWaitlist = ev.stages.find((s) => s.key === "waitlist")!.participants.map((p) => p.firstName);
        expect(atTour).toEqual(["Riley"]);
        expect(atWaitlist).toEqual(["Avery"]);
        expect(ev.participantsAligned).toBe(false);
    });

    it("places by KEY, not by the label a human reads", () => {
        const ev = buildBusinessProcessCardEvidence(
            ctx({ caseStageKey: "tour", children: [{ name: "Avery Wright", stage_key: "waitlist" }] }),
        );
        const avery = ev.participants[0]!;
        expect(avery.stageKey).toBe("waitlist");
        // The label rides along for presentation and is NOT what placed the marker.
        expect(avery.stageLabel).not.toBe(avery.stageKey);
        expect(ev.stages.find((s) => s.key === "waitlist")!.participants).toHaveLength(1);
    });

    it("quiets the projection when every participant sits at the case's own stage", () => {
        const ev = buildBusinessProcessCardEvidence(
            ctx({
                caseStageKey: "tour",
                children: [
                    { name: "Avery Wright", stage_key: "tour" },
                    { name: "Riley Wright", stage_key: "tour" },
                ],
            }),
        );
        // Divergence is the information worth showing; agreement adds nothing to the rail.
        expect(ev.participantsAligned).toBe(true);
    });

    it("records an unplaceable participant instead of dropping them", () => {
        const ev = buildBusinessProcessCardEvidence(
            ctx({
                caseStageKey: "tour",
                children: [
                    { name: "Avery Wright", stage_key: "waitlist" },
                    // A real stage this rail does not show.
                    { name: "Sam Wright", stage_key: "closed_withdrawn" },
                ],
            }),
        );
        expect(ev.participants.map((p) => p.firstName)).toEqual(["Avery"]);
        expect(ev.unresolvedParticipants).toHaveLength(1);
        expect(ev.unresolvedParticipants[0]!.reason).toBe("stage_not_on_rail");
        expect(ev.unresolvedParticipants[0]!.stageKey).toBe("closed_withdrawn");
        // The family still has two children — the gap is reported, never silently smaller.
        expect(ev.participants.length + ev.unresolvedParticipants.length).toBe(2);
    });

    it("a child with no stage of their own rides the family's — canonical, not a guess", () => {
        // The resolver's documented third source: a brand-new lead has no child stage yet and is
        // genuinely at the family's stage. Placing them there is truth, not a fallback for display.
        const ev = buildBusinessProcessCardEvidence(
            ctx({
                caseStageKey: "tour",
                children: [{ name: "Newby Wright", stage_key: null, outcome_status_key: null }],
            }),
        );
        expect(ev.participants).toHaveLength(1);
        expect(ev.participants[0]!.stageKey).toBe("tour");
        expect(ev.unresolvedParticipants).toHaveLength(0);
    });

    it("is reported unresolved only when NO source can name a stage", () => {
        const ev = buildBusinessProcessCardEvidence(
            ctx({
                // No case stage either, so there is nothing to ride.
                caseStageKey: "",
                children: [{ name: "Nobody Wright", stage_key: null, outcome_status_key: null }],
            }),
        );
        expect(ev.participants).toHaveLength(0);
        expect(ev.unresolvedParticipants[0]!.reason).toBe("no_stage_key");
    });
});
