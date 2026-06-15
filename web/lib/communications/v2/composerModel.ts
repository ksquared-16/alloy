/**
 * Communications V2 — Composer V2 model (PKG-12). PURE, no I/O, no React, no send.
 *
 * Channel availability + consent gating (via injected decision), validation, SMS HTML stripping,
 * multi-recipient payload shaping, and preview. The actual send (executeCommunicationsSend) is NOT
 * wired here — buildSendPayloads only shapes intent for a real-gate-validated send step.
 */

export type ComposerChannel = "email" | "sms" | "note";

export type ComposerDraft = {
    channel: ComposerChannel;
    subject?: string | null;
    body: string;
    recipients?: string[];
    attachments?: string[];
    templateId?: string | null;
    scheduledAt?: string | null;
};

export type ChannelAvailability = {
    email: boolean;
    sms: boolean;
    note: boolean;
    reasons: Record<string, string>;
};

export function resolveAvailableChannels(opts: {
    hasEmailBinding: boolean;
    hasSmsBinding: boolean;
    recipientHasEmail: boolean;
    recipientHasPhone: boolean;
}): ChannelAvailability {
    const reasons: Record<string, string> = {};
    const email = opts.hasEmailBinding && opts.recipientHasEmail;
    if (!opts.hasEmailBinding) reasons.email = "No email provider connected.";
    else if (!opts.recipientHasEmail) reasons.email = "Recipient has no email address.";
    const sms = opts.hasSmsBinding && opts.recipientHasPhone;
    if (!opts.hasSmsBinding) reasons.sms = "No SMS provider connected.";
    else if (!opts.recipientHasPhone) reasons.sms = "Recipient has no mobile number.";
    return { email, sms, note: true, reasons };
}

/** Merge availability with a per-channel consent decision (injected — PKG-08 evaluateConsent lives in the caller). */
export function applyConsentToChannels(
    availability: ChannelAvailability,
    consentAllowed: { email?: boolean; sms?: boolean }
): ChannelAvailability {
    const reasons = { ...availability.reasons };
    const email = availability.email && consentAllowed.email !== false;
    if (availability.email && consentAllowed.email === false) reasons.email = "Blocked by recipient consent.";
    const sms = availability.sms && consentAllowed.sms !== false;
    if (availability.sms && consentAllowed.sms === false) reasons.sms = "Blocked by recipient consent.";
    return { email, sms, note: true, reasons };
}

export function validateComposerDraft(draft: ComposerDraft): string[] {
    const errors: string[] = [];
    if (!draft.body || draft.body.trim().length === 0) errors.push("Message body is required.");
    if (draft.channel === "email" && (!draft.subject || draft.subject.trim().length === 0)) {
        errors.push("Email subject is required.");
    }
    if (draft.channel !== "note" && (!draft.recipients || draft.recipients.length === 0)) {
        errors.push("At least one recipient is required.");
    }
    return errors;
}

/** Strip HTML to plain text for SMS. Pure. */
export function smsBodyStripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export type SendPayload = {
    channel: ComposerChannel;
    to: string;
    subject: string | null;
    body: string;
    body_format: "plain" | "html";
};

/** Shape (not execute) one payload per recipient. Notes are internal — direction handled by the send step. */
export function buildSendPayloads(draft: ComposerDraft): SendPayload[] {
    const recipients = draft.channel === "note" ? ["__internal__"] : draft.recipients ?? [];
    const body = draft.channel === "sms" ? smsBodyStripHtml(draft.body) : draft.body;
    const body_format: "plain" | "html" = draft.channel === "email" ? "html" : "plain";
    return recipients.map((to) => ({
        channel: draft.channel,
        to,
        subject: draft.channel === "email" ? draft.subject ?? null : null,
        body,
        body_format,
    }));
}

export function composerPreview(draft: ComposerDraft): {
    desktop: { subject: string | null; body: string; format: string };
    mobile: { subject: string | null; body: string; format: string };
} {
    const subject = draft.channel === "email" ? draft.subject ?? null : null;
    const format = draft.channel === "email" ? "html" : "plain";
    const body = draft.channel === "sms" ? smsBodyStripHtml(draft.body) : draft.body;
    return { desktop: { subject, body, format }, mobile: { subject, body, format } };
}
