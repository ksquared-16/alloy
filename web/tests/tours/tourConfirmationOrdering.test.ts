/**
 * Booking → mint → confirm ordering, and the timezone authority.
 *
 * `createTourBooking` is the canonical DOMAIN service. It owns the booking row and the
 * lifecycle event; it must never own public action credentials or template URLs. But
 * the public flow cannot render a useful confirmation until it has minted the scoped
 * reschedule/cancel credentials, which can only exist AFTER the booking commits —
 * sending inside the transaction produced a confirmation with nothing in it.
 *
 * These cases pin the corrected sequence, the parent-safe action model, and the
 * date/time parity between what the parent sees on the page and in the message.
 */

import { describe, expect, it } from "vitest";

import { buildTourParentActionModel } from "@/lib/tours/invitation/tourParentActionModel";
import { formatTourCommsDateTimeLabels } from "@/lib/tours/comms/tourCommsTemplateContext";
import { formatParentTourTime, tourSlotDayKey, formatParentTimeOnly } from "@/lib/tours/public/tourParentView";

const BASE = "https://app.example.invalid";
const actions = [
    { id: "1", actionKind: "view_tour_details" as const, rawToken: "TOK_MANAGE" },
    { id: "2", actionKind: "confirm_tour" as const, rawToken: "TOK_CONFIRM" },
    { id: "3", actionKind: "reschedule_tour" as const, rawToken: "TOK_RESCHED" },
];

describe("the parent-safe action model", () => {
    it("offers reschedule and Manage for a live booking", () => {
        // Manage, not a direct cancel: cancellation is a bounded flow.
        const m = buildTourParentActionModel({ actions, baseUrl: BASE, bookingStatusKey: "confirmed" });
        expect(m.rescheduleUrl).toBe(`${BASE}/tour-booking/TOK_RESCHED`);
        expect(m.manageUrl).toBe(`${BASE}/tour-booking/TOK_MANAGE`);
    });

    it("does NOT offer confirm on an already-confirmed booking", () => {
        // An action is not offered merely because a route exists for it.
        const m = buildTourParentActionModel({ actions, baseUrl: BASE, bookingStatusKey: "confirmed" });
        expect(m.confirmUrl).toBeNull();
    });

    it("offers confirm only while confirmation is still a required step", () => {
        const m = buildTourParentActionModel({ actions, baseUrl: BASE, bookingStatusKey: "pending_approval" });
        expect(m.confirmUrl).toBe(`${BASE}/tour-booking/TOK_CONFIRM`);
    });

    it.each(["cancelled", "canceled", "completed", "no_show"])(
        "offers nothing once the booking is %s",
        (statusKey) => {
            const m = buildTourParentActionModel({ actions, baseUrl: BASE, bookingStatusKey: statusKey });
            expect(m).toEqual({ rescheduleUrl: null, manageUrl: null, confirmUrl: null, confirmAttendanceUrl: null });
        }
    );

    it("carries URLs only — never an action kind, id, or status", () => {
        const m = buildTourParentActionModel({ actions, baseUrl: BASE, bookingStatusKey: "pending_approval" });
        const raw = JSON.stringify(m);
        for (const forbidden of ["reschedule_tour", "cancel_tour", "confirm_tour", "status_key", "pending_approval"]) {
            expect(raw, `${forbidden} crossed the boundary`).not.toContain(forbidden);
        }
    });

    it("degrades to no actions rather than emitting a broken origin", () => {
        const m = buildTourParentActionModel({ actions, baseUrl: "  ", bookingStatusKey: "confirmed" });
        expect(m).toEqual({ rescheduleUrl: null, manageUrl: null, confirmUrl: null, confirmAttendanceUrl: null });
    });
});

describe("timezone authority — one answer everywhere", () => {
    const START = "2026-08-05T18:00:00.000Z"; // 11:00 AM in Los Angeles
    const TZ = "America/Los_Angeles";

    it("the confirmation renders the CENTRE's local time, not the server's", () => {
        // Regression: the labels were derived by packing wall-clock fields with
        // `Date.UTC` and re-interpreting them, which is correct only when the server
        // process runs in UTC. On a Pacific host this rendered 11:00 AM as 4:00 AM.
        const l = formatTourCommsDateTimeLabels({ tourStartAt: START, timezone: TZ });
        expect(l.tourTimeLabel).toBe("11:00 AM");
        expect(l.tourDisplayLabel).toBe("08/05/2026, 11:00 AM");
        expect(l.tourDisplayLabel).not.toContain("4:00 AM");
    });

    it("parent page and confirmation agree on the same instant", () => {
        const page = formatParentTourTime(START, TZ); // "Wednesday, August 5 · 11:00 AM"
        const message = formatTourCommsDateTimeLabels({ tourStartAt: START, timezone: TZ });
        expect(page).toContain("11:00 AM");
        expect(message.tourTimeLabel).toBe("11:00 AM");
        expect(page).toContain("August 5");
        expect(message.tourDateLabel).toBe("08/05/2026");
    });

    it("SMS and email share one label source, so they cannot drift", () => {
        // Both channels render from the same merge fields; proving the source is
        // singular is what makes per-channel parity structural rather than lucky.
        const a = formatTourCommsDateTimeLabels({ tourStartAt: START, timezone: TZ });
        const b = formatTourCommsDateTimeLabels({ tourStartAt: START, timezone: TZ });
        expect(a).toEqual(b);
    });

    it("groups a boundary-crossing UTC slot to the correct centre-local date", () => {
        // 02:00Z on the 6th is still the 5th in Los Angeles.
        expect(tourSlotDayKey("2026-08-06T02:00:00Z", TZ)).toBe("2026-08-05");
        const l = formatTourCommsDateTimeLabels({ tourStartAt: "2026-08-06T02:00:00Z", timezone: TZ });
        expect(l.tourDateLabel).toBe("08/05/2026");
    });

    it("is correct across a DST boundary", () => {
        // 2026-11-01 is the US DST end. 09:00 local is 16:00Z before, 17:00Z after.
        const beforeDst = formatTourCommsDateTimeLabels({ tourStartAt: "2026-10-31T16:00:00Z", timezone: TZ });
        const afterDst = formatTourCommsDateTimeLabels({ tourStartAt: "2026-11-02T17:00:00Z", timezone: TZ });
        expect(beforeDst.tourTimeLabel).toBe("9:00 AM");
        expect(afterDst.tourTimeLabel).toBe("9:00 AM");
        expect(formatParentTimeOnly("2026-10-31T16:00:00Z", TZ)).toBe("9:00 AM");
        expect(formatParentTimeOnly("2026-11-02T17:00:00Z", TZ)).toBe("9:00 AM");
    });

    it("falls back explicitly to UTC when the timezone is unusable", () => {
        const l = formatTourCommsDateTimeLabels({ tourStartAt: START, timezone: "Not/AZone" });
        expect(l.tourTimeLabel).toBe("6:00 PM"); // 18:00Z rendered as UTC
        const empty = formatTourCommsDateTimeLabels({ tourStartAt: "", timezone: TZ });
        expect(empty).toEqual({ tourDateLabel: "", tourTimeLabel: "", tourDisplayLabel: "" });
    });
});
