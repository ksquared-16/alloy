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
    // The stage move crosses the child-grain boundary (and establishes the track); the disposition is
    // then recorded on that track. The reverse order refused for every child still in the family
    // segment (E2E-06). @see childTrackBeginsAtGrainCrossing.test.ts
    it("moves the selected child to the waitlist stage, then records the waitlisted disposition", async () => {
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
                kind: "move_to_stage",
                disposition: undefined,
                stage: CHILD_WAITLIST_STAGE_KEY,
            },
            {
                child: "child-A",
                kind: "update_child_enrollment_status",
                disposition: CHILD_WAITLIST_DISPOSITION_KEY,
                stage: undefined,
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

describe("a family surface acting on a child's own work", () => {
    // Every child has a path and one offer is still pending: the family card's current work IS that
    // child's work item. The outcome must run for the child the item names.
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
                            id: "s-offered",
                            key: "offered",
                            label: "Offer pending",
                            sort_order: 0,
                            is_active: true,
                            stage_operating_plan_v1: {
                                version: 1,
                                lifecycle_key: "enrollment",
                                stage_key: "offered",
                                journey_segment: "child",
                                work_templates: [
                                    {
                                        template_key: "offer_response",
                                        label: "Get the family's answer",
                                        required: true,
                                        primary: true,
                                        due_policy: { kind: "same_day" },
                                        owner_strategy: "record_owner",
                                        work_definition_key: "contact_family",
                                    },
                                ],
                                outcomes: [{ outcome_key: "offer_accepted", label: "Family accepted", completes_work: true }],
                                outcome_rules: [],
                            },
                        },
                    ],
                },
            ],
        },
    };
    const task = (metadata: Record<string, unknown>) => ({
        id: "task-ava",
        title: "Get the family's answer",
        due_at: "2026-10-21T00:00:00Z",
        status: "open",
        source: "business_process",
        updated_at: "2026-10-20T00:00:00Z",
        metadata: { lifecycle_stage_key: "offered", operating_plan_template_key: "offer_response", ...metadata },
    });
    const project = (openRows: ReturnType<typeof task>[], customerMemberId?: string) =>
        projectStageWorkRuntimeSync({
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            departmentMetadata,
            builderStageKey: "offered",
            openRows,
            ...(customerMemberId ? { customerMemberId } : {}),
        });

    it("runs for the child the open work item names, with that child's journey", () => {
        const p = project([task({ bp_subject_customer_member_id: "ava", bp_subject_process_instance_id: "pi-ava" })]);
        expect(p?.execution.subject).toMatchObject({ journey_segment: "child", opportunity_id: "opp-1", customer_member_id: "ava", process_instance_id: "pi-ava" });
        expect(p?.execution.subject_unresolved).toBeUndefined();
    });

    it("never overrides a child the caller named", () => {
        const p = project([task({ bp_subject_customer_member_id: "ava" })], "ben");
        expect(p?.execution.subject.customer_member_id).toBe("ben");
    });

    it("work naming no child still leaves the subject unresolved — never a guess", () => {
        const p = project([task({})]);
        expect(p?.execution.subject.customer_member_id).toBeUndefined();
        expect(p?.execution.subject_unresolved).toBe("child_identity_required");
    });
});
});
