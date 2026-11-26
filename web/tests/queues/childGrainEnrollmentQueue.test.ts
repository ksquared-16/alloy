import { describe, expect, it } from "vitest";

import { loadQueueDefinitionBundle, resolveQueueKeyFromDefinition } from "@/lib/config/queueDefinitionV2Runtime";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import {
    __testing,
    isEnrollmentChildGrainGloballyDisabled,
    resolveEnrollmentOffersChildGrainContext,
    enrollmentOffersChildQueueRowId,
} from "@/lib/queues/childGrainEnrollmentQueue";
import { readOpportunityIdFromQueueRow } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";

const v2Bundle = loadQueueDefinitionBundle(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2);

describe("childGrainEnrollmentQueue", () => {
    describe("resolveEnrollmentOffersChildGrainContext", () => {
        it("enables for v2 enrollment_offers with child grain", () => {
            const ctx = resolveEnrollmentOffersChildGrainContext({
                normalized: v2Bundle.normalized,
                executableQueueKey: "enrollment_offers",
            });
            expect(ctx).not.toBeNull();
            expect(ctx!.queueEntry.grain).toBe("child");
            expect(ctx!.filters.child_lifecycle_statuses).toEqual(["offer_pending", "enrolling"]);
        });

        it("does not enable for enrollment_completed (out of Card 8 scope)", () => {
            expect(
                resolveEnrollmentOffersChildGrainContext({
                    normalized: v2Bundle.normalized,
                    executableQueueKey: "enrollment_completed",
                })
            ).toBeNull();
        });

        it("does not enable for v1 config", () => {
            const v1Bundle = loadQueueDefinitionBundle(CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1);
            expect(
                resolveEnrollmentOffersChildGrainContext({
                    normalized: v1Bundle.normalized,
                    executableQueueKey: "enrollment_offers",
                })
            ).toBeNull();
        });

        it("does not enable for case-grain queues", () => {
            expect(
                resolveEnrollmentOffersChildGrainContext({
                    normalized: v2Bundle.normalized,
                    executableQueueKey: "new_leads",
                })
            ).toBeNull();
        });

        it("respects global disable env gate", () => {
            const prev = process.env.ALLOY_QUEUE_ENROLLMENT_CHILD_GRAIN_DISABLED;
            process.env.ALLOY_QUEUE_ENROLLMENT_CHILD_GRAIN_DISABLED = "1";
            expect(isEnrollmentChildGrainGloballyDisabled()).toBe(true);
            expect(
                resolveEnrollmentOffersChildGrainContext({
                    normalized: v2Bundle.normalized,
                    executableQueueKey: "enrollment_offers",
                })
            ).toBeNull();
            if (prev === undefined) delete process.env.ALLOY_QUEUE_ENROLLMENT_CHILD_GRAIN_DISABLED;
            else process.env.ALLOY_QUEUE_ENROLLMENT_CHILD_GRAIN_DISABLED = prev;
        });
    });

    it("ready_to_enroll alias resolves to enrollment_offers", () => {
        const resolution = resolveQueueKeyFromDefinition("ready_to_enroll", v2Bundle.normalized.queues);
        expect(resolution.resolvedKey).toBe("enrollment_offers");
        expect(resolution.matchedBy).toBe("alias");
    });

    it("enrolling alias resolves to enrollment_offers", () => {
        const resolution = resolveQueueKeyFromDefinition("enrolling", v2Bundle.normalized.queues);
        expect(resolution.resolvedKey).toBe("enrollment_offers");
    });

    describe("row shape", () => {
        it("mixed siblings produce separate rows with child identifiers", () => {
            const oppId = "opp-1";
            const rowA = __testing.buildChildGrainRowFromOcm(
                {
                    id: "ocm-a",
                    org_id: "org-1",
                    opportunity_id: oppId,
                    customer_member_id: "cm-a",
                    outcome_status_key: "offer_pending",
                    program_category_id: "cat-infant",
                    location_program_categories: { key: "infant", label: "Infant" },
                    schedule_type: null,
                    updated_at: "2026-01-01T00:00:00Z",
                    created_at: "2026-01-01T00:00:00Z",
                    opportunities: {
                        id: oppId,
                        name: "Smith Family",
                        title: null,
                        status_key: "ready_to_enroll",
                        customer_id: "cust-1",
                        primary_person_id: null,
                        primary_contact_id: null,
                        work_unit_id: "wu-1",
                        location_id: null,
                        metadata: {},
                        created_at: "2026-01-01T00:00:00Z",
                        updated_at: "2026-01-01T00:00:00Z",
                    },
                    customer_members: {
                        id: "cm-a",
                        display_name: "Alex Smith",
                        first_name: "Alex",
                        last_name: "Smith",
                        dob: null,
                        person_id: null,
                        relationship: "child",
                        is_active: true,
                    },
                },
                { id: oppId, name: "Smith Family" }
            );
            const rowB = __testing.buildChildGrainRowFromOcm(
                {
                    id: "ocm-b",
                    org_id: "org-1",
                    opportunity_id: oppId,
                    customer_member_id: "cm-b",
                    outcome_status_key: "enrolling",
                    program_category_id: "cat-toddler",
                    location_program_categories: { key: "toddler", label: "Toddler" },
                    schedule_type: null,
                    updated_at: "2026-01-02T00:00:00Z",
                    created_at: "2026-01-01T00:00:00Z",
                    opportunities: {
                        id: oppId,
                        name: "Smith Family",
                        title: null,
                        status_key: "enrolling",
                        customer_id: "cust-1",
                        primary_person_id: null,
                        primary_contact_id: null,
                        work_unit_id: "wu-1",
                        location_id: null,
                        metadata: {},
                        created_at: "2026-01-01T00:00:00Z",
                        updated_at: "2026-01-02T00:00:00Z",
                    },
                    customer_members: {
                        id: "cm-b",
                        display_name: "Jordan Smith",
                        first_name: "Jordan",
                        last_name: "Smith",
                        dob: null,
                        person_id: null,
                        relationship: "child",
                        is_active: true,
                    },
                },
                { id: oppId, name: "Smith Family" }
            );

            expect(rowA.id).not.toBe(rowB.id);
            expect(rowA.opportunity_id).toBe(oppId);
            expect(rowB.opportunity_id).toBe(oppId);
            expect(rowA.opportunity_customer_member_id).toBe("ocm-a");
            expect(rowB.opportunity_customer_member_id).toBe("ocm-b");
            expect(rowA.row_grain).toBe("child");
            expect(rowA._child_display_name).toBe("Alex Smith");
            expect(rowB._child_display_name).toBe("Jordan Smith");
            expect(rowA.child_lifecycle_status).toBe("offer_pending");
            expect(rowB.child_lifecycle_status).toBe("enrolling");
        });

        it("ocmrow id resolves opportunity for drawer navigation", () => {
            const id = enrollmentOffersChildQueueRowId("opp-99", "ocm-42");
            expect(readOpportunityIdFromQueueRow({ id })).toBe("opp-99");
        });
    });

    it("parseEnrollmentOffersChildGrainFilters reads config values", () => {
        const offers = v2Bundle.normalized.queues.find((q) => q.key === "enrollment_offers")!;
        const filters = __testing.parseEnrollmentOffersChildGrainFilters(offers);
        expect(filters.child_lifecycle_statuses).toEqual(["offer_pending", "enrolling"]);
    });
});

describe("waitlist candidate grain unchanged", () => {
    it("waitlist remains candidate grain only", () => {
        const waitlist = v2Bundle.normalized.queues.find((q) => q.key === "waitlist")!;
        expect(waitlist.grain).toBe("candidate");
        expect(
            resolveEnrollmentOffersChildGrainContext({
                normalized: v2Bundle.normalized,
                executableQueueKey: "waitlist",
            })
        ).toBeNull();
    });
});
