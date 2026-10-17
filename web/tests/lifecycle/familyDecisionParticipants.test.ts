/**
 * At Decision, children who have no Enrollment journey yet are still the family's children.
 */
import { describe, expect, it } from "vitest";

import { readFamilyDecisionParticipants } from "@/lib/lifecycle/listFamilyDecisionParticipants";
import { projectParticipantDecisionRows } from "@/lib/lifecycle/projectParticipantDecisionRows";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const ORG = "org-1";
const LEAD = "lead-1";

function fake(tables: Record<string, Array<Record<string, unknown>>>) {
    return {
        from: (table: string) => {
            const eqs: Array<[string, unknown]> = [];
            let inCol = "";
            let inVals: unknown[] | null = null;
            const b: Record<string, unknown> = {
                select: () => b,
                eq: (c: string, v: unknown) => {
                    eqs.push([c, v]);
                    return b;
                },
                in: (c: string, v: unknown[]) => {
                    inCol = c;
                    inVals = v;
                    return b;
                },
                then: (resolve: (r: { data: unknown; error: null }) => void) =>
                    resolve({
                        data: (tables[table] ?? []).filter(
                            (r) =>
                                eqs.every(([c, v]) => !(c in r) || r[c] === v)
                                && (inVals == null || inVals.includes(r[inCol])),
                        ),
                        error: null,
                    }),
            };
            return b;
        },
    } as never;
}

const world = () => ({
    opportunity_customer_members: [
        { id: "ocm-ava", org_id: ORG, opportunity_id: LEAD, customer_member_id: "ava" },
        { id: "ocm-ben", org_id: ORG, opportunity_id: LEAD, customer_member_id: "ben" },
    ],
    process_instances: [] as Array<Record<string, unknown>>,
    customer_members: [
        { id: "ava", org_id: ORG, first_name: "Ava", last_name: "Q" },
        { id: "ben", org_id: ORG, first_name: "Ben", last_name: "Q" },
    ],
});

const plan = {
    version: 1,
    stage_key: "decision",
    outcomes: [],
    outcome_rules: [],
    attention_rules: [],
    work_templates: [
        {
            template_key: "review_child_paths",
            label: "Review each child's path",
            participant_decisions: [
                {
                    decision_key: "child_offer_spot",
                    action_ref: "waitlist_child",
                    label: "Offer spot",
                    subject_grain: "child",
                    targets: [
                        { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                        { kind: "move_to_stage", stage_key: "offered" },
                    ],
                },
            ],
        },
    ],
} as unknown as StageOperatingPlanV1;

describe("the family's children at Decision", () => {
    it("lists children with no journey yet as live and undecided", async () => {
        const read = await readFamilyDecisionParticipants(fake(world()), { orgId: ORG, opportunityId: LEAD });
        expect(read.ok && read.participants).toEqual([
            { customer_member_id: "ava", process_instance_id: null, state: null, stage_key: null },
            { customer_member_id: "ben", process_instance_id: null, state: null, stage_key: null },
        ]);
    });

    it("prefers a child's journey where one exists", async () => {
        const w = world();
        w.process_instances.push({ id: "pi-ava", org_id: ORG, process_key: "enrollment", context_id: "ocm-ava", subject_id: "ava", state: "waitlisted" });
        const read = await readFamilyDecisionParticipants(fake(w), { orgId: ORG, opportunityId: LEAD });
        expect(read.ok && read.participants.find((p) => p.customer_member_id === "ava")).toEqual({
            customer_member_id: "ava",
            process_instance_id: "pi-ava",
            state: "waitlisted",
            stage_key: null,
        });
    });

    it("names an offered child's path Offer spot, not the Waitlist path that shares its disposition", async () => {
        const w = world();
        w.process_instances.push({ id: "pi-ava", org_id: ORG, process_key: "enrollment", context_id: "ocm-ava", subject_id: "ava", state: "waitlisted", stage_key: "offered" });
        const twoPaths = {
            ...plan,
            work_templates: [
                {
                    ...plan.work_templates[0],
                    participant_decisions: [
                        {
                            decision_key: "child_waitlist",
                            action_ref: "waitlist_child",
                            label: "Waitlist",
                            subject_grain: "child",
                            targets: [
                                { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                                { kind: "move_to_stage", stage_key: "waitlist" },
                            ],
                        },
                        ...(plan.work_templates[0].participant_decisions ?? []),
                    ],
                },
            ],
        } as unknown as StageOperatingPlanV1;
        const surface = await projectParticipantDecisionRows({ supabase: fake(w), orgId: ORG, opportunityId: LEAD, plan: twoPaths, templateKey: "review_child_paths" });
        expect(surface?.rows.find((r) => r.label === "Ava Q")?.state_label).toBe("Offer spot");
    });

    it("renders a row and an enabled Offer spot for each child, and counts both as undecided", async () => {
        const surface = await projectParticipantDecisionRows({
            supabase: fake(world()),
            orgId: ORG,
            opportunityId: LEAD,
            plan,
            templateKey: "review_child_paths",
        });
        expect(surface?.rows.map((r) => [r.label, r.process_instance_id, r.decisions.map((d) => [d.label, d.enabled])])).toEqual([
            ["Ava Q", "", [["Offer spot", true]]],
            ["Ben Q", "", [["Offer spot", true]]],
        ]);
        expect(surface?.progress).toMatchObject({ resolved: 0, total: 2, all_resolved: false });
    });
});
