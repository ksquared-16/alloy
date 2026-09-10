/**
 * THE DRIFT THAT SHOULD HAVE BEEN IMPOSSIBLE TO PUBLISH.
 *
 * The tenant's Enrollment process routed `enrollment_start` — one child beginning paperwork — into
 * a stage whose operating plan declared `journey_segment: "family"`, while the child's completion
 * outcome sat on a second, separately-named stage nothing led to.
 *
 * Nothing refused it. Every part was internally valid: the entry stage existed and was active
 * (D-103 passed), the completion rule was well-formed, its targets resolved. Only the JOIN between
 * them was wrong, and no validator looked at the join. So the defect surfaced as an operator
 * pressing Complete Enrollment, being told it worked, and nothing changing — the worst way for a
 * configuration error to present itself.
 *
 * Two invariants close it, and both are expressed from grain and configured movement rather than
 * from stage names, because the stage names are the tenant's to choose:
 *
 *   entry grain     a subject may not START in a stage whose grain cannot own it
 *   reachability    a child's completion may not live where no child can arrive
 */

import { describe, expect, it } from "vitest";

import {
    PUBLISH_CHILD_COMPLETION_UNREACHABLE,
    PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH,
    validateBusinessProcessForPublish,
} from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import {
    buildEnrollmentTemplateStageRecords,
    ENROLLMENT_DEFAULT_TRACKS,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";

type StageSpec = {
    key: string;
    grain: "family" | "child";
    journey_segment?: "family" | "child";
    exits?: { ref: string; to: string }[];
    rules?: { when: string; targets: Record<string, unknown>[] }[];
};

/** The smallest payload the publish validator will read. Stage names are arbitrary on purpose. */
function payload(stages: StageSpec[], byIntent: Record<string, string>) {
    return {
        version: 1,
        active_process_id: "p1",
        processes: [
            {
                id: "p1",
                key: "enrollment",
                name: "Enrollment",
                is_active: true,
                sort_order: 0,
                primary_entity: "opportunity",
                entry_points_v1: { version: 1, by_intent: byIntent },
                stages: stages.map((s, i) => ({
                    id: `s${i}`,
                    key: s.key,
                    label: s.key,
                    is_active: true,
                    sort_order: i,
                    grain: s.grain,
                    stage_operating_plan_v1: {
                        version: 1,
                        lifecycle_key: "enrollment",
                        stage_key: s.key,
                        journey_segment: s.journey_segment ?? s.grain,
                        purpose: s.key,
                        work_templates: [],
                        outcomes: (s.rules ?? []).map((r) => ({ outcome_key: r.when, label: r.when })),
                        outcome_rules: (s.rules ?? []).map((r) => ({
                            rule_key: `${s.key}_${r.when}`,
                            when_outcome_key: r.when,
                            targets: r.targets,
                        })),
                        attention_rules: [],
                        outgoing_transitions: (s.exits ?? []).map((e) => ({
                            transition_ref: e.ref,
                            source_stage_key: s.key,
                            target_stage_key: e.to,
                            label: e.ref,
                            available: true,
                        })),
                    },
                })),
            },
        ],
    };
}

const ENROLLED = { kind: "update_child_enrollment_status", disposition_key: "enrolled" };

/** The corrected shape: child entry, child completion, one reachable track. */
function correctedProcess() {
    return payload(
        [
            { key: "front_door", grain: "family" },
            {
                key: "in_progress",
                grain: "child",
                exits: [{ ref: "to_done", to: "done" }],
                rules: [{ when: "finished", targets: [ENROLLED, { kind: "move_to_stage", transition_ref: "to_done" }] }],
            },
            { key: "done", grain: "child" },
        ],
        { create_lead: "front_door", enrollment_start: "in_progress" },
    );
}

function codes(result: { errors: { code: string }[] }) {
    return result.errors.map((e) => e.code);
}

describe("a subject may not start in a stage that cannot own it", () => {
    it("REFUSES the exact drift: child entry into a family-grain stage", () => {
        /*
         * This is the tenant's configuration reduced to its essentials — a stage the metadata calls
         * child and the operating plan calls family, named as the child's entry point. Note that
         * `resolveStageGrain` refuses this even before the entry check reads it, because the two
         * configured declarations contradict each other.
         */
        const result = validateBusinessProcessForPublish(
            payload(
                [
                    { key: "front_door", grain: "family" },
                    { key: "in_progress", grain: "child", journey_segment: "family" },
                ],
                { enrollment_start: "in_progress" },
            ),
        );
        expect(codes(result)).toContain(PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH);
    });

    it("REFUSES a coherently family-grain stage used as the child entry", () => {
        const result = validateBusinessProcessForPublish(
            payload([{ key: "front_door", grain: "family" }], { enrollment_start: "front_door" }),
        );
        const issue = result.errors.find((e) => e.code === PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH);
        expect(issue).toBeDefined();
        // The operator is told which track the stage belongs to, not a code.
        expect(issue?.message).toContain("family");
        expect(issue?.detail).toMatchObject({ entry_subject_grain: "child" });
    });

    it("REFUSES a family initiation pointed at a child stage — the mirror case", () => {
        const result = validateBusinessProcessForPublish(
            payload([{ key: "in_progress", grain: "child" }], { create_lead: "in_progress" }),
        );
        expect(codes(result)).toContain(PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH);
    });

    it("REFUSES an entry stage that declares no grain at all, rather than assuming one", () => {
        const raw = payload([{ key: "in_progress", grain: "child" }], { enrollment_start: "in_progress" });
        const stage = raw.processes[0]!.stages[0]! as Record<string, unknown>;
        delete stage.grain;
        delete (stage.stage_operating_plan_v1 as Record<string, unknown>).journey_segment;
        expect(codes(validateBusinessProcessForPublish(raw))).toContain(PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH);
    });

    it("ACCEPTS each intent pointed at its own grain", () => {
        expect(codes(validateBusinessProcessForPublish(correctedProcess()))).not.toContain(
            PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH,
        );
    });

    it("does not fire on a stage the process does not have — that has its own diagnosis", () => {
        /*
         * A dangling entry point is already PUBLISH_ENTRY_STAGE_UNRESOLVABLE. Reporting a grain
         * mismatch for it too would make one defect arrive twice under two names.
         */
        const result = validateBusinessProcessForPublish(
            payload([{ key: "front_door", grain: "family" }], { enrollment_start: "nowhere" }),
        );
        expect(codes(result)).not.toContain(PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH);
        expect(codes(result)).toContain("process_entry_stage_unresolvable");
    });
});

describe("a child's completion must be somewhere a child can arrive", () => {
    it("REFUSES completion stranded on a stage no movement reaches", () => {
        /*
         * The tenant's second defect, exactly: the completion effect existed, was well-formed, and
         * sat on a stage nothing led to. `Complete Enrollment` then matched no rule and reported
         * success having written nothing.
         */
        const result = validateBusinessProcessForPublish(
            payload(
                [
                    { key: "in_progress", grain: "child" },
                    { key: "orphan", grain: "child", rules: [{ when: "finished", targets: [ENROLLED] }] },
                ],
                { enrollment_start: "in_progress" },
            ),
        );
        expect(codes(result)).toContain(PUBLISH_CHILD_COMPLETION_UNREACHABLE);
    });

    it("ACCEPTS completion on the entry stage itself", () => {
        expect(codes(validateBusinessProcessForPublish(correctedProcess()))).not.toContain(
            PUBLISH_CHILD_COMPLETION_UNREACHABLE,
        );
    });

    it("ACCEPTS completion one configured move downstream", () => {
        const result = validateBusinessProcessForPublish(
            payload(
                [
                    { key: "in_progress", grain: "child", exits: [{ ref: "on", to: "later" }],
                      rules: [{ when: "advance", targets: [{ kind: "move_to_stage", transition_ref: "on" }] }] },
                    { key: "later", grain: "child", rules: [{ when: "finished", targets: [ENROLLED] }] },
                ],
                { enrollment_start: "in_progress" },
            ),
        );
        expect(codes(result)).not.toContain(PUBLISH_CHILD_COMPLETION_UNREACHABLE);
    });

    it("follows a bare stage_key move, not only a transition_ref", () => {
        /*
         * The waitlist rule in this tenant moves with a bare `stage_key`. A walk that followed only
         * declared transitions would call a perfectly reachable completion stranded.
         */
        const result = validateBusinessProcessForPublish(
            payload(
                [
                    { key: "in_progress", grain: "child",
                      rules: [{ when: "advance", targets: [{ kind: "move_to_stage", stage_key: "later" }] }] },
                    { key: "later", grain: "child", rules: [{ when: "finished", targets: [ENROLLED] }] },
                ],
                { enrollment_start: "in_progress" },
            ),
        );
        expect(codes(result)).not.toContain(PUBLISH_CHILD_COMPLETION_UNREACHABLE);
    });

    it("stays silent for a process that never enrolls a child", () => {
        // No completion effect configured anywhere: nothing to strand, so nothing to report.
        const result = validateBusinessProcessForPublish(
            payload([{ key: "in_progress", grain: "child" }], { enrollment_start: "in_progress" }),
        );
        expect(codes(result)).not.toContain(PUBLISH_CHILD_COMPLETION_UNREACHABLE);
    });

    it("stays silent when the tenant declares no child entry at all", () => {
        const result = validateBusinessProcessForPublish(
            payload(
                [
                    { key: "front_door", grain: "family" },
                    { key: "orphan", grain: "child", rules: [{ when: "finished", targets: [ENROLLED] }] },
                ],
                { create_lead: "front_door" },
            ),
        );
        expect(codes(result)).not.toContain(PUBLISH_CHILD_COMPLETION_UNREACHABLE);
    });
});

describe("the SHIPPED Enrollment template satisfies both invariants", () => {
    /*
     * The guards above prove the rule. This proves the product obeys it — and it is the assertion
     * that would have failed before this correction, for three separate reasons at once:
     *
     *   the template's stage metadata called `enrolling` child, its operating plan called it family
     *     -> grain_contradiction, so the child entry stage had no resolvable grain
     *   the completion outcome lived on a stage named `enrollment`
     *     -> which the template's stage list has never contained
     *   the waitlist rule moved children to that same absent stage
     *     -> a dangling reference nothing downstream could follow
     */
    function templatePayload(byIntent: Record<string, string>) {
        return {
            version: 1,
            active_process_id: "p1",
            processes: [
                {
                    id: "p1",
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    sort_order: 0,
                    primary_entity: "opportunity",
                    entry_points_v1: { version: 1, by_intent: byIntent },
                    tracks_v1: structuredClone(ENROLLMENT_DEFAULT_TRACKS),
                    stages: buildEnrollmentTemplateStageRecords(),
                },
            ],
        };
    }

    it("declares ONE stage per grain-track position, and no orphan `enrollment` stage", () => {
        const keys = buildEnrollmentTemplateStageRecords().map((s) => s.key);
        expect(keys).toEqual(["lead", "tour", "decision", "closed", "waitlist", "enrolling", "enrolled", "closed_withdrawn"]);
        expect(keys).not.toContain("enrollment");
    });

    it("the child Enrollment stage agrees with itself about its grain", () => {
        /*
         * The precise contradiction that hid the defect: `resolveStageGrain` ranks the operating
         * plan above stage metadata, so the plan's `family` won and the metadata's `child` — which
         * was right — never got a hearing.
         */
        const enrolling = buildEnrollmentTemplateStageRecords().find((s) => s.key === "enrolling");
        expect(enrolling?.grain).toBe("child");
        expect(enrolling?.stage_operating_plan_v1?.journey_segment).toBe("child");
    });

    it("publishes clean with the canonical entry intents", () => {
        const result = validateBusinessProcessForPublish(
            templatePayload({ create_lead: "lead", enrollment_start: "enrolling" }),
        );
        expect(codes(result)).not.toContain(PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH);
        expect(codes(result)).not.toContain(PUBLISH_CHILD_COMPLETION_UNREACHABLE);
    });

    it("REFUSES the drift if anyone re-declares the child stage family-grain", () => {
        // The regression this exists to stop, exercised against the real template rather than a toy.
        const raw = templatePayload({ create_lead: "lead", enrollment_start: "enrolling" });
        const enrolling = raw.processes[0]!.stages.find((s) => s.key === "enrolling")!;
        (enrolling.stage_operating_plan_v1 as { journey_segment: string }).journey_segment = "family";
        expect(codes(validateBusinessProcessForPublish(raw))).toContain(PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH);
    });

    it("REFUSES the drift if completion is moved back off the child's reachable track", () => {
        const raw = templatePayload({ create_lead: "lead", enrollment_start: "enrolling" });
        const enrolling = raw.processes[0]!.stages.find((s) => s.key === "enrolling")!;
        const plan = enrolling.stage_operating_plan_v1 as {
            outcome_rules: { targets: Record<string, unknown>[] }[];
        };
        // Strand the completion effect on the terminal stage, reachable from nowhere the child starts.
        const enrolled = raw.processes[0]!.stages.find((s) => s.key === "closed_withdrawn")!;
        const completion = plan.outcome_rules.flatMap((r) => r.targets).filter(
            (t) => t.kind === "update_child_enrollment_status" && t.disposition_key === "enrolled",
        );
        expect(completion.length).toBeGreaterThan(0);
        plan.outcome_rules = plan.outcome_rules.filter(
            (r) => !r.targets.some((t) => t.kind === "update_child_enrollment_status" && t.disposition_key === "enrolled"),
        );
        // Remove every exit from the entry stage so nothing downstream is reachable.
        (enrolling.stage_operating_plan_v1 as { outgoing_transitions: unknown[] }).outgoing_transitions = [];
        (enrolled.stage_operating_plan_v1 as { outcome_rules: unknown[] }).outcome_rules = [
            { rule_key: "strand", when_outcome_key: "acknowledged", targets: completion },
        ];
        expect(codes(validateBusinessProcessForPublish(raw))).toContain(PUBLISH_CHILD_COMPLETION_UNREACHABLE);
    });
});
