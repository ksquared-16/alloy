/**
 * Interactive Tour Invitation — Slice A: structured authored content.
 *
 * The claim under test: the message carries an invitation SNAPSHOT and action
 * REFERENCES, never mutable availability as authority.
 */
import { describe, expect, it } from "vitest";

import {
    TOUR_ACTION_REUSE,
    buildTourInvitationSnapshot,
    renderTourInvitationSms,
    renderTourInvitationText,
    validateTourInvitationContent,
    type TourInvitationContent,
    type TourOption,
} from "@/lib/tours/invitation/tourInvitationContent";

const LOCATION = "cccccccc-0000-4000-8000-00000000000c";

const option = (over: Partial<TourOption> = {}): TourOption => ({
    optionId: "opt-1",
    date: "2026-08-10",
    startTime: "09:00",
    timezone: "America/Los_Angeles",
    locationId: LOCATION,
    locationLabel: "North Campus",
    availabilityRef: "rule-1:2026-08-10T09:00",
    presentationLabel: "Monday, August 10 · 9:00 AM",
    actionKind: "select_tour_slot",
    ...over,
});

const content = (over: Partial<TourInvitationContent> = {}): TourInvitationContent => ({
    kind: "tour_invitation",
    text: "We'd love to show you around.",
    options: [option(), option({ optionId: "opt-2", startTime: "11:30", presentationLabel: "Monday, August 10 · 11:30 AM" })],
    primaryAction: { kind: "select_tour_slot", label: "Choose this time", actionRef: "act-select" },
    secondaryAction: { kind: "view_more_tour_slots", label: "More dates and times", actionRef: "act-more" },
    fallbackActionUrl: "https://alloy.example/tour-booking/abc123",
    expiresAt: null,
    ...over,
});

describe("content validation", () => {
    it("accepts a well-formed invitation", () => {
        expect(validateTourInvitationContent(content())).toBeNull();
    });

    it("REFUSES an invitation with no options rather than rendering an empty list", () => {
        const v = validateTourInvitationContent(content({ options: [] }));
        expect(v?.code).toBe("no_options");
        // Operator-safe: says what to check, not what threw.
        expect(v?.message).toMatch(/tour availability/i);
    });

    it("refuses options across more than one location", () => {
        const v = validateTourInvitationContent(
            content({ options: [option(), option({ optionId: "opt-2", locationId: "dddddddd-0000-4000-8000-00000000000d" })] })
        );
        expect(v?.code).toBe("mixed_locations");
    });

    it("refuses duplicate options", () => {
        expect(validateTourInvitationContent(content({ options: [option(), option()] }))?.code).toBe("duplicate_option");
    });

    it("requires a timezone on every option — a bare time is ambiguous", () => {
        expect(validateTourInvitationContent(content({ options: [option({ timezone: "" })] }))?.code).toBe(
            "missing_timezone"
        );
    });

    it("requires an availability reference — provenance, not permission", () => {
        expect(validateTourInvitationContent(content({ options: [option({ availabilityRef: "" })] }))?.code).toBe(
            "missing_availability_ref"
        );
    });

    it("requires the no-login fallback URL", () => {
        expect(validateTourInvitationContent(content({ fallbackActionUrl: "" }))?.code).toBe("missing_fallback");
    });

    it("rejects malformed dates and times", () => {
        expect(validateTourInvitationContent(content({ options: [option({ date: "Aug 10" })] }))?.code).toBe("bad_date");
        expect(validateTourInvitationContent(content({ options: [option({ startTime: "9am" })] }))?.code).toBe("bad_time");
        expect(validateTourInvitationContent(content({ options: [option({ startTime: "24:00" })] }))?.code).toBe("bad_time");
    });

    it("an option may only invoke select_tour_slot", () => {
        expect(
            validateTourInvitationContent(
                content({ options: [option({ actionKind: "decline_tour" as never })] })
            )?.code
        ).toBe("bad_option_action");
    });
});

describe("action reuse semantics", () => {
    it("makes the two consequential actions single-use", () => {
        expect(TOUR_ACTION_REUSE.select_tour_slot).toBe("single_use");
        expect(TOUR_ACTION_REUSE.decline_tour).toBe("single_use");
    });

    it("lets viewing more times be reusable until expiry", () => {
        expect(TOUR_ACTION_REUSE.view_more_tour_slots).toBe("reusable_until_expiry");
    });

    it("makes reschedule single-use — it is issued fresh against an existing booking", () => {
        expect(TOUR_ACTION_REUSE.reschedule_tour).toBe("single_use");
    });
});

describe("immutable snapshot", () => {
    it("captures exactly what was offered", () => {
        const snap = buildTourInvitationSnapshot({
            invitationId: "inv-1",
            capturedAt: "2026-08-01T12:00:00Z",
            content: content(),
        });
        expect(snap.options).toHaveLength(2);
        expect(snap.locationId).toBe(LOCATION);
        expect(snap.timezone).toBe("America/Los_Angeles");
    });

    it("COPIES options so the snapshot cannot drift with the draft", () => {
        const c = content();
        const snap = buildTourInvitationSnapshot({ invitationId: "inv-1", capturedAt: "2026-08-01T12:00:00Z", content: c });
        c.options[0]!.presentationLabel = "MUTATED";
        c.options.push(option({ optionId: "opt-3" }));
        expect(snap.options).toHaveLength(2);
        expect(snap.options[0]!.presentationLabel).toBe("Monday, August 10 · 9:00 AM");
    });

    it("carries no availability authority — only what was shown", () => {
        const snap = buildTourInvitationSnapshot({
            invitationId: "inv-1",
            capturedAt: "2026-08-01T12:00:00Z",
            content: content(),
        });
        // Nothing in the snapshot grants a booking; it is evidence, not permission.
        expect(JSON.stringify(snap)).not.toMatch(/token|credential|authoriz/i);
    });
});

describe("transport rendering", () => {
    it("renders a readable plain-text fallback with the options and the action URL", () => {
        const text = renderTourInvitationText(content());
        expect(text).toContain("Available tour times");
        expect(text).toContain("Monday, August 10 · 9:00 AM");
        expect(text).toContain("Monday, August 10 · 11:30 AM");
        expect(text).toContain("https://alloy.example/tour-booking/abc123");
        expect(text).toContain("More dates and times");
    });

    it("states the holding caveat when the invitation expires", () => {
        expect(renderTourInvitationText(content({ expiresAt: "2026-08-05T00:00:00Z" }))).toMatch(
            /only while they remain available/i
        );
    });

    it("SMS carries ONE link and no slot list", () => {
        const sms = renderTourInvitationSms({
            recipientFirstName: "Kelly",
            locationLabel: "North Campus",
            actionUrl: "https://alloy.example/tour-booking/abc123",
        });
        expect(sms).toContain("Hi Kelly");
        expect(sms).toContain("North Campus");
        expect(sms).toContain("https://alloy.example/tour-booking/abc123");
        // Deliberately no times: a stale option list is worse on SMS than a link.
        expect(sms).not.toMatch(/9:00 AM|11:30 AM/);
        expect(sms.length).toBeLessThan(320);
    });

    it("omits the greeting cleanly when no name is known", () => {
        const sms = renderTourInvitationSms({
            recipientFirstName: null,
            locationLabel: "North Campus",
            actionUrl: "https://alloy.example/t/x",
        });
        expect(sms.startsWith("choose a time")).toBe(true);
    });

    it("exposes no raw identifiers to the parent", () => {
        const text = renderTourInvitationText(content());
        expect(text).not.toContain(LOCATION);
        expect(text).not.toMatch(/opt-1|rule-1/);
    });
});
