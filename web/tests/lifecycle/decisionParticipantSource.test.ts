import { describe, expect, it } from "vitest";

import { projectParticipantDecisionRows } from "@/lib/lifecycle/projectParticipantDecisionRows";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/**
 * WHO is being decided about, versus WHAT has already happened to them.
 *
 * The surface used to enumerate Enrollment journeys and derive the children from them. At the
 * Decision stage that is backwards: `Begin Enrolling` is the decision that CREATES a journey, so a
 * child who had never been enrolled produced no row and could never be offered the decision — the
 * children the surface exists for were exactly the ones it could not see.
 *
 * These fixtures are the real shape `review_child_paths` is for: one lead, three children, three
 * different amounts of history.
 */

const PLAN: StageOperatingPlanV1 = {
    version: 1,
    stage_key: "decision",
    lifecycle_key: "enrollment",
    purpose: "Choose each child's enrollment path after the family tour.",
    outcomes: [],
    outcome_rules: [],
    attention_rules: [],
    journey_segment: "family",
    outgoing_transitions: [],
    work_templates: [
        {
            template_key: "review_child_paths",
            label: "Review each child's path",
            required: true,
            participant_decisions: [
                {
                    decision_key: "child_waitlist",
                    label: "Waitlist",
                    subject_grain: "child",
                    action_ref: "waitlist_child",
                    targets: [{ kind: "update_child_enrollment_status", disposition_key: "waitlisted" }],
                },
                {
                    decision_key: "child_begin_enrolling",
                    label: "Begin Enrolling",
                    subject_grain: "child",
                    action_ref: "enroll_child",
                    targets: [
                        { kind: "update_child_enrollment_status", disposition_key: "enrolling" },
                        { kind: "move_to_stage", stage_key: "enrolling" },
                    ],
                },
                {
                    decision_key: "child_not_enrolling",
                    label: "Not Enrolling",
                    subject_grain: "child",
                    action_ref: "update_child_enrollment_status",
                    targets: [{ kind: "update_child_enrollment_status", disposition_key: "not_enrolling" }],
                },
            ],
        },
    ],
} as unknown as StageOperatingPlanV1;

const OPP = "opportunity-1";

/** Answers the three reads the projection makes: memberships, journeys, names. */
function client(opts: {
    memberships: { id: string; customer_member_id: string; outcome_status_key?: string | null }[];
    instances: Record<string, unknown>[];
    names: { id: string; first_name: string; last_name: string }[];
}) {
    const table = (rows: unknown[]) => {
        const b: Record<string, unknown> = {
            select: () => b,
            eq: () => b,
            in: () => b,
            then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
        };
        return b;
    };
    return {
        from(name: string) {
            if (name === "opportunity_customer_members") return table(opts.memberships);
            if (name === "customer_members") return table(opts.names);
            // process_instances, reached through listEnrollmentInstancesForLead
            return table(opts.instances);
        },
    };
}

const project = (db: unknown) =>
    projectParticipantDecisionRows({
        supabase: db as never,
        orgId: "org-1",
        opportunityId: OPP,
        plan: PLAN,
        templateKey: "review_child_paths",
    });

const THREE_CHILDREN = {
    memberships: [
        { id: "ocm-a", customer_member_id: "child-a", outcome_status_key: null },
        { id: "ocm-b", customer_member_id: "child-b", outcome_status_key: null },
        { id: "ocm-c", customer_member_id: "child-c", outcome_status_key: null },
    ],
    names: [
        { id: "child-a", first_name: "Ana", last_name: "Lead" },
        { id: "child-b", first_name: "Ben", last_name: "Lead" },
        { id: "child-c", first_name: "Cleo", last_name: "Lead" },
    ],
    instances: [
        // Child B: participation-anchored journey. Child C: legacy opportunity-anchored.
        { id: "pi-b", subject_id: "child-b", context_id: "ocm-b", context_type: "enrollment_participation", state: null },
        { id: "pi-c", subject_id: "child-c", context_id: OPP, context_type: "opportunity", state: null },
    ],
};

describe("membership defines the participants", () => {
    it("renders a child with NO journey — the case that produced no row at all", async () => {
        const surface = await project(
            client({ memberships: [THREE_CHILDREN.memberships[0]!], names: [THREE_CHILDREN.names[0]!], instances: [] }),
        );

        expect(surface?.rows.map((r) => r.label)).toEqual(["Ana Lead"]);
        expect(surface?.rows[0]?.process_instance_id).toBeUndefined();
        expect(surface?.rows[0]?.opportunity_customer_member_id).toBe("ocm-a");
        // The whole point: the decision is offered to the child who needs it.
        expect(surface?.rows[0]?.decisions.map((d) => d.label)).toEqual([
            "Waitlist",
            "Begin Enrolling",
            "Not Enrolling",
        ]);
    });

    it("gives a mixed three-child family exactly three rows, one per child", async () => {
        const surface = await project(client(THREE_CHILDREN));

        expect(surface?.rows.map((r) => r.label)).toEqual(["Ana Lead", "Ben Lead", "Cleo Lead"]);
        expect(surface?.rows).toHaveLength(3);
    });

    it("attaches each journey to its own child, under either anchor", async () => {
        const surface = await project(client(THREE_CHILDREN));
        const byName = new Map(surface!.rows.map((r) => [r.label, r]));

        expect(byName.get("Ana Lead")?.process_instance_id).toBeUndefined();
        expect(byName.get("Ben Lead")?.process_instance_id).toBe("pi-b"); // participation anchor
        expect(byName.get("Cleo Lead")?.process_instance_id).toBe("pi-c"); // legacy anchor
    });

    it("does not duplicate a child who holds more than one journey", async () => {
        const surface = await project(
            client({
                memberships: [THREE_CHILDREN.memberships[1]!],
                names: [THREE_CHILDREN.names[1]!],
                instances: [
                    { id: "pi-old", subject_id: "child-b", context_id: OPP, state: "withdrawn" },
                    { id: "pi-open", subject_id: "child-b", context_id: "ocm-b", state: null },
                ],
            }),
        );

        expect(surface?.rows).toHaveLength(1);
        // A concluded journey never displaces the open one a Decision is actually about.
        expect(surface?.rows[0]?.process_instance_id).toBe("pi-open");
    });

    it("excludes a child who belongs to another lead", async () => {
        const surface = await project(
            client({
                memberships: [THREE_CHILDREN.memberships[0]!],
                names: THREE_CHILDREN.names,
                // A journey whose subject is not a member of this lead must not create a row.
                instances: [{ id: "pi-foreign", subject_id: "child-z", context_id: "ocm-of-another-lead" }],
            }),
        );

        expect(surface?.rows.map((r) => r.customer_member_id)).toEqual(["child-a"]);
    });
});

describe("completion counts children, not journeys", () => {
    const decided = (key: string) => ({
        ...THREE_CHILDREN,
        memberships: THREE_CHILDREN.memberships.map((m, i) =>
            i === 0 ? { ...m, outcome_status_key: key } : m,
        ),
    });

    it("0 of 3 with no decisions taken", async () => {
        const surface = await project(client(THREE_CHILDREN));
        expect(surface?.progress).toMatchObject({ resolved: 0, total: 3, all_resolved: false });
    });

    it("1 of 3 after one child is decided — the family work stays open", async () => {
        const surface = await project(client(decided("enrolling")));
        expect(surface?.progress).toMatchObject({ resolved: 1, total: 3, all_resolved: false });
    });

    it("3 of 3 completes only when every child has a path", async () => {
        const all = {
            ...THREE_CHILDREN,
            memberships: [
                { id: "ocm-a", customer_member_id: "child-a", outcome_status_key: "enrolling" },
                { id: "ocm-b", customer_member_id: "child-b", outcome_status_key: "waitlisted" },
                { id: "ocm-c", customer_member_id: "child-c", outcome_status_key: "not_enrolling" },
            ],
        };
        const surface = await project(client(all));
        expect(surface?.progress).toMatchObject({ resolved: 3, total: 3, all_resolved: true });
    });

    it("a journey's own state resolves a child too, not only the membership", async () => {
        const surface = await project(
            client({
                memberships: [THREE_CHILDREN.memberships[1]!],
                names: [THREE_CHILDREN.names[1]!],
                instances: [{ id: "pi-b", subject_id: "child-b", context_id: "ocm-b", state: "enrolling" }],
            }),
        );
        expect(surface?.progress).toMatchObject({ resolved: 1, total: 1, all_resolved: true });
    });
});
