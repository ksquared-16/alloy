/**
 * S1-B — a due tour reminder is re-decided against the booking at the moment of sending.
 *
 * Scheduling-time eligibility is not dispatch-time eligibility: between the two, a booking
 * can be canceled, marked no-show, moved, or turn out never to have been approved.
 */
import { describe, expect, it, vi } from "vitest";

import { revalidateTourReminderForDispatch } from "@/lib/tours/comms/tourSchedulingScheduledSends";

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const START = "2099-06-16T12:00:00.000Z";
const NOW = new Date("2026-10-22T12:00:00.000Z");

function dueRow(metadata: Record<string, unknown> = {}) {
    return {
        org_id: ORG,
        entity_id: OPP,
        metadata: { tour_booking_id: BOOKING, event_key: "tour_reminder", tour_start_at: START, ...metadata },
    };
}

function loadState(status_key: string, over: { start_at?: string; opportunity_id?: string; accepted?: boolean } = {}) {
    return vi.fn(async (_sb: unknown, params: { orgId: string; bookingId: string }) => {
        expect(params).toEqual({ orgId: ORG, bookingId: BOOKING });
        const start_at = over.start_at ?? START;
        return {
            booking: { status_key, start_at },
            opportunityAccepted: over.accepted ?? true,
            row: { id: BOOKING, org_id: ORG, opportunity_id: over.opportunity_id ?? OPP, status_key, start_at } as never,
        };
    });
}

const sb = {} as never;

describe("revalidateTourReminderForDispatch", () => {
    it.each(["confirmed", "rescheduled"])("dispatches for a %s booking at the scheduled start", async (status) => {
        const verdict = await revalidateTourReminderForDispatch({ supabase: sb, row: dueRow(), now: NOW, loadState: loadState(status) });
        expect(verdict).toEqual({ kind: "dispatch" });
    });

    it.each([
        ["canceled", "booking_canceled"],
        ["pending_approval", "awaiting_approval"],
        ["requested", "awaiting_approval"],
        ["no_show", "booking_closed"],
        ["completed", "booking_closed"],
    ])("withdraws the reminder when the booking is now %s", async (status, reason) => {
        const verdict = await revalidateTourReminderForDispatch({ supabase: sb, row: dueRow(), now: NOW, loadState: loadState(status) });
        expect(verdict).toEqual({ kind: "suppress", reason });
    });

    it("withdraws a generation written for a start time the booking no longer has", async () => {
        const verdict = await revalidateTourReminderForDispatch({
            supabase: sb,
            row: dueRow(),
            now: NOW,
            loadState: loadState("confirmed", { start_at: "2099-06-17T12:00:00.000Z" }),
        });
        expect(verdict).toEqual({ kind: "suppress", reason: "schedule_stale" });
    });

    it("withdraws when the booking no longer belongs to the reminder's opportunity", async () => {
        const verdict = await revalidateTourReminderForDispatch({
            supabase: sb,
            row: dueRow(),
            now: NOW,
            loadState: loadState("confirmed", { opportunity_id: "99999999-9999-4999-8999-999999999999" }),
        });
        expect(verdict).toEqual({ kind: "suppress", reason: "entity_mismatch" });
    });

    it("withdraws when the lead behind the booking was never accepted", async () => {
        const verdict = await revalidateTourReminderForDispatch({
            supabase: sb,
            row: dueRow(),
            now: NOW,
            loadState: loadState("confirmed", { accepted: false }),
        });
        expect(verdict).toEqual({ kind: "suppress", reason: "lead_not_accepted" });
    });

    it("withdraws a row that names no booking", async () => {
        const verdict = await revalidateTourReminderForDispatch({
            supabase: sb,
            row: { org_id: ORG, entity_id: OPP, metadata: {} },
            now: NOW,
            loadState: loadState("confirmed"),
        });
        expect(verdict).toEqual({ kind: "suppress", reason: "booking_reference_missing" });
    });

    it("reports — never sends — when the booking cannot be read", async () => {
        const verdict = await revalidateTourReminderForDispatch({
            supabase: sb,
            row: dueRow(),
            now: NOW,
            loadState: vi.fn(async () => {
                throw new Error("db down");
            }),
        });
        expect(verdict).toEqual({ kind: "error", message: "db down" });
    });
});
