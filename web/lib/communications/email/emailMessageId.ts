/**
 * The RFC 5322 Message-ID Alloy mints, read from the TypeScript side.
 *
 * Inbound SMS is handled in Python; inbound EMAIL arrives on the Resend webhook,
 * which is TypeScript. Both runtimes therefore need to read the same header, so
 * this mirrors `backend/app/services/communications/email_message_id.py`.
 *
 * The duplication is deliberate and bounded: the format is a single line of
 * grammar, and `emailMessageIdParity.test.ts` runs a shared fixture list through
 * both implementations, so a change to either that the other does not match fails
 * the build. That is the same arrangement `contracts/communications/sms-keywords.json`
 * uses for the keyword vocabulary.
 *
 * Parsing is of UNTRUSTED input. A header is attacker-controlled, so anything that
 * is not shape-exactly ours yields nothing, and the id it does yield is still
 * resolved scoped to the receiving organization — naming a message id is not the
 * same as being allowed to reach it.
 */

/** Local-part prefix marking a Message-ID as one Alloy minted. */
export const ALLOY_LOCAL_PREFIX = "alloy.";

const MESSAGE_ID_RE = /<([^<>@\s]+)@([^<>@\s]+)>/g;
const SINGLE_MESSAGE_ID_RE = /<([^<>@\s]+)@([^<>@\s]+)>/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Domain half of an address, or null when there isn't one. */
export function domainOf(emailAddress: string | null | undefined): string | null {
    const raw = (emailAddress ?? "").trim();
    const at = raw.lastIndexOf("@");
    if (at < 0) return null;
    const domain = raw.slice(at + 1).trim().replace(/>$/, "").toLowerCase();
    return domain || null;
}

/**
 * The `Message-ID` for an outbound email, or null when one cannot be minted.
 *
 * Refuses rather than inventing: a header that looks authoritative and correlates
 * to nothing is worse than no header.
 */
export function mintOutboundMessageId(params: {
    communicationMessageId: string;
    fromEmail: string;
}): string | null {
    const id = (params.communicationMessageId ?? "").trim();
    if (!UUID_RE.test(id)) return null;
    const domain = domainOf(params.fromEmail);
    if (!domain) return null;
    return `<${ALLOY_LOCAL_PREFIX}${id.toLowerCase()}@${domain}>`;
}

/** The canonical message id inside an Alloy-minted Message-ID, or null. */
export function parseAlloyMessageId(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== "string") return null;
    const match = SINGLE_MESSAGE_ID_RE.exec(raw.trim());
    if (!match) return null;
    const local = match[1]!;
    if (!local.toLowerCase().startsWith(ALLOY_LOCAL_PREFIX)) return null;
    const candidate = local.slice(ALLOY_LOCAL_PREFIX.length);
    if (!UUID_RE.test(candidate)) return null;
    return candidate.toLowerCase();
}

/**
 * Every Alloy-minted canonical message id in a `References` header, in chain order.
 *
 * `References` runs oldest first, so the LAST of ours is the nearest ancestor.
 * Order is preserved here rather than decided here. Foreign ids are skipped rather
 * than failing the parse — a thread that passed through another system is still
 * ours to correlate.
 */
export function parseReferenceMessageIds(raw: string | null | undefined): string[] {
    if (!raw || typeof raw !== "string") return [];
    const out: string[] = [];
    MESSAGE_ID_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MESSAGE_ID_RE.exec(raw)) !== null) {
        const parsed = parseAlloyMessageId(`<${match[1]}@${match[2]}>`);
        if (parsed && !out.includes(parsed)) out.push(parsed);
    }
    return out;
}

/** How a reply was correlated. Recorded on the message so the decision is auditable. */
export type EmailCorrelationMethod =
    | "in_reply_to"
    | "references"
    | "endpoint_provenance"
    | "unresolved";

/**
 * Canonical message ids a reply points at, strongest evidence first.
 *
 * `In-Reply-To` names the single message being answered and outranks everything.
 * `References` contributes its nearest Alloy ancestor next. Sender-based guessing
 * is deliberately absent — it is weaker evidence and belongs to the caller, after
 * these are exhausted. Subject text is never authority anywhere.
 */
export function correlationCandidates(params: {
    inReplyTo?: string | null;
    references?: string | null;
}): string[] {
    const ordered: string[] = [];
    const direct = parseAlloyMessageId(params.inReplyTo);
    if (direct) ordered.push(direct);
    const chain = parseReferenceMessageIds(params.references);
    for (let i = chain.length - 1; i >= 0; i--) {
        const ref = chain[i]!;
        if (!ordered.includes(ref)) ordered.push(ref);
    }
    return ordered;
}
