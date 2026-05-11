import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue("workflow-event-id-1"),
}));

vi.mock("@/lib/workflowRun", () => ({
    executeWorkflowRun: vi.fn().mockResolvedValue({ ok: true, status: "completed", workflow_run_id: "run-1" }),
}));

import { emitEvent } from "@/lib/emitEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";
import { emitTourBookingLifecycleEvent } from "@/lib/tours/events/tourLifecycleEvents";

describe("emitTourBookingLifecycleEvent", () => {
    beforeEach(() => {
        vi.mocked(emitEvent).mockClear();
        vi.mocked(executeWorkflowRun).mockClear();
    });

    const sampleRow = (): TourBookingRow => ({
        id: "book-1",
        org_id: "org-1",
        opportunity_id: "opp-1",
        location_id: "loc-1",
        primary_person_id: null,
        primary_contact_id: null,
        requested_by_user_id: "user-1",
        start_at: "2026-05-11T14:00:00.000Z",
        end_at: "2026-05-11T15:00:00.000Z",
        timezone: "UTC",
        status_key: "confirmed",
        source: "admin",
        form_submission_id: null,
        form_public_link_id: null,
        canceled_at: null,
        canceled_by: null,
        cancel_reason: null,
        rescheduled_from_booking_id: null,
        metadata: {},
        created_at: "2026-05-11T13:00:00.000Z",
        updated_at: "2026-05-11T13:00:00.000Z",
    });

    it("calls emitEvent with tour_bookings entity and payload fields", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                or: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
        } as never;

        const row = sampleRow();
        await emitTourBookingLifecycleEvent(supabase, "tour_confirmed", row, { previous_status_key: "pending_approval" }, {
            correlation_id: "corr-1",
            actor_user_id: "user-1",
        });

        expect(emitEvent).toHaveBeenCalledTimes(1);
        const arg = vi.mocked(emitEvent).mock.calls[0]![0];
        expect(arg.event_type).toBe("tour_confirmed");
        expect(arg.entity_type).toBe("tour_bookings");
        expect(arg.entity_id).toBe("book-1");
        expect(arg.org_id).toBe("org-1");
        expect(arg.payload).toMatchObject({
            booking_id: "book-1",
            opportunity_id: "opp-1",
            location_id: "loc-1",
            start_at: row.start_at,
            end_at: row.end_at,
            timezone: "UTC",
            status_key: "confirmed",
            source: "admin",
            previous_status_key: "pending_approval",
            correlation_id: "corr-1",
            actor_user_id: "user-1",
        });
        expect(arg.payload).not.toHaveProperty("tour_scheduled");
    });

    it("fans out executeWorkflowRun when workflows match", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                or: vi.fn().mockResolvedValue({ data: [{ id: "wf-99" }], error: null }),
            })),
        } as never;

        await emitTourBookingLifecycleEvent(supabase, "tour_canceled", sampleRow(), {}, undefined);
        expect(executeWorkflowRun).toHaveBeenCalledWith(
            supabase,
            "wf-99",
            expect.objectContaining({ event_type: "tour_canceled", entity_type: "tour_bookings" }),
            expect.objectContaining({ event_id: "workflow-event-id-1", org_id: "org-1" })
        );
    });
});
