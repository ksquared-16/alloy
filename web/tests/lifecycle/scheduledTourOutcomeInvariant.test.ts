/**
 * A terminal Tour outcome may not leave the same Tour scheduled.
 *
 * The plan below is staging's Tour stage (rev 45) with Conduct Tour bound to the platform
 * `record_tour_outcome` work definition: "Tour Completed — Interested" moves to Decision (terminal),
 * "No Show" stays and raises attention (not terminal), "Tour Scheduled" belongs to Schedule Tour.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { tourOutcomeDueAnchor } from "@/lib/lifecycle/instantiateStageWorkFromTemplate";
import {
    isTourOutcome,
    outcomeClosesScheduledTour,
    shiftTourOutcomeWorkDue,
} from "@/lib/lifecycle/scheduledTourOutcomeInvariant";
import { shouldCloseWorkAfterStageOutcome } from "@/lib/lifecycle/shouldCloseWorkAfterStageOutcome";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const departmentId = "33333333-3333-4333-8333-333333333333";
const workId = "44444444-4444-4444-8444-444444444444";
const opportunityId = "55555555-5555-4555-8555-555555555555";
const bookingId = "66666666-6666-4666-8666-666666666666";

const NOW = new Date("2026-10-16T18:00:00.000Z");
const FUTURE = { start_at: "2026-10-21T16:00:00.000Z", end_at: "2026-10-21T17:00:00.000Z" }; // 9:00 AM PT
const PAST = { start_at: "2026-10-15T16:00:00.000Z", end_at: "2026-10-15T17:00:00.000Z" };

const mockCompleteWorkInstance = vi.fn();
const mockExecuteStageOperatingOutcome = vi.fn();
const mockRollback = vi.fn(async () => [] as string[]);
const mockTrace = vi.fn(async () => ({ logged: true }) as { logged: boolean; error?: string });
const mockCancelTourBooking = vi.fn();
const mockMarkCompleted = vi.fn();
const mockStopReminders = vi.fn();

vi.mock("@/lib/admin/operationalWork/operationalWorkService", () => ({
    completeWorkInstance: (...a: unknown[]) => mockCompleteWorkInstance(...a),
}));
vi.mock("@/lib/lifecycle/patchLifecycleWorkIntentAttemptMetadata", () => ({
    patchLifecycleWorkIntentAttemptMetadata: vi.fn(async () => ({ ok: true, attempt_count: 1 })),
}));
vi.mock("@/lib/lifecycle/reopenStageWorkWithDueDate", () => ({
    reopenStageWorkWithDueDate: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/lifecycle/recordStageWorkContactOutcomeTrace", () => ({
    recordStageWorkContactOutcomeTrace: (...a: unknown[]) => mockTrace(...(a as [])),
}));
vi.mock("@/lib/lifecycle/executeStageOperatingOutcome", () => ({
    executeStageOperatingOutcome: (...a: unknown[]) => mockExecuteStageOperatingOutcome(...a),
    rollbackStageOperatingOutcome: (...a: unknown[]) => mockRollback(...(a as [])),
}));
vi.mock("@/lib/tours/bookings/tourBookingService", () => ({
    cancelTourBooking: (...a: unknown[]) => mockCancelTourBooking(...a),
    markTourBookingCompleted: (...a: unknown[]) => mockMarkCompleted(...a),
}));
vi.mock("@/lib/tours/comms/tourSchedulingScheduledSends", () => ({
    cancelPendingTourSchedulingRemindersForBooking: (...a: unknown[]) => mockStopReminders(...a),
}));

const tourPlan: StageOperatingPlanV1 = {
    version: 1,
    stage_key: "tour",
    lifecycle_key: "enrollment",
    purpose: "Book and conduct tours.",
    journey_segment: "family",
    outcomes: [
        { outcome_key: "outcome_1", label: "Tour Scheduled", successful: true, completes_work: true, work_template_key: "work_1" },
        { outcome_key: "outcome_7", label: "Tour Completed — Interested" },
        { outcome_key: "outcome_10", label: "No Show" },
    ],
    outcome_rules: [
        { rule_key: "outcome_1_automation_1", when_outcome_key: "outcome_1", targets: [{ kind: "no_movement" }] },
        { rule_key: "outcome_7_behavior", when_outcome_key: "outcome_7", targets: [{ kind: "move_to_stage", transition_ref: "tour_transition_2" }] },
        {
            rule_key: "outcome_10_behavior",
            when_outcome_key: "outcome_10",
            targets: [
                { kind: "no_movement" },
                { kind: "create_needs_attention", wait_bucket: "waiting_on_staff", attention_reason: "Family no show." },
            ],
        },
    ],
    work_templates: [
        {
            template_key: "work_1",
            label: "Schedule Tour",
            required: false,
            due_policy: { kind: "offset_days", days: 1 },
            owner_strategy: "record_owner",
            work_definition_key: "manual_ad_hoc",
            outcome_refs: [{ outcome_ref: "outcome_1" }],
        },
        {
            template_key: "work_3",
            label: "Conduct Tour",
            primary: true,
            required: false,
            due_policy: { kind: "offset_days", days: 1 },
            owner_strategy: "record_owner",
            work_definition_key: "record_tour_outcome",
            execution_mode: "outcome_led",
            outcome_refs: [{ outcome_ref: "outcome_7" }, { outcome_ref: "outcome_10" }],
        },
    ],
    attention_rules: [],
    outgoing_transitions: [
        { transition_ref: "tour_transition_2", label: "Move to Decision", available: true, source_stage_key: "tour", target_stage_key: "decision" },
    ],
} as unknown as StageOperatingPlanV1;

const metadata = {
    [LIFECYCLE_BUILDER_METADATA_KEY]: {
        version: 1,
        active_process_id: "proc",
        processes: [
            {
                id: "proc",
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                stages: [
                    { id: "s-tour", key: "tour", label: "Tour", sort_order: 1, is_active: true, grain: "family", stage_operating_plan_v1: tourPlan },
                    { id: "s-decision", key: "decision", label: "Decision", sort_order: 2, is_active: true, grain: "family" },
                ],
            },
        ],
    },
};

type Booking = { id: string; opportunity_id: string; status_key: string; start_at: string; end_at: string; timezone: string; canceled_at: null; canceled_by: null; cancel_reason: null };
let activeBookings: Booking[] = [];
const bookingUpdates: unknown[] = [];
const rpcCalls: unknown[] = [];

function booking(times: { start_at: string; end_at: string }, status = "confirmed"): Booking {
    return { id: bookingId, opportunity_id: opportunityId, status_key: status, ...times, timezone: "America/Los_Angeles", canceled_at: null, canceled_by: null, cancel_reason: null };
}

function chain(result: () => unknown) {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "update", "filter"]) c[m] = vi.fn(() => c);
    c.limit = vi.fn(async () => result());
    c.maybeSingle = vi.fn(async () => result());
    c.then = (resolve: (v: unknown) => void) => resolve(result());
    return c;
}

const supabase = {
    from: vi.fn((table: string) => {
        if (table === "departments") return chain(() => ({ data: { metadata }, error: null }));
        if (table === "operational_tasks") return chain(() => ({ data: { status: "open", due_at: null, metadata: {} }, error: null }));
        if (table === "tour_bookings") {
            const c = chain(() => ({ data: activeBookings, error: null }));
            c.update = vi.fn((patch: unknown) => {
                bookingUpdates.push(patch);
                return c;
            });
            return c;
        }
        throw new Error(`unexpected table ${table}`);
    }),
    rpc: vi.fn(async (...a: unknown[]) => {
        rpcCalls.push(a);
        return { error: null };
    }),
};

const record = (outcomeKey: string, extra: Record<string, unknown> = {}) =>
    completeStageWorkWithOutcome({
        supabase: supabase as never,
        orgId,
        userId,
        departmentId,
        stageKey: "tour",
        workId,
        outcomeKey,
        subject: { journey_segment: "family", opportunity_id: opportunityId },
        now: NOW,
        ...extra,
    });

describe("a terminal Tour outcome may not leave the same Tour scheduled", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        activeBookings = [];
        bookingUpdates.length = 0;
        rpcCalls.length = 0;
        mockCompleteWorkInstance.mockResolvedValue({ ok: true, row: { id: workId, status: "completed" } });
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [{ kind: "move_to_stage", stage_key: "decision" }],
            failed_targets: [],
            errors: [],
            degraded: [],
            queue_refresh_opportunity_id: opportunityId,
            needs_attention_set: false,
            status_updated: false,
            undo: [],
        });
        mockTrace.mockResolvedValue({ logged: true });
        mockCancelTourBooking.mockImplementation(async () => ({ ...activeBookings[0], status_key: "canceled" }));
        mockMarkCompleted.mockImplementation(async () => ({ ...activeBookings[0], status_key: "completed" }));
        mockStopReminders.mockResolvedValue({ ok: true, canceledIds: ["r1"], canceledCount: 1 });
    });

    it("classifies from configuration: the outcome's work is record_tour_outcome and it closes the work", () => {
        expect(isTourOutcome(tourPlan, "outcome_7")).toBe(true);
        expect(isTourOutcome(tourPlan, "outcome_10")).toBe(true);
        // Successful, but Schedule Tour's outcome — not a Tour outcome; must never close the tour it scheduled.
        expect(isTourOutcome(tourPlan, "outcome_1")).toBe(false);
        expect(outcomeClosesScheduledTour(tourPlan, "outcome_7", shouldCloseWorkAfterStageOutcome(tourPlan, "outcome_7"))).toBe(true);
        expect(outcomeClosesScheduledTour(tourPlan, "outcome_10", shouldCloseWorkAfterStageOutcome(tourPlan, "outcome_10"))).toBe(false);
        expect(outcomeClosesScheduledTour(tourPlan, "outcome_1", shouldCloseWorkAfterStageOutcome(tourPlan, "outcome_1"))).toBe(false);
    });

    it("future tour + terminal outcome → asks for confirmation and writes nothing", async () => {
        activeBookings = [booking(FUTURE)];
        const result = await record("outcome_7");
        expect(result.ok).toBe(false);
        expect(result.changed).toBe(false);
        expect(result.confirmation_required?.kind).toBe("tour_still_scheduled");
        expect(result.confirmation_required?.message).toBe(
            "This Tour is still scheduled for Oct 21, 9:00 AM. Recording this outcome will close the scheduled Tour. Continue?",
        );
        expect(mockCompleteWorkInstance).not.toHaveBeenCalled();
        expect(mockExecuteStageOperatingOutcome).not.toHaveBeenCalled();
        expect(mockCancelTourBooking).not.toHaveBeenCalled();
        expect(mockMarkCompleted).not.toHaveBeenCalled();
    });

    it("declining the confirmation is simply not resubmitting: the API refuses again, still writing nothing", async () => {
        activeBookings = [booking(FUTURE)];
        await record("outcome_7");
        const again = await record("outcome_7", { confirmCloseScheduledTour: false });
        expect(again.confirmation_required).toBeDefined();
        expect(mockCompleteWorkInstance).not.toHaveBeenCalled();
        expect(mockCancelTourBooking).not.toHaveBeenCalled();
    });

    it("confirmed → the outcome applies and the scheduled tour closes (cancelled, reminders stopped, no notice)", async () => {
        activeBookings = [booking(FUTURE)];
        const result = await record("outcome_7", { confirmCloseScheduledTour: true });
        expect(result.ok).toBe(true);
        expect(mockCompleteWorkInstance).toHaveBeenCalledTimes(1);
        expect(mockExecuteStageOperatingOutcome).toHaveBeenCalledTimes(1);
        expect(mockCancelTourBooking).toHaveBeenCalledWith(
            supabase,
            orgId,
            bookingId,
            expect.objectContaining({
                canceledBy: userId,
                cancelReason: "Closed by outcome: Tour Completed — Interested",
                deferLifecycleComms: true,
            }),
        );
        expect(mockStopReminders).toHaveBeenCalledWith(expect.objectContaining({ tourBookingId: bookingId, opportunityId }));
        expect(result.scheduled_tour_closed).toMatchObject({ booking_id: bookingId, closed_as: "canceled" });
    });

    it("future tour + non-terminal outcome → the tour stays scheduled", async () => {
        activeBookings = [booking(FUTURE)];
        const result = await record("outcome_10");
        expect(result.ok).toBe(true);
        expect(result.confirmation_required).toBeUndefined();
        expect(mockCancelTourBooking).not.toHaveBeenCalled();
        expect(mockMarkCompleted).not.toHaveBeenCalled();
        expect(result.scheduled_tour_closed).toBeUndefined();
    });

    it("past tour + terminal outcome → no question; the tour is marked completed", async () => {
        activeBookings = [booking(PAST)];
        const result = await record("outcome_7");
        expect(result.ok).toBe(true);
        expect(mockMarkCompleted).toHaveBeenCalledWith(supabase, orgId, bookingId, expect.objectContaining({ actorUserId: userId }));
        expect(mockCancelTourBooking).not.toHaveBeenCalled();
        expect(result.scheduled_tour_closed).toMatchObject({ closed_as: "completed" });
    });

    it("a past tour that was never confirmed is cancelled, not completed", async () => {
        activeBookings = [booking(PAST, "requested")];
        const result = await record("outcome_7");
        expect(result.ok).toBe(true);
        expect(mockCancelTourBooking).toHaveBeenCalled();
        expect(mockMarkCompleted).not.toHaveBeenCalled();
    });

    it("a rescheduled tour is judged by its current time", async () => {
        // Was ahead; rescheduled to a time that has now passed — the booking row carries the new time.
        activeBookings = [booking(PAST, "confirmed")];
        const result = await record("outcome_7");
        expect(result.confirmation_required).toBeUndefined();
        expect(mockMarkCompleted).toHaveBeenCalled();
    });

    it("replay: once the tour is closed there is nothing left to close, and no second question", async () => {
        activeBookings = [booking(FUTURE)];
        await record("outcome_7", { confirmCloseScheduledTour: true });
        activeBookings = [];
        const replay = await record("outcome_7");
        expect(replay.confirmation_required).toBeUndefined();
        expect(mockCancelTourBooking).toHaveBeenCalledTimes(1);
    });

    it("a later step failing reopens the tour it closed", async () => {
        activeBookings = [booking(PAST)];
        mockTrace.mockResolvedValue({ logged: false, error: "trace down" });
        const result = await record("outcome_7");
        expect(result.ok).toBe(false);
        expect(mockMarkCompleted).toHaveBeenCalled();
        expect(bookingUpdates).toContainEqual(expect.objectContaining({ status_key: "confirmed" }));
        expect(rpcCalls).toContainEqual(["maintain_opportunity_tour_facts", { p_org_id: orgId, p_opportunity_id: opportunityId }]);
    });

    it("with no active tour the outcome records exactly as before", async () => {
        const result = await record("outcome_7");
        expect(result.ok).toBe(true);
        expect(mockCancelTourBooking).not.toHaveBeenCalled();
        expect(mockMarkCompleted).not.toHaveBeenCalled();
    });
});

describe("Record Tour Outcome is due after the tour, and follows it", () => {
    beforeEach(() => {
        activeBookings = [];
    });

    it("anchors to the scheduled end of the active tour", async () => {
        activeBookings = [booking(FUTURE)];
        const anchor = await tourOutcomeDueAnchor({ supabase: supabase as never, orgId, opportunityId }, "record_tour_outcome", NOW);
        expect(anchor.toISOString()).toBe(FUTURE.end_at);
    });

    it("other work, or no tour, keeps the creation time", async () => {
        activeBookings = [booking(FUTURE)];
        expect((await tourOutcomeDueAnchor({ supabase: supabase as never, orgId, opportunityId }, "contact_family", NOW)).toISOString()).toBe(NOW.toISOString());
        activeBookings = [];
        expect((await tourOutcomeDueAnchor({ supabase: supabase as never, orgId, opportunityId }, "record_tour_outcome", NOW)).toISOString()).toBe(NOW.toISOString());
    });

    it("a reschedule moves open outcome work by exactly the amount the tour moved", async () => {
        const updates: Array<Record<string, unknown>> = [];
        const tasks = [{ id: "t1", due_at: "2026-10-22T17:00:00.000Z" }];
        const sb = {
            from: vi.fn(() => {
                const c = chain(() => ({ data: tasks, error: null }));
                c.update = vi.fn((patch: Record<string, unknown>) => {
                    updates.push(patch);
                    return chain(() => ({ error: null }));
                });
                return c;
            }),
        };
        const r = await shiftTourOutcomeWorkDue({
            supabase: sb as never,
            orgId,
            opportunityId,
            previousEndAt: "2026-10-21T17:00:00.000Z",
            nextEndAt: "2026-10-23T19:00:00.000Z",
        });
        expect(r.shifted).toBe(1);
        expect(updates[0]?.due_at).toBe("2026-10-24T19:00:00.000Z");
    });
});
