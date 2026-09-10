import { describe, expect, it } from "vitest";

import { filterQueueRowsByWorkViewFilters } from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import {
    attachEffectiveParticipantStagesToContextRows,
    EFFECTIVE_PARTICIPANT_STAGE_KEYS_FIELD,
} from "@/lib/process/engine/attachEffectiveParticipantStagesToContextRows";
import { contextBelongsToEffectiveStage } from "@/lib/process/engine/effectiveProcessPosition";
import { effectiveStage } from "@/lib/process/engine/processParticipant";

/**
 * ONE FAMILY, TWO CHILDREN, THREE STAGES AT ONCE.
 *
 * The invariant a mixed-grain Business Process rests on: stage membership belongs to the PROCESS
 * SUBJECT at that stage. A family-grain stage is answered by the opportunity's own stage; a
 * child-grain stage is answered by the child's process instance. The family stays where it is while
 * its children sit in different stages, and no view may require the family stage to be mutated to
 * make a child visible.
 *
 * This is written against the shipped evaluator rather than a description of it, because the
 * question "is this already handled?" is exactly the kind that reading cannot settle.
 */

const CONTEXT_ID = "opp-certopp";

/** The Registration and Waitlist views as this tenant actually stores them. */
const REGISTRATION = [{ field_key: "opportunity_stage", operator: "equals", value: "enrolling" }] as never;
const WAITLIST = [{ field_key: "opportunity_stage", operator: "equals", value: "waitlist" }] as never;
const LEAD = [{ field_key: "opportunity_stage", operator: "equals", value: "lead" }] as never;

/** The family row, sitting at `lead`, with two children at different stages beneath it. */
function familyRowWithChildren(childStages: readonly string[]) {
    const base: Record<string, unknown> = { id: CONTEXT_ID, stage_key: "lead", lifecycle_stage_key: "lead" };
    const [row] = attachEffectiveParticipantStagesToContextRows([base], new Map([[CONTEXT_ID, childStages]]));
    return row;
}

describe("a family at Lead with a child Enrolling and a child Waitlisted", () => {
    const row = familyRowWithChildren(["enrolling", "waitlist"]);

    it("carries both children's stages on the context row", () => {
        expect(row[EFFECTIVE_PARTICIPANT_STAGE_KEYS_FIELD]).toEqual(["enrolling", "waitlist"]);
    });

    it("appears in the Enrolling view because one child is enrolling", () => {
        expect(filterQueueRowsByWorkViewFilters([row], REGISTRATION)).toHaveLength(1);
    });

    it("appears in the Waitlist view because the other child is waitlisted", () => {
        expect(filterQueueRowsByWorkViewFilters([row], WAITLIST)).toHaveLength(1);
    });

    it("does NOT require the family stage to be mutated for either to be true", () => {
        // The family is still at `lead` throughout. Nothing above copied a child's stage upward.
        expect(row.stage_key).toBe("lead");
        expect(row.lifecycle_stage_key).toBe("lead");
    });

    it("drops out of the family-grain Lead view once its children have their own stages", () => {
        /*
         * The consequence worth stating rather than discovering: participant stages WIN. A context
         * whose children have taken their own positions is represented by those positions, so the
         * family stops answering to its own `lead` stage in stage-scoped views. That is the
         * documented rule in `contextBelongsToEffectiveStage`, not an accident here.
         */
        expect(filterQueueRowsByWorkViewFilters([row], LEAD)).toHaveLength(0);
    });
});

describe("a family whose children have no stage of their own", () => {
    const row = familyRowWithChildren([]);

    it("falls back to the family's own stage", () => {
        // This is Certopp today: Pathb has no participant stage, so the family answers as `lead`.
        expect(filterQueueRowsByWorkViewFilters([row], LEAD)).toHaveLength(1);
        expect(filterQueueRowsByWorkViewFilters([row], REGISTRATION)).toHaveLength(0);
    });
});

describe("the rule the evaluator applies", () => {
    it("prefers participant stages and only falls back when there are none", () => {
        expect(
            contextBelongsToEffectiveStage({
                contextStageKey: "lead",
                participantEffectiveStageKeys: ["enrolling"],
                stageKey: "enrolling",
            }),
        ).toBe(true);
        expect(
            contextBelongsToEffectiveStage({
                contextStageKey: "lead",
                participantEffectiveStageKeys: [],
                stageKey: "lead",
            }),
        ).toBe(true);
    });

    it("does not let household inheritance mask a child's own stage", () => {
        // `inheritsContextStage` applies only when the participant has no stage of its own, so a
        // child at `enrolling` under a family at `lead` reports `enrolling`.
        const participant = {
            participantId: "p1",
            subjectId: "child-a",
            contextId: CONTEXT_ID,
            participantStageKey: "enrolling",
            contextStageKey: "lead",
            processKey: "enrollment",
            subjectType: "child",
            closeReasonKey: null,
        } as never;
        expect(effectiveStage(participant, { inheritsContextStage: true } as never)).toBe("enrolling");
        const inheriting = { ...(participant as object), participantStageKey: null } as never;
        expect(effectiveStage(inheriting, { inheritsContextStage: true } as never)).toBe("lead");
    });
});
