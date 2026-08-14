/**
 * Public Tour booking completion — Confirm Tour contract.
 *
 * Pins the parent-facing commitment path: selection alone is not booking,
 * Confirm Tour is the label, and account/token explanatory copy stays gone.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildTourParentView } from "@/lib/tours/public/tourParentView";

const clientSrc = readFileSync(
    join(process.cwd(), "app/tour-booking/[token]/TourBookingPublicClient.tsx"),
    "utf8"
);

describe("public Tour booking completion contract", () => {
    it("removes account/token explanatory copy from the public page", () => {
        expect(clientSrc).not.toContain("No account is needed");
        expect(clientSrc).not.toContain("this link is just for you");
    });

    it("keeps Confirm Tour hidden until a time is selected (client gates on pick)", () => {
        expect(clientSrc).toContain("pick && bookAction");
        expect(clientSrc).toContain("{bookAction.label}");
        // Time chips only set local pick — they do not POST /book.
        expect(clientSrc).toMatch(/onClick=\{\(\) => setPick\(chosen \? null : s\)\}/);
        expect(clientSrc).toContain('path = "/book"');
        expect(
            buildTourParentView({
                opportunityLabel: "Rowan",
                locationLabel: "North Campus",
                invitationStatus: "active",
                availableActions: ["select_tour_slot"],
            }).actions[0]?.label
        ).toBe("Confirm Tour");
    });

    it("surfaces SLOT_UNAVAILABLE as a parent-safe retry, not a hard stop", () => {
        expect(clientSrc).toContain("SLOT_UNAVAILABLE");
        expect(clientSrc).toContain("That time is no longer available. Please choose another.");
        expect(clientSrc).toContain("setPick(null)");
        expect(clientSrc).toContain("loadSlots()");
    });

    it("confirmation state carries date, time, and location", () => {
        const v = buildTourParentView({
            opportunityLabel: "Rowan Reyes",
            locationLabel: "North Campus",
            locationAddress: "123 Main Street, Bend, OR 97701",
            invitationStatus: "booked",
            bookingStatusKey: "confirmed",
            bookingStartAt: "2026-08-14T16:00:00Z",
            bookingTimezone: "America/Los_Angeles",
            availableActions: ["reschedule_tour", "cancel_tour"],
        });
        expect(v.headline).toBe("Tour confirmed");
        expect(v.bookingLabel).toContain("August 14");
        expect(v.bookingLabel).toContain("9:00 AM");
        expect(v.locationLine).toBe("North Campus");
        expect(v.locationAddress).toContain("123 Main Street");
        expect(v.notice).toContain("look forward");
        expect(v.showsOptions).toBe(false);
    });
});
