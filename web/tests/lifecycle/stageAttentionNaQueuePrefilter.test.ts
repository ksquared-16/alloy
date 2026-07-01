import { describe, expect, it } from "vitest";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import {
    evaluateStageOperatingPlanAttention,
    type StageAttentionTaskSnapshot,
} from "@/lib/lifecycle/evaluateStageOperatingPlanAttention";
import {
    buildStageAttentionStatusKeyOrBranches,
    resolveStageAttentionCandidateStatusKeys,
} from "@/lib/lifecycle/resolveStageAttentionCandidateStatusKeys";
import { projectStagePlanToAttentionReasons } from "@/lib/lifecycle/stageOperatingPlanAttentionProjection";
import { tryEvaluateStageAttentionForOpportunity } from "@/lib/lifecycle/stageAttentionForOpportunity";
import { createDefaultOpportunityAttentionResolvedConfig } from "@/lib/opportunities/opportunityAttentionConfig";
import { resolveOpportunityAttention } from "@/lib/opportunities/opportunityAttentionResolver";
import { __testing } from "@/lib/queues/QueueService";

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

function baseOpportunity(overrides?: Partial<Record<string, unknown>>) {
    return {
        id: "opp-na-1",
        status_key: "new_inquiry",
        created_at: new Date(NOW - 2 * MS_PER_DAY).toISOString(),
        updated_at: new Date(NOW - 2 * MS_PER_DAY).toISOString(),
        metadata: {},
        customer_id: "cust-1",
        primary_person_id: "person-1",
        ...overrides,
    };
}

function simulateNaLaneMembership(input: {
    opportunity: ReturnType<typeof baseOpportunity>;
    departmentMetadata: Record<string, unknown>;
    tasks?: StageAttentionTaskSnapshot[];
    nowMs?: number;
}): boolean {
    const nowMs = input.nowMs ?? NOW;
    const stageAttention = tryEvaluateStageAttentionForOpportunity({
        opportunity: input.opportunity,
        departmentMetadata: input.departmentMetadata,
        tasks: input.tasks ?? [],
        nowMs,
    });
    const attention = resolveOpportunityAttention({
        opportunity: input.opportunity,
        defs: [],
        config: createDefaultOpportunityAttentionResolvedConfig(),
        nowMs,
        stageAttention,
    });
    return attention.needs_attention;
}

describe("resolveStageAttentionCandidateStatusKeys", () => {
    it("includes lead-stage status keys when default enrollment plan has attention rules", () => {
        const keys = resolveStageAttentionCandidateStatusKeys(enrollmentDeptMetadata());
        expect(keys).toContain("new_inquiry");
        expect(keys).toContain("open");
    });

    it("returns empty when department has no lifecycle builder", () => {
        expect(resolveStageAttentionCandidateStatusKeys({})).toEqual([]);
        expect(resolveStageAttentionCandidateStatusKeys(null)).toEqual([]);
    });

    it("builds PostgREST-safe eq branches (no status_key.in)", () => {
        const branches = buildStageAttentionStatusKeyOrBranches(["new_inquiry", "open"]);
        expect(branches).toEqual(["status_key.eq.new_inquiry", "status_key.eq.open"]);
        expect(branches.some((b) => b.includes("in.("))).toBe(false);
    });
});

describe("Needs Attention queue prefilter", () => {
    it("extends candidate OR with stage-attention status keys", () => {
        const now = new Date(NOW);
        const keys = resolveStageAttentionCandidateStatusKeys(enrollmentDeptMetadata());
        const expr = __testing.buildOpportunityNeedsAttentionCandidateOrExpr(now, 48, keys);
        expect(expr).toContain("status_key.eq.new_inquiry");
        expect(expr).toContain("status_key.eq.open");
    });

    it("without stage keys, prefilter matches legacy OR only", () => {
        const now = new Date(NOW);
        const withStage = __testing.buildOpportunityNeedsAttentionCandidateOrExpr(now, 48, ["new_inquiry"]);
        const legacy = __testing.buildOpportunityNeedsAttentionCandidateOrExpr(now, 48, []);
        expect(withStage).toContain("status_key.eq.new_inquiry");
        expect(legacy).not.toContain("status_key.eq.new_inquiry");
    });
});

describe("NA lane final membership (prefilter + resolver)", () => {
    it("includes record with only stage_work_overdue after final evaluation", () => {
        const deptMeta = enrollmentDeptMetadata();
        const keys = resolveStageAttentionCandidateStatusKeys(deptMeta);
        expect(keys).toContain("new_inquiry");

        const tasks: StageAttentionTaskSnapshot[] = [
            {
                template_key: "review_lead",
                work_intent_key: "gather_enrollment_information",
                due_at: new Date(NOW - 2 * MS_PER_DAY).toISOString(),
                status: "open",
                attempt_count: 0,
                lifecycle_stage_key: "lead",
            },
        ];

        expect(
            simulateNaLaneMembership({
                opportunity: baseOpportunity(),
                departmentMetadata: deptMeta,
                tasks,
            }),
        ).toBe(true);
    });

    it("includes record with only stage_age_exceeded after final evaluation", () => {
        expect(
            simulateNaLaneMembership({
                opportunity: baseOpportunity({
                    updated_at: new Date(NOW - 8 * MS_PER_DAY).toISOString(),
                }),
                departmentMetadata: enrollmentDeptMetadata(),
                tasks: [],
            }),
        ).toBe(true);
    });

    it("excludes record in stage-attention candidate set when no rules fire", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        const fired = evaluateStageOperatingPlanAttention({
            plan,
            builderStageKey: "lead",
            nowMs: NOW,
            stageEnteredMs: NOW - 2 * MS_PER_DAY,
            tasks: [],
        });
        expect(fired.length).toBe(0);

        const attention = resolveOpportunityAttention({
            opportunity: baseOpportunity(),
            defs: [],
            nowMs: NOW,
            stageAttention: projectStagePlanToAttentionReasons(fired),
        });
        expect(attention.needs_attention).toBe(false);
    });

    it("preserves org-wide attention alongside stage attention", () => {
        const stageProjected = projectStagePlanToAttentionReasons([
            {
                rule_key: "stage_age_7d",
                kind: "stage_age_exceeded",
                label: "Stage age > 7 days",
                severity: "medium",
                provenance: "stage_operating_plan_v1:lead:stage_age_7d",
            },
        ]);

        const resolved = resolveOpportunityAttention({
            opportunity: {
                ...baseOpportunity(),
                metadata: {
                    enrollment_operational: {
                        wait_bucket: "waiting_on_staff",
                        wait_since: new Date(NOW - MS_PER_DAY).toISOString(),
                    },
                },
            },
            nowMs: NOW,
            defs: [],
            stageAttention: stageProjected,
        });

        expect(resolved.reasons.some((r) => r.code === "waiting_on_staff")).toBe(true);
        expect(resolved.reasons.some((r) => r.code === "stage_age_exceeded")).toBe(true);
    });
});
