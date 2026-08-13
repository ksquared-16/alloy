/**
 * Bounded cancellation.
 *
 * Cancellation is deliberately NOT a one-tap link in a message: a mis-tap in an inbox
 * must never release a family's appointment. The delivered confirmation carries a
 * Manage credential that can only READ; a `cancel_tour` credential exists only after
 * the parent opens that surface, chooses to cancel, and confirms.
 *
 * These cases pin the two halves of that: no destructive credential is ever put in a
 * message, and the intent route is the only thing that mints one.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildTourParentActionModel } from "@/lib/tours/invitation/tourParentActionModel";
import { buildTourParentView } from "@/lib/tours/public/tourParentView";
import { POST_BOOKING_ACTION_KINDS } from "@/lib/tours/invitation/mintTourInvitation";
import { TOUR_PUBLIC_RATE_LIMIT } from "@/lib/tours/public/tourPublicRateLimit";
import { TOUR_ACTION_REUSE } from "@/lib/tours/public/authorizeTourAction";

const BASE = "https://app.example.invalid";
const postBooking = [
    { id: "1", actionKind: "view_tour_details" as const, rawToken: "TOK_MANAGE" },
    { id: "2", actionKind: "confirm_tour" as const, rawToken: "TOK_CONFIRM" },
    { id: "3", actionKind: "reschedule_tour" as const, rawToken: "TOK_RESCHED" },
];

describe("no destructive credential is ever delivered in a message", () => {
    it("the post-booking mint does not include cancel_tour", () => {
        expect(POST_BOOKING_ACTION_KINDS).not.toContain("cancel_tour");
    });

    it("the confirmation action model offers Manage, never a direct cancel", () => {
        const m = buildTourParentActionModel({ actions: postBooking, baseUrl: BASE, bookingStatusKey: "confirmed" });
        expect(m.manageUrl).toBe(`${BASE}/tour-booking/TOK_MANAGE`);
        expect(m.rescheduleUrl).toBe(`${BASE}/tour-booking/TOK_RESCHED`);
        expect(m).not.toHaveProperty("cancelUrl");
    });

    it("even given a cancel credential, the model will not surface it", () => {
        // Defence against a future caller minting one and expecting it to be rendered.
        const withCancel = [...postBooking, { id: "4", actionKind: "cancel_tour" as const, rawToken: "TOK_CANCEL" }];
        const m = buildTourParentActionModel({ actions: withCancel, baseUrl: BASE, bookingStatusKey: "confirmed" });
        expect(JSON.stringify(m)).not.toContain("TOK_CANCEL");
    });

    it("offers nothing once the tour is already cancelled", () => {
        const m = buildTourParentActionModel({ actions: postBooking, baseUrl: BASE, bookingStatusKey: "cancelled" });
        expect(m).toEqual({ rescheduleUrl: null, manageUrl: null, confirmUrl: null, confirmAttendanceUrl: null });
    });
});

describe("the Manage surface opens the bounded flow", () => {
    it("a Manage credential offers Cancel tour as an entry point", () => {
        const v = buildTourParentView({
            opportunityLabel: "Rowan Reyes",
            locationLabel: "Northwind — Riverside",
            invitationStatus: "booked",
            bookingStatusKey: "confirmed",
            bookingStartAt: "2026-08-05T17:00:00Z",
            bookingTimezone: "America/Los_Angeles",
            availableActions: ["view_tour_details"],
        });
        expect(v.state).toBe("booked_confirmed");
        expect(v.actions.map((a) => a.intent)).toContain("cancel");
        // The label is an entry point, not a destructive verb in a message.
        expect(v.actions.find((a) => a.intent === "cancel")?.tone).toBe("quiet");
    });

    it("shows the current booking in the centre's timezone", () => {
        const v = buildTourParentView({
            opportunityLabel: "Rowan Reyes",
            locationLabel: "Northwind — Riverside",
            invitationStatus: "booked",
            bookingStatusKey: "confirmed",
            bookingStartAt: "2026-08-05T17:00:00Z",
            bookingTimezone: "America/Los_Angeles",
            availableActions: ["view_tour_details"],
        });
        expect(v.bookingLabel).toBe("Wednesday, August 5 · 10:00 AM");
    });

    it("a cancelled tour reads as a truthful terminal state, not an error", () => {
        const v = buildTourParentView({
            opportunityLabel: "Rowan Reyes",
            locationLabel: "Northwind — Riverside",
            invitationStatus: "booked",
            bookingStatusKey: "cancelled",
            availableActions: ["view_tour_details"],
        });
        expect(v.state).toBe("cancelled");
        expect(v.actions).toHaveLength(0);
        expect(v.headline.toLowerCase()).toContain("cancelled");
    });
});

describe("the bounded credential's properties", () => {
    it("cancel_tour is single-use", () => {
        expect(TOUR_ACTION_REUSE.cancel_tour).toBe("single_use");
    });

    it("the Manage credential is reusable, so reopening is safe", () => {
        expect(TOUR_ACTION_REUSE.view_tour_details).toBe("reusable");
    });

    it("the intent route has its own rate-limit budget", () => {
        // A public route with no budget resolves to undefined config and throws — the
        // typed kind is what stops one shipping without it.
        expect(TOUR_PUBLIC_RATE_LIMIT).toHaveProperty("cancel_intent");
        expect(TOUR_PUBLIC_RATE_LIMIT.cancel_intent.max).toBeGreaterThan(0);
    });
});
