import { describe, expect, it, vi, afterEach } from "vitest";
import {
    buildGoogleCalendarUrl,
    buildOutlookCalendarUrl,
    buildTourAddToCalendarLinks,
    buildTourIcsDownloadPath,
    buildTourIcsDownloadUrl,
    withTourAddToCalendarLinks,
} from "@/lib/tours/comms/tourAddToCalendarLinks";
import {
    buildTourBookingIcs,
    buildTourBookingIcsUid,
    escapeIcsText,
    formatIcsUtcDateTime,
} from "@/lib/tours/comms/tourBookingIcs";
import { buildTourCommsMergeFields } from "@/lib/tours/comms/tourCommsTemplateContext";
import { renderTourCommsTemplate } from "@/lib/tours/comms/tourCommsTemplates";

const baseIcsInput = {
    bookingId: "b-11111111-1111-1111-1111-111111111111",
    orgId: "o-22222222-2222-2222-2222-222222222222",
    opportunityId: "opp-1",
    locationId: "loc-1",
    startAtIso: "2026-06-15T17:00:00.000Z",
    endAtIso: "2026-06-15T18:00:00.000Z",
    timezone: "America/Los_Angeles",
    summary: "Campus tour",
    description: "See our classrooms, meet teachers.",
    locationLabel: "Main Campus, 123 Oak St",
    organizerName: "Tour Host",
    organizerEmail: "host@example.com",
    attendeeEmail: "parent@example.com",
    dtStampIso: "2026-06-01T12:00:00.000Z",
    createdIso: "2026-06-01T12:00:00.000Z",
    lastModifiedIso: "2026-06-01T12:00:00.000Z",
};

describe("buildTourBookingIcs", () => {
    it("contains required VCALENDAR and VEVENT fields", () => {
        const ics = buildTourBookingIcs(baseIcsInput);
        expect(ics).toContain("BEGIN:VCALENDAR");
        expect(ics).toContain("VERSION:2.0");
        expect(ics).toContain("PRODID:-//Alloy//Tour Scheduling//EN");
        expect(ics).toContain("BEGIN:VEVENT");
        expect(ics).toContain("END:VEVENT");
        expect(ics).toContain("END:VCALENDAR");
        expect(ics).toContain("DTSTART:20260615T170000Z");
        expect(ics).toContain("DTEND:20260615T180000Z");
        expect(ics).toContain("SUMMARY:Campus tour");
        expect(ics).toContain("ORGANIZER;CN=Tour Host:mailto:host@example.com");
        expect(ics).toContain("ATTENDEE;");
        expect(ics).toContain("mailto:parent@example.com");
    });

    it("escapes commas semicolons and newlines", () => {
        const ics = buildTourBookingIcs({
            ...baseIcsInput,
            summary: "Tour; intro, welcome",
            description: "Line one\nLine two",
        });
        expect(ics).toContain("SUMMARY:Tour\\; intro\\, welcome");
        expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
    });

    it("uses stable UID from booking and org", () => {
        const uid = buildTourBookingIcsUid(baseIcsInput.bookingId, baseIcsInput.orgId);
        expect(uid).toBe(`tour-booking-${baseIcsInput.bookingId}@${baseIcsInput.orgId}.alloy.local`);
        const ics = buildTourBookingIcs(baseIcsInput);
        expect(ics).toContain(`UID:${uid}`);
    });

    it("sets CANCELLED status and CANCEL method for cancelled bookings", () => {
        const ics = buildTourBookingIcs({
            ...baseIcsInput,
            status: "cancelled",
            method: "CANCEL",
            sequence: 2,
        });
        expect(ics).toContain("STATUS:CANCELLED");
        expect(ics).toContain("METHOD:CANCEL");
        expect(ics).toContain("SEQUENCE:2");
    });
});

describe("escapeIcsText", () => {
    it("escapes special characters", () => {
        expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    });
});

describe("formatIcsUtcDateTime", () => {
    it("formats UTC Zulu", () => {
        expect(formatIcsUtcDateTime("2026-06-15T17:00:00.000Z")).toBe("20260615T170000Z");
    });
});

describe("add-to-calendar URL helpers", () => {
    const event = {
        summary: "Tour at Main Campus",
        description: "Bring questions",
        locationLabel: "Main Campus",
        startAtIso: "2026-06-15T17:00:00.000Z",
        endAtIso: "2026-06-15T18:00:00.000Z",
    };

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("buildGoogleCalendarUrl encodes expected fields", () => {
        const url = buildGoogleCalendarUrl(event);
        expect(url).toMatch(/^https:\/\/calendar\.google\.com\//);
        expect(url).toContain("action=TEMPLATE");
        expect(url).toContain(encodeURIComponent("Tour at Main Campus"));
        expect(url).toContain("dates=20260615T170000Z");
        expect(url).toContain("20260615T180000Z");
        expect(url).toContain(encodeURIComponent("Main Campus"));
    });

    it("buildOutlookCalendarUrl encodes expected fields", () => {
        const url = buildOutlookCalendarUrl(event);
        expect(url).toMatch(/^https:\/\/outlook\.office\.com\//);
        expect(url).toContain("subject=");
        expect(url).toContain("startdt=");
        expect(url).toContain("enddt=");
    });

    it("ICS download path does not hardcode hostname", () => {
        expect(buildTourIcsDownloadPath({ bookingId: "b-1" })).toBe("/api/admin/tours/bookings/b-1/ics");
        expect(buildTourIcsDownloadPath({ bookingId: "b-1", publicAccessToken: "tok/abc" })).toBe(
            "/api/public/tour-booking/tok%2Fabc/ics"
        );
    });

    it("buildTourIcsDownloadUrl uses env origin when set", () => {
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
        const url = buildTourIcsDownloadUrl({ bookingId: "b-1" });
        expect(url).toBe("https://app.example.com/api/admin/tours/bookings/b-1/ics");
    });

    it("buildTourAddToCalendarLinks returns all three links", () => {
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
        const links = buildTourAddToCalendarLinks({ event, bookingId: "b-1" });
        expect(links.googleCalendarUrl).toContain("calendar.google.com");
        expect(links.outlookCalendarUrl).toContain("outlook.office.com");
        expect(links.icsDownloadUrl).toContain("app.example.com");
    });
});

describe("withTourAddToCalendarLinks", () => {
    it("injects addToCalendarUrl into template context and merge fields", () => {
        const ctx = withTourAddToCalendarLinks(
            { parentName: "Sam", tourStartAt: "2026-06-15T17:00:00.000Z", tourEndAt: "2026-06-15T18:00:00.000Z" },
            {
                icsDownloadUrl: "https://app.example.com/api/admin/tours/bookings/b-1/ics",
                googleCalendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
                outlookCalendarUrl: "https://outlook.office.com/calendar/0/deeplink/compose",
            }
        );
        expect(ctx.addToCalendarUrl).toContain("/ics");
        expect(buildTourCommsMergeFields(ctx).add_to_calendar_url).toContain("/ics");

        const msg = renderTourCommsTemplate({
            eventKey: "confirmation",
            channel: "email",
            context: ctx,
        });
        expect(msg?.channel).toBe("email");
        if (msg?.channel === "email") {
            expect(msg.bodyText).toContain("https://app.example.com/api/admin/tours/bookings/b-1/ics");
        }
    });
});
