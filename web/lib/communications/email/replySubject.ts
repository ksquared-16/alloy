/**
 * The Subject an operator's reply carries — decided by the SERVER, from the
 * conversation, never typed again by the operator.
 *
 * THE RULE: a new email needs a Subject and cannot be sent without one. A reply
 * INHERITS the conversation's subject and shows no Subject field at all. Those
 * are two different acts and the composer must not present them as one.
 *
 * Why the server and not the client: a subject supplied by a reply composer is an
 * unverified claim about which conversation this message belongs to. The same
 * reasoning already governs the RFC threading headers (`email_thread_headers.py`)
 * — the client never constructs one. A reply's subject is weaker evidence than
 * those headers but it is still conversation truth, so it is derived here from
 * canonical history rather than accepted from a request body.
 *
 * Subject is NEVER correlation authority. `resolveEmailThread` deliberately takes
 * no subject parameter, and nothing in this file changes that: this decides what
 * a reply is CALLED, not what it belongs to.
 *
 * Pure: values in, subject out.
 */

/**
 * The reply prefix, matched case-insensitively with optional counter forms mail
 * clients emit (`Re:`, `RE:`, `Re[2]:`, `Re :`). Localized prefixes (`AW:`,
 * `SV:`) are deliberately NOT stripped — guessing wrong mangles the subject a
 * parent recognises, and an extra prefix is merely untidy where a mangled subject
 * is wrong.
 */
const REPLY_PREFIX_RE = /^\s*re\s*(\[\d+\])?\s*:\s*/i;

/** The canonical prefix Alloy writes. One, at the front, never stacked. */
export const REPLY_PREFIX = "Re: ";

/** Subject with every leading reply prefix removed — the conversation's own name. */
export function stripReplyPrefixes(raw: string | null | undefined): string {
    let value = String(raw ?? "").trim();
    // Loop, because a subject that has crossed several clients can arrive as
    // "Re: Re: Re: Tour". The parent sees one conversation; so should Alloy.
    for (;;) {
        const next = value.replace(REPLY_PREFIX_RE, "").trim();
        if (next === value) return value;
        value = next;
    }
}

/**
 * The subject for a reply into an existing conversation.
 *
 * Returns null when the conversation has no subject to inherit — the caller
 * decides what that means rather than having a placeholder invented here. A
 * fabricated subject on a reply is worse than none: it appears in the parent's
 * client as a NEW conversation, which is the exact outcome inheritance exists to
 * prevent.
 */
export function deriveReplySubject(conversationSubject: string | null | undefined): string | null {
    const base = stripReplyPrefixes(conversationSubject);
    if (!base) return null;
    return `${REPLY_PREFIX}${base}`;
}

/**
 * Which subject an email send should carry, given what the operator supplied and
 * what the conversation already holds.
 *
 * The two modes are named rather than inferred from emptiness, because "the
 * operator left Subject blank" and "this is a reply and there is no Subject
 * field" produce the same empty string and must not produce the same outcome.
 */
export type EmailSubjectDecision =
    /** Use this subject. */
    | { kind: "subject"; subject: string; inherited: boolean }
    /** A new email with no subject. The send must be refused, not defaulted. */
    | { kind: "subject_required" }
    /**
     * A reply whose conversation carries no subject of its own. Not an error —
     * the operator was never shown a field to fill in, so refusing would strand
     * them with no way to proceed. The send continues with no subject and the
     * RFC threading headers carry the correlation, which is the stronger evidence
     * anyway.
     */
    | { kind: "inherit_unavailable" };

export function decideEmailSubject(params: {
    /** Exactly what the client sent. Whitespace is not meaningful. */
    supplied: string | null | undefined;
    /**
     * The subject of the conversation being replied into, or null when this is a
     * new conversation. Read from canonical history by the caller.
     */
    conversationSubject?: string | null;
    /** True when the request named a thread to reply into. */
    isReply: boolean;
}): EmailSubjectDecision {
    const supplied = String(params.supplied ?? "").trim();

    if (!params.isReply) {
        // A new email is the ONE place a Subject is the operator's to author, so
        // it is the one place its absence is a refusal. Note that a supplied
        // subject wins here even if it looks like a reply — an operator who typed
        // "Re: tour" into a new email meant it.
        return supplied ? { kind: "subject", subject: supplied, inherited: false } : { kind: "subject_required" };
    }

    // A reply. The conversation decides, and a client-supplied subject does NOT
    // override it — the reply composer shows no Subject field, so anything
    // arriving here is either stale draft state or a caller reaching past the UI.
    // Honouring it would let a request rename a conversation in the parent's mail
    // client without an operator ever having asked for that.
    const inherited = deriveReplySubject(params.conversationSubject);
    if (inherited) return { kind: "subject", subject: inherited, inherited: true };
    return { kind: "inherit_unavailable" };
}
