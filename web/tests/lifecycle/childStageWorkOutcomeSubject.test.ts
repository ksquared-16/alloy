/**
 * Child stage work names its child under the work's own keys (`bp_subject_*`). Resolving the work's
 * outcomes must hand back THAT child — a child-grain subject without one is refused by the outcome
 * runtime ("Child enrollment subject required"), which is how "Record outcome" on a pending offer
 * failed on staging.
 */
import { describe, expect, it } from "vitest";
import { resolveStageWorkOutcomeContext } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { stageWorkChildMetadata } from "@/lib/lifecycle/stageWorkChildSubject";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

const offeredPlan = {
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
    outcomes: [{ outcome_key: "offer_accepted", label: "Family accepted" }],
    outcome_rules: [],
};

const CHILD = "44444444-4444-4444-8444-444444444444";
const JOURNEY = "55555555-5555-4555-8555-555555555555";
const OPP = "22222222-2222-4222-8222-222222222222";

const metadata = {
    [LIFECYCLE_BUILDER_METADATA_KEY]: {
        version: 1,
        active_process_id: "proc-1",
        processes: [
            {
                id: "proc-1",
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                is_active: true,
                sort_order: 0,
                stages: [
                    { id: "s-offered", key: "offered", label: "Offer pending", grain: "child", is_active: true, sort_order: 0, stage_operating_plan_v1: offeredPlan },
                ],
            },
        ],
    },
};
const supabase = {
    from() {
        const api: Record<string, unknown> = {
            select: () => api,
            eq: () => api,
            maybeSingle: () => Promise.resolve({ data: { metadata }, error: null }),
        };
        return api;
    },
} as never;

const task = (md: Record<string, unknown>) =>
    ({ id: "task-1", org_id: "org", title: "Get the family's answer", status: "open", entity_type: "opportunities", entity_id: OPP, metadata: { lifecycle_stage_key: "offered", department_id: "dept-1", ...md } }) as never;

describe("child stage work resolves to its child", () => {

    it("reads the child and journey stamped by stage work (bp_subject_*)", async () => {
        const ctx = await resolveStageWorkOutcomeContext({ supabase, orgId: "org", task: task(stageWorkChildMetadata({ customerMemberId: CHILD, processInstanceId: JOURNEY })) });
        expect(ctx?.subject).toMatchObject({ journey_segment: "child", opportunity_id: OPP, customer_member_id: CHILD, process_instance_id: JOURNEY });
    });

    it("still reads the older wire names", async () => {
        const ctx = await resolveStageWorkOutcomeContext({ supabase, orgId: "org", task: task({ customer_member_id: CHILD }) });
        expect(ctx?.subject.customer_member_id).toBe(CHILD);
    });
});
