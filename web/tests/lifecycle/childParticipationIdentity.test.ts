/**
 * 3A — CANONICAL CHILD PARTICIPATION IDENTITY, as a boundary contract.
 *
 * Two defects sat on either side of this seam, and they are the same mistake: treating "some id that
 * might name a child" as "the child".
 *
 *  1. The drawer's stage-work cache keyed the child as `customerMemberId || ocmId || processInstanceId`.
 *     Different identities collapsed onto one key while sending different query strings, so one
 *     caller's slice was served to another.
 *  2. The stage-work projection, when the caller named no child, walked the family's open tasks and
 *     took the first one carrying any child id — an arbitrary sibling, stamped as the execution
 *     subject for every work item in the projection.
 *
 * Both produced a WRITE against a subject the operator did not choose, and both passed every
 * downstream guard, because the guards ask "is a child named?" and one was.
 */

import { describe, expect, it } from "vitest";
import {
    childParticipationIdentityFromWire,
    childParticipationIdentityKey,
    childParticipationIdentityToWire,
    namesAChild,
    sameChildParticipation,
} from "@/lib/lifecycle/childParticipationIdentity";
import { opportunityStageWorkCacheKey } from "@/lib/adminV2/viewModel/drawer/opportunity/stageWork/opportunityStageWorkResource";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

describe("the identity is a tuple, and the key is injective on it", () => {
    it("keeps the four ids apart instead of coalescing them", () => {
        const id = childParticipationIdentityFromWire({
            customer_member_id: "cm-1",
            process_instance_id: "pi-1",
            opportunity_customer_member_id: "ocm-1",
            opportunity_id: "opp-1",
        });
        expect(id).toEqual({
            subjectId: "cm-1",
            participationId: "pi-1",
            contextId: "opp-1",
            legacyOcmId: "ocm-1",
        });
        expect(new Set([id.subjectId, id.participationId, id.contextId, id.legacyOcmId]).size).toBe(4);
    });

    it("the SAME string in different slots is a DIFFERENT identity", () => {
        // Reachable in real data: a process_instances.id was carried under the OCM name through the
        // migration, so "x" genuinely appears in both roles.
        const asOcm = childParticipationIdentityFromWire({ opportunity_customer_member_id: "x" });
        const asParticipation = childParticipationIdentityFromWire({ process_instance_id: "x" });
        expect(childParticipationIdentityKey(asOcm)).not.toBe(childParticipationIdentityKey(asParticipation));
        expect(sameChildParticipation(asOcm, asParticipation)).toBe(false);
    });

    it("adding an id CHANGES the identity — a superset is not the same participation", () => {
        const bare = childParticipationIdentityFromWire({ customer_member_id: "cm-1" });
        const withParticipation = childParticipationIdentityFromWire({
            customer_member_id: "cm-1",
            process_instance_id: "pi-9",
        });
        expect(childParticipationIdentityKey(bare)).not.toBe(childParticipationIdentityKey(withParticipation));
    });

    it("the family case alone does not name a child", () => {
        expect(namesAChild(childParticipationIdentityFromWire({ opportunity_id: "opp-1" }))).toBe(false);
        expect(namesAChild(childParticipationIdentityFromWire({ customer_member_id: "cm-1" }))).toBe(true);
        expect(namesAChild(childParticipationIdentityFromWire({ process_instance_id: "pi-1" }))).toBe(true);
        expect(namesAChild(childParticipationIdentityFromWire({ opportunity_customer_member_id: "o" }))).toBe(true);
    });

    it("round-trips through the wire without inventing nulls", () => {
        const wire = childParticipationIdentityToWire(
            childParticipationIdentityFromWire({ customer_member_id: "cm-1" }),
        );
        expect(wire).toEqual({ customer_member_id: "cm-1" });
        expect("process_instance_id" in wire).toBe(false);
    });

    it("whitespace-only ids are absent, not present-and-blank", () => {
        expect(namesAChild(childParticipationIdentityFromWire({ customer_member_id: "   " }))).toBe(false);
    });
});

describe("the stage-work cache key is injective on what the fetch varies by", () => {
    const base = { orgScope: "org-1", opportunityId: "opp-1", departmentId: "dept-1", stageKey: "waitlist" };

    it("two identities that send different queries get different keys", () => {
        const a = opportunityStageWorkCacheKey({ ...base, customerMemberId: "cm-1" });
        const b = opportunityStageWorkCacheKey({ ...base, customerMemberId: "cm-1", processInstanceId: "pi-9" });
        expect(a).not.toBe(b);
    });

    it("the same string in different id slots does not collide", () => {
        const asOcm = opportunityStageWorkCacheKey({ ...base, opportunityCustomerMemberId: "x" });
        const asParticipation = opportunityStageWorkCacheKey({ ...base, processInstanceId: "x" });
        expect(asOcm).not.toBe(asParticipation);
    });

    it("siblings never share a key", () => {
        const a = opportunityStageWorkCacheKey({ ...base, customerMemberId: "cm-a" });
        const b = opportunityStageWorkCacheKey({ ...base, customerMemberId: "cm-b" });
        expect(a).not.toBe(b);
    });

    it("the same identity is stable across calls — it is still a cache", () => {
        const params = { ...base, customerMemberId: "cm-1", processInstanceId: "pi-1" };
        expect(opportunityStageWorkCacheKey(params)).toBe(opportunityStageWorkCacheKey({ ...params }));
    });

    it("a family-grain request (no child) keeps one stable key", () => {
        expect(opportunityStageWorkCacheKey(base)).toBe(opportunityStageWorkCacheKey({ ...base }));
        expect(opportunityStageWorkCacheKey(base)).not.toBe(
            opportunityStageWorkCacheKey({ ...base, customerMemberId: "cm-1" }),
        );
    });
});

// ── The projection no longer scrapes a sibling out of the family's task list ─────────────────────

const childStageMetadata = {
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
                        grain: "child",
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

const openTaskFor = (id: string, customerMemberId: string) => ({
    id,
    title: "Review waitlist position",
    due_at: "2026-07-30",
    status: "open",
    source: "lifecycle",
    updated_at: "2026-07-30",
    metadata: {
        operating_plan_template_key: "review_waitlist_position",
        lifecycle_stage_key: "waitlist",
        customer_member_id: customerMemberId,
    },
});

const project = (over: Record<string, unknown>) =>
    projectStageWorkRuntimeSync({
        orgId: "org-1",
        opportunityId: "opp-1",
        departmentId: "dept-1",
        departmentMetadata: childStageMetadata,
        builderStageKey: "waitlist",
        ...over,
    } as never);

describe("a child-grain projection names the child EXPLICITLY or not at all", () => {
    it("an explicit child is threaded onto the execution subject", () => {
        const p = project({ customerMemberId: "cm-chosen", processInstanceId: "pi-chosen" });
        expect(p?.execution.subject).toMatchObject({
            journey_segment: "child",
            opportunity_id: "opp-1",
            customer_member_id: "cm-chosen",
            process_instance_id: "pi-chosen",
        });
        expect(p?.execution.subject_unresolved).toBeUndefined();
    });

    it("open tasks belonging to SIBLINGS never become the subject", () => {
        // The batch queue enrichment groups tasks by opportunity and passes no explicit identity.
        // First-wins picked child-A here and executed every work item against them.
        const p = project({
            openRows: [openTaskFor("task-a", "cm-child-A"), openTaskFor("task-b", "cm-child-B")],
        });
        expect(p?.execution.subject.customer_member_id).toBeUndefined();
        expect(p?.execution.subject.opportunity_customer_member_id).toBeUndefined();
        expect(p?.execution.subject.process_instance_id).toBeUndefined();
    });

    it("an unresolved child subject says so, rather than looking executable", () => {
        const p = project({ openRows: [openTaskFor("task-a", "cm-child-A")] });
        expect(p?.execution.subject_unresolved).toBe("child_identity_required");
        // Still truthful about what it DOES know: the case and the grain.
        expect(p?.execution.subject.journey_segment).toBe("child");
        expect(p?.execution.subject.opportunity_id).toBe("opp-1");
    });

    it("an explicit identity wins even when open tasks name someone else", () => {
        const p = project({
            customerMemberId: "cm-chosen",
            openRows: [openTaskFor("task-a", "cm-child-A")],
        });
        expect(p?.execution.subject.customer_member_id).toBe("cm-chosen");
        expect(p?.execution.subject_unresolved).toBeUndefined();
    });
});
