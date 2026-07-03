import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { applyEnrollmentTemplateToProcess } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { placementCandidateQueueRowId } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { enrollmentOffersChildQueueRowId } from "@/lib/queues/childGrainEnrollmentQueue";
import {
    isChildGrainLaneBuildersEnabled,
    readChildGrainLanesEnabledKeysFromEnv,
} from "@/lib/queues/childGrainLanesFeatureFlag";
import {
    __testing as ocmBuilderTesting,
    resolveOcmEnrollmentTrackLaneContext,
} from "@/lib/queues/ocmEnrollmentTrackQueueBuilder";
import { attachOpportunityQueueRowsWithRowContext } from "@/lib/workUnits/attachQueueRowContextToItems";
import {
    buildChildGrainQueueRowContext,
    isHonestChildCandidateGrainRow,
} from "@/lib/workUnits/buildChildGrainQueueRowContext";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

const v2Bundle = loadQueueDefinitionBundle(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2);

function withEnvChildGrainLanes(value: string | undefined, fn: () => void) {
    const prev = process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    if (value === undefined) delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    else process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = value;
    try {
        fn();
    } finally {
        if (prev === undefined) delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
        else process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = prev;
    }
}

describe("childGrainLanesFeatureFlag", () => {
    it("defaults to disabled when env unset", () => {
        withEnvChildGrainLanes(undefined, () => {
            expect(readChildGrainLanesEnabledKeysFromEnv()).toBeNull();
            expect(isChildGrainLaneBuildersEnabled("tours")).toBe(false);
        });
    });

    it("enables listed queue keys", () => {
        withEnvChildGrainLanes("tours,enrollment_completed", () => {
            expect(isChildGrainLaneBuildersEnabled("tours")).toBe(true);
            expect(isChildGrainLaneBuildersEnabled("enrollment_completed")).toBe(true);
            expect(isChildGrainLaneBuildersEnabled("new_leads")).toBe(false);
        });
    });

    it("supports all alias", () => {
        withEnvChildGrainLanes("all", () => {
            expect(isChildGrainLaneBuildersEnabled("waitlist")).toBe(true);
        });
    });

    it("auto-enables standard lanes when tracks_v1 configured without env", () => {
        const process = applyEnrollmentTemplateToProcess({
            id: "p1",
            key: ENROLLMENT_PROCESS_KEY,
            name: "Enrollment",
            primary_entity: "opportunity",
            sort_order: 0,
            is_active: true,
            stages: [],
        });
        const metadata = {
            [LIFECYCLE_BUILDER_METADATA_KEY]: {
                version: 1,
                active_process_id: process.id,
                processes: [process],
            },
        };
        withEnvChildGrainLanes(undefined, () => {
            expect(isChildGrainLaneBuildersEnabled("tours", metadata)).toBe(true);
            expect(isChildGrainLaneBuildersEnabled("enrollment_completed", metadata)).toBe(true);
            expect(isChildGrainLaneBuildersEnabled("new_leads", metadata)).toBe(false);
        });
    });
});

describe("ocmEnrollmentTrackQueueBuilder", () => {
    it("resolves lane context only when flag enabled", () => {
        withEnvChildGrainLanes(undefined, () => {
            expect(resolveOcmEnrollmentTrackLaneContext({ executableQueueKey: "tours" })).toBeNull();
        });
        withEnvChildGrainLanes("tours", () => {
            const ctx = resolveOcmEnrollmentTrackLaneContext({ executableQueueKey: "tours" });
            expect(ctx).toMatchObject({ stageKey: "tour", stageLabel: "Tour" });
        });
    });

    it("builds ocmrow id for Tour OCM row", () => {
        const lane = {
            enabled: true as const,
            queueKey: "tours",
            stageKey: "tour",
            stageLabel: "Tour",
            dispositionKeys: ["tour_scheduled"],
        };
        const row = ocmBuilderTesting.buildOcmEnrollmentTrackQueueRow(
            {
                id: "ocm-b",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: "tour_scheduled",
                program_category_id: "cat-preschool",
                location_program_categories: { key: "preschool", label: "Preschool" },
                schedule_type: "full_time",
                location_id: "loc-1",
                program_room_cohort_key: "room-a",
                start_date: "2026-09-01",
                updated_at: "2026-06-01",
                created_at: "2026-06-01",
                opportunities: {
                    id: "opp-1",
                    name: "Smith Household",
                    title: "Smith Household",
                    status_key: "open",
                    customer_id: "cust-1",
                    primary_person_id: null,
                    primary_contact_id: null,
                    work_unit_id: "wu-1",
                    location_id: "loc-1",
                    metadata: {},
                    created_at: "2026-06-01",
                    updated_at: "2026-06-01",
                },
                customer_members: {
                    id: "cm-1",
                    display_name: "Child B",
                    first_name: "Child",
                    last_name: "B",
                    dob: null,
                    person_id: "person-b",
                    relationship: "child",
                    is_active: true,
                },
            },
            {
                id: "opp-1",
                name: "Smith Household",
                _primary_contact_line: "Sarah Smith",
                _inquiry_children: [
                    {
                        ocm_id: "ocm-a",
                        display_name: "Child A",
                        outcome_status_key: "enrolled",
                        location_id: "loc-1",
                    },
                    {
                        ocm_id: "ocm-b",
                        display_name: "Child B",
                        outcome_status_key: "tour_scheduled",
                        location_id: "loc-1",
                        program_key: "preschool",
                    },
                ],
            },
            lane,
        );

        expect(row.id).toBe(enrollmentOffersChildQueueRowId("opp-1", "ocm-b"));
        expect(row.opportunity_id).toBe("opp-1");
        expect(row.row_grain).toBe("child");
        expect(row._row_subject_placement).toMatchObject({
            location_id: "loc-1",
            program_key: "preschool",
        });
    });
});

describe("buildChildGrainQueueRowContext", () => {
    const queue = {
        key: "tours",
        label: "Tours",
        lifecycle_key: "enrollment",
        stage_key: "tour",
        subject_grain: "child" as const,
    };

    const tourRow = {
        id: enrollmentOffersChildQueueRowId("opp-1", "ocm-b"),
        opportunity_id: "opp-1",
        opportunity_customer_member_id: "ocm-b",
        row_grain: "child",
        opportunity_status_key: "open",
        name: "Smith Household",
        _child_display_name: "Child B",
        child_lifecycle_status: "tour_scheduled",
        enrollment_track_stage_key: "tour",
        enrollment_track_stage_label: "Tour",
        _ocm_enrollment_track_row: {
            opportunity_customer_member_id: "ocm-b",
            opportunity_id: "opp-1",
            stage_key: "tour",
            stage_label: "Tour",
            outcome_status_key: "tour_scheduled",
            location_id: "loc-1",
            program_key: "preschool",
        },
        _row_subject_placement: {
            location_id: "loc-1",
            program_key: "preschool",
        },
        _inquiry_children: [
            {
                ocm_id: "ocm-a",
                display_name: "Child A",
                outcome_status_key: "enrolled",
                location_id: "loc-1",
            },
            {
                ocm_id: "ocm-b",
                display_name: "Child B",
                outcome_status_key: "tour_scheduled",
                location_id: "loc-1",
            },
        ],
    };

    it("detects honest child/candidate grain rows", () => {
        expect(isHonestChildCandidateGrainRow(tourRow)).toBe(true);
        expect(isHonestChildCandidateGrainRow({ id: "opp-1" })).toBe(false);
    });

    it("produces honest child row_subject and active_subject", () => {
        const ctx = buildChildGrainQueueRowContext({ row: tourRow, queue });
        expect(ctx).not.toBeNull();
        expect(ctx!.row_subject).toEqual({
            subject_type: "child",
            subject_id: "ocm-b",
            display_name: "Child B",
        });
        expect(ctx!.drawer_open.entity_id).toBe("opp-1");
        expect(ctx!.drawer_open.active_subject?.subject_type).toBe("child");
        expect(ctx!.drawer_open.active_subject?.subject_id).toBe("ocm-b");
        expect(ctx!.drawer_open.active_subject?.stage_key).toBe("tour");
        expect(ctx!.case_context.case_id).toBe("opp-1");
        expect(ctx!.placement_context).toMatchObject({
            location_id: "loc-1",
            program_key: "preschool",
        });
        expect(ctx!.related_subjects_summary).toHaveLength(1);
        expect(ctx!.related_subjects_summary[0]?.display_name).toBe("Child A");
    });

    it("produces honest candidate Waitlist row context", () => {
        const candidateRow = {
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
            _inquiry_children: [
                {
                    ocm_id: "ocm-x",
                    display_name: "Child C",
                    outcome_status_key: "waitlisted",
                    location_id: "loc-2",
                },
            ],
        };

        const ctx = buildChildGrainQueueRowContext({
            row: candidateRow,
            queue: {
                key: "waitlist",
                label: "Waitlist",
                lifecycle_key: "enrollment",
                stage_key: "waitlist",
                subject_grain: "candidate",
            },
        });

        expect(ctx!.row_subject.subject_type).toBe("candidate");
        expect(ctx!.row_subject.subject_id).toBe("cand-c");
        expect(ctx!.row_subject.display_name).toBe("Child C");
        expect(ctx!.drawer_open.active_subject?.subject_type).toBe("candidate");
        expect(ctx!.placement_context?.location_id).toBe("loc-2");
    });
});

describe("attachOpportunityQueueRowsWithRowContext flag gating", () => {
    const lane = {
        entityType: "opportunity",
        requestedQueueKey: "tours",
        executableQueueKey: "tours",
        queueLabel: "Tours",
        normalized: v2Bundle.normalized,
        lifecycleKey: "enrollment",
    };

    const childRow = {
        id: enrollmentOffersChildQueueRowId("opp-1", "ocm-b"),
        opportunity_id: "opp-1",
        opportunity_customer_member_id: "ocm-b",
        row_grain: "child",
        name: "Smith Household",
        status_key: "open",
        opportunity_status_key: "open",
        _child_display_name: "Child B",
        child_lifecycle_status: "tour_scheduled",
        _ocm_enrollment_track_row: {
            opportunity_customer_member_id: "ocm-b",
            stage_key: "tour",
            outcome_status_key: "tour_scheduled",
            location_id: "loc-1",
        },
        _row_subject_placement: { location_id: "loc-1", program_key: "preschool" },
    };

    const caseRow = {
        id: "opp-1",
        name: "Smith Household",
        status_key: "tour_scheduled",
        _status_display: "Tour scheduled",
    };

    let prevEnv: string | undefined;

    beforeEach(() => {
        prevEnv = process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    });

    afterEach(() => {
        if (prevEnv === undefined) delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
        else process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = prevEnv;
    });

    it("uses honest child context without flag (Phase B)", () => {
        delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
        const [attached] = attachOpportunityQueueRowsWithRowContext([childRow], lane);
        const ctx = attached._queue_row_context as {
            row_subject: { subject_type: string; subject_id: string };
        };
        expect(ctx.row_subject.subject_type).toBe("child");
        expect(ctx.row_subject.subject_id).toBe("ocm-b");
    });

    it("flag on enables OCM lane routing (Phase A)", () => {
        process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = "tours";
        expect(
            resolveOcmEnrollmentTrackLaneContext({ executableQueueKey: "tours" }),
        ).not.toBeNull();
    });

    it("keeps case-grain context for opportunity rows when flag on", () => {
        process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = "tours";
        const [attached] = attachOpportunityQueueRowsWithRowContext([caseRow], lane);
        const ctx = attached._queue_row_context as { row_subject: { subject_type: string } };
        expect(ctx.row_subject.subject_type).toBe("case");
    });
});
