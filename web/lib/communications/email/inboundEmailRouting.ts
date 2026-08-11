/**
 * Which organization owns a received email, decided before anything else.
 *
 * THE AUTHORITY ORDER MATTERS AND IS NOT NEGOTIABLE:
 *
 *     receiving address / provider binding  ->  tenant ownership
 *     In-Reply-To / References              ->  conversation, INSIDE that tenant
 *
 * A Message-ID is conversation evidence, never ownership. A syntactically perfect
 * `<alloy.{uuid}@…>` naming a real message in ANOTHER organization must not pull
 * this email across that boundary — which is why correlation only ever runs after
 * ownership is settled, and every canonical lookup it performs is org-scoped.
 *
 * Pure: every function here decides from values it is given. The I/O that fetches
 * bindings and messages lives in the ingestion service, so these decisions are
 * testable against the cases that actually matter.
 */

export type InboundEmailBinding = {
    id: string;
    org_id: string;
    channel: string;
    provider: string;
    status: string;
    inbound_address: string | null;
    location_id?: string | null;
};

export type InboundEmailOwnership =
    | { kind: "owned"; binding: InboundEmailBinding; receivingAddress: string }
    /** No active binding claims any destination — retained at provider authority. */
    | { kind: "no_attributable_org" }
    /**
     * Several organizations' bindings match. The database prevents this for one
     * address, so it means the email named MULTIPLE destinations owned by
     * different tenants — genuinely ambiguous, and never resolved by picking one.
     */
    | { kind: "cross_org_ambiguous"; candidateOrgIds: string[] };

/** Mail addresses are compared case-insensitively, and angle brackets are noise. */
export function normalizeEmailAddress(raw: string | null | undefined): string | null {
    let value = (raw ?? "").trim();
    if (!value) return null;
    const angled = /<([^<>]+)>/.exec(value);
    if (angled) value = angled[1]!.trim();
    value = value.toLowerCase();
    return value.includes("@") ? value : null;
}

/** A binding may own inbound only while it is actually active. */
export function bindingAcceptsInbound(binding: InboundEmailBinding): boolean {
    return (
        binding.channel.trim().toLowerCase() === "email" &&
        binding.status.trim().toLowerCase() === "active" &&
        normalizeEmailAddress(binding.inbound_address) !== null
    );
}

/**
 * Resolve tenant ownership from the destinations the provider reported.
 *
 * A `disabled` or `pending_verification` binding is deliberately NOT an owner:
 * the address exists in configuration but the organization has not turned
 * receiving on, so treating it as owned would deliver mail into a tenant that has
 * not agreed to receive it. Those land in quarantine, where they are recoverable,
 * rather than being refused and lost.
 */
export function resolveInboundEmailOwnership(params: {
    toAddresses: string[];
    bindings: InboundEmailBinding[];
}): InboundEmailOwnership {
    const destinations = params.toAddresses
        .map(normalizeEmailAddress)
        .filter((a): a is string => a !== null);
    if (destinations.length === 0) return { kind: "no_attributable_org" };

    const matches: Array<{ binding: InboundEmailBinding; receivingAddress: string }> = [];
    for (const binding of params.bindings) {
        if (!bindingAcceptsInbound(binding)) continue;
        const address = normalizeEmailAddress(binding.inbound_address)!;
        if (destinations.includes(address)) matches.push({ binding, receivingAddress: address });
    }

    if (matches.length === 0) return { kind: "no_attributable_org" };

    const orgIds = [...new Set(matches.map((m) => m.binding.org_id))];
    if (orgIds.length > 1) return { kind: "cross_org_ambiguous", candidateOrgIds: orgIds.sort() };

    // One organization. If it exposed several of its own aliases on the same
    // email, any of them is a truthful receiving address for that tenant; the
    // first reported destination order is stable and does not change ownership.
    return { kind: "owned", binding: matches[0]!.binding, receivingAddress: matches[0]!.receivingAddress };
}

/** How the conversation was decided. Persisted so the choice stays auditable. */
export type EmailProvenanceMethod =
    | "in_reply_to"
    | "references"
    | "endpoint_provenance"
    | "none";

export type EmailThreadResolution = {
    threadId: string | null;
    method: EmailProvenanceMethod;
    /** True when evidence pointed at more than one equally plausible conversation. */
    ambiguous: boolean;
};

/**
 * Choose the conversation from already-fetched, already-org-scoped candidates.
 *
 * Subject is not a parameter, deliberately. `Re:` prefixes, changed subjects and
 * identical subjects are all irrelevant: a valid `In-Reply-To` must survive a
 * rewritten subject, and two unrelated emails sharing a subject must not merge.
 *
 * `endpointCandidateThreadIds` is the weakest evidence and is only consulted when
 * no threading header of ours resolved. More than one candidate there stays
 * ambiguous rather than picking the newest — "most recent sender email" is
 * precisely the guess this precedence exists to avoid.
 */
export function resolveEmailThread(params: {
    /** Thread ids for Alloy-minted ids in In-Reply-To, org-scoped, in evidence order. */
    inReplyToThreadIds: string[];
    /** Thread ids from the References chain, nearest ancestor first, org-scoped. */
    referencesThreadIds: string[];
    /** Threads on the same sender + receiving-address pair. */
    endpointCandidateThreadIds: string[];
}): EmailThreadResolution {
    const direct = [...new Set(params.inReplyToThreadIds.filter(Boolean))];
    if (direct.length === 1) return { threadId: direct[0]!, method: "in_reply_to", ambiguous: false };
    if (direct.length > 1) return { threadId: null, method: "in_reply_to", ambiguous: true };

    const chain = [...new Set(params.referencesThreadIds.filter(Boolean))];
    if (chain.length >= 1) {
        // Nearest ancestor first, so the head is the closest conversation. Several
        // DISTINCT threads in one chain is a forward across conversations, not a
        // tie — the nearest is still the right answer.
        return { threadId: chain[0]!, method: "references", ambiguous: false };
    }

    const endpoint = [...new Set(params.endpointCandidateThreadIds.filter(Boolean))];
    if (endpoint.length === 1) {
        return { threadId: endpoint[0]!, method: "endpoint_provenance", ambiguous: false };
    }
    if (endpoint.length > 1) {
        // A parent with Enrollment AND Billing open, replying without usable
        // headers. Both are plausible; neither is provable.
        return { threadId: null, method: "endpoint_provenance", ambiguous: true };
    }

    return { threadId: null, method: "none", ambiguous: false };
}
