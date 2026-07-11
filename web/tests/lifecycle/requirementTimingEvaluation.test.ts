import { describe, expect, it } from "vitest";
import { buildCompletionContextFromRecord } from "@/lib/completion/evaluateCompletionRequirements";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";
import { lifecyclePreflightStagesForAction } from "@/lib/lifecycle/lifecycleFieldRuleEvaluator";
import {
    resolveCreateLeadActionIntakeSpec,
    validateActionIntakePayload,
} from "@/lib/lifecycle/resolveActionIntakeSpec";
import { buildRuleMetaV1 } from "@/lib/lifecycle/requirementTimingMeta";
import {
    evaluateRequirementsForTransition,
    selectRequirementRulesForMoment,
    selectRulesForRecordCreation,
    selectRulesForStageProgressReadiness,
    transitionMatchesRuleMeta,
} from "@/lib/lifecycle/requirementTimingEvaluation";
import type { LifecycleStageFieldRulesStored } from "@/lib/lifecycle/lifecycleStageRequirementLevels";

function leadStored(input: {
    required?: string[];
    recommended?: string[];
    meta?: LifecycleStageFieldRulesStored["rule_meta_v1"];
}): LifecycleStageFieldRulesStored {
    return {
        required_rule_ids: input.required ?? [],
        recommended_rule_ids: input.recommended ?? [],
        ...(input.meta ? { rule_meta_v1: input.meta } : {}),
    };
}

function oppCtx(overrides?: Partial<CompletionEvaluationContext>): CompletionEvaluationContext {
    return {
        phase: "status_change",
        entity_type: "opportunity",
        entity_id: "opp-1",
        values: { primary_person_id: "p1", status_key: "new_inquiry" },
        related: {
            primary_person: {
                first_name: "Jordan",
                last_name: "Johnson",
                email: "jordan@example.com",
                phone: null,
            },
            inquiry_children: [],
            ...overrides?.related,
        },
        ...overrides,
    };
}

describe("requirement timing selection", () => {
    it("legacy rules without timing appear for stage progress but not transitions", () => {
        const rules = leadStored({
            required: ["child:program_interest"],
            meta: buildRuleMetaV1({}),
        });
        const progress = selectRequirementRulesForMoment({
            rules,
            ruleMeta: rules.rule_meta_v1 ?? null,
            moment: { kind: "stage_progress", stageKey: "lead" },
        });
        expect(progress.map((r) => r.ruleId)).toContain("child:program_interest");

        const transition = selectRequirementRulesForMoment({
            rules,
            ruleMeta: rules.rule_meta_v1 ?? null,
            moment: {
                kind: "transition",
                fromStageKey: "lead",
                toStageKey: "tour_scheduled",
                transitionKey: "tour_scheduled",
            },
        });
        expect(transition).toHaveLength(0);
    });

    it("explicit stage_exit rules participate in transition evaluation only when configured", () => {
        const rules = leadStored({
            required: ["child:program_interest", "child:desired_schedule"],
            meta: buildRuleMetaV1({
                "child:program_interest": {
                    timing: "stage_exit",
                    applies_to_transition_keys: ["tour_scheduled"],
                },
                "child:desired_schedule": {
                    timing: "stage_exit",
                    excluded_transition_keys: ["closed_lost"],
                },
            }),
        });

        expect(
            transitionMatchesRuleMeta(rules.rule_meta_v1!.by_rule_id["child:program_interest"], {
                kind: "transition",
                fromStageKey: "lead",
                toStageKey: "tour_scheduled",
                transitionKey: "tour_scheduled",
            }),
        ).toBe(true);

        expect(
            transitionMatchesRuleMeta(rules.rule_meta_v1!.by_rule_id["child:desired_schedule"], {
                kind: "transition",
                fromStageKey: "lead",
                toStageKey: "closed_lost",
                transitionKey: "closed_lost",
            }),
        ).toBe(false);

        expect(
            transitionMatchesRuleMeta(rules.rule_meta_v1!.by_rule_id["child:desired_schedule"], {
                kind: "transition",
                fromStageKey: "lead",
                toStageKey: "waitlisted",
                transitionKey: "waitlisted",
            }),
        ).toBe(true);
    });

    it("record_creation rules are explicit only", () => {
        const rules = leadStored({
            required: ["child:program_interest"],
            meta: buildRuleMetaV1({
                "child:program_interest": { timing: "record_creation" },
            }),
        });
        const selected = selectRulesForRecordCreation(rules, rules.rule_meta_v1 ?? null);
        expect(selected.map((r) => r.ruleId)).toEqual(["child:program_interest"]);
    });
});

describe("Create Lead intake timing", () => {
    const departmentMetadata = {
        lifecycle_builder_stage_field_rules_v1: {
            version: 1,
            by_stage_key: {
                lead: {
                    required_rule_ids: ["child:program_interest", "child:desired_schedule", "person:first_name"],
                    recommended_rule_ids: [],
                    rule_meta_v1: {
                        version: 1,
                        by_rule_id: {
                            "child:program_interest": { timing: "stage_exit" },
                            "child:desired_schedule": { timing: "stage_exit" },
                        },
                    },
                },
            },
        },
    };

    it("succeeds without child information when child rules are stage-exit only", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            builder_stage_key: "lead",
            department_metadata: departmentMetadata,
        });
        const result = validateActionIntakePayload(spec, {
            first_name: "Jordan",
            last_name: "Johnson",
            email: "jordan@example.com",
        });
        expect(result.ok).toBe(true);
        expect(spec.required.some((f) => f.rule_id.startsWith("child:"))).toBe(false);
    });

    it("fails when an explicit record_creation requirement is missing", () => {
        const metadata = {
            lifecycle_builder_stage_field_rules_v1: {
                version: 1,
                by_stage_key: {
                    lead: {
                        required_rule_ids: ["opportunity:location"],
                        recommended_rule_ids: [],
                        rule_meta_v1: {
                            version: 1,
                            by_rule_id: {
                                "opportunity:location": { timing: "record_creation" },
                            },
                        },
                    },
                },
            },
        };
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            builder_stage_key: "lead",
            department_metadata: metadata,
        });
        const result = validateActionIntakePayload(spec, {
            first_name: "Jordan",
            last_name: "Johnson",
            email: "jordan@example.com",
        });
        expect(result.ok).toBe(false);
    });

    it("preserves legacy child downgrade when timing is absent", () => {
        const metadata = {
            lifecycle_progression_requirements_v1: {
                version: 1,
                stages: {
                    lead: {
                        field_rules: {
                            required_rule_ids: ["child:program_interest"],
                            recommended_rule_ids: [],
                        },
                    },
                },
            },
        };
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            department_metadata: metadata,
        });
        expect(spec.required.some((f) => f.rule_id === "child:program_interest")).toBe(false);
        expect(spec.recommended.some((f) => f.rule_id === "child:program_interest")).toBe(true);
    });
});

describe("evaluateRequirementsForTransition", () => {
    it("blocks Lead → Tour Scheduled when configured exit requirements are missing", () => {
        const rules = leadStored({
            required: ["child:program_interest"],
            meta: buildRuleMetaV1({
                "child:program_interest": {
                    timing: "stage_exit",
                    applies_to_transition_keys: ["tour_scheduled"],
                },
            }),
        });

        const evaluation = evaluateRequirementsForTransition({
            ctx: oppCtx(),
            operatorStage: "lead",
            publishedRules: rules,
            ruleMeta: rules.rule_meta_v1 ?? null,
            fromStageKey: "lead",
            toStageKey: "tour_scheduled",
            transitionKey: "tour_scheduled",
            toStageLabel: "Tour Scheduled",
        });

        expect(evaluation.satisfied).toBe(false);
        expect(evaluation.blocking.length).toBeGreaterThan(0);
        expect(evaluation.missing[0]?.progressionHint).toContain("Tour Scheduled");
    });

    it("does not block Lead → Closed Lost when requirement excludes that transition", () => {
        const rules = leadStored({
            required: ["child:program_interest"],
            meta: buildRuleMetaV1({
                "child:program_interest": {
                    timing: "stage_exit",
                    excluded_transition_keys: ["closed_lost"],
                },
            }),
        });

        const evaluation = evaluateRequirementsForTransition({
            ctx: oppCtx(),
            operatorStage: "lead",
            publishedRules: rules,
            ruleMeta: rules.rule_meta_v1 ?? null,
            fromStageKey: "lead",
            toStageKey: "closed_lost",
            transitionKey: "closed_lost",
        });

        expect(evaluation.satisfied).toBe(true);
        expect(evaluation.blocking).toHaveLength(0);
    });

    it("Lead → Waitlist evaluates only its configured requirement subset", () => {
        const rules = leadStored({
            required: ["child:program_interest", "child:desired_schedule"],
            meta: buildRuleMetaV1({
                "child:program_interest": {
                    timing: "stage_exit",
                    applies_to_transition_keys: ["tour_scheduled"],
                },
                "child:desired_schedule": {
                    timing: "stage_exit",
                    applies_to_transition_keys: ["waitlisted"],
                },
            }),
        });

        const waitlistEval = evaluateRequirementsForTransition({
            ctx: oppCtx(),
            operatorStage: "lead",
            publishedRules: rules,
            ruleMeta: rules.rule_meta_v1 ?? null,
            fromStageKey: "lead",
            toStageKey: "waitlisted",
            transitionKey: "waitlisted",
        });
        expect(waitlistEval.blocking.some((m) => m.key === "child:desired_schedule")).toBe(true);
        expect(waitlistEval.blocking.some((m) => m.key === "child:program_interest")).toBe(false);
    });
});

describe("readiness projection rule selection", () => {
    it("includes stage_progress and stage_exit configured rules", () => {
        const rules = leadStored({
            required: ["person:email", "child:program_interest"],
            meta: buildRuleMetaV1({
                "child:program_interest": { timing: "stage_exit" },
            }),
        });
        const selected = selectRulesForStageProgressReadiness(rules, rules.rule_meta_v1 ?? null, "lead");
        expect(selected.map((r) => r.ruleId).sort()).toEqual(
            ["child:program_interest", "person:email"].sort(),
        );
    });
});

describe("qualification preflight cleanup", () => {
    it("schedule_tour preflight does not assume qualification stage exists", () => {
        const stages = lifecyclePreflightStagesForAction(
            buildCompletionContextFromRecord({
                entity_type: "opportunity",
                entity_id: "opp-1",
                phase: "action",
                record: { status_key: "new_inquiry" },
                status_from: "new_inquiry",
                action_key: "schedule_tour",
            }),
            "schedule_tour",
        );
        expect(stages).not.toContain("qualification");
        expect(stages).toContain("tour");
    });
});
