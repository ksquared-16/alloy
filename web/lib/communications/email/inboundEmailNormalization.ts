/**
 * A received email, reduced to the truth Alloy stores.
 *
 * THE PROVIDER CONTRACT IS TWO STEPS, and that shapes everything here. Per
 * Resend's documentation (see RESEND-INBOUND-CONTRACT.md), the `email.received`
 * webhook carries METADATA ONLY — no body, no headers. The body and the RFC
 * headers that make threading possible come from `GET /emails/receiving/{id}`.
 *
 * So the two halves are modelled separately and deliberately:
 *
 *   ResendReceivedEvent     what the signed webhook actually tells us
 *   ResendRetrievedEmail    what the follow-up fetch adds
 *
 * A canonical message is only built once BOTH exist. Keeping them apart is what
 * lets a retrieval failure be retried without inventing a half-message, and stops
 * anyone assuming the webhook contained a body it never had.
 *
 * Everything is pure. A verified signature proves Resend sent the event, not that
 * its contents are well-formed, so each field is optional until proven and an
 * unusable shape yields null rather than a partial record.
 */

export type InboundEmailAttachmentMetadata = {
    /** Provider attachment id — retrieval is WS11's problem, but the id is kept. */
    id: string | null;
    filename: string | null;
    contentType: string | null;
    /** `inline` attachments are usually embedded images, not documents. */
    contentDisposition: string | null;
    size: number | null;
};

/** Step 1 — the Svix-verified `email.received` webhook. Metadata only. */
export type ResendReceivedEvent = {
    /** Resend's own id. The idempotency key, and the retrieval key. */
    emailId: string;
    fromAddress: string;
    /** Addressed recipients. */
    toAddresses: string[];
    ccAddresses: string[];
    /**
     * Addresses that actually caused Resend to receive this. For forwarded mail
     * `to` is the sender's addressee while this is the Alloy-owned address, so
     * tenant ownership must consider both.
     */
    receivedFor: string[];
    /** The SENDER's RFC Message-ID, not Resend's id. */
    messageId: string | null;
    subject: string | null;
    receivedAt: string;
    attachments: InboundEmailAttachmentMetadata[];
};

/** Step 2 — `GET /emails/receiving/{id}`. Body and headers. */
export type ResendRetrievedEmail = {
    text: string | null;
    html: string | null;
    /** `data_uri` means inline images are embedded rather than remote. */
    htmlFormat: string | null;
    /** Header map; `In-Reply-To` and `References` live here, not at top level. */
    headers: unknown;
};

export type NormalizedInboundEmail = ResendReceivedEvent & {
    /** Always present: a safe plain-text representation, derived from HTML if needed. */
    text: string;
    /** Retained unsanitized — sanitizing is the RENDERER's job, not the parser's. */
    html: string | null;
    htmlFormat: string | null;
    inReplyTo: string | null;
    references: string | null;
    /**
     * What the receiving transport was able to prove about the sender, read from the
     * headers it stamped — `Authentication-Results`, falling back to `Received-SPF`.
     *
     * Metadata, and derived rather than trusted: these headers are added by the receiving
     * infrastructure, so they mean something, but only the ones the RECEIVER stamped do.
     * `unknown` is the honest value when nothing was reported, and every consumer must
     * treat it as a failure wherever authentication is load-bearing — an unreported check
     * is not a passed check.
     *
     * Nothing in the certified routing or correlation path reads this. It exists so the
     * ingress eligibility gate can tell a genuine sender from a forged `From` without
     * being handed a body.
     */
    authentication: SenderAuthenticationResult;
};

/** Whether the transport asserted the sender is who the `From` header claims. */
export type SenderAuthenticationResult = "pass" | "fail" | "unknown";

function str(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
    const single = str(value);
    return single ? [single] : [];
}

/**
 * An RFC header by name, case-insensitively.
 *
 * Resend's documented example map is lowercased (`return-path`, `mime-version`),
 * but header names are case-insensitive by RFC and Alloy must not depend on one
 * provider's casing. The array-of-pairs shape is accepted too, since that is the
 * other common representation.
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
 * Deliberately crude: the goal is that a safe text representation ALWAYS exists,
 * not that it is faithful — truthful ugly text beats an elaborate parser that
 * alters meaning. Script and style CONTENT is dropped rather than flattened,
 * because it is not message content and would read as something the sender wrote.
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
        // after a block break starts with one.
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function normalizeAttachments(raw: unknown): InboundEmailAttachmentMetadata[] {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 50).map((entry) => {
        const e = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        return {
            id: str(e.id),
            filename: str(e.filename),
            contentType: str(e.content_type),
            contentDisposition: str(e.content_disposition),
            size: typeof e.size === "number" && Number.isFinite(e.size) ? e.size : null,
        };
    });
}

/**
 * Read the `data` object of an `email.received` webhook.
 *
 * Returns null when the provider identity, sender, or every destination is
 * missing: without them the message cannot be retrieved, attributed or
 * deduplicated, and storing it would create a row nothing can act on.
 */
export function normalizeResendReceivedEvent(
    data: unknown,
    opts: { receivedAtFallback: string }
): ResendReceivedEvent | null {
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;

    const emailId = str(d.email_id);
    const fromAddress = str(d.from);
    const toAddresses = strArray(d.to);
    const receivedFor = strArray(d.received_for);

    if (!emailId || !fromAddress || (toAddresses.length === 0 && receivedFor.length === 0)) return null;

    return {
        emailId,
        fromAddress,
        toAddresses,
        ccAddresses: strArray(d.cc),
        receivedFor,
        messageId: str(d.message_id),
        subject: str(d.subject),
        receivedAt: str(d.created_at) ?? opts.receivedAtFallback,
        attachments: normalizeAttachments(d.attachments),
    };
}

/** Read the body and headers returned by `GET /emails/receiving/{id}`. */
export function normalizeResendRetrievedEmail(payload: unknown): ResendRetrievedEmail | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    return {
        text: str(p.text),
        html: str(p.html),
        htmlFormat: str(p.html_format),
        headers: p.headers ?? null,
    };
}

/**
 * Combine both provider steps into canonical inbound truth.
 *
 * The event is authoritative for identity, addressing and subject; retrieval is
 * authoritative for body and headers. Retrieval may legitimately be absent when a
 * message genuinely has no body, so an empty text is not a failure — but the
 * CALLER decides whether to proceed without a successful fetch, because "the
 * fetch failed" and "the email was empty" must not look alike here.
 */
export function combineInboundEmail(
    event: ResendReceivedEvent,
    retrieved: ResendRetrievedEmail | null
): NormalizedInboundEmail {
    const html = retrieved?.html ?? null;
    const text = retrieved?.text ?? (html ? htmlToSafeText(html) : "");
    return {
        ...event,
        text,
        html,
        htmlFormat: retrieved?.htmlFormat ?? null,
        inReplyTo: headerValue(retrieved?.headers, "in-reply-to"),
        references: headerValue(retrieved?.headers, "references"),
        authentication: parseSenderAuthentication(retrieved?.headers),
    };
}

/**
 * Read the transport's verdict on the sender out of the headers it stamped.
 *
 * DMARC is the only check that ties the visible `From` to an authenticated identity, so it
 * decides whenever it is reported. SPF alone authenticates the ENVELOPE sender, which a
 * forwarded message routinely changes — so a bare `Received-SPF: pass` is accepted only
 * when DMARC said nothing at all, and it is the weakest thing here.
 *
 * Anything unparseable yields `unknown` rather than a guess. The gate treats `unknown`
 * exactly as it treats `fail`, so being unable to read a header can never be safer than
 * reading one that failed.
 */
export function parseSenderAuthentication(headers: unknown): SenderAuthenticationResult {
    const results = headerValue(headers, "authentication-results");
    if (results) {
        const dmarc = /\bdmarc\s*=\s*([a-z]+)/i.exec(results);
        if (dmarc) {
            const verdict = dmarc[1]!.toLowerCase();
            if (verdict === "pass") return "pass";
            if (verdict === "fail" || verdict === "quarantine" || verdict === "reject") return "fail";
            return "unknown";
        }
    }
    const spf = headerValue(headers, "received-spf");
    if (spf) {
        const verdict = spf.trim().toLowerCase();
        if (verdict.startsWith("pass")) return "pass";
        if (verdict.startsWith("fail") || verdict.startsWith("softfail")) return "fail";
    }
    return "unknown";
}

/**
 * Every address that could make this email Alloy's to own.
 *
 * `received_for` first: on forwarded mail it is the Alloy-owned address while
 * `to` is whoever the sender wrote to. Considering only `to` would quarantine
 * forwarded mail as unowned.
 */
export function ownershipCandidateAddresses(event: ResendReceivedEvent): string[] {
    return [...event.receivedFor, ...event.toAddresses, ...event.ccAddresses];
}

/** Operator-facing note when an email arrived carrying attachments. WS11 owns the rest. */
export function attachmentNotice(attachments: InboundEmailAttachmentMetadata[]): string | null {
    if (attachments.length === 0) return null;
    const named = attachments.map((a) => a.filename).filter((n): n is string => !!n);
    const detail = named.length > 0 ? `: ${named.join(", ")}` : "";
    const noun = attachments.length === 1 ? "attachment" : "attachments";
    return `${attachments.length} ${noun} received${detail} — attachment support is not available yet.`;
}
