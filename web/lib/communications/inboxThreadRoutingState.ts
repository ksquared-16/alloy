/**
 * What the operator is allowed to be told about who sent a conversation.
 *
 * The inbound seam already made this decision and wrote it down: a thread that
 * could be attributed to exactly one person anchors to `persons`, and one that
 * could not anchors to the `communications_unknown` surrogate carrying an
 * `inbound_resolution` of `unknown_sender` or `ambiguous_sender`. This module is
 * the read side of that decision and nothing more — it never re-derives identity.
 *
 * That matters more than it looks. The inbox list resolves people by phone and
 * email across the whole page of threads, so a person loaded for one thread is
 * visible when projecting another. Left alone, an unattributed conversation
 * would acquire a name purely because some other row on the page happened to
 * load a person with the same number — identity that changes with pagination.
 * The surrogate anchor is therefore treated as final: when the thread says the
 * sender is unknown, no Person is asserted here, whatever else is in the batch.
 */

/** Surrogate anchor written by the inbound seam when no single person matched. */
export const UNKNOWN_SENDER_ENTITY_TYPE = "communications_unknown";

/** Thread attention state the inbound seam sets when it could not route a reply. */
export const NEEDS_ROUTING_ATTENTION_STATE = "needs_routing_resolution";

export type InboxSenderIdentityState = "identified" | "unidentified";
export type InboxRoutingState = "routed" | "needs_routing_resolution";

export type InboxThreadRoutingProjection = {
    senderIdentityState: InboxSenderIdentityState;
    routingState: InboxRoutingState;
    /**
     * How many in-org people matched the sender when routing stayed ambiguous.
     * A count, not the ids: it tells the operator that a choice exists without
     * presenting a shortlist that reads as "pick one of these", which is a
     * resolution decision this slice deliberately does not make.
     */
    routingCandidateCount: number;
};

function candidateCountFromMetadata(metadata: Record<string, unknown> | null | undefined): number {
    const raw = metadata?.candidate_person_ids;
    return Array.isArray(raw) ? raw.length : 0;
}

export function deriveInboxThreadRoutingState(input: {
    primaryEntityType: string;
    attentionState?: string | null;
    metadata?: Record<string, unknown> | null;
}): InboxThreadRoutingProjection {
    const entityType = input.primaryEntityType.trim().toLowerCase();
    const resolution = String(input.metadata?.inbound_resolution ?? "").trim().toLowerCase();
    const attention = String(input.attentionState ?? "").trim().toLowerCase();

    const unidentified = entityType === UNKNOWN_SENDER_ENTITY_TYPE;
    const candidateCount = candidateCountFromMetadata(input.metadata ?? null);

    // Either authority is enough. `ambiguous_sender` is what the resolver
    // concluded; `needs_routing_resolution` is what it asked the operator to do
    // about it. An operator triaging the thread can clear the attention state
    // without the ambiguity having gone away, so neither one alone is sufficient.
    const ambiguous = resolution === "ambiguous_sender" || attention === NEEDS_ROUTING_ATTENTION_STATE;

    return {
        senderIdentityState: unidentified ? "unidentified" : "identified",
        routingState: ambiguous ? "needs_routing_resolution" : "routed",
        routingCandidateCount: ambiguous ? candidateCount : 0,
    };
}

/**
 * A destination an operator can recognise without reading a provider identity.
 *
 * Enough to tell two unattributed conversations apart, not enough to be the
 * phone number or address itself.
 */
export function maskInboxEndpointForDisplay(
    recipientKey: string | null | undefined,
    channel: string
): string | null {
    const key = (recipientKey ?? "").trim();
    if (!key || key === "_empty" || key === "_in_app") return null;
    const ch = channel.trim().toLowerCase();

    if (ch === "sms") {
        const digits = key.replace(/\D/g, "");
        if (digits.length < 4) return null;
        return `ending in ${digits.slice(-4)}`;
    }

    if (ch === "email") {
        const at = key.lastIndexOf("@");
        const domain = at >= 0 ? key.slice(at + 1).trim() : "";
        if (!domain) return null;
        return `at ${domain}`;
    }

    return null;
}

/** Row/header name for a conversation whose sender Alloy has not identified. */
export function unidentifiedSenderDisplayName(maskedEndpoint: string | null): string {
    return maskedEndpoint ? `Unidentified sender · ${maskedEndpoint}` : "Unidentified sender";
}

/** Operator-safe explanation of an unresolved routing decision. No ids, no enums. */
export function routingAmbiguityNotice(projection: InboxThreadRoutingProjection): string | null {
    if (projection.routingState !== "needs_routing_resolution") return null;
    if (projection.routingCandidateCount > 1) {
        return `Needs routing — ${projection.routingCandidateCount} people in this organization share this number.`;
    }
    return "Needs routing — Alloy could not tell which record this belongs to.";
}
