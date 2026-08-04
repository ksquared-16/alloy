import type { TourCommsChannel, TourCommsEventKey, TourCommsTemplate, TourCommsTemplates } from "@/lib/tours/comms/tourCommsConfig";
import { TOUR_COMMS_EVENT_KEYS } from "@/lib/tours/comms/tourCommsConfig";
import {
    buildTourCommsMergeFields,
    type TourCommsTemplateContext,
} from "@/lib/tours/comms/tourCommsTemplateContext";

/** Alias keys accepted by {@link normalizeTourCommsEventKey}. */
export type TourCommsTemplateEventAlias =
    | TourCommsEventKey
    | "confirmation"
    | "reschedule"
    | "cancel"
    | "reminder"
    | "no_show_follow_up";

/**
 * Short human aliases only. Canonical `tour_*` keys are derived from
 * `TOUR_COMMS_EVENT_KEYS` below rather than restated by hand.
 *
 * This map previously listed every canonical key manually and had silently drifted:
 * `tour_invitation` and `tour_pending_internal` were missing, so
 * `normalizeTourCommsEventKey` returned null for them, `renderTourCommsTemplate`
 * returned null, and the send was skipped as `empty_body`. An entire message type
 * could not render and nothing failed loudly. Deriving the identity entries makes a
 * newly added event key renderable by construction.
 */
const EVENT_ALIASES: Record<string, TourCommsEventKey> = {
    confirmation: "tour_confirmation",
    reschedule: "tour_reschedule",
    cancel: "tour_cancel",
    reminder: "tour_reminder",
    no_show_follow_up: "tour_no_show_followup",
    ...Object.fromEntries(TOUR_COMMS_EVENT_KEYS.map((k) => [k, k])),
};

export type TourCommsDefaultTemplateSet = Record<
    TourCommsEventKey,
    Partial<Record<TourCommsChannel, TourCommsTemplate>>
>;

export type RenderedTourCommsEmail = {
    channel: "email";
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
};

export type RenderedTourCommsSms = {
    channel: "sms";
    body: string;
};

export type RenderedTourCommsMessage = RenderedTourCommsEmail | RenderedTourCommsSms;

export type RenderTourCommsTemplateInput = {
    eventKey: TourCommsTemplateEventAlias | string;
    channel: TourCommsChannel;
    context: TourCommsTemplateContext;
    /** Config overrides (`TourCommsConfig.templates`). */
    templateOverrides?: TourCommsTemplates | null;
};

const DEFAULT_EMAIL_SUBJECT: Partial<Record<TourCommsEventKey, string>> = {
    tour_invitation: "Come visit {{location_name}} — pick a time that works",
    tour_confirmation: "Your tour is scheduled — {{tour_display_label}}",
    tour_reminder: "Reminder: tour on {{tour_display_label}}",
    tour_reschedule: "Your tour has been rescheduled — {{tour_display_label}}",
    tour_cancel: "Tour canceled — {{location_name}}",
    tour_no_show_followup: "Following up on your tour visit",
};

const DEFAULT_EMAIL_BODY: Record<TourCommsEventKey, string> = {
    // Leads with who the tour is for and where. No login, no ids, no platform words.
    tour_invitation: [
        "Hello {{parent_name}},",
        "",
        "We would love to show {{child_name}} around {{location_name}}.",
        "{{site_line}}",
        "",
        "Here are some times that work for us — choose whichever suits you:",
        "",
        "{{tour_options_block}}",
        "",
        "None of these work? See more times: {{invitation_action_url}}",
        "Not the right time for your family? Let us know: {{decline_url}}",
        "",
        "We look forward to meeting you.",
        "",
        "Warmly,",
        "{{org_name}}",
    ].join("\n"),
    tour_confirmation: [
        "Hello {{parent_name}},",
        "",
        "Your tour is confirmed for {{tour_display_label}}.",
        "{{site_line}}",
        "",
        "Add to calendar: {{add_to_calendar_url}}",
        "Need to reschedule? {{reschedule_url}}",
        "",
        "We look forward to meeting you.",
        "",
        "Warmly,",
        "{{org_name}}",
    ].join("\n"),
    tour_reminder: [
        "Hello {{parent_name}},",
        "",
        "This is a friendly reminder about your upcoming tour on {{tour_display_label}}.",
        "{{site_line}}",
        "",
        "Add to calendar: {{add_to_calendar_url}}",
        "Need to reschedule? {{reschedule_url}}",
        "",
        "See you soon,",
        "{{org_name}}",
    ].join("\n"),
    tour_reschedule: [
        "Hello {{parent_name}},",
        "",
        "Your tour has been moved to {{tour_display_label}}.",
        "{{site_line}}",
        "",
        "Add to calendar: {{add_to_calendar_url}}",
        "",
        "If this time does not work, please contact us or reschedule here: {{reschedule_url}}",
        "",
        "Thank you,",
        "{{org_name}}",
    ].join("\n"),
    tour_cancel: [
        "Hello {{parent_name}},",
        "",
        "Your scheduled tour on {{tour_display_label}} at {{location_name}} has been canceled.",
        "",
        "If you would like to book a new time: {{public_booking_url}}",
        "",
        "Thank you,",
        "{{org_name}}",
    ].join("\n"),
    tour_no_show_followup: [
        "Hello {{parent_name}},",
        "",
        "We missed you at your scheduled tour on {{tour_display_label}}. We would still love to connect and answer any questions about enrollment.",
        "",
        "Book a new time: {{public_booking_url}}",
        "Or reply to this message and we will help you find a time that works.",
        "",
        "Thank you,",
        "{{org_name}}",
    ].join("\n"),
    tour_pending_internal: [
        "A tour booking is pending approval for {{opportunity_name}} on {{tour_display_label}}.",
        "Site: {{site_line}}",
    ].join("\n"),
};

const DEFAULT_SMS_BODY: Partial<Record<TourCommsEventKey, string>> = {
    // SMS carries one link, not the option list — the page shows the times.
    tour_invitation:
        "Hi {{parent_name}}, we'd love to show {{child_name}} around {{location_name}}. Pick a tour time here: {{invitation_action_url}}",
    tour_confirmation:
        "Hi {{parent_name}}, your tour is set for {{tour_display_label}} at {{location_name}}. Details: {{add_to_calendar_url}}",
    tour_reminder: "Reminder: tour {{tour_display_label}} at {{location_name}}. Reply if you need to reschedule.",
    tour_reschedule: "Your tour was moved to {{tour_display_label}} at {{location_name}}.",
    tour_cancel: "Your tour on {{tour_display_label}} at {{location_name}} was canceled. Reply to rebook.",
    tour_no_show_followup: "We missed you at your tour. Reply or book here: {{public_booking_url}}",
};

/** Platform default templates (Batch 2). Not org-specific. */
export function getDefaultTourCommsTemplateSet(): TourCommsDefaultTemplateSet {
    const out = {} as TourCommsDefaultTemplateSet;
    for (const key of TOUR_COMMS_EVENT_KEYS) {
        const emailSubject = DEFAULT_EMAIL_SUBJECT[key];
        const emailBody = DEFAULT_EMAIL_BODY[key];
        const smsBody = DEFAULT_SMS_BODY[key];
        const entry: Partial<Record<TourCommsChannel, TourCommsTemplate>> = {};
        if (emailSubject || emailBody) {
            entry.email = {
                subject: emailSubject ?? `Update from {{org_name}}`,
                body_text: emailBody,
            };
        }
        if (smsBody) {
            entry.sms = { body_text: smsBody };
        }
        out[key] = entry;
    }
    return out;
}

/** Map alias / string to canonical {@link TourCommsEventKey}; null when unknown. */
export function normalizeTourCommsEventKey(raw: string): TourCommsEventKey | null {
    const k = String(raw ?? "").trim().toLowerCase();
    if (!k) return null;
    return EVENT_ALIASES[k] ?? null;
}

export function applyTourCommsPlaceholders(template: string, mergeFields: Record<string, string>): string {
    let out = String(template ?? "");
    for (const [key, val] of Object.entries(mergeFields)) {
        out = out.split(`{{${key}}}`).join(val);
    }
    return out;
}

/** Remove lines that became empty labels after merge (optional URLs, site_line). */
export function omitEmptyOptionalTourCommsLines(text: string): string {
    const lines = text.split("\n");
    const filtered = lines.filter((line) => {
        const t = line.trim();
        if (!t) return true;
        if (/^Add to calendar:\s*$/i.test(t)) return false;
        if (/^Need to reschedule\?\s*$/i.test(t)) return false;
        if (/^Book a new time:\s*$/i.test(t)) return false;
        if (/^If you would like to book a new time:\s*$/i.test(t)) return false;
        if (/^If this time does not work.*:\s*$/i.test(t)) return false;
        if (t === "{{site_line}}") return false;
        if (/^Site:\s*$/.test(t)) return false;
        return true;
    });
    return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function plainTextToSimpleHtml(text: string): string {
    const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const paras = escaped.split(/\n{2,}/).map((p) => p.replace(/\n/g, "<br/>"));
    return paras.map((p) => `<p>${p}</p>`).join("\n");
}

/** Turn plain merged lines into parent-friendly HTML CTAs (text body keeps raw URLs). */
export function polishTourCommsEmailHtml(bodyHtml: string): string {
    let out = bodyHtml;
    out = out.replace(
        /Add to calendar:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#2563eb;text-decoration:underline;">Add to calendar</a>'
    );
    out = out.replace(
        /Need to reschedule\?\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#2563eb;text-decoration:underline;">Reschedule your tour</a>'
    );
    out = out.replace(
        /If this time does not work, please contact us or reschedule here:\s*(https?:\/\/[^\s<]+)/gi,
        'If this time does not work, please <a href="$1" style="color:#2563eb;text-decoration:underline;">reschedule here</a> or reply to this email.'
    );
    out = out.replace(
        /If you would like to book a new time:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#2563eb;text-decoration:underline;">Book a new time</a>'
    );
    out = out.replace(
        /Book a new time:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#2563eb;text-decoration:underline;">Book a new time</a>'
    );
    return out;
}

function resolveEffectiveTemplate(
    eventKey: TourCommsEventKey,
    channel: TourCommsChannel,
    overrides: TourCommsTemplates | null | undefined
): TourCommsTemplate {
    const defaults = getDefaultTourCommsTemplateSet()[eventKey]?.[channel] ?? {};
    const override = overrides?.[eventKey]?.[channel];
    if (!override) return { ...defaults };
    return {
        subject: override.subject?.trim() ? override.subject : defaults.subject,
        body_text: override.body_text?.trim() ? override.body_text : defaults.body_text,
        body_html: override.body_html?.trim() ? override.body_html : defaults.body_html,
    };
}

/**
 * Render a tour comms template for email or SMS. Does not send messages.
 * Returns null when event key is unknown or channel has no default/override body.
 */
export function renderTourCommsTemplate(input: RenderTourCommsTemplateInput): RenderedTourCommsMessage | null {
    const canonical = normalizeTourCommsEventKey(String(input.eventKey ?? ""));
    if (!canonical) return null;

    const mergeFields = buildTourCommsMergeFields(input.context);
    const effective = resolveEffectiveTemplate(canonical, input.channel, input.templateOverrides);

    if (input.channel === "sms") {
        const raw = effective.body_text ?? DEFAULT_SMS_BODY[canonical] ?? "";
        if (!String(raw).trim()) return null;
        const body = omitEmptyOptionalTourCommsLines(applyTourCommsPlaceholders(raw, mergeFields));
        if (!body.trim()) return null;
        return { channel: "sms", body };
    }

    const subjectRaw = effective.subject ?? DEFAULT_EMAIL_SUBJECT[canonical] ?? "Update from {{org_name}}";
    const bodyRaw = effective.body_text ?? DEFAULT_EMAIL_BODY[canonical] ?? "";
    if (!String(bodyRaw).trim()) return null;

    const subject = applyTourCommsPlaceholders(subjectRaw, mergeFields).trim();
    const bodyText = omitEmptyOptionalTourCommsLines(applyTourCommsPlaceholders(bodyRaw, mergeFields));
    if (!bodyText.trim()) return null;

    const bodyHtml = effective.body_html?.trim()
        ? omitEmptyOptionalTourCommsLines(applyTourCommsPlaceholders(effective.body_html, mergeFields))
        : polishTourCommsEmailHtml(plainTextToSimpleHtml(bodyText));

    return {
        channel: "email",
        subject: subject || "Tour update",
        bodyText,
        bodyHtml,
    };
}
