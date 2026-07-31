/**
 * The execution graph — every link in the integrity unit.
 *
 *   stage -> outgoing transition -> destination stage -> outcome -> effect -> transition ref
 *
 * The shapes here are the ones that produced the Firefly failure while every stage target still
 * resolved, so the older stage-reference walker saw nothing wrong.
 */

import { describe, expect, it } from "vitest";

import {
    buildExecutionGraph,
    selectableTransitionsForStage,
    validateExecutionGraph,
    validateProcessExecutionGraph,
} from "@/lib/businessProcesses/configuration/executionGraphValidation";

type Stage = Record<string, unknown>;

function process(stages: Stage[]): Record<string, unknown> {
    return { id: "p1", key: "enrollment", name: "Enrollment", is_active: true, stages };
}

function stage(key: string, label: string, plan?: Record<string, unknown>): Stage {
    return { id: `s-${key}`, key, label, is_active: true, ...(plan ? { stage_operating_plan_v1: plan } : {}) };
}

const leadToTour = {
    transition_ref: "lead_to_tour",
    source_stage_key: "lead",
    target_stage_key: "tour",
    label: "Lead → Tour",
    available: true,
};

function leadPlan(over?: Record<string, unknown>) {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "lead",
        journey_segment: "family",
        outgoing_transitions: [leadToTour],
        outcomes: [{ outcome_key: "tour_scheduled", label: "Tour Scheduled" }],
        outcome_rules: [
            {
                rule_key: "tour_scheduled_move",
                when_outcome_key: "tour_scheduled",
                targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
            },
        ],
        ...over,
    };
}

const errorCodes = (p: Record<string, unknown>) =>
    validateProcessExecutionGraph(p).errors.map((e) => e.code);

describe("execution graph — the healthy case", () => {
    const healthy = process([stage("lead", "Lead", leadPlan()), stage("tour", "Tour")]);

    it("validates a stage → transition → outcome chain that resolves", () => {
        expect(validateProcessExecutionGraph(healthy).errors).toEqual([]);
    });

    it("reads the graph out of the raw process", () => {
        const graph = buildExecutionGraph(healthy);
        expect(graph.stage_keys).toEqual(["lead", "tour"]);
        expect(graph.transitions).toHaveLength(1);
        expect(graph.movements).toEqual([
            expect.objectContaining({
                stage_key: "lead",
                rule_key: "tour_scheduled_move",
                // The operator's word for the trigger, not `tour_scheduled`.
                trigger_label: "Tour Scheduled",
                transition_ref: "lead_to_tour",
            }),
        ]);
    });
});

describe("execution graph — transitions", () => {
    it("blocks a destination stage that does not exist", () => {
        const p = process([
            stage("lead", "Lead", leadPlan({ outgoing_transitions: [{ ...leadToTour, target_stage_key: "ghost" }] })),
            stage("tour", "Tour"),
        ]);
        const result = validateProcessExecutionGraph(p);
        expect(result.errors.map((e) => e.code)).toContain("transition_destination_unknown");
        expect(result.errors[0]!.message).toContain("Lead → Tour");
    });

    it("blocks a missing destination", () => {
        const p = process([
            stage("lead", "Lead", leadPlan({ outgoing_transitions: [{ ...leadToTour, target_stage_key: "" }] })),
            stage("tour", "Tour"),
        ]);
        expect(errorCodes(p)).toContain("transition_missing_destination");
    });

    it("blocks a missing source", () => {
        const p = process([
            stage("lead", "Lead", leadPlan({ outgoing_transitions: [{ ...leadToTour, source_stage_key: "" }] })),
            stage("tour", "Tour"),
        ]);
        expect(errorCodes(p)).toContain("transition_missing_source");
    });

    it("blocks a transition declared on a stage it does not leave from", () => {
        // The subtlest shape: the transition exists, but not where the runtime looks for it.
        const p = process([
            stage("lead", "Lead"),
            stage(
                "tour",
                "Tour",
                {
                    version: 1,
                    lifecycle_key: "enrollment",
                    stage_key: "tour",
                    journey_segment: "family",
                    outgoing_transitions: [leadToTour],
                },
            ),
        ]);
        const result = validateProcessExecutionGraph(p);
        expect(result.errors.map((e) => e.code)).toContain("transition_not_outgoing_from_source");
        expect(result.errors[0]!.message).toContain("Move it to");
    });

    it("blocks a duplicate transition identity", () => {
        const p = process([
            stage(
                "lead",
                "Lead",
                leadPlan({ outgoing_transitions: [leadToTour, { ...leadToTour, label: "Also Lead → Tour" }] }),
            ),
            stage("tour", "Tour"),
        ]);
        const result = validateProcessExecutionGraph(p);
        expect(result.errors.map((e) => e.code)).toContain("duplicate_transition_identity");
        expect(result.errors.find((e) => e.code === "duplicate_transition_identity")!.message).toContain(
            "Only the first would ever be used",
        );
    });

    it("blocks a self-transition", () => {
        const p = process([
            stage("lead", "Lead", leadPlan({ outgoing_transitions: [{ ...leadToTour, target_stage_key: "lead" }] })),
            stage("tour", "Tour"),
        ]);
        expect(errorCodes(p)).toContain("transition_self_loop");
    });
});

describe("execution graph — outcomes and automation", () => {
    it("blocks an outcome naming a transition that does not exist — THE Firefly shape", () => {
        const p = process([
            stage("lead", "Lead", leadPlan({ outgoing_transitions: [] })),
            stage("tour", "Tour"),
        ]);
        const result = validateProcessExecutionGraph(p);
        expect(result.errors.map((e) => e.code)).toEqual(["movement_transition_not_found"]);
        // Reads like a repair instruction, in the operator's vocabulary.
        expect(result.errors[0]!.message).toBe(
            '“Tour Scheduled” is set to move through “lead_to_tour”, but that transition does not ' +
                "exist. Create it on “Lead”, or choose a different behaviour.",
        );
    });

    it("blocks an outcome using a transition that leaves a DIFFERENT stage", () => {
        const p = process([
            stage("lead", "Lead", leadPlan({ outgoing_transitions: [leadToTour] })),
            stage("tour", "Tour", {
                version: 1,
                lifecycle_key: "enrollment",
                stage_key: "tour",
                journey_segment: "family",
                outgoing_transitions: [],
                outcomes: [{ outcome_key: "done", label: "Tour Completed" }],
                outcome_rules: [
                    {
                        rule_key: "done_move",
                        when_outcome_key: "done",
                        // Reaching for Lead's transition from Tour. It can never fire here.
                        targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
                    },
                ],
            }),
        ]);
        const result = validateProcessExecutionGraph(p);
        const foreign = result.errors.find((e) => e.code === "movement_transition_from_another_stage");
        expect(foreign).toBeTruthy();
        expect(foreign!.message).toContain("leaves from “Lead”");
        expect(foreign!.message).toContain("can only use a transition that leaves its own stage");
    });

    it("warns — does not block — a legacy bare stage_key move", () => {
        const p = process([
            stage(
                "lead",
                "Lead",
                leadPlan({
                    outgoing_transitions: [leadToTour],
                    outcome_rules: [
                        {
                            rule_key: "legacy",
                            when_outcome_key: "tour_scheduled",
                            targets: [{ kind: "move_to_stage", stage_key: "tour" }],
                        },
                    ],
                }),
            ),
            stage("tour", "Tour"),
        ]);
        const result = validateProcessExecutionGraph(p);
        expect(result.errors).toEqual([]);
        expect(result.warnings.map((w) => w.code)).toContain("movement_without_transition");
    });

    it("blocks a legacy bare stage_key move to a stage that does not exist", () => {
        const p = process([
            stage(
                "lead",
                "Lead",
                leadPlan({
                    outcome_rules: [
                        {
                            rule_key: "legacy",
                            when_outcome_key: "tour_scheduled",
                            targets: [{ kind: "move_to_stage", stage_key: "ghost" }],
                        },
                    ],
                }),
            ),
            stage("tour", "Tour"),
        ]);
        expect(errorCodes(p)).toContain("transition_destination_unknown");
    });
});

describe("selectable transitions — what the Move-through-transition control may offer", () => {
    const graph = buildExecutionGraph(
        process([
            stage("lead", "Lead", leadPlan()),
            stage("tour", "Tour", {
                version: 1,
                lifecycle_key: "enrollment",
                stage_key: "tour",
                journey_segment: "family",
                outgoing_transitions: [
                    {
                        transition_ref: "tour_to_decision",
                        source_stage_key: "tour",
                        target_stage_key: "decision",
                        label: "Tour → Decision",
                    },
                ],
            }),
            stage("decision", "Decision"),
        ]),
    );

    it("offers only transitions that leave the stage in question", () => {
        expect(selectableTransitionsForStage(graph, "lead").map((t) => t.transition_ref)).toEqual([
            "lead_to_tour",
        ]);
        expect(selectableTransitionsForStage(graph, "tour").map((t) => t.transition_ref)).toEqual([
            "tour_to_decision",
        ]);
        // Never every transition in the process — that is how an outcome ends up referencing one
        // that can never fire from where it lives.
        expect(selectableTransitionsForStage(graph, "decision")).toEqual([]);
    });

    it("omits a transition whose destination is missing", () => {
        const broken = buildExecutionGraph(
            process([
                stage("lead", "Lead", leadPlan({ outgoing_transitions: [{ ...leadToTour, target_stage_key: "ghost" }] })),
            ]),
        );
        expect(selectableTransitionsForStage(broken, "lead")).toEqual([]);
    });
});

describe("validateExecutionGraph is pure", () => {
    it("does not mutate the graph it is given", () => {
        const graph = buildExecutionGraph(process([stage("lead", "Lead", leadPlan()), stage("tour", "Tour")]));
        const before = JSON.stringify(graph);
        validateExecutionGraph(graph);
        validateExecutionGraph(graph);
        expect(JSON.stringify(graph)).toBe(before);
    });
});
