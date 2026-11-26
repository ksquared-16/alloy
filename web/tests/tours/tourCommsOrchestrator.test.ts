import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_TOUR_COMMS_CONFIG } from "@/lib/tours/comms/tourCommsConfig";
import type { LoadedTourCommsContext } from "@/lib/tours/comms/loadTourCommsContext";
import type { TourCommsParentRecipient } from "@/lib/tours/comms/resolveTourCommsRecipient";
import type { TourCommsOrchestratorDeps } from "@/lib/tours/comms/tourCommsOrchestrator";
import {
    buildTourCommsImmediateIdempotencyKey,
    orchestrateTourBookingCanceled,
    orchestrateTourBookingCompleted,
    orchestrateTourBookingConfirmed,
    orchestrateTourBookingNoShow,
    orchestrateTourBookingRescheduled,
    orchestrateTourCommsForBooking,
    runTourCommsOrchestratorBestEffort,
} from "@/lib/tours/comms/tourCommsOrchestrator";
import type { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";
const LOCATION = "66666666-6666-4666-8666-666666666666";

type EnqueueParams = Parameters<typeof enqueueCanonicalOutboundMessage>[0];

const mockRecipient = vi.fn<(params: unknown) => Promise<TourCommsParentRecipient | null>>();

function firstEnqueueCall(deps: ReturnType<typeof makeDeps>): EnqueueParams | undefined {
    const calls = vi.mocked(deps.enqueueImmediate).mock.calls as unknown as Array<[EnqueueParams]>;
    return calls[0]?.[0];
}

vi.mock("@/lib/tours/comms/resolveTourCommsRecipient", () => ({
    resolveTourCommsParentRecipient: (params: unknown) => mockRecipient(params as never),
    tourCommsRecipientHasChannel: (rec: TourCommsParentRecipient, ch: string) =>
        ch === "email" ? Boolean(rec.email?.trim()) : Boolean(rec.smsTo?.trim()),
}));

const bookingRow = (): TourBookingRow => ({
    id: BOOKING,
    org_id: ORG,
    opportunity_id: OPP,
    location_id: LOCATION,
    primary_person_id: PERSON,
    primary_contact_id: null,
    requested_by_user_id: null,
    // In the future: a reminder for a tour that has started is refused by policy.
    start_at: "2099-06-16T12:00:00.000Z",
    end_at: "2099-06-16T13:00:00.000Z",
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
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:00:00.000Z",
});

const loadedContext = (): LoadedTourCommsContext => ({
    booking: bookingRow(),
    opportunity: {
        id: OPP,
        name: "Alex",
        primary_person_id: PERSON,
        primary_contact_id: null,
        location_id: LOCATION,
        stage_key: "waitlist",
        status_key: "open",
    },
    orgName: "Test Org",
    orgTimezoneIana: "UTC",
    templateContext: {
        orgName: "Test Org",
        locationName: "Main Campus",
        tourStartAt: bookingRow().start_at,
        tourEndAt: bookingRow().end_at,
        timezone: "UTC",
        parentName: "Jordan",
        childName: "Alex",
        opportunityName: "Alex",
        tourDisplayLabel: "Mon, Jun 16 at 12:00 PM",
    },
});

function makeDeps(overrides: {
    enabled?: boolean;
    smsEnabled?: boolean;
    existingIdempotency?: boolean;
    /** What the database holds NOW. Default: exactly the row the caller passes. */
    dbBooking?: TourBookingRow | null;
    /** False = the opportunity is missing (lead never accepted). */
    opportunityAccepted?: boolean;
} = {}) {
    const enqueueImmediate = vi.fn(async () => ({
        communicationMessageId: "msg-1",
        threadId: "thread-1",
        skippedReason: undefined,
    }));
    const triggerQueue = vi.fn(async () => ({ attempted: true, status: 200 }));
    const scheduleReminders = vi.fn(async () => ({ ok: true as const, scheduled: [{ id: "sched-1" }], suppressed: [] }));
    const replaceReminders = vi.fn(async () => ({
        ok: true as const,
        scheduled: [{ id: "sched-2" }],
        suppressed: [],
        canceledIds: ["old-1"],
        canceledCount: 1,
    }));
    const cancelReminders = vi.fn(async () => ({ ok: true as const, canceledIds: ["old-1"], canceledCount: 1 }));
    const hasExistingImmediateSend = vi.fn(async () => overrides.existingIdempotency ?? false);

    const enabled = overrides.enabled ?? true;
    const resolveConfig = vi.fn(async () => ({
        config: {
            ...DEFAULT_TOUR_COMMS_CONFIG,
            enabled,
            channels: { email: true, sms: overrides.smsEnabled ?? false },
            quiet_hours: { ...DEFAULT_TOUR_COMMS_CONFIG.quiet_hours, enabled: false },
        },
        sources: { org: false, location: false },
    }));

    const loadContext = vi.fn(async () => loadedContext());
    const loadBookingState = vi.fn(async (_sb: unknown, params: { orgId: string; bookingId: string }) => {
        const row = overrides.dbBooking === undefined ? lastPassedBooking : overrides.dbBooking;
        if (!row || row.id !== params.bookingId || row.org_id !== params.orgId) {
            return { booking: null, opportunityAccepted: false, row: null };
        }
        return {
            booking: { status_key: row.status_key, start_at: row.start_at },
            opportunityAccepted: overrides.opportunityAccepted ?? true,
            row,
        };
    });
    const sendInternalCalendarInvite = vi.fn(async () => ({ ok: true }));

    return {
        enqueueImmediate,
        triggerQueue,
        scheduleReminders,
        replaceReminders,
        cancelReminders,
        hasExistingImmediateSend,
        resolveConfig,
        loadContext,
        loadBookingState,
        sendInternalCalendarInvite,
    };
}

/** The row most recently handed to an orchestrator entry point — the default DB state. */
let lastPassedBooking: TourBookingRow | null = null;
function passed(row: TourBookingRow): TourBookingRow {
    lastPassedBooking = row;
    return row;
}

describe("tourCommsOrchestrator", () => {
    beforeEach(() => {
        mockRecipient.mockResolvedValue({
            personId: PERSON,
            displayName: "Jordan",
            email: "parent@example.com",
            smsTo: "+15551234567",
        });
    });

    it("returns disabled when config.enabled is false", async () => {
        const deps = makeDeps({ enabled: false });
        const supabase = {} as SupabaseClient;
        const result = await orchestrateTourBookingConfirmed(supabase, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.disabled).toBe(true);
        expect(result.immediate).toHaveLength(0);
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
        expect(deps.scheduleReminders).not.toHaveBeenCalled();
    });

    it("confirmation sends once and schedules reminders when enabled", async () => {
        const deps = makeDeps();
        const supabase = {} as SupabaseClient;
        const result = await orchestrateTourBookingConfirmed(supabase, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.disabled).toBe(false);
        expect(result.immediate).toHaveLength(1);
        expect(result.immediate[0]?.status).toBe("sent");
        expect(result.immediate[0]?.channel).toBe("email");
        expect(deps.enqueueImmediate).toHaveBeenCalledTimes(1);
        expect(deps.scheduleReminders).toHaveBeenCalledTimes(1);
        const firstEnqueue = firstEnqueueCall(deps);
        expect(firstEnqueue?.metadata?.event_key).toBe("tour_confirmation");
        expect(firstEnqueue?.metadata?.source).toBe("tour_scheduling");
        expect(firstEnqueue?.metadata?.opportunity_id).toBe(OPP);
        expect(firstEnqueue?.metadata?.channel).toBe("email");
        expect(firstEnqueue?.metadata?.lifecycle_action).toBe("confirm");
    });

    it("reschedule sends notification and replaces reminders", async () => {
        const deps = makeDeps();
        const supabase = {} as SupabaseClient;
        const result = await orchestrateTourBookingRescheduled(supabase, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.immediate[0]?.eventKey).toBe("tour_reschedule");
        expect(deps.replaceReminders).toHaveBeenCalledTimes(1);
        expect(deps.scheduleReminders).not.toHaveBeenCalled();
    });

    it("cancel sends notification and cancels reminders", async () => {
        const deps = makeDeps();
        const supabase = {} as SupabaseClient;
        const result = await orchestrateTourBookingCanceled(supabase, {
            orgId: ORG,
            booking: passed({ ...bookingRow(), status_key: "canceled" }),
            previousStatusKey: "confirmed",
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.immediate[0]?.eventKey).toBe("tour_cancel");
        expect(deps.cancelReminders).toHaveBeenCalledTimes(1);
        expect(deps.replaceReminders).not.toHaveBeenCalled();
    });

    it("no-show cancels reminders and sends follow-up", async () => {
        const deps = makeDeps();
        const supabase = {} as SupabaseClient;
        const result = await orchestrateTourBookingNoShow(supabase, {
            orgId: ORG,
            booking: passed({ ...bookingRow(), status_key: "no_show" }),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.immediate[0]?.eventKey).toBe("tour_no_show_followup");
        expect(deps.cancelReminders).toHaveBeenCalledTimes(1);
    });

    it("complete cancels reminders only", async () => {
        const deps = makeDeps();
        const supabase = {} as SupabaseClient;
        const result = await orchestrateTourBookingCompleted(supabase, {
            orgId: ORG,
            booking: passed({ ...bookingRow(), status_key: "completed" }),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.immediate).toHaveLength(0);
        expect(deps.cancelReminders).toHaveBeenCalledTimes(1);
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
    });

    it("missing recipient does not throw", async () => {
        mockRecipient.mockResolvedValue(null);
        const deps = makeDeps();
        const supabase = {} as SupabaseClient;
        const result = await orchestrateTourCommsForBooking({
            supabase,
            orgId: ORG,
            booking: passed(bookingRow()),
            immediateEventKey: "tour_confirmation",
            reminderAction: "schedule",
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.ok).toBe(true);
        expect(result.skippedReasons).toContain("missing_recipient");
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
    });

    it("duplicate orchestration call does not duplicate immediate sends", async () => {
        const deps = makeDeps({ existingIdempotency: true });
        const supabase = {} as SupabaseClient;
        const result = await orchestrateTourBookingConfirmed(supabase, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.immediate[0]?.status).toBe("deduped");
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
    });

    it("does not send SMS by default", async () => {
        const deps = makeDeps({ smsEnabled: false });
        const supabase = {} as SupabaseClient;
        const result = await orchestrateTourBookingConfirmed(supabase, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.immediate.every((i) => i.channel === "email")).toBe(true);
        expect(deps.enqueueImmediate).toHaveBeenCalledTimes(1);
    });

    it("buildTourCommsImmediateIdempotencyKey is stable per subject/event/channel/generation", () => {
        const key = buildTourCommsImmediateIdempotencyKey({
            subjectId: BOOKING,
            eventKey: "tour_confirmation",
            channel: "email",
            generationToken: "confirmed",
        });
        expect(key).toBe(`tour_scheduling:immediate:${BOOKING}:tour_confirmation:email:confirmed`);
    });

    it("runTourCommsOrchestratorBestEffort swallows errors", async () => {
        const result = await runTourCommsOrchestratorBestEffort("test", async () => {
            throw new Error("boom");
        });
        expect(result).toBeNull();
    });

    it("uses Google/Outlook links instead of ICS download paths in rendered body", async () => {
        const deps = makeDeps();
        const supabase = {} as SupabaseClient;
        await orchestrateTourBookingConfirmed(supabase, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        const body = String(firstEnqueueCall(deps)?.bodyRaw ?? "");
        expect(body).not.toContain("/api/admin/tours/bookings/");
        expect(body).not.toContain("/api/public/tour-booking/");
    });
});

/**
 * S1-A — the orchestrator asks `mayCommunicateForTour` about the booking AS IT IS IN THE
 * DATABASE, for every outbound side effect it owns: the parent message, the reminder
 * generation and the staff calendar invite.
 */
describe("tour communications eligibility at the orchestrator", () => {
    beforeEach(() => {
        mockRecipient.mockResolvedValue({
            personId: PERSON,
            displayName: "Jordan",
            email: "parent@example.com",
            smsTo: "+15551234567",
        });
    });

    const pending = (): TourBookingRow => ({ ...bookingRow(), status_key: "pending_approval" });

    it("a pending booking produces no confirmation, no reminders and no calendar invite", async () => {
        const deps = makeDeps({ smsEnabled: true });
        const result = await orchestrateTourBookingConfirmed({} as SupabaseClient, {
            orgId: ORG,
            booking: passed(pending()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
        expect(deps.scheduleReminders).not.toHaveBeenCalled();
        expect(deps.sendInternalCalendarInvite).not.toHaveBeenCalled();
        expect(result.skippedReasons).toEqual(
            expect.arrayContaining([
                "ineligible:booking_confirmation:awaiting_approval",
                "ineligible:reminder:awaiting_approval",
            ])
        );
    });

    it.each(["requested", "canceled", "completed", "no_show"])(
        "a %s booking produces no confirmation",
        async (status) => {
            const deps = makeDeps();
            await orchestrateTourBookingConfirmed({} as SupabaseClient, {
                orgId: ORG,
                booking: passed({ ...bookingRow(), status_key: status }),
                deps: deps as unknown as TourCommsOrchestratorDeps,
            });
            expect(deps.enqueueImmediate).not.toHaveBeenCalled();
            expect(deps.scheduleReminders).not.toHaveBeenCalled();
            expect(deps.sendInternalCalendarInvite).not.toHaveBeenCalled();
        }
    );

    it("decides from the database, not the caller's row: confirmed in hand, canceled in the DB → nothing", async () => {
        const deps = makeDeps({ dbBooking: { ...bookingRow(), status_key: "canceled" } });
        await orchestrateTourBookingConfirmed({} as SupabaseClient, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(deps.loadBookingState).toHaveBeenCalledTimes(1);
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
        expect(deps.scheduleReminders).not.toHaveBeenCalled();
    });

    it("approval is RE-READ, not inferred: a stale pending row whose booking was since approved confirms once", async () => {
        const deps = makeDeps({ dbBooking: bookingRow() });
        const result = await orchestrateTourBookingConfirmed({} as SupabaseClient, {
            orgId: ORG,
            booking: pending(),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.immediate.map((i) => i.status)).toEqual(["sent"]);
        expect(deps.scheduleReminders).toHaveBeenCalledTimes(1);
        expect(deps.sendInternalCalendarInvite).toHaveBeenCalledTimes(1);
        expect((vi.mocked(deps.sendInternalCalendarInvite).mock.calls as unknown as Array<[unknown]>)[0][0]).toMatchObject({ action: "request" });
    });

    it("a confirmed booking sends the confirmation, schedules reminders and invites staff exactly once", async () => {
        const deps = makeDeps();
        const result = await orchestrateTourBookingConfirmed({} as SupabaseClient, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.immediate.filter((i) => i.status === "sent")).toHaveLength(1);
        expect(deps.scheduleReminders).toHaveBeenCalledTimes(1);
        expect(deps.sendInternalCalendarInvite).toHaveBeenCalledTimes(1);
    });

    it("a replayed confirmation dedupes on its idempotency key and does not double-send", async () => {
        const deps = makeDeps({ existingIdempotency: true });
        const result = await orchestrateTourBookingConfirmed({} as SupabaseClient, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.immediate.map((i) => i.status)).toEqual(["deduped"]);
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
    });

    it("rescheduling a PENDING booking sends no 'moved' notice and no calendar update, and only withdraws reminders", async () => {
        const deps = makeDeps();
        const result = await orchestrateTourBookingRescheduled({} as SupabaseClient, {
            orgId: ORG,
            booking: passed(pending()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
        expect(deps.sendInternalCalendarInvite).not.toHaveBeenCalled();
        expect(deps.replaceReminders).not.toHaveBeenCalled();
        expect(deps.cancelReminders).toHaveBeenCalledTimes(1);
        expect(result.reminders.action).toBe("cancel");
    });

    it("rescheduling a CONFIRMED booking sends the notice, replaces reminders and updates the calendar", async () => {
        const deps = makeDeps();
        const result = await orchestrateTourBookingRescheduled({} as SupabaseClient, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(result.immediate.map((i) => i.eventKey)).toEqual(["tour_reschedule"]);
        expect(deps.replaceReminders).toHaveBeenCalledTimes(1);
        expect((vi.mocked(deps.sendInternalCalendarInvite).mock.calls as unknown as Array<[unknown]>)[0][0]).toMatchObject({ action: "update" });
    });

    it("rejecting a never-confirmed request tells the family nothing 'canceled' and sends no calendar cancel", async () => {
        const deps = makeDeps();
        const result = await orchestrateTourBookingCanceled({} as SupabaseClient, {
            orgId: ORG,
            booking: passed({ ...bookingRow(), status_key: "canceled" }),
            previousStatusKey: "pending_approval",
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
        expect(deps.sendInternalCalendarInvite).not.toHaveBeenCalled();
        expect(deps.cancelReminders).toHaveBeenCalledTimes(1);
        expect(result.skippedReasons).toContain("ineligible:cancellation_notice:never_confirmed");
    });

    it("canceling a confirmed tour sends the notice and the calendar cancel", async () => {
        const deps = makeDeps();
        await orchestrateTourBookingCanceled({} as SupabaseClient, {
            orgId: ORG,
            booking: passed({ ...bookingRow(), status_key: "canceled" }),
            previousStatusKey: "confirmed",
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(deps.enqueueImmediate).toHaveBeenCalledTimes(1);
        expect((vi.mocked(deps.sendInternalCalendarInvite).mock.calls as unknown as Array<[unknown]>)[0][0]).toMatchObject({ action: "cancel" });
    });

    it("an unaccepted lead (no opportunity in this org) gets nothing, even for a confirmed booking", async () => {
        const deps = makeDeps({ opportunityAccepted: false });
        const result = await orchestrateTourBookingConfirmed({} as SupabaseClient, {
            orgId: ORG,
            booking: passed(bookingRow()),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
        expect(deps.scheduleReminders).not.toHaveBeenCalled();
        expect(result.skippedReasons).toContain("ineligible:booking_confirmation:lead_not_accepted");
    });

    it("a booking id from another org is not found and sends nothing", async () => {
        const deps = makeDeps({ dbBooking: { ...bookingRow(), org_id: "99999999-9999-4999-8999-999999999999" } });
        await orchestrateTourBookingConfirmed({} as SupabaseClient, {
            orgId: ORG,
            booking: bookingRow(),
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
    });

    it("an event with no declared intent is refused by default", async () => {
        const deps = makeDeps();
        const result = await orchestrateTourCommsForBooking({
            supabase: {} as SupabaseClient,
            orgId: ORG,
            booking: passed(bookingRow()),
            immediateEventKey: "tour_pending_internal",
            deps: deps as unknown as TourCommsOrchestratorDeps,
        });
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
        expect(result.skippedReasons).toContain("ineligible:undeclared_event:tour_pending_internal");
    });

    it("an unreadable booking fails closed: the best-effort wrapper sends nothing", async () => {
        const deps = makeDeps();
        deps.loadBookingState.mockRejectedValueOnce(new Error("db down"));
        const result = await runTourCommsOrchestratorBestEffort("test", () =>
            orchestrateTourBookingConfirmed({} as SupabaseClient, {
                orgId: ORG,
                booking: passed(bookingRow()),
                deps: deps as unknown as TourCommsOrchestratorDeps,
            })
        );
        expect(result).toBeNull();
        expect(deps.enqueueImmediate).not.toHaveBeenCalled();
    });
});
