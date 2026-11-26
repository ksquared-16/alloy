import { describe, expect, it } from "vitest";
import { buildTourCommsMergeFields, formatTourCommsDateTimeLabels } from "@/lib/tours/comms/tourCommsTemplateContext";
import { renderOutboundMessage } from "@/lib/communications/render/renderOutboundMessage";
import {
    applyTourCommsPlaceholders,
    getDefaultTourCommsTemplateSet,
    normalizeTourCommsEventKey,
    polishTourCommsEmailHtml,
    renderTourCommsTemplate,
} from "@/lib/tours/comms/tourCommsTemplates";

const baseContext = {
    orgName: "Sunrise Learning Center",
    locationName: "Main Campus",
    locationAddress: "123 Oak St, Portland, OR",
    tourStartAt: "2026-06-15T17:00:00.000Z",
    tourEndAt: "2026-06-15T18:00:00.000Z",
    timezone: "America/Los_Angeles",
    parentName: "Jordan Smith",
    addToCalendarUrl: "https://example.com/calendar.ics",
    rescheduleUrl: "https://example.com/reschedule",
};

describe("normalizeTourCommsEventKey", () => {
    it("maps aliases to canonical keys", () => {
        expect(normalizeTourCommsEventKey("confirmation")).toBe("tour_confirmation");
        expect(normalizeTourCommsEventKey("no_show_follow_up")).toBe("tour_no_show_followup");
    });

    it("returns null for unknown keys", () => {
        expect(normalizeTourCommsEventKey("marketing_blast")).toBeNull();
    });
});

describe("renderTourCommsTemplate", () => {
    it("renders default confirmation email", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "confirmation",
            channel: "email",
            context: baseContext,
        });
        expect(msg?.channel).toBe("email");
        if (msg?.channel !== "email") return;
        expect(msg.subject).toContain("scheduled");
        expect(msg.bodyText).toContain("Jordan");
        expect(msg.bodyText).toContain("Sunrise Learning Center");
        expect(msg.bodyText).toContain("https://example.com/calendar.ics");
        expect(msg.bodyText).not.toContain("America/Los_Angeles");
        expect(msg.bodyHtml).toContain("<p>");
        expect(msg.bodyHtml).toContain('href="https://example.com/calendar.ics"');
        expect(msg.bodyHtml).toContain("Add to calendar</a>");
    });

    it("renders default reminder SMS", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "reminder",
            channel: "sms",
            context: baseContext,
        });
        expect(msg?.channel).toBe("sms");
        if (msg?.channel !== "sms") return;
        expect(msg.body.length).toBeLessThan(320);
        expect(msg.body).toMatch(/Reminder/i);
        expect(msg.body).toContain("Main Campus");
    });

    it("override subject only keeps default body", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "tour_confirmation",
            channel: "email",
            context: baseContext,
            templateOverrides: {
                tour_confirmation: {
                    email: { subject: "Custom subject for {{parent_name}}" },
                },
            },
        });
        expect(msg?.channel).toBe("email");
        if (msg?.channel !== "email") return;
        expect(msg.subject).toBe("Custom subject for Jordan");
        expect(msg.bodyText).toContain("Your tour is confirmed");
    });

    it("override email body only keeps default subject", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "tour_confirmation",
            channel: "email",
            context: baseContext,
            templateOverrides: {
                tour_confirmation: {
                    email: { body_text: "Only body for {{parent_name}} at {{location_name}}." },
                },
            },
        });
        expect(msg?.channel).toBe("email");
        if (msg?.channel !== "email") return;
        expect(msg.subject).toContain("scheduled");
        expect(msg.bodyText).toBe("Only body for Jordan at Main Campus.");
    });

    it("override SMS only", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "tour_reminder",
            channel: "sms",
            context: baseContext,
            templateOverrides: {
                tour_reminder: {
                    sms: { body_text: "SMS override {{tour_display_label}}" },
                },
            },
        });
        expect(msg?.channel).toBe("sms");
        if (msg?.channel !== "sms") return;
        expect(msg.body.startsWith("SMS override")).toBe(true);
    });

    it("missing merge fields degrade gracefully", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "confirmation",
            channel: "email",
            context: {
                parentName: "Alex",
                tourStartAt: "2026-06-15T17:00:00.000Z",
                timezone: "America/Los_Angeles",
            },
        });
        expect(msg?.channel).toBe("email");
        if (msg?.channel !== "email") return;
        expect(msg.bodyText).toContain("Alex");
        expect(msg.bodyText).not.toContain("{{");
        expect(msg.bodyText).not.toMatch(/Add to calendar:\s*\n/i);
    });

    it("returns null for unknown template event key", () => {
        expect(
            renderTourCommsTemplate({
                eventKey: "unknown_event",
                channel: "email",
                context: baseContext,
            })
        ).toBeNull();
    });

    it("does not crash on malformed override input", () => {
        const msg = renderTourCommsTemplate({
            eventKey: "cancel",
            channel: "email",
            context: baseContext,
            templateOverrides: {
                tour_cancel: {
                    email: { subject: "   ", body_text: "Canceled for {{parent_name}}." },
                },
            } as never,
        });
        expect(msg?.channel).toBe("email");
    });
});

describe("getDefaultTourCommsTemplateSet", () => {
    it("includes all five parent-facing event defaults", () => {
        const set = getDefaultTourCommsTemplateSet();
        for (const key of [
            "tour_confirmation",
            "tour_reminder",
            "tour_reschedule",
            "tour_cancel",
            "tour_no_show_followup",
        ] as const) {
            expect(set[key]?.email?.body_text).toBeTruthy();
        }
    });
});

describe("applyTourCommsPlaceholders", () => {
    it("replaces merge tokens", () => {
        expect(applyTourCommsPlaceholders("Hi {{parent_name}}", { parent_name: "Sam" })).toBe("Hi Sam");
    });
});

describe("formatTourCommsDateTimeLabels", () => {
    it("formats wall labels from booking instant", () => {
        const labels = formatTourCommsDateTimeLabels({
            tourStartAt: "2026-06-15T17:00:00.000Z",
            timezone: "America/Los_Angeles",
        });
        expect(labels.tourDisplayLabel).not.toBe("");
    });
});

describe("polishTourCommsEmailHtml", () => {
    it("wraps calendar URL in a CTA link", () => {
        const html = polishTourCommsEmailHtml(
            "<p>Add to calendar: https://example.com/calendar.ics</p>"
        );
        expect(html).toContain('href="https://example.com/calendar.ics"');
        expect(html).toContain("Add to calendar</a>");
        expect(html).not.toContain("https://example.com/calendar.ics</p>");
    });
});

describe("buildTourCommsMergeFields", () => {
    it("uses first name for parent_name", () => {
        const m = buildTourCommsMergeFields({ parentName: "Taylor Jones" });
        expect(m.parent_name).toBe("Taylor");
    });
});

/**
 * Does any Tour template hit the canonical renderer's `render_blocked` path?
 *
 * The orchestrator pre-renders a Tour body and hands it to
 * `enqueueCanonicalOutboundMessage` as FREE TEXT — no renderContext, no template
 * lineage — so `renderOutboundMessage` re-validates it before the eligibility
 * gate ever runs. A block there returns `render_blocked:<CODE>` and, unlike an
 * eligibility block, still persists nothing.
 *
 * This answers whether that open hole touches Interactive Tour today.
 */
describe("Tour templates clear the canonical renderer", () => {
    const parentFacingKeys = [
        "tour_invitation",
        "tour_confirmation",
        "tour_reminder",
        "tour_reschedule",
        "tour_cancel",
        "tour_no_show_followup",
    ] as const;

    for (const eventKey of parentFacingKeys) {
        for (const channel of ["email", "sms"] as const) {
            it(`${eventKey} / ${channel} renders without blocking`, () => {
                const tpl = renderTourCommsTemplate({ eventKey, channel, context: baseContext });
                if (!tpl) return; // key not offered on this channel

                const result = renderOutboundMessage({
                    subject: tpl.channel === "email" ? tpl.subject : null,
                    body: tpl.channel === "email" ? tpl.bodyText : tpl.body,
                    bodyIsHtml: false,
                    context: { values: {}, channel, template: null },
                    expectedFingerprint: null,
                });

                if (!result.ok) {
                    throw new Error(`${eventKey}/${channel} blocked: ${result.block.code} — ${result.block.message}`);
                }
                expect(result.output.text).not.toContain("{{");
            });
        }
    }
});
