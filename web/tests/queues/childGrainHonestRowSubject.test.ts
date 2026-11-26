import { describe, expect, it } from "vitest";

import { placementCandidateQueueRowId } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { enrollmentOffersChildQueueRowId } from "@/lib/queues/childGrainEnrollmentQueue";
import { applyQueueRowContextToLayoutRecord } from "@/lib/layout/runtime/applyQueueRowContextToLayoutRuntime";
import {
    isCaseGrainQueueRowContext,
    isQueueRowSubjectFieldVisible,
    suppressDuplicateQueueRowSubjectOnRecord,
} from "@/lib/layout/runtime/queueRowSubjectPresentation";
import { attachOpportunityQueueRowsWithRowContext } from "@/lib/workUnits/attachQueueRowContextToItems";
import { buildDrawerSubjectContextFromQueueRowContext } from "@/lib/workUnits/buildDrawerSubjectContextFromQueueRowContext";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

const v2Bundle = loadQueueDefinitionBundle(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2);

function attachLane(
    rows: Record<string, unknown>[],
    queueKey: string,
    label: string,
): Record<string, unknown>[] {
    return attachOpportunityQueueRowsWithRowContext(rows, {
        entityType: "opportunity",
        requestedQueueKey: queueKey,
        executableQueueKey: queueKey,
        queueLabel: label,
        normalized: v2Bundle.normalized,
        lifecycleKey: "enrollment",
    });
}

describe("Phase B honest row_subject on existing grain rows", () => {
    it("Card 8 ocmrow row gets honest child subject without flag", () => {
        const prev = process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
        delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;

        const [row] = attachLane(
            [
                {
                    id: enrollmentOffersChildQueueRowId("opp-1", "ocm-8"),
                    opportunity_id: "opp-1",
                    opportunity_customer_member_id: "ocm-8",
                    row_grain: "child",
                    name: "Smith Household",
                    opportunity_status_key: "open",
                    _child_display_name: "Mia Hayes",
                    child_lifecycle_status: "offer_pending",
                    _child_lifecycle_grain_row: {
                        opportunity_customer_member_id: "ocm-8",
                        opportunity_id: "opp-1",
                        child_display_name: "Mia Hayes",
                        child_lifecycle_status: "offer_pending",
                        program_line: "Preschool · Full time",
                    },
                    _inquiry_children: [
                        {
                            ocm_id: "ocm-8",
                            display_name: "Mia Hayes",
                            outcome_status_key: "offer_pending",
                            location_id: "loc-1",
                            program_key: "preschool",
                        },
                    ],
                },
            ],
            "enrollment_offers",
            "Enrolling",
        );

        const ctx = row._queue_row_context as {
            row_subject: { subject_type: string; subject_id: string; display_name: string };
            drawer_open: { active_subject?: { subject_type: string; stage_key: string } };
            placement_context?: { location_id: string };
        };

        expect(ctx.row_subject).toEqual({
            subject_type: "child",
            subject_id: "ocm-8",
            display_name: "Mia Hayes",
        });
        expect(ctx.drawer_open.active_subject?.subject_type).toBe("child");
        expect(ctx.drawer_open.active_subject?.stage_key).toBe("enrolling");
        expect(ctx.placement_context?.location_id).toBe("loc-1");

        if (prev !== undefined) process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = prev;
    });

    it("Card 6 pcrow row gets honest candidate subject without flag", () => {
        const [row] = attachLane(
            [
                {
                    id: placementCandidateQueueRowId("opp-2", "cand-c"),
                    opportunity_id: "opp-2",
                    row_grain: "candidate",
                    placement_candidate_id: "cand-c",
                    candidate_status: "active",
                    name: "Jones Household",
                    _child_display_name: "Child C",
                    _placement_waitlist_row: {
                        placement_candidate_id: "cand-c",
                        opportunity_id: "opp-2",
                        child_display_name: "Child C",
                        site_id: "loc-2",
                        program_room_cohort_key: "infant-room",
                        program_room_group_label: "Infant",
                    },
                },
            ],
            "waitlist",
            "Waitlist",
        );

        const ctx = row._queue_row_context as {
            row_subject: { subject_type: string; subject_id: string };
            drawer_open: { active_subject?: { subject_type: string; stage_key: string } };
        };

        expect(ctx.row_subject.subject_type).toBe("candidate");
        expect(ctx.row_subject.subject_id).toBe("cand-c");
        expect(ctx.drawer_open.active_subject?.subject_type).toBe("candidate");
        expect(ctx.drawer_open.active_subject?.stage_key).toBe("waitlist");
    });

    it("case opportunity row remains case subject", () => {
        const [row] = attachLane(
            [
                {
                    id: "opp-3",
                    name: "Smith Household",
                    status_key: "tour_scheduled",
                    _status_display: "Tour scheduled",
                },
            ],
            "tours",
            "Tours",
        );

        const ctx = row._queue_row_context as { row_subject: { subject_type: string; subject_id: string } };
        expect(ctx.row_subject.subject_type).toBe("case");
        expect(ctx.row_subject.subject_id).toBe("opp-3");
    });

    it("buildDrawerSubjectContext enters subject_highlight for ocmrow context", () => {
        const [row] = attachLane(
            [
                {
                    id: enrollmentOffersChildQueueRowId("opp-1", "ocm-b"),
                    opportunity_id: "opp-1",
                    row_grain: "child",
                    opportunity_customer_member_id: "ocm-b",
                    _child_display_name: "Child B",
                    child_lifecycle_status: "offer_pending",
                    _child_lifecycle_grain_row: {
                        opportunity_customer_member_id: "ocm-b",
                        child_display_name: "Child B",
                        child_lifecycle_status: "offer_pending",
                    },
                },
            ],
            "enrollment_offers",
            "Enrolling",
        );

        const drawerCtx = buildDrawerSubjectContextFromQueueRowContext(
            row._queue_row_context as import("@/lib/workUnits/lifecycleSubjectContracts").QueueRowContext,
        );
        expect(drawerCtx?.focus_mode).toBe("subject_highlight");
        expect(drawerCtx?.active_subject?.subject_id).toBe("ocm-b");
    });

    it("queue card shows child subject line and does not suppress distinct child label", () => {
        const [row] = attachLane(
            [
                {
                    id: enrollmentOffersChildQueueRowId("opp-1", "ocm-b"),
                    opportunity_id: "opp-1",
                    row_grain: "child",
                    name: "Smith Household",
                    opportunity_customer_member_id: "ocm-b",
                    _child_display_name: "Child B",
                    child_lifecycle_status: "offer_pending",
                    _child_lifecycle_grain_row: {
                        opportunity_customer_member_id: "ocm-b",
                        child_display_name: "Child B",
                        child_lifecycle_status: "offer_pending",
                    },
                },
            ],
            "enrollment_offers",
            "Enrolling",
        );

        const record = applyQueueRowContextToLayoutRecord({
            id: row.id as string,
            name: "Smith Household",
            "customer.display_name": "Smith Household",
            _queue_row_context: row._queue_row_context,
        });

        expect(record["queue_row.subject_label"]).toBe("Child B");
        expect(isCaseGrainQueueRowContext(record)).toBe(false);
        expect(isQueueRowSubjectFieldVisible(record, "queue_row.subject_label")).toBe(true);
    });

    it("queue card suppresses duplicate subject only on case-grain rows", () => {
        const caseRecord = suppressDuplicateQueueRowSubjectOnRecord({
            "customer.display_name": "Smith Household",
            "queue_row.subject_label": "Smith Household",
            _queue_row_context: {
                row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Smith Household" },
            },
        });
        expect(caseRecord["queue_row.subject_label"]).toBeUndefined();
        expect(isCaseGrainQueueRowContext(caseRecord)).toBe(true);

        const childRecord = suppressDuplicateQueueRowSubjectOnRecord({
            "customer.display_name": "Smith Household",
            "queue_row.subject_label": "Child B",
            _queue_row_context: {
                row_subject: { subject_type: "child", subject_id: "ocm-b", display_name: "Child B" },
            },
        });
        expect(childRecord["queue_row.subject_label"]).toBe("Child B");
    });
});
