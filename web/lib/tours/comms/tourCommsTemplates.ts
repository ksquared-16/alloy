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
    tour_reminder: "Your tour is tomorrow — {{tour_display_label}}",
    tour_reschedule: "Your tour has been rescheduled — {{tour_display_label}}",
    tour_cancel: "Tour canceled — {{location_name}}",
    tour_no_show_followup: "Following up on your tour visit",
};

const DEFAULT_EMAIL_BODY: Record<TourCommsEventKey, string> = {
    // Leads with who the tour is for and where. No login, no ids, no platform words.
    tour_invitation: [
        "Hello {{parent_name}},",
        "",
        "We’d love to show your family around {{location_name}}.",
        "{{site_line}}",
        "",
        "Choose a tour time:",
        "{{invitation_action_url}}",
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
        "Manage or cancel your tour: {{cancel_url}}",
        "",
        "We look forward to meeting you.",
        "",
        "Warmly,",
        "{{org_name}}",
    ].join("\n"),
    tour_reminder: [
        "Hello {{parent_name}},",
        "",
        "Your tour is tomorrow.",
        "",
        "{{tour_display_label}}",
        "{{site_line}}",
        "",
        "Confirm I'm coming: {{confirm_attendance_url}}",
        "Need to reschedule? {{reschedule_url}}",
        "Manage or cancel your tour: {{cancel_url}}",
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
        "Manage or cancel your tour: {{cancel_url}}",
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
        "Hi {{parent_name}}, we'd love to show your family around {{location_name}}. Pick a tour time: {{invitation_action_url}}",
    tour_confirmation:
        "Hi {{parent_name}}, your tour is set for {{tour_display_label}} at {{location_name}}. Details: {{add_to_calendar_url}}",
    tour_reminder:
        "Reminder: Your {{location_name}} tour is tomorrow at {{tour_time_label}}.{{confirm_reply_instruction}} Reschedule or cancel: {{cancel_url}}",
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
        if (/^Confirm I'm coming:\s*$/i.test(t)) return false;
        if (/^Manage or cancel your tour:\s*$/i.test(t)) return false;
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

/** Turn plain merged lines into parent-friendly HTML CTAs (text body keeps raw URLs for SMS). */
export function polishTourCommsEmailHtml(bodyHtml: string): string {
    let out = bodyHtml;
    // Invitation CTA — prefer "Choose a tour time" as the visible label.
    out = out.replace(
        /(Choose a tour time:?\s*(?:<br\/?>)?)(?:\s*)(https?:\/\/[^\s<]+)/gi,
        '$1<a href="$2" style="color:#1f4d3a;text-decoration:underline;font-weight:600;">Choose a tour time</a>',
    );
    // Tour invitation option lines (legacy templates that still list times):
    // "Monday, August 10 · 9:00 AM — https://…"
    out = out.replace(
        /(?:^|<br\/?>|<p>)([^<]*?·[^<]*?)\s+[—–-]\s*(https?:\/\/[^\s<]+)/gi,
        (match, label: string, url: string) => {
            const cleanLabel = String(label).replace(/^[\s•]+/, "").trim();
            if (!cleanLabel) return match;
            const linked = `<a href="${url}" style="color:#1f4d3a;text-decoration:underline;font-weight:600;">${cleanLabel}</a>`;
            if (match.startsWith("<p>")) return `<p>${linked}`;
            if (match.startsWith("<br")) return `<br/>${linked}`;
            return linked;
        },
    );
    out = out.replace(
        /See more times:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1f4d3a;text-decoration:underline;">See more times</a>',
    );
    out = out.replace(
        /Request another time:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1f4d3a;text-decoration:underline;">Request another time</a>',
    );
    out = out.replace(
        /Book your tour:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1f4d3a;text-decoration:underline;font-weight:600;">Choose a tour time</a>',
    );
    out = out.replace(
        /Add to calendar:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1f4d3a;text-decoration:underline;">Add to calendar</a>',
    );
    out = out.replace(
        /Confirm I'm coming:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1f4d3a;text-decoration:underline;font-weight:600;">Confirm I\'m coming</a>',
    );
    out = out.replace(
        /Need to reschedule\?\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1f4d3a;text-decoration:underline;">Reschedule tour</a>',
    );
    out = out.replace(
        /Manage or cancel your tour:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1f4d3a;text-decoration:underline;">Manage or cancel tour</a>',
    );
    out = out.replace(
        /Manage or cancel tour:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1f4d3a;text-decoration:underline;">Manage or cancel tour</a>',
    );
    out = out.replace(
        /If this time does not work, please contact us or reschedule here:\s*(https?:\/\/[^\s<]+)/gi,
        'If this time does not work, please <a href="$1" style="color:#1f4d3a;text-decoration:underline;">Reschedule tour</a> or reply to this email.',
    );
    out = out.replace(
        /If you would like to book a new time:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1f4d3a;text-decoration:underline;">Choose a tour time</a>',
    );
    out = out.replace(
        /Book a new time:\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1f4d3a;text-decoration:underline;">Choose a tour time</a>',
    );
    // Bare URL after a friendly label on its own line (composer HTML uses <br>).
    out = out.replace(
        /(Choose a tour time|Add to calendar|Reschedule tour|Manage or cancel tour)\s*(?:<br\s*\/?>)+\s*(https?:\/\/[^\s<]+)/gi,
        '<a href="$2" style="color:#1f4d3a;text-decoration:underline;font-weight:600;">$1</a>',
    );
    return out;
}

/**
 * Convert plain email text (or composer HTML) into parent-friendly HTML with
 * action labels as anchors. Used by family-send and tour orchestrator.
 */
export function polishTourCommsPlainEmailToHtml(plainOrHtml: string): string {
    const trimmed = String(plainOrHtml ?? "").trim();
    if (!trimmed) return "";
    if (/<(p|br|a|div|span)\b/i.test(trimmed)) {
        return polishTourCommsEmailHtml(trimmed);
    }
    return polishTourCommsEmailHtml(plainTextToSimpleHtml(trimmed));
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
