/**
 * Config policy acceptance — Tour reminder / channels / confirm / internal recipients.
 * Tenant policy via TourCommsConfig; not hardcoded childcare offsets/channels.
 */

import { describe, expect, it } from "vitest";

import {
    DEFAULT_TOUR_COMMS_CONFIG,
    mergeTourCommsConfig,
    parseTourCommsConfigFragment,
} from "@/lib/tours/comms/tourCommsConfig";
import { buildTourReminderSchedulePlans } from "@/lib/tours/comms/tourReminderTiming";
import { renderTourCommsTemplate } from "@/lib/tours/comms/tourCommsTemplates";

const tourStart = "2026-08-20T16:00:00.000Z";
const now = new Date("2026-08-13T00:00:00.000Z");

function schedule(fragment: Record<string, unknown>) {
    const config = mergeTourCommsConfig(parseTourCommsConfigFragment(fragment), {});
    return buildTourReminderSchedulePlans({
        tourStartAtIso: tourStart,
        bookingStatusKey: "confirmed",
        bookingTimezone: "America/Los_Angeles",
        config,
        now,
    }).filter((p) => p.kind === "schedule");
}

describe("Tour config policy acceptance", () => {
    it("Test 1 — 24h before schedules at start−24h", () => {
        const rows = schedule({
            reminder_offsets: [{ reminder_key: "r24", offset_minutes: 1440, channels: ["email"] }],
            channels: { email: true, sms: false },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].scheduledForIso).toBe("2026-08-19T16:00:00.000Z");
    });

    it("Test 2 — change to 48h before", () => {
        const rows = schedule({
            reminder_offsets: [{ reminder_key: "r48", offset_minutes: 2880, channels: ["email"] }],
            channels: { email: true, sms: false },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].scheduledForIso).toBe("2026-08-18T16:00:00.000Z");
    });

    it("Test 3 — email only does not schedule SMS", () => {
        const rows = schedule({
            reminder_offsets: [{ reminder_key: "r24", offset_minutes: 1440, channels: ["email"] }],
            channels: { email: true, sms: false },
        });
        expect(rows.map((r) => r.channel)).toEqual(["email"]);
    });

    it("Test 4 — email + SMS schedules both when master channels allow", () => {
        const rows = schedule({
            reminder_offsets: [{ reminder_key: "r24", offset_minutes: 1440, channels: ["email", "sms"] }],
            channels: { email: true, sms: true },
        });
        expect(rows.map((r) => r.channel).sort()).toEqual(["email", "sms"]);
    });

    it("Test 6 — confirm OFF omits Confirm I'm coming", () => {
        const rendered = renderTourCommsTemplate({
            eventKey: "tour_reminder",
            channel: "email",
            context: {
                parentName: "Kelly",
                locationName: "North",
                tourStartAt: tourStart,
                timezone: "America/Los_Angeles",
                confirmAttendanceUrl: "",
                rescheduleUrl: "https://x/r",
                cancelUrl: "https://x/m",
                orgName: "Org",
            },
        });
        expect(rendered?.channel).toBe("email");
        if (rendered?.channel === "email") {
            expect(rendered.bodyText).not.toMatch(/Confirm I'm coming:/);
        }
    });

    it("Test 7 — confirm ON includes Confirm I'm coming", () => {
        const rendered = renderTourCommsTemplate({
            eventKey: "tour_reminder",
            channel: "email",
            context: {
                parentName: "Kelly",
                locationName: "North",
                tourStartAt: tourStart,
                timezone: "America/Los_Angeles",
                confirmAttendanceUrl: "https://x/c",
                rescheduleUrl: "https://x/r",
                cancelUrl: "https://x/m",
                orgName: "Org",
            },
        });
        expect(rendered?.channel).toBe("email");
        if (rendered?.channel === "email") {
            expect(rendered.bodyText).toMatch(/Confirm I'm coming/);
            expect(rendered.bodyText).toContain("https://x/c");
        }
    });

    it("Test 9 — internal recipients follow config (0/1/many), not a Tour Host model", () => {
        expect(DEFAULT_TOUR_COMMS_CONFIG.internal_recipients.user_ids).toEqual([]);
        expect(DEFAULT_TOUR_COMMS_CONFIG.internal_recipients.enabled).toBe(true);

        const one = mergeTourCommsConfig(
            parseTourCommsConfigFragment({
                internal_recipients: { enabled: true, user_ids: ["user-a"] },
            }),
            {},
        );
        expect(one.internal_recipients.user_ids).toEqual(["user-a"]);

        const many = mergeTourCommsConfig(
            parseTourCommsConfigFragment({
                internal_recipients: { enabled: true, user_ids: ["user-a", "user-b", "user-a"] },
            }),
            {},
        );
        expect(many.internal_recipients.user_ids).toEqual(["user-a", "user-b"]);

        const off = mergeTourCommsConfig(
            parseTourCommsConfigFragment({
                internal_recipients: { enabled: false, user_ids: ["user-a"] },
            }),
            {},
        );
        expect(off.internal_recipients.enabled).toBe(false);
    });

    it("preserves multi-reminder shape for later 48h+24h stacks", () => {
        const rows = schedule({
            reminder_offsets: [
                { reminder_key: "r48", offset_minutes: 2880, channels: ["email"] },
                { reminder_key: "r24", offset_minutes: 1440, channels: ["email"] },
            ],
            channels: { email: true, sms: false },
        });
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.reminderKey).sort()).toEqual(["r24", "r48"]);
    });
});
