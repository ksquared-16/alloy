/**
 * A Resend `email.received` event, reduced to the truth Alloy stores.
 *
 * Pure and defensive. Inbound is an unauthenticated surface once the signature is
 * verified — the SIGNATURE proves Resend sent it, not that its contents are
 * well-formed or benign — so every field is optional until proven, and a shape
 * this does not recognise yields `null` rather than a half-built message.
 *
 * PROVIDER CONTRACT NOT YET CONFIRMED LIVE. The field names below follow Resend's
 * documented inbound shape, and several plausible spellings are accepted for the
 * same fact because the exact payload has not been observed against a real
 * account. `headerValue()` is case-insensitive for the same reason: RFC header
 * names are case-insensitive and providers differ on how they normalise them.
 * This must be reconciled against a real event before inbound email is called
 * production-ready — recorded alongside the standing live-provider requirement.
 *
 * Attachments are WS11. Their METADATA is retained here so an operator can be
 * told an attachment arrived; nothing is fetched or stored.
 */

export type InboundEmailAttachmentMetadata = {
    filename: string | null;
    contentType: string | null;
    /** Provider-reported size in bytes, when given. Never trusted for allocation. */
    size: number | null;
};

export type NormalizedInboundEmail = {
    /** Stable provider identity for this received message — the idempotency key. */
    providerMessageId: string;
    fromAddress: string;
    /** Every destination the provider reported; tenant ownership is resolved from these. */
    toAddresses: string[];
    subject: string | null;
    /** Always present: a safe plain-text representation, derived from HTML if needed. */
    text: string;
    /** Retained unsanitized; sanitizing is the RENDERER's job, not the parser's. */
    html: string | null;
    receivedAt: string;
    messageId: string | null;
    inReplyTo: string | null;
    references: string | null;
    attachments: InboundEmailAttachmentMetadata[];
};

function str(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
    const single = str(value);
    return single ? [single] : [];
}

/**
 * An RFC header by name, case-insensitively, from either an object map or an
 * array of {name,value} pairs. Providers use both shapes.
 */
export function headerValue(headers: unknown, name: string): string | null {
    const wanted = name.toLowerCase();
    if (Array.isArray(headers)) {
        for (const entry of headers) {
            if (!entry || typeof entry !== "object") continue;
            const e = entry as Record<string, unknown>;
            if (str(e.name)?.toLowerCase() === wanted) return str(e.value);
        }
        return null;
    }
    if (headers && typeof headers === "object") {
        for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
            if (key.toLowerCase() === wanted) return str(value);
        }
    }
    return null;
}

/**
 * A readable plain-text rendering of an HTML body.
 *
 * Deliberately crude. The goal is that a safe text representation ALWAYS exists,
 * not that it is a faithful rendering — truthful ugly text beats an elaborate
 * parser that alters meaning. Script and style contents are dropped rather than
 * flattened, because their text is not message content and would read as if the
 * parent had written it.
 */
export function htmlToSafeText(html: string): string {
    return html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, " ")
        // Stripping an opening tag leaves a space where the tag was, so every line
        // after a block break starts with one. Collapse padding around newlines
        // before limiting blank runs.
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function normalizeAttachments(raw: unknown): InboundEmailAttachmentMetadata[] {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 50).map((entry) => {
        const e = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        const size = typeof e.size === "number" && Number.isFinite(e.size) ? e.size : null;
        return {
            filename: str(e.filename) ?? str(e.name),
            contentType: str(e.content_type) ?? str(e.contentType) ?? str(e.type),
            size,
        };
    });
}

/**
 * Reduce a provider payload to canonical inbound truth, or null if it is not a
 * usable received email.
 *
 * `null` is returned rather than a partial record when the sender, a destination
 * or the provider identity is missing: without any one of them the message cannot
 * be attributed, deduplicated, or answered, and storing it would create a row
 * nothing can act on.
 */
export function normalizeResendInboundEmail(
    payload: unknown,
    opts: { fallbackProviderMessageId?: string | null; receivedAtFallback: string }
): NormalizedInboundEmail | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;

    const headers = p.headers;
    const fromAddress = str(p.from) ?? headerValue(headers, "from");
    const toAddresses = asArray(p.to).length > 0 ? asArray(p.to) : asArray(headerValue(headers, "to"));

    // Provider identity, preferred over the RFC Message-ID: the provider's own id
    // is what a REDELIVERY repeats. A sender controls their Message-ID and could
    // reuse or omit it, which would make it a poor idempotency key.
    const providerMessageId =
        str(p.email_id) ?? str(p.id) ?? str(opts.fallbackProviderMessageId) ?? null;

    if (!fromAddress || toAddresses.length === 0 || !providerMessageId) return null;

    const html = str(p.html);
    const rawText = str(p.text);
    const text = rawText ?? (html ? htmlToSafeText(html) : "");

    return {
        providerMessageId,
        fromAddress,
        toAddresses,
        subject: str(p.subject) ?? headerValue(headers, "subject"),
        text,
        html,
        receivedAt: str(p.created_at) ?? str(p.received_at) ?? opts.receivedAtFallback,
        messageId: headerValue(headers, "message-id") ?? str(p.message_id),
        inReplyTo: headerValue(headers, "in-reply-to") ?? str(p.in_reply_to),
        references: headerValue(headers, "references") ?? str(p.references),
        attachments: normalizeAttachments(p.attachments),
    };
}

/** Operator-facing note when an email arrived carrying attachments. WS11 owns the rest. */
export function attachmentNotice(attachments: InboundEmailAttachmentMetadata[]): string | null {
    if (attachments.length === 0) return null;
    const named = attachments.map((a) => a.filename).filter((n): n is string => !!n);
    const detail = named.length > 0 ? `: ${named.join(", ")}` : "";
    const noun = attachments.length === 1 ? "attachment" : "attachments";
    return `${attachments.length} ${noun} received${detail} — attachment support is not available yet.`;
}
