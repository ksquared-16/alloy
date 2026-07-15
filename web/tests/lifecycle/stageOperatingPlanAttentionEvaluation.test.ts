import { describe, expect, it } from "vitest";
import {
    evaluateStageOperatingPlanAttention,
    type StageAttentionTaskSnapshot,
} from "@/lib/lifecycle/evaluateStageOperatingPlanAttention";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { projectStagePlanToAttentionReasons } from "@/lib/lifecycle/stageOperatingPlanAttentionProjection";
import { tryEvaluateStageAttentionForOpportunity } from "@/lib/lifecycle/stageAttentionForOpportunity";
import {
    createDefaultOpportunityAttentionResolvedConfig,
} from "@/lib/opportunities/opportunityAttentionConfig";
import {
    OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER,
    resolveOpportunityAttention,
} from "@/lib/opportunities/opportunityAttentionResolver";
import { DEFAULT_READINESS_ATTENTION_PROJECTION_PROFILE_V1 } from "@/lib/opportunities/readinessAttentionProjectionProfile";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-10T12:00:00.000Z");

function enrollmentDeptMetadata(): Record<string, unknown> {
    return {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "proc-enrollment",
            processes: [
                {
                    id: "proc-enrollment",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "stage-lead",
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                        },
                    ],
                },
            ],
        },
    };
}

function leadPlan(): StageOperatingPlanV1 {
    return defaultStageOperatingPlanForEnrollmentStage("lead")!;
}

function baseOpportunity(overrides?: Partial<Record<string, unknown>>) {
    return {
        id: "opp-1",
        status_key: "new_inquiry",
        created_at: new Date(NOW - 10 * MS_PER_DAY).toISOString(),
        updated_at: new Date(NOW - 8 * MS_PER_DAY).toISOString(),
        metadata: {},
        customer_id: "cust-1",
        primary_person_id: "person-1",
        ...overrides,
    };
}

describe("evaluateStageOperatingPlanAttention", () => {
    it("fires work_overdue when required work is past due threshold", () => {
        const plan = leadPlan();
        const tasks: StageAttentionTaskSnapshot[] = [
            {
                template_key: "contact_family",
                work_intent_key: "contact_family",
                due_at: new Date(NOW - 2 * MS_PER_DAY).toISOString(),
                status: "open",
                attempt_count: 0,
                lifecycle_stage_key: "lead",
            },
        ];

        const fired = evaluateStageOperatingPlanAttention({
            plan,
            builderStageKey: "lead",
            nowMs: NOW,
            stageEnteredMs: NOW - 5 * MS_PER_DAY,
            tasks,
        });

        expect(fired.some((r) => r.kind === "work_overdue" && r.rule_key === "first_contact_overdue")).toBe(true);
    });

    it("fires stage_age_exceeded when record exceeds threshold days in stage", () => {
        const plan = leadPlan();
        const fired = evaluateStageOperatingPlanAttention({
            plan,
            builderStageKey: "lead",
            nowMs: NOW,
            stageEnteredMs: NOW - 8 * MS_PER_DAY,
            tasks: [],
        });

        expect(fired.some((r) => r.kind === "stage_age_exceeded")).toBe(true);
    });

    it("fires missing_required_fields when readiness reports gaps", () => {
        const plan = leadPlan();
        const readiness = {
            contract_version: "1.0" as const,
            primary_state: "needs_information" as const,
            trigger: "record_view" as const,
            subject: { entity_type: "opportunity", entity_id: "opp-1" },
            context: { org_id: "org-1" },
            gaps: [
                {
                    requirement_id: "lead:location",
                    scope_type: "record" as const,
                    level: "enforced" as const,
                    label: "Location",
                    missing_reason: "Missing",
                    failure_kind: "missing" as const,
                    blocking: false,
                },
            ],
            counts: {
                gaps_total: 1,
                by_level: { recommended: 0, required: 1, enforced: 0 },
                blocking: 0,
                satisfied: 0,
                configured: 1,
            },
            ok: false,
        };

        const fired = evaluateStageOperatingPlanAttention({
            plan,
            builderStageKey: "lead",
            nowMs: NOW,
            stageEnteredMs: NOW - 2 * MS_PER_DAY,
            tasks: [],
            readiness,
            readinessProfile: DEFAULT_READINESS_ATTENTION_PROJECTION_PROFILE_V1,
        });

        expect(fired.some((r) => r.kind === "missing_required_fields")).toBe(true);
    });

    it("fires attempts_incomplete when window elapsed with fewer attempts than threshold", () => {
        const plan: StageOperatingPlanV1 = {
            ...leadPlan(),
            work_templates: leadPlan().work_templates.map((row) =>
                row.template_key === "contact_family"
                    ? {
                          ...row,
                          completion_policy: {
                              min_attempts: 3,
                              max_attempts: 3,
                              window_days: 7,
                              repeat_until_outcome: true,
                              repeat_due_days: 2,
                          },
                      }
                    : row,
            ),
            attention_rules: [
                ...leadPlan().attention_rules,
                {
                    rule_key: "contact_attempts_window",
                    kind: "no_contact_attempt",
                    label: "Contact Family fewer than 3 attempts after 7 days",
                    severity: "high",
                    threshold: 3,
                    template_key: "contact_family",
                    targets: [],
                },
            ],
        };
        const tasks: StageAttentionTaskSnapshot[] = [
            {
                template_key: "contact_family",
                work_intent_key: "make_contact",
                due_at: new Date(NOW + MS_PER_DAY).toISOString(),
                status: "open",
                attempt_count: 1,
                lifecycle_stage_key: "lead",
            },
        ];

        const fired = evaluateStageOperatingPlanAttention({
            plan,
            builderStageKey: "lead",
            nowMs: NOW,
            stageEnteredMs: NOW - 8 * MS_PER_DAY,
            tasks,
        });

        expect(fired.some((r) => r.kind === "attempts_incomplete" && r.rule_key === "contact_attempts_window")).toBe(
            true,
        );
    });
});

describe("resolveOpportunityAttention stage_plan merge", () => {
    it("includes canonical priority codes for stage attention", () => {
        expect(OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER.length).toBe(21);
        expect(OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER).toContain("stage_work_overdue");
    });

    it("merges stage attention additively with org-wide attention", () => {
        const stageProjected = projectStagePlanToAttentionReasons([
            {
                rule_key: "first_contact_overdue",
                kind: "work_overdue",
                label: "First contact overdue after 1 day",
                severity: "medium",
                provenance: "stage_operating_plan_v1:lead:first_contact_overdue",
            },
        ]);

        const resolved = resolveOpportunityAttention({
            opportunity: {
                ...baseOpportunity(),
                metadata: {
                    enrollment_operational: {
                        wait_bucket: "waiting_on_staff",
                        wait_since: new Date(NOW - 2 * MS_PER_DAY).toISOString(),
                    },
                },
            },
            nowMs: NOW,
            defs: [],
            config: createDefaultOpportunityAttentionResolvedConfig(),
            stageAttention: stageProjected,
        });

        expect(resolved.needs_attention).toBe(true);
        expect(resolved.reasons.some((r) => r.code === "waiting_on_staff")).toBe(true);
        expect(resolved.reasons.some((r) => r.code === "stage_work_overdue")).toBe(true);
        const stageReason = resolved.reasons.find((r) => r.code === "stage_work_overdue");
        expect(stageReason?.attention_source).toBe("stage_plan");
        expect(stageReason?.stage_attention_rule_key).toBe("first_contact_overdue");
        expect(stageReason?.stage_attention_provenance).toContain("stage_operating_plan_v1:lead:");
    });

    it("preserves legacy behavior when no stage plan / no attention rules", () => {
        const baseline = resolveOpportunityAttention({
            opportunity: baseOpportunity(),
            nowMs: NOW,
            defs: [],
        });

        const withEmptyStage = resolveOpportunityAttention({
            opportunity: baseOpportunity(),
            nowMs: NOW,
            defs: [],
            stageAttention: [],
        });

        expect(withEmptyStage).toEqual(baseline);
    });
});

describe("tryEvaluateStageAttentionForOpportunity", () => {
    it("evaluates default lead plan from department metadata", () => {
        const projected = tryEvaluateStageAttentionForOpportunity({
            opportunity: baseOpportunity(),
            departmentMetadata: enrollmentDeptMetadata(),
            tasks: [],
            nowMs: NOW,
        });

        expect(projected?.some((r) => r.code === "stage_age_exceeded")).toBe(true);
    });

    it("returns undefined without department metadata (legacy path)", () => {
        expect(
            tryEvaluateStageAttentionForOpportunity({
                opportunity: baseOpportunity(),
                nowMs: NOW,
            }),
        ).toBeUndefined();
    });
});
