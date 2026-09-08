/**
 * Tour reminder + attendance + internal calendar — focused regression.
 * Policy lives in TourCommsConfig (org_settings.metadata.tour_comms), not hardcoded.
 * No Tour Host ownership model.
 */

import { describe, expect, it } from "vitest";

import {
    DEFAULT_TOUR_COMMS_CONFIG,
    mergeTourCommsConfig,
    parseTourCommsConfigFragment,
} from "@/lib/tours/comms/tourCommsConfig";
import {
    readAttendanceConfirmation,
    resetAttendanceAwaitingResponse,
    withAttendanceConfirmation,
} from "@/lib/tours/bookings/tourBookingAttendance";
import { buildTourBookingIcs } from "@/lib/tours/comms/tourBookingIcs";
import { renderTourCommsTemplate } from "@/lib/tours/comms/tourCommsTemplates";
import { normalizeTourAttendanceSmsReply } from "@/lib/communications/inbound/tourAttendanceSmsReply";
import { buildWhatsNextContextFacts } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildWhatsNextCardPresentation";

describe("TourCommsConfig — tenant policy ownership", () => {
    it("seeds a single 24h reminder offset (not hardcoded forever as one column)", () => {
        expect(DEFAULT_TOUR_COMMS_CONFIG.reminder_offsets).toHaveLength(1);
        expect(DEFAULT_TOUR_COMMS_CONFIG.reminder_offsets[0].offset_minutes).toBe(24 * 60);
    });

    it("allows org config to set 48h / multi-reminder + channel + internal recipients", () => {
        const merged = mergeTourCommsConfig(
            parseTourCommsConfigFragment({
                reminder_offsets: [
                    { reminder_key: "tour_reminder_48h", offset_minutes: 48 * 60, channels: ["email"] },
                    { reminder_key: "tour_reminder_24h", offset_minutes: 24 * 60, channels: ["email", "sms"] },
                ],
                channels: { email: true, sms: true },
                ask_parent_confirm_attendance: false,
                parent_recipient_policy: "primary_contact",
                internal_recipients: { enabled: true, user_ids: ["user-staff-1", "user-staff-2"] },
            }),
            {},
        );
        expect(merged.reminder_offsets).toHaveLength(2);
        expect(merged.reminder_offsets[0].offset_minutes).toBe(48 * 60);
        expect(merged.channels.sms).toBe(true);
        expect(merged.ask_parent_confirm_attendance).toBe(false);
        expect(merged.internal_recipients.user_ids).toEqual(["user-staff-1", "user-staff-2"]);
    });
});

describe("Tour attendance metadata", () => {
    it("tracks attendance affirmation without changing booking status semantics", () => {
        const md = withAttendanceConfirmation({}, {
            status: "confirmed_by_parent",
            confirmed_at: "2026-08-13T12:00:00.000Z",
            source: "email_action",
        });
        expect(readAttendanceConfirmation(md)?.status).toBe("confirmed_by_parent");
        const reset = resetAttendanceAwaitingResponse(md);
        expect(readAttendanceConfirmation(reset)?.status).toBe("awaiting_response");
    });
});

describe("Internal calendar ICS artifact", () => {
    it("builds one METHOD:REQUEST with multiple staff attendees (no duplicate UIDs)", () => {
        const ics = buildTourBookingIcs({
            bookingId: "b1",
            orgId: "o1",
            startAtIso: "2026-08-14T16:00:00.000Z",
            endAtIso: "2026-08-14T16:45:00.000Z",
            timezone: "America/Los_Angeles",
            summary: "Kurzman Family — Tour",
            attendeeEmails: ["staff1@example.com", "staff2@example.com", "staff1@example.com"],
            method: "REQUEST",
            sequence: 0,
        });
        expect(ics).toContain("METHOD:REQUEST");
        expect(ics).toContain("UID:tour-booking-b1@");
        const attendeeLines = ics.split("\r\n").filter((l) => l.startsWith("ATTENDEE"));
        expect(attendeeLines).toHaveLength(2);
    });

    it("uses CANCEL method for cancellation without inventing a second UID", () => {
        const ics = buildTourBookingIcs({
            bookingId: "b1",
            orgId: "o1",
            startAtIso: "2026-08-14T16:00:00.000Z",
            endAtIso: "2026-08-14T16:45:00.000Z",
            timezone: "America/Los_Angeles",
            summary: "Kurzman Family — Tour",
            status: "cancelled",
            method: "CANCEL",
            sequence: 2,
        });
        expect(ics).toContain("METHOD:CANCEL");
        expect(ics).toContain("SEQUENCE:2");
        expect(ics).toContain("UID:tour-booking-b1@");
    });
});

describe("Reminder templates + confirmation policy", () => {
    it("includes Confirm I'm coming when confirm URL is present", () => {
        const rendered = renderTourCommsTemplate({
            eventKey: "tour_reminder",
            channel: "email",
            context: {
                parentName: "Kelly",
                locationName: "North Campus",
                tourStartAt: "2026-08-14T16:00:00.000Z",
                timezone: "America/Los_Angeles",
                confirmAttendanceUrl: "https://example.com/tour-booking/tok",
                rescheduleUrl: "https://example.com/r",
                cancelUrl: "https://example.com/m",
                orgName: "Firefly",
            },
        });
        expect(rendered?.channel).toBe("email");
        if (rendered?.channel === "email") {
            expect(rendered.bodyText).toMatch(/Confirm I'm coming/i);
            expect(rendered.bodyText).toContain("https://example.com/tour-booking/tok");
        }
    });

    it("omits confirmation CTA lines when confirm URL is empty (policy OFF)", () => {
        const rendered = renderTourCommsTemplate({
            eventKey: "tour_reminder",
            channel: "email",
            context: {
                parentName: "Kelly",
                locationName: "North Campus",
                tourStartAt: "2026-08-14T16:00:00.000Z",
                timezone: "America/Los_Angeles",
                confirmAttendanceUrl: "",
                rescheduleUrl: "https://example.com/r",
                cancelUrl: "https://example.com/m",
                orgName: "Firefly",
            },
        });
        expect(rendered?.channel).toBe("email");
        if (rendered?.channel === "email") {
            expect(rendered.bodyText).not.toMatch(/Confirm I'm coming:\s*$/m);
            expect(rendered.bodyText).not.toContain("Confirm I'm coming: ");
        }
    });

    it("SMS reply instruction is empty when confirmReplyInstruction is blank", () => {
        const rendered = renderTourCommsTemplate({
            eventKey: "tour_reminder",
            channel: "sms",
            context: {
                parentName: "Kelly",
                locationName: "North Campus",
                tourTimeLabel: "9:00 AM",
                confirmReplyInstruction: "",
                cancelUrl: "https://example.com/m",
                orgName: "Firefly",
            },
        });
        expect(rendered?.channel).toBe("sms");
        if (rendered?.channel === "sms") {
            expect(rendered.body).not.toMatch(/Reply 1/i);
        }
    });
});

describe("SMS reply 1 normalization", () => {
    it("recognizes 1 / reply 1 only", () => {
        expect(normalizeTourAttendanceSmsReply("1")).toBe("1");
        expect(normalizeTourAttendanceSmsReply(" Reply 1 ")).toBe("1");
        expect(normalizeTourAttendanceSmsReply("yes")).toBeNull();
        expect(normalizeTourAttendanceSmsReply("STOP")).toBeNull();
        expect(normalizeTourAttendanceSmsReply("11")).toBeNull();
    });
});

describe("What's Next Tour facts", () => {
    it("shows Scheduled Tour without Host or raw confirmed status", () => {
        const facts = buildWhatsNextContextFacts({
            surface: {
                primaryWorkItem: null,
                headline: "Tour",
                subtitle: null,
                contextFacts: [],
                actions: [],
            } as never,
            context: {
                truth: {
                    "opportunity.location": "North Campus",
                    "primary_contact.name": "Kelly Kurzman",
                },
                signals: {
                    tour: {
                        scheduled: true,
                        startAt: "2026-08-14T16:00:00.000Z",
                        statusLabel: "confirmed", statusKey: null,
                        bookingId: "b1",
                        parentConfirmationLabel: "Awaiting response",
                    },
                },
            } as never,
            timeZone: "America/Los_Angeles",
        });
        expect(facts.find((f) => f.key === "scheduled_tour")?.label).toBe("Scheduled Tour");
        expect(facts.find((f) => f.key === "tour_host")).toBeUndefined();
        expect(facts.find((f) => f.key === "tour_parent_confirmation")).toBeUndefined();
        expect(facts.every((f) => f.value !== "confirmed")).toBe(true);
    });
});
