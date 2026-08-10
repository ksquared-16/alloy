import { describe, expect, it } from "vitest";

import {
    classifyEligibleEnrollmentChildren,
    type EligibleEnrollmentChildSubject,
} from "@/lib/lifecycle/resolveEligibleEnrollmentChildrenForOpportunity";
import { dedupeTourOptionsForRecipient, buildTourOptionsBlock } from "@/lib/tours/invitation/sendTourInvitation";
import type { TourInvitationContent, TourOption } from "@/lib/tours/invitation/tourInvitationContent";
import {
    isSafeTourBookingRedirectPath,
    tourBookingPathFromPublicUrl,
} from "@/lib/tours/invitation/tourBookingPublicAlias";
import { polishTourCommsEmailHtml } from "@/lib/tours/comms/tourCommsTemplates";

function child(id: string, label: string, customerMemberId: string): EligibleEnrollmentChildSubject {
    return { id, label, grain: "opportunity_customer_member", customerMemberId };
}

describe("classifyEligibleEnrollmentChildren", () => {
    it("reports none without inventing subjects", () => {
        const out = classifyEligibleEnrollmentChildren([]);
        expect(out.status).toBe("none");
        expect(out.subjects).toEqual([]);
        if (out.status === "none") {
            expect(out.message).toMatch(/child/i);
        }
    });

    it("classifies a single child", () => {
        const out = classifyEligibleEnrollmentChildren([child("ocm-1", "Lennon", "cm-1")]);
        expect(out.status).toBe("single");
        expect(out.subjects).toHaveLength(1);
    });

    it("classifies multiple children for multi-select", () => {
        const out = classifyEligibleEnrollmentChildren([
            child("ocm-1", "Lennon · North Campus", "cm-1"),
            child("ocm-2", "Wrigley · North Campus", "cm-2"),
        ]);
        expect(out.status).toBe("multiple");
        expect(out.subjects).toHaveLength(2);
        if (out.status === "multiple") {
            expect(out.message).toMatch(/Who should move/i);
        }
    });
});

describe("dedupeTourOptionsForRecipient", () => {
    it("collapses identical wall-clock recipient choices", () => {
        const a: TourOption = {
            optionId: "rule-a:2026-08-10T16:00:00.000Z",
            date: "2026-08-10",
            startTime: "09:00",
            timezone: "America/Los_Angeles",
            locationId: "loc-1",
            locationLabel: "North Campus",
            staffUserId: "staff-1",
            availabilityRef: "rule-a",
            presentationLabel: "Monday, August 10 · 9:00 AM",
            actionKind: "select_tour_slot",
        };
        const b: TourOption = {
            ...a,
            optionId: "rule-b:2026-08-10T16:00:00.000Z",
            staffUserId: "staff-2",
            availabilityRef: "rule-b",
        };
        expect(dedupeTourOptionsForRecipient([a, b])).toHaveLength(1);
    });
});

describe("buildTourOptionsBlock + email polish", () => {
    it("does not expose bullet-raw URLs in polished HTML", () => {
        const content: TourInvitationContent = {
            kind: "tour_invitation",
            text: "",
            options: [
                {
                    optionId: "r:1",
                    date: "2026-08-10",
                    startTime: "09:00",
                    timezone: "America/Los_Angeles",
                    locationId: "loc-1",
                    locationLabel: "North",
                    staffUserId: null,
                    availabilityRef: "r",
                    presentationLabel: "Monday, August 10 · 9:00 AM",
                    actionKind: "select_tour_slot",
                },
            ],
            primaryAction: { kind: "select_tour_slot", label: "Choose", actionRef: "select" },
            secondaryAction: { kind: "decline_tour", label: "No", actionRef: "decline" },
            fallbackActionUrl: "http://localhost:3015/tour-booking",
        };
        const block = buildTourOptionsBlock(
            content,
            "http://localhost:3015",
            "tok",
            { "r:1": "http://localhost:3015/a/Ab3X9k12" },
        );
        expect(block).toContain("Monday, August 10 · 9:00 AM — http://localhost:3015/a/Ab3X9k12");
        const html = polishTourCommsEmailHtml(`<p>${block}</p>`);
        expect(html).toContain("Monday, August 10 · 9:00 AM</a>");
        expect(html).toContain('href="http://localhost:3015/a/Ab3X9k12"');
        expect(html).not.toMatch(/>http:\/\/localhost:3015\/a\/Ab3X9k12</);
    });
});

describe("tour booking public alias safety", () => {
    it("accepts only same-origin tour-booking paths", () => {
        expect(isSafeTourBookingRedirectPath("/tour-booking/abc123")).toBe(true);
        expect(isSafeTourBookingRedirectPath("/tour-booking/abc123?option=r:1")).toBe(true);
        expect(isSafeTourBookingRedirectPath("https://evil.example/tour-booking/x")).toBe(false);
        expect(isSafeTourBookingRedirectPath("//evil.example")).toBe(false);
        expect(tourBookingPathFromPublicUrl("http://localhost:3015/tour-booking/tok?option=x")).toBe(
            "/tour-booking/tok?option=x",
        );
    });
});
