/**
 * Effective Process Position — pure engine tests (Enrollment fixtures + Assignment/Billing pressure).
 */

import { describe, expect, it } from "vitest";

import {
    buildProcessParticipant,
    type ProcessParticipant,
} from "@/lib/process/engine/processParticipant";
import type { ProcessParticipationContract } from "@/lib/process/engine/processParticipationContract";
import {
    composeStageRollup,
    contextBelongsToEffectiveStage,
    deriveEffectiveProcessPosition,
    effectiveProcessPositionBelongsToStage,
} from "@/lib/process/engine/effectiveProcessPosition";
import { ENROLLMENT_PARTICIPATION_CONTRACT } from "@/lib/process/definitions/enrollment/enrollmentContract";

function participant(args: {
    id: string;
    subjectId: string;
    contextId: string;
    participantStage: string | null;
    contextStage: string;
    locationId?: string | null;
}): ProcessParticipant<{ locationId: string | null }> {
    return buildProcessParticipant(
        {
            id: args.id,
            org_id: "org",
            process_key: "enrollment",
            subject_type: "child",
            subject_id: args.subjectId,
            context_id: args.contextId,
            stage_key: args.participantStage,
            state: null,
            close_reason_key: null,
        },
        {
            contextStageKey: args.contextStage,
            scopeId: "wu",
            attributes: { locationId: args.locationId ?? null },
        },
    );
}

const locationOf = (p: ProcessParticipant<{ locationId: string | null }>) => p.attributes.locationId;

describe("Effective Process Position — Enrollment scenarios", () => {
    it("A: both children inherit Lead → family Lead → Lead membership", () => {
        const kids = [
            participant({
                id: "pi-1",
                subjectId: "cm-1",
                contextId: "opp",
                participantStage: null,
                contextStage: "lead",
                locationId: "north",
            }),
            participant({
                id: "pi-2",
                subjectId: "cm-2",
                contextId: "opp",
                participantStage: null,
                contextStage: "lead",
                locationId: "north",
            }),
        ];
        const pos = deriveEffectiveProcessPosition({
            contextId: "opp",
            contextStageKey: "lead",
            participants: kids,
            contract: ENROLLMENT_PARTICIPATION_CONTRACT,
            locationOf,
        });
        expect(pos.stageRollup.homogeneous).toBe(true);
        expect(pos.stageRollup.compactLabel).toBe("lead");
        expect(effectiveProcessPositionBelongsToStage(pos, "lead")).toBe(true);
        expect(effectiveProcessPositionBelongsToStage(pos, "waitlist")).toBe(false);
    });

    it("B: one Lead / one Waitlist → mixed rollup; family remains in Lead; Waitlist has one child", () => {
        const kids = [
            participant({
                id: "pi-1",
                subjectId: "cm-1",
                contextId: "opp",
                participantStage: "waitlist",
                contextStage: "lead",
                locationId: "north",
            }),
            participant({
                id: "pi-2",
                subjectId: "cm-2",
                contextId: "opp",
                participantStage: null,
                contextStage: "lead",
                locationId: "north",
            }),
        ];
        const pos = deriveEffectiveProcessPosition({
            contextId: "opp",
            contextStageKey: "lead",
            participants: kids,
            contract: ENROLLMENT_PARTICIPATION_CONTRACT,
            locationOf,
        });
        expect(pos.stageRollup.homogeneous).toBe(false);
        expect(pos.stageRollup.compactLabel).toBe("waitlist · lead");
        expect(effectiveProcessPositionBelongsToStage(pos, "lead")).toBe(true);
        expect(effectiveProcessPositionBelongsToStage(pos, "waitlist")).toBe(true);
        expect(pos.participants.filter((p) => p.effectiveStageKey === "waitlist")).toHaveLength(1);
    });

    it("C: both Waitlist → family rollup Waitlist; absent from Lead", () => {
        const kids = [
            participant({
                id: "pi-1",
                subjectId: "cm-1",
                contextId: "opp",
                participantStage: "waitlist",
                contextStage: "lead",
            }),
            participant({
                id: "pi-2",
                subjectId: "cm-2",
                contextId: "opp",
                participantStage: "waitlist",
                contextStage: "lead",
            }),
        ];
        const pos = deriveEffectiveProcessPosition({
            contextId: "opp",
            contextStageKey: "lead", // persisted family stage may still say lead
            participants: kids,
            contract: ENROLLMENT_PARTICIPATION_CONTRACT,
            locationOf,
        });
        expect(pos.stageRollup.compactLabel).toBe("waitlist");
        expect(effectiveProcessPositionBelongsToStage(pos, "lead")).toBe(false);
        expect(effectiveProcessPositionBelongsToStage(pos, "waitlist")).toBe(true);
        // Critical: raw context stage must NOT keep the family in Lead alone.
        expect(
            contextBelongsToEffectiveStage({
                contextStageKey: "lead",
                participantEffectiveStageKeys: ["waitlist", "waitlist"],
                stageKey: "lead",
            }),
        ).toBe(false);
    });

    it("D: shared Tour inheritance", () => {
        const kids = [
            participant({
                id: "pi-1",
                subjectId: "cm-1",
                contextId: "opp",
                participantStage: null,
                contextStage: "tour",
            }),
            participant({
                id: "pi-2",
                subjectId: "cm-2",
                contextId: "opp",
                participantStage: null,
                contextStage: "tour",
            }),
        ];
        const pos = deriveEffectiveProcessPosition({
            contextId: "opp",
            contextStageKey: "tour",
            participants: kids,
            contract: ENROLLMENT_PARTICIPATION_CONTRACT,
            locationOf,
        });
        expect(pos.stageRollup.compactLabel).toBe("tour");
        expect(effectiveProcessPositionBelongsToStage(pos, "tour")).toBe(true);
    });

    it("E: Waitlist + Tour after shared advance — do not overwrite explicit Waitlist", () => {
        const kids = [
            participant({
                id: "pi-1",
                subjectId: "cm-1",
                contextId: "opp",
                participantStage: "waitlist",
                contextStage: "tour",
            }),
            participant({
                id: "pi-2",
                subjectId: "cm-2",
                contextId: "opp",
                participantStage: null,
                contextStage: "tour",
            }),
        ];
        const pos = deriveEffectiveProcessPosition({
            contextId: "opp",
            contextStageKey: "tour",
            participants: kids,
            contract: ENROLLMENT_PARTICIPATION_CONTRACT,
            locationOf,
        });
        expect(pos.participants.find((p) => p.subjectId === "cm-1")?.effectiveStageKey).toBe("waitlist");
        expect(pos.participants.find((p) => p.subjectId === "cm-2")?.effectiveStageKey).toBe("tour");
        expect(pos.stageRollup.compactLabel).toBe("waitlist · tour");
        expect(effectiveProcessPositionBelongsToStage(pos, "tour")).toBe(true);
        expect(effectiveProcessPositionBelongsToStage(pos, "waitlist")).toBe(true);
        expect(effectiveProcessPositionBelongsToStage(pos, "lead")).toBe(false);
    });

    it("no participants → context stage alone", () => {
        const pos = deriveEffectiveProcessPosition({
            contextId: "opp",
            contextStageKey: "lead",
            participants: [],
            contract: ENROLLMENT_PARTICIPATION_CONTRACT,
        });
        expect(pos.stageRollup.compactLabel).toBeNull();
        expect(effectiveProcessPositionBelongsToStage(pos, "lead")).toBe(true);
    });
});

describe("Effective Process Position — multi-location", () => {
    it("same stage / mixed locations", () => {
        const kids = [
            participant({
                id: "pi-1",
                subjectId: "cm-1",
                contextId: "opp",
                participantStage: "waitlist",
                contextStage: "lead",
                locationId: "north",
            }),
            participant({
                id: "pi-2",
                subjectId: "cm-2",
                contextId: "opp",
                participantStage: "waitlist",
                contextStage: "lead",
                locationId: "south",
            }),
        ];
        const pos = deriveEffectiveProcessPosition({
            contextId: "opp",
            contextStageKey: "lead",
            participants: kids,
            contract: ENROLLMENT_PARTICIPATION_CONTRACT,
            locationOf,
        });
        expect(pos.stageRollup.compactLabel).toBe("waitlist");
        expect(pos.locationRollup.compactLabel).toBe("2 locations");
        expect(pos.locationRollup.homogeneous).toBe(false);
    });

    it("access-filtered: North-only set does not leak South stage/location", () => {
        const all = [
            participant({
                id: "pi-1",
                subjectId: "cm-1",
                contextId: "opp",
                participantStage: "waitlist",
                contextStage: "lead",
                locationId: "north",
            }),
            participant({
                id: "pi-2",
                subjectId: "cm-2",
                contextId: "opp",
                participantStage: "tour",
                contextStage: "lead",
                locationId: "south",
            }),
        ];
        // Access filtering happens BEFORE rollup — only North remains.
        const authorized = all.filter((p) => p.attributes.locationId === "north");
        const pos = deriveEffectiveProcessPosition({
            contextId: "opp",
            contextStageKey: "lead",
            participants: authorized,
            contract: ENROLLMENT_PARTICIPATION_CONTRACT,
            locationOf,
        });
        expect(pos.stageRollup.compactLabel).toBe("waitlist");
        expect(pos.locationRollup.singleLocationId).toBe("north");
        expect(pos.stageRollup.stageKeys).not.toContain("tour");
        expect(pos.locationRollup.locationIds).not.toContain("south");
    });
});

describe("Effective Process Position — Assignment / Billing pressure (generic contract)", () => {
    const assignmentContract: ProcessParticipationContract = {
        processKey: "assignment",
        subjectType: "child",
        contextType: "family",
        inheritsContextStage: true,
    };

    it("Assignment: two need action + one assigned → mixed; child-grain needs-action has two", () => {
        const kids = [
            participant({
                id: "a1",
                subjectId: "c1",
                contextId: "fam",
                participantStage: "assigned",
                contextStage: "needs_assignment",
            }),
            participant({
                id: "a2",
                subjectId: "c2",
                contextId: "fam",
                participantStage: "needs_assignment",
                contextStage: "needs_assignment",
            }),
            participant({
                id: "a3",
                subjectId: "c3",
                contextId: "fam",
                participantStage: "needs_assignment",
                contextStage: "needs_assignment",
            }),
        ];
        const pos = deriveEffectiveProcessPosition({
            contextId: "fam",
            contextStageKey: "needs_assignment",
            participants: kids,
            contract: assignmentContract,
        });
        expect(pos.stageRollup.countsByStage.find((c) => c.stageKey === "needs_assignment")?.count).toBe(2);
        expect(effectiveProcessPositionBelongsToStage(pos, "needs_assignment")).toBe(true);
        expect(effectiveProcessPositionBelongsToStage(pos, "assigned")).toBe(true);
    });

    it("Billing: paid + past_due → mixed household rollup", () => {
        const billingContract: ProcessParticipationContract = {
            processKey: "billing",
            subjectType: "obligation",
            contextType: "household",
            inheritsContextStage: false,
        };
        const obligations = [
            buildProcessParticipant(
                {
                    id: "o1",
                    org_id: "org",
                    process_key: "billing",
                    subject_type: "obligation",
                    subject_id: "child-a",
                    context_id: "hh",
                    stage_key: "paid",
                },
                { contextStageKey: null, scopeId: null, attributes: {} },
            ),
            buildProcessParticipant(
                {
                    id: "o2",
                    org_id: "org",
                    process_key: "billing",
                    subject_type: "obligation",
                    subject_id: "child-b",
                    context_id: "hh",
                    stage_key: "past_due",
                },
                { contextStageKey: null, scopeId: null, attributes: {} },
            ),
        ];
        const pos = deriveEffectiveProcessPosition({
            contextId: "hh",
            contextStageKey: null,
            participants: obligations,
            contract: billingContract,
        });
        expect(composeStageRollup(pos.participants.map((p) => p.effectiveStageKey)).compactLabel).toBe(
            "paid · past_due",
        );
        expect(effectiveProcessPositionBelongsToStage(pos, "past_due")).toBe(true);
    });
});
