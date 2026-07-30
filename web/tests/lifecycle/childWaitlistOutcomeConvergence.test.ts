import { describe, expect, it, vi } from "vitest";
import {
    applyChildWaitlistViaOutcomeRuntime,
    CHILD_WAITLIST_DISPOSITION_KEY,
    CHILD_WAITLIST_STAGE_KEY,
} from "@/lib/lifecycle/applyChildWaitlistViaOutcomeRuntime";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

vi.mock("@/lib/lifecycle/stageOutcomeRuleTargetExecutor", () => ({
    applyStageOutcomeRuleTarget: vi.fn(async (_sb: unknown, params: { subject: { customer_member_id?: string }; target: { kind: string; disposition_key?: string; stage_key?: string } }) => {
        const calls = ((globalThis as { __waitlistCalls?: unknown[] }).__waitlistCalls ??= []);
        calls.push({
            child: params.subject.customer_member_id,
            kind: params.target.kind,
            disposition: params.target.disposition_key,
            stage: params.target.stage_key,
        });
        return { status_updated: params.target.kind === "update_child_enrollment_status", undo: async () => undefined };
    }),
}));

describe("applyChildWaitlistViaOutcomeRuntime", () => {
    it("applies waitlisted disposition then waitlist stage for the selected child only", async () => {
        (globalThis as { __waitlistCalls?: unknown[] }).__waitlistCalls = [];
        const result = await applyChildWaitlistViaOutcomeRuntime({
            supabase: {} as never,
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            opportunityId: "opp-1",
            customerMemberId: "child-A",
            opportunityCustomerMemberId: "ocm-A",
            departmentMetadata: {},
        });
        expect(result.ok).toBe(true);
        const calls = (globalThis as { __waitlistCalls?: Array<{ child: string; kind: string; disposition?: string; stage?: string }> }).__waitlistCalls ?? [];
        expect(calls).toEqual([
            {
                child: "child-A",
                kind: "update_child_enrollment_status",
                disposition: CHILD_WAITLIST_DISPOSITION_KEY,
                stage: undefined,
            },
            {
                child: "child-A",
                kind: "move_to_stage",
                disposition: undefined,
                stage: CHILD_WAITLIST_STAGE_KEY,
            },
        ]);
        expect(calls.every((c) => c.child === "child-A")).toBe(true);
        expect(calls.some((c) => c.child === "child-B")).toBe(false);
    });
});

describe("projectStageWorkRuntimeSync child subject", () => {
    it("threads customer_member_id onto child-grain execution subject", () => {
        const departmentMetadata = {
            [LIFECYCLE_BUILDER_METADATA_KEY]: {
                version: 1,
                active_process_id: "proc-1",
                processes: [
                    {
                        id: "proc-1",
                        key: "enrollment",
                        name: "Enrollment",
                        primary_entity: "opportunity",
                        sort_order: 0,
                        is_active: true,
                        stages: [
                            {
                                id: "s-waitlist",
                                key: "waitlist",
                                label: "Waitlist",
                                sort_order: 0,
                                is_active: true,
                                stage_operating_plan_v1: {
                                    version: 1,
                                    lifecycle_key: "enrollment",
                                    stage_key: "waitlist",
                                    journey_segment: "child",
                                    work_templates: [
                                        {
                                            template_key: "review_waitlist_position",
                                            label: "Review waitlist position",
                                            required: true,
                                            primary: true,
                                            due_policy: { kind: "same_day" },
                                            owner_strategy: "record_owner",
                                            work_definition_key: "contact_family",
                                        },
                                    ],
                                    outcomes: [{ outcome_key: "spot_offered", label: "Spot Offered" }],
                                    outcome_rules: [],
                                },
                            },
                        ],
                    },
                ],
            },
        };

        const projection = projectStageWorkRuntimeSync({
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata,
            builderStageKey: "waitlist",
            customerMemberId: "child-selected",
            opportunityCustomerMemberId: "ocm-selected",
        });

        expect(projection?.journey_segment).toBe("child");
        expect(projection?.execution.subject).toMatchObject({
            journey_segment: "child",
            opportunity_id: "opp-1",
            customer_member_id: "child-selected",
            opportunity_customer_member_id: "ocm-selected",
        });
    });

    it("does not invent a family subject when child identity is missing", () => {
        const departmentMetadata = {
            [LIFECYCLE_BUILDER_METADATA_KEY]: {
                version: 1,
                active_process_id: "proc-1",
                processes: [
                    {
                        id: "proc-1",
                        key: "enrollment",
                        name: "Enrollment",
                        primary_entity: "opportunity",
                        sort_order: 0,
                        is_active: true,
                        stages: [
                            {
                                id: "s-waitlist",
                                key: "waitlist",
                                label: "Waitlist",
                                sort_order: 0,
                                is_active: true,
                                stage_operating_plan_v1: {
                                    version: 1,
                                    lifecycle_key: "enrollment",
                                    stage_key: "waitlist",
                                    journey_segment: "child",
                                    work_templates: [
                                        {
                                            template_key: "review_waitlist_position",
                                            label: "Review waitlist position",
                                            required: true,
                                            primary: true,
                                            due_policy: { kind: "same_day" },
                                            owner_strategy: "record_owner",
                                            work_definition_key: "contact_family",
                                        },
                                    ],
                                    outcomes: [],
                                    outcome_rules: [],
                                },
                            },
                        ],
                    },
                ],
            },
        };

        const projection = projectStageWorkRuntimeSync({
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata,
            builderStageKey: "waitlist",
        });

        expect(projection?.execution.subject.journey_segment).toBe("child");
        expect(projection?.execution.subject.customer_member_id).toBeUndefined();
        expect(projection?.execution.subject.opportunity_id).toBe("opp-1");
    });
});
