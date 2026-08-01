/**
 * Graph findings, scoped to the stage being edited.
 *
 * The counter previously missed execution-graph defects entirely, so a stage saved clean and was
 * refused at publish. The obvious fix — count every process finding on every stage — trades that
 * for a worse failure: each stage card reports its neighbours' problems and the number becomes
 * noise. These tests pin the middle: the stage sees what it can repair, and nothing else.
 */

import { describe, expect, it } from "vitest";

import {
    executionGraphFindingKey,
    findingBelongsToStage,
    stageExecutionGraphFindings,
} from "@/lib/lifecycle/stageExecutionGraphFindings";

const leadToTour = {
    transition_ref: "lead_to_tour",
    source_stage_key: "lead",
    target_stage_key: "tour",
    label: "Lead → Tour",
    available: true,
};

function process(over?: { leadTransitions?: unknown[]; leadRuleRef?: string; tourRuleRef?: string }) {
    return {
        id: "p1",
        key: "enrollment",
        name: "Enrollment",
        is_active: true,
        stages: [
            {
                id: "s-lead",
                key: "lead",
                label: "Lead",
                is_active: true,
                stage_operating_plan_v1: {
                    version: 1,
                    lifecycle_key: "enrollment",
                    stage_key: "lead",
                    journey_segment: "family",
                    outgoing_transitions: over?.leadTransitions ?? [leadToTour],
                    outcomes: [{ outcome_key: "reached", label: "Reached Family" }],
                    outcome_rules: [
                        {
                            rule_key: "reached_move",
                            when_outcome_key: "reached",
                            targets: [
                                { kind: "move_to_stage", transition_ref: over?.leadRuleRef ?? "lead_to_tour" },
                            ],
                        },
                    ],
                },
            },
            {
                id: "s-tour",
                key: "tour",
                label: "Tour",
                is_active: true,
                stage_operating_plan_v1: {
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
                            targets: [
                                { kind: "move_to_stage", transition_ref: over?.tourRuleRef ?? "tour_to_decision" },
                            ],
                        },
                    ],
                },
            },
        ],
    };
}

describe("finding identity", () => {
    it("is structural, so rewording a finding does not create a new one", () => {
        const a = { code: "movement_transition_not_found", message: "Old wording.", path: "p", stage_key: "lead" };
        const b = { code: "movement_transition_not_found", message: "New wording.", path: "p", stage_key: "lead" };
        expect(executionGraphFindingKey(a)).toBe(executionGraphFindingKey(b));
    });

    it("separates the same defect on two different objects", () => {
        expect(
            executionGraphFindingKey({ code: "x", message: "m", path: "a", stage_key: "lead" }),
        ).not.toBe(executionGraphFindingKey({ code: "x", message: "m", path: "b", stage_key: "lead" }));
    });
});

describe("scoping", () => {
    it("claims a finding that names the stage", () => {
        expect(findingBelongsToStage({ code: "c", message: "m", stage_key: "lead" }, "lead", new Set())).toBe(true);
    });

    it("claims a finding about a transition declared on the stage, wherever it was attributed", () => {
        const finding = { code: "c", message: "m", detail: { transition_ref: "lead_to_tour" } };
        expect(findingBelongsToStage(finding, "lead", new Set(["lead_to_tour"]))).toBe(true);
    });

    it("does NOT claim another stage's finding", () => {
        expect(findingBelongsToStage({ code: "c", message: "m", stage_key: "tour" }, "lead", new Set())).toBe(false);
    });

    it("falls back to the configuration path when the finding carries no stage_key", () => {
        const finding = { code: "c", message: "m", path: "processes[enrollment].stages[lead].outcome_rules[0]" };
        expect(findingBelongsToStage(finding, "lead", new Set())).toBe(true);
    });
});

describe("what a stage actually sees", () => {
    it("reports nothing when the graph is healthy", () => {
        expect(stageExecutionGraphFindings(process(), "lead")).toEqual([]);
    });

    it("reports the stage's OWN broken movement", () => {
        const findings = stageExecutionGraphFindings(process({ leadRuleRef: "lead_to_nowhere" }), "lead");
        expect(findings.length).toBeGreaterThan(0);
        expect(findings[0]!.severity).toBe("error");
        expect(findings[0]!.controlId).toContain("execution-graph::");
    });

    it("does NOT report another stage's broken movement — that repair happens over there", () => {
        // Tour's rule is broken; Lead is fine. Editing Lead must not surface Tour's problem.
        const broken = process({ tourRuleRef: "tour_to_nowhere" });
        expect(stageExecutionGraphFindings(broken, "lead")).toEqual([]);
        expect(stageExecutionGraphFindings(broken, "tour").length).toBeGreaterThan(0);
    });

    it("keeps a graph warning a warning", () => {
        // A legacy bare stage_key move warns rather than blocking; severity must survive scoping,
        // because what makes something blocking is the delta, not the finding.
        const legacy = process();
        legacy.stages[0]!.stage_operating_plan_v1.outcome_rules = [
            {
                rule_key: "legacy",
                when_outcome_key: "reached",
                targets: [{ kind: "move_to_stage", stage_key: "tour" }],
            },
        ] as never;
        const findings = stageExecutionGraphFindings(legacy, "lead");
        expect(findings.every((f) => f.severity === "warning")).toBe(true);
    });
});
