/**
 * Tour system templates + friendly Email link polish.
 */

import { describe, expect, it } from "vitest";

import { composerMarkupToEmailHtml } from "@/lib/communications/v2/familyWorkspace/composerBodyMarkup";
import {
    mergeTourCommsTemplateOverrides,
    parseTourSystemTemplateKey,
    TOUR_SYSTEM_TEMPLATE_KEYS,
    tourSystemTemplateKeyForChannel,
    validateTourSystemTemplateRequiredPlaceholders,
} from "@/lib/tours/comms/tourSystemTemplates";
import { buildShortActionLinkUrl } from "@/lib/actionLinks";
import {
    polishTourCommsEmailHtml,
    polishTourCommsPlainEmailToHtml,
    renderTourCommsTemplate,
} from "@/lib/tours/comms/tourCommsTemplates";
import { isSafeTourBookingRedirectPath } from "@/lib/tours/invitation/tourBookingPublicAlias";

const baseContext = {
    orgName: "Sunrise Learning Center",
    locationName: "Main Campus",
    locationAddress: "123 Oak St",
    tourStartAt: "2026-06-15T17:00:00.000Z",
    tourEndAt: "2026-06-15T18:00:00.000Z",
    timezone: "America/Los_Angeles",
    parentName: "Jordan Smith",
    addToCalendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tour",
    rescheduleUrl: "https://example.com/tour-booking/reschedule-token-abc",
    cancelUrl: "https://example.com/tour-booking/manage-token-xyz",
    invitationActionUrl: "https://example.com/a/inviteShort",
};

describe("Tour friendly Email link polish", () => {
    it("confirmation HTML uses friendly anchors with full hrefs", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "tour_confirmation",
            channel: "email",
            context: baseContext,
        });
        expect(msg?.channel).toBe("email");
        if (msg?.channel !== "email") return;
        expect(msg.bodyText).toContain("https://calendar.google.com/");
        expect(msg.bodyHtml).toContain('href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=Tour"');
        expect(msg.bodyHtml).toContain(">Add to calendar</a>");
        expect(msg.bodyHtml).toContain('href="https://example.com/tour-booking/reschedule-token-abc"');
        expect(msg.bodyHtml).toContain(">Reschedule tour</a>");
        expect(msg.bodyHtml).toContain('href="https://example.com/tour-booking/manage-token-xyz"');
        expect(msg.bodyHtml).toContain(">Manage or cancel tour</a>");
        expect(msg.bodyHtml).not.toMatch(/>https:\/\/calendar\.google\.com/);
    });

    it("invitation HTML labels Choose a tour time", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "tour_invitation",
            channel: "email",
            context: baseContext,
        });
        expect(msg?.channel).toBe("email");
        if (msg?.channel !== "email") return;
        expect(msg.bodyHtml).toContain(">Choose a tour time</a>");
        expect(msg.bodyHtml).toContain('href="https://example.com/a/inviteShort"');
    });

    it("SMS keeps raw URL (no anchors)", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "tour_invitation",
            channel: "sms",
            context: baseContext,
        });
        expect(msg?.channel).toBe("sms");
        if (msg?.channel !== "sms") return;
        expect(msg.body).toContain("https://example.com/a/inviteShort");
        expect(msg.body).not.toContain("<a ");
    });

    it("family-send composer polish converts labeled URLs to anchors", () => {
        const raw = [
            "Hello Jordan,",
            "",
            "Add to calendar: https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tour",
            "Need to reschedule? https://example.com/r",
            "Manage or cancel your tour: https://example.com/m",
        ].join("\n");
        const converted = composerMarkupToEmailHtml(raw);
        expect(converted.ok).toBe(true);
        if (!converted.ok) return;
        expect(converted.html).toContain(">Add to calendar</a>");
        expect(converted.html).toContain(">Reschedule tour</a>");
        expect(converted.html).toContain(">Manage or cancel tour</a>");
        expect(converted.html).toContain('href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=Tour"');
    });

    it("invitation composer→render keeps Choose a tour time href in HTML and URL in text", async () => {
        const { renderOutboundMessage } = await import("@/lib/communications/render/renderOutboundMessage");
        const url = "http://127.0.0.1:3015/a/inviteAlive";
        const plain = `Hi Jordan,\n\nChoose a tour time:\n${url}\n\nThanks`;
        const converted = composerMarkupToEmailHtml(plain);
        expect(converted.ok).toBe(true);
        if (!converted.ok) return;
        expect(converted.html).toMatch(new RegExp(`href="${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
        expect(converted.html).toContain(">Choose a tour time</a>");

        const rendered = renderOutboundMessage({
            subject: "Tour invite",
            body: converted.html,
            bodyIsHtml: true,
            context: { values: {}, channel: "email", template: null },
        });
        expect(rendered.ok).toBe(true);
        if (!rendered.ok) return;
        expect(rendered.output.html).toContain(`href="${url}"`);
        expect(rendered.output.html).toContain(">Choose a tour time</a>");
        // Plain text must still carry the destination (dispatcher text fallback / multipart).
        expect(rendered.output.text).toContain(url);
        expect(rendered.snapshot.html).toContain(`href="${url}"`);
        expect(rendered.snapshot.text).toContain(url);
    });

    it("polishTourCommsPlainEmailToHtml handles plain confirmation lines", () => {
        const html = polishTourCommsPlainEmailToHtml(
            "Add to calendar: https://cal.example/x\nManage or cancel your tour: https://m.example/y",
        );
        expect(html).toContain(">Add to calendar</a>");
        expect(html).toContain(">Manage or cancel tour</a>");
        expect(polishTourCommsEmailHtml(html)).toContain("href=");
    });
});

describe("Tour system templates", () => {
    it("defines required system keys for supported lifecycle messages", () => {
        expect(TOUR_SYSTEM_TEMPLATE_KEYS).toContain("tour_invitation");
        expect(TOUR_SYSTEM_TEMPLATE_KEYS).toContain("tour_confirmation");
        expect(TOUR_SYSTEM_TEMPLATE_KEYS).toContain("tour_reminder");
        expect(TOUR_SYSTEM_TEMPLATE_KEYS).toContain("tour_reschedule");
        expect(TOUR_SYSTEM_TEMPLATE_KEYS).toContain("tour_cancel");
        expect(TOUR_SYSTEM_TEMPLATE_KEYS).toContain("tour_no_show_followup");
        expect(tourSystemTemplateKeyForChannel("tour_invitation", "email")).toBe("tour_invitation:email");
        expect(parseTourSystemTemplateKey("tour_confirmation:sms")).toEqual({
            eventKey: "tour_confirmation",
            channel: "sms",
        });
    });

    it("blocks saving Tour Invitation without invitation link placeholder", () => {
        const bad = validateTourSystemTemplateRequiredPlaceholders({
            systemKey: "tour_invitation:email",
            subject: "Visit us",
            body: "Hello {{parent_name}}, come by sometime.",
        });
        expect(bad.ok).toBe(false);
        if (bad.ok) return;
        expect(bad.error).toMatch(/Tour Invitation Link/i);

        const good = validateTourSystemTemplateRequiredPlaceholders({
            systemKey: "tour_invitation:email",
            subject: "Visit us",
            body: "Pick a time: {{invitation_action_url}}",
        });
        expect(good.ok).toBe(true);
    });

    it("library overrides win over metadata templates", () => {
        const merged = mergeTourCommsTemplateOverrides(
            {
                tour_confirmation: {
                    email: { subject: "Meta subject", body_text: "meta body" },
                },
            },
            {
                tour_confirmation: {
                    email: { subject: "Library subject {{parent_name}}", body_text: "library body" },
                },
            },
        );
        expect(merged.tour_confirmation?.email?.subject).toBe("Library subject {{parent_name}}");
        expect(merged.tour_confirmation?.email?.body_text).toBe("library body");
    });

    it("library override is used by renderTourCommsTemplate", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "tour_confirmation",
            channel: "email",
            context: baseContext,
            templateOverrides: {
                tour_confirmation: {
                    email: {
                        subject: "Edited confirmation for {{parent_name}}",
                        body_text: [
                            "Hello {{parent_name}},",
                            "",
                            "Custom line.",
                            "Add to calendar: {{add_to_calendar_url}}",
                        ].join("\n"),
                    },
                },
            },
        });
        expect(msg?.channel).toBe("email");
        if (msg?.channel !== "email") return;
        expect(msg.subject).toBe("Edited confirmation for Jordan");
        expect(msg.bodyText).toContain("Custom line.");
        expect(msg.bodyHtml).toContain(">Add to calendar</a>");
    });
});

describe("Tour short-link absolute URLs", () => {
    it("buildShortActionLinkUrl prefers caller origin override", () => {
        expect(buildShortActionLinkUrl("AbCdEf12", "http://localhost:3015")).toBe(
            "http://localhost:3015/a/AbCdEf12",
        );
    });

    it("tour booking redirect paths stay same-origin only", () => {
        expect(isSafeTourBookingRedirectPath("/tour-booking/token-abc")).toBe(true);
        expect(isSafeTourBookingRedirectPath("https://evil.example/tour-booking/x")).toBe(false);
    });
});
