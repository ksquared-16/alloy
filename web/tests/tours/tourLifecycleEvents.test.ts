import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue("workflow-event-id-1"),
}));

vi.mock("@/lib/workflowRun", () => ({
    executeWorkflowRun: vi.fn().mockResolvedValue({ ok: true, status: "completed", workflow_run_id: "run-1" }),
}));

const loadStateMock = vi.fn();
vi.mock("@/lib/tours/comms/tourCommsEligibility", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/tours/comms/tourCommsEligibility")>();
    return { ...actual, loadTourCommsAuthoritativeState: (...a: unknown[]) => loadStateMock(...a) };
});

import { emitEvent } from "@/lib/emitEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";
import { emitTourBookingLifecycleEvent } from "@/lib/tours/events/tourLifecycleEvents";

describe("emitTourBookingLifecycleEvent", () => {
    beforeEach(() => {
        vi.mocked(emitEvent).mockClear();
        vi.mocked(executeWorkflowRun).mockClear();
        loadStateMock.mockReset();
        loadStateMock.mockResolvedValue({
            booking: { status_key: "confirmed", start_at: "2099-01-01T00:00:00.000Z" },
            opportunityAccepted: true,
            row: null,
        });
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

    // S1-F. A workflow keyed on a tour event may still log, assign and open work — but it may
    // only MESSAGE when the booking, as it is in the database now, may be talked about.
    describe("workflow outbound messaging is gated on the booking's current state", () => {
        const withWorkflows = () =>
            ({
                from: vi.fn(() => ({
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    or: vi.fn().mockResolvedValue({ data: [{ id: "wf-1" }], error: null }),
                })),
            }) as never;
        const refusalPassed = () =>
            (vi.mocked(executeWorkflowRun).mock.calls[0]![3] as { outboundMessagingRefusedReason?: string | null })
                .outboundMessagingRefusedReason;

        it("tour_booking_pending on a pending booking: the workflow runs, its messaging is refused", async () => {
            loadStateMock.mockResolvedValue({
                booking: { status_key: "pending_approval", start_at: "2099-01-01T00:00:00.000Z" },
                opportunityAccepted: true,
                row: null,
            });
            await emitTourBookingLifecycleEvent(withWorkflows(), "tour_booking_pending", { ...sampleRow(), status_key: "pending_approval" });
            expect(executeWorkflowRun).toHaveBeenCalledTimes(1);
            expect(refusalPassed()).toBe("tour_comms_ineligible:awaiting_approval");
        });

        it("tour_rescheduled on a still-pending booking is refused too — the event name grants nothing", async () => {
            loadStateMock.mockResolvedValue({
                booking: { status_key: "pending_approval", start_at: "2099-01-01T00:00:00.000Z" },
                opportunityAccepted: true,
                row: null,
            });
            await emitTourBookingLifecycleEvent(withWorkflows(), "tour_rescheduled", { ...sampleRow(), status_key: "pending_approval" });
            expect(refusalPassed()).toBe("tour_comms_ineligible:awaiting_approval");
        });

        it("tour_confirmed on a confirmed booking: messaging is allowed", async () => {
            await emitTourBookingLifecycleEvent(withWorkflows(), "tour_confirmed", sampleRow());
            expect(refusalPassed()).toBeNull();
        });

        it("tour_canceled after a confirmed tour is allowed; after a never-confirmed request it is not", async () => {
            loadStateMock.mockResolvedValue({
                booking: { status_key: "canceled", start_at: "2099-01-01T00:00:00.000Z" },
                opportunityAccepted: true,
                row: null,
            });
            await emitTourBookingLifecycleEvent(withWorkflows(), "tour_canceled", sampleRow(), { previous_status_key: "confirmed" });
            expect(refusalPassed()).toBeNull();
            vi.mocked(executeWorkflowRun).mockClear();
            await emitTourBookingLifecycleEvent(withWorkflows(), "tour_canceled", sampleRow(), {
                previous_status_key: "pending_approval",
            });
            expect(refusalPassed()).toBe("tour_comms_ineligible:never_confirmed");
        });

        it("fails closed when the booking cannot be read", async () => {
            loadStateMock.mockRejectedValue(new Error("db down"));
            await emitTourBookingLifecycleEvent(withWorkflows(), "tour_confirmed", sampleRow());
            expect(refusalPassed()).toBe("tour_comms_ineligible:eligibility_unavailable");
        });

        it("reads nothing when no workflow listens", async () => {
            const supabase = {
                from: vi.fn(() => ({
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    or: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
            } as never;
            await emitTourBookingLifecycleEvent(supabase, "tour_booking_pending", sampleRow());
            expect(loadStateMock).not.toHaveBeenCalled();
        });
    });
});
