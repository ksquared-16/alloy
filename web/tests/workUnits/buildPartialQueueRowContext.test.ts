import { describe, expect, it } from "vitest";
import {
    attachPartialQueueRowContext,
    buildPartialQueueRowContext,
    buildWorkUnitSurfaceContextFromRows,
    resolveBoringCaseStatusLabel,
} from "@/lib/workUnits/buildPartialQueueRowContext";

describe("buildPartialQueueRowContext", () => {
    const queue = { key: "tours", label: "Tours", lifecycle_key: "enrollment", stage_key: "tour" };

    it("builds case-grain context from enriched opportunity row", () => {
        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Smith Household",
                status_key: "tour_scheduled",
                _status_display: "Tour scheduled",
                _primary_contact_line: "Sarah Smith",
                _primary_phone: "555-0100",
            },
            queue,
        });

        expect(ctx.contract_version).toBe("1.1-partial");
        expect(ctx.row_subject).toEqual({
            subject_type: "case",
            subject_id: "opp-1",
            display_name: "Smith Household",
        });
        expect(ctx.row_stage).toBe("Tours");
        expect(ctx.lifecycle_key).toBe("enrollment");
        expect(ctx.row_status_key).toBe("tour_scheduled");
        expect(ctx.row_status_label).toBe("Tour scheduled");
        expect(ctx.case_context.case_id).toBe("opp-1");
        expect(ctx.case_context.display_name).toBe("Smith Household");
        expect(ctx.primary_contact?.display_name).toBe("Sarah Smith");
        expect(ctx.drawer_open.entity_id).toBe("opp-1");
        expect(ctx.drawer_open.active_subject.subject_type).toBe("case");
        expect(ctx.drawer_open.active_subject.stage_key).toBe("tour");
    });

    it("maps boring case label for open-like keys", () => {
        expect(resolveBoringCaseStatusLabel("open", "Open")).toBe("Active");
        expect(resolveBoringCaseStatusLabel("new_inquiry", "New inquiry")).toBe("Active");
        expect(resolveBoringCaseStatusLabel("lost", "Lost")).toBe("Closed");
    });

    it("builds related_subjects_summary from metadata.inquiry_children", () => {
        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Smith Household",
                status_key: "open",
                metadata: {
                    inquiry_children: [
                        {
                            id: "ocm-a",
                            display_name: "Child A",
                            outcome_status_key: "enrolled",
                            outcome_status_label: "Enrolled",
                        },
                        {
                            id: "ocm-b",
                            display_name: "Child B",
                            outcome_status_key: "tour_scheduled",
                            outcome_status_label: "Touring",
                        },
                        {
                            id: "ocm-c",
                            display_name: "Child C",
                            outcome_status_key: "waitlisted",
                            outcome_status_label: "Waitlisted",
                        },
                    ],
                },
            },
            queue,
        });

        expect(ctx.related_subjects_summary).toHaveLength(3);
        expect(ctx.related_subjects_summary.map((s) => s.status_label)).toEqual([
            "Enrolled",
            "Touring",
            "Waitlisted",
        ]);
    });

    it("populates placement_context when one inquiry child has placement", () => {
        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Smith Household",
                status_key: "tour_scheduled",
                _inquiry_children: [
                    {
                        id: "ocm-b",
                        display_name: "Child B",
                        outcome_status_key: "tour_scheduled",
                        location_id: "loc-1",
                        location_label: "North Campus",
                        desired_program_type: "infant",
                        desired_program_label: "Infant",
                        program_room_cohort_key: "room-a",
                        program_room_cohort_label: "Infant A",
                        desired_schedule_type: "full_time",
                        desired_schedule_label: "Full time",
                    },
                ],
            },
            queue,
        });

        expect(ctx.placement_context).toEqual({
            location_id: "loc-1",
            location_label: "North Campus",
            program_key: "infant",
            program_label: "Infant",
            room_id: "room-a",
            room_label: "Infant A",
            schedule_key: "full_time",
            schedule_label: "Full time",
        });
    });

    it("does not fake placement_context when children have distinct placements", () => {
        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Smith Household",
                status_key: "open",
                _inquiry_children: [
                    {
                        id: "ocm-a",
                        display_name: "Child A",
                        location_id: "loc-1",
                        location_label: "Site 1",
                        desired_program_type: "infant",
                    },
                    {
                        id: "ocm-b",
                        display_name: "Child B",
                        location_id: "loc-2",
                        location_label: "Site 2",
                        desired_program_type: "preschool",
                    },
                ],
            },
            queue,
        });

        expect(ctx.placement_context).toBeUndefined();
    });

    it("uses shared placement when all children match", () => {
        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Smith Household",
                status_key: "tour_scheduled",
                _inquiry_children: [
                    {
                        id: "ocm-a",
                        display_name: "Child A",
                        location_id: "loc-1",
                        location_label: "North Campus",
                        desired_program_type: "infant",
                    },
                    {
                        id: "ocm-b",
                        display_name: "Child B",
                        location_id: "loc-1",
                        location_label: "North Campus",
                        desired_program_type: "infant",
                    },
                ],
            },
            queue,
        });

        expect(ctx.placement_context?.location_id).toBe("loc-1");
        expect(ctx.placement_context?.program_key).toBe("infant");
    });

    it("related_subjects_summary includes placement labels when present", () => {
        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Smith Household",
                status_key: "open",
                metadata: {
                    inquiry_children: [
                        {
                            id: "ocm-a",
                            display_name: "Child A",
                            outcome_status_label: "Enrolled",
                            location_id: "loc-1",
                            location_label: "North Campus",
                            desired_program_label: "Infant",
                            program_room_cohort_label: "Infant A",
                            desired_schedule_label: "Full time",
                        },
                    ],
                },
            },
            queue,
        });

        expect(ctx.related_subjects_summary[0]).toMatchObject({
            display_name: "Child A",
            status_label: "Enrolled",
            location_label: "North Campus",
            program_label: "Infant",
            room_label: "Infant A",
            schedule_label: "Full time",
        });
    });

    it("missing inquiry children does not crash and leaves placement unset", () => {
        const ctx = buildPartialQueueRowContext({
            row: { id: "opp-1", name: "Empty Case", status_key: "new_inquiry" },
            queue,
        });

        expect(ctx.placement_context).toBeUndefined();
        expect(ctx.related_subjects_summary).toEqual([]);
        expect(ctx.row_subject.subject_type).toBe("case");
    });

    it("attaches _queue_row_context without mutating source row fields", () => {
        const row = { id: "opp-2", name: "Jones Family", status_key: "new_inquiry" };
        const out = attachPartialQueueRowContext(row, { key: "new_leads", label: "New Leads" });
        expect(out._queue_row_context).toBeDefined();
        expect((out._queue_row_context as { row_stage: string }).row_stage).toBe("New Leads");
        expect(row).not.toHaveProperty("_queue_row_context");
    });

    it("builds WorkUnitSurfaceContext from rows", () => {
        const surface = buildWorkUnitSurfaceContextFromRows({
            work_unit_id: "wu-1",
            queue_key: "tours",
            queue,
            rows: [{ id: "opp-1", name: "Smith Household", status_key: "tour_scheduled" }],
        });

        expect(surface.work_unit_id).toBe("wu-1");
        expect(surface.queue_grain).toBe("case");
        expect(surface.rows).toHaveLength(1);
        expect(surface.rows[0]!.queue_row_context.row_subject.subject_type).toBe("case");
    });

    it("projects attention and recommendation when present on row", () => {
        const ctx = buildPartialQueueRowContext({
            row: {
                id: "opp-1",
                name: "Smith",
                status_key: "tour_scheduled",
                _needs_attention: true,
                _attention_reason_label: "Tour date passed",
                _operational_recommendation_preview: {
                    suggested_action_label: "Record tour outcome",
                    suggested_action_key: "record_tour_outcome",
                },
            },
            queue,
        });

        expect(ctx.attention_summary).toEqual({
            needs_attention: true,
            primary_reason_label: "Tour date passed",
        });
        expect(ctx.next_best_action?.label).toBe("Record tour outcome");
        expect(ctx.next_best_action?.action_key).toBe("record_tour_outcome");
    });
});
