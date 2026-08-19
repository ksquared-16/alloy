/**
 * Judge mail that has already been filed — and touch nothing.
 *
 * ---------------------------------------------------------------------------
 * WHAT A BACKTEST IS ALLOWED TO BE
 * ---------------------------------------------------------------------------
 *
 * Replaying a corpus through an ingestion pipeline would re-thread it, re-attribute it,
 * re-emit its Activity and re-fetch its content. None of that is wanted, and all of it
 * would be destructive. So a backtest never touches ingestion: it reconstructs the
 * ENVELOPE from canonical columns and hands that to the same
 * `evaluateEmailIngressEligibility` the live hook calls.
 *
 * The gate is a pure function of an envelope, a policy and a set of relationships. That is
 * what makes this possible at all, and it is why the gate was built pure — a policy you
 * cannot evaluate against history is a policy you cannot measure before you enforce it.
 *
 * ---------------------------------------------------------------------------
 * WHAT A RECONSTRUCTION CANNOT RECOVER, AND WHY IT MATTERS MOST
 * ---------------------------------------------------------------------------
 *
 * `authentication` is not stored on a canonical message. It is derived at ingestion from
 * headers the transport stamped, and messages received before that derivation existed
 * carry no trace of it. A reconstruction must therefore report `unknown`, and `unknown` is
 * treated as failure wherever authentication is load-bearing — which is precisely Lane B.
 *
 * The consequence has to be said plainly rather than discovered in a number: **in a
 * historical replay, every Lane B message lands in review, and that is a fact about the
 * evidence, not about the policy.** `counterfactualAuthenticated` exists to separate the
 * two — the same corpus evaluated as if the transport had vouched for each sender. The
 * difference between the two runs is the cost of the missing header, isolated.
 *
 * Anything else the live path had and this does not — a `Cc` list, an envelope
 * `received_for` — is recorded as a known limitation on the result rather than guessed at.
 */

import {
    evaluateEmailIngressEligibility,
    type EmailIngressDecision,
    type EmailIngressEnvelope,
    type EmailIngressPolicy,
    type SenderRelationship,
} from "@/lib/communications/ingress/emailIngressEligibility";

/** One already-persisted inbound email, as canonical storage holds it. */
export type HistoricalInboundEmail = {
    /** `communication_messages.id` — the audit key for every finding. */
    messageId: string;
    orgId: string;
    provider: string;
    providerMessageId: string;
    /** The thread ingestion actually filed it into. Context for the audit, never evidence. */
    canonicalThreadId: string | null;
    fromAddress: string;
    toAddress: string;
    subject: string | null;
    emailMessageId: string | null;
    emailInReplyTo: string | null;
    emailReferences: string | null;
    attachmentCount: number;
    /**
     * The thread an Alloy-minted id in the headers resolves to IN THIS ORGANIZATION.
     *
     * Resolved by the caller with an org-scoped lookup, exactly as ingestion does. It is
     * NOT `canonicalThreadId`: ingestion also files messages by endpoint provenance, and
     * treating "we put it somewhere" as "it proved a thread" would manufacture Lane A.
     */
    resolvedAlloyThreadId: string | null;
    /**
     * How much conversation the canonical thread actually holds, besides this message.
     *
     * Both are audit context and neither is evidence — but they are the only way to ask
     * the question that matters about a rejection: did the organization TREAT this as
     * work? "Has a thread" cannot answer it, because ingestion creates a thread for every
     * message it accepts, so every message in the corpus has one. An outbound message in
     * the same thread is different: somebody replied.
     */
    canonicalThreadMessageCount: number;
    canonicalThreadOutboundCount: number;
    /**
     * Outbound messages in this thread sent BEFORE this one arrived.
     *
     * The distinction that decides whether an engagement signal is usable at all. A gate
     * runs at arrival time and can only see the past; `canonicalThreadOutboundCount`
     * includes replies the message itself provoked, which is hindsight. Any candidate rule
     * must be evaluated on this field, and a rule that only works on the other one is not
     * a rule — it is a description of what already happened.
     */
    canonicalThreadOutboundBeforeCount: number;
    /** What ingestion concluded about the sender at the time. Audit context only. */
    inboundResolution: string | null;
    correlationMethod: string | null;
    receivedAt: string | null;
};

/**
 * Rebuild what the gate would have been given.
 *
 * `recipients` holds only `to_address`, and that is a real narrowing: the live path also
 * considers `cc` and the provider's `received_for`, neither of which canonical storage
 * keeps. It can only cause a message to match FEWER identities than it did, so a
 * reconstruction can under-admit and never over-admit — the safe direction for a
 * measurement whose purpose is to find over-admission.
 */
export function reconstructEnvelope(
    message: HistoricalInboundEmail,
    options: { counterfactualAuthenticated?: boolean } = {}
): EmailIngressEnvelope {
    return {
        recipients: [message.toAddress],
        sender: message.fromAddress,
        messageId: message.emailMessageId,
        inReplyTo: message.emailInReplyTo,
        references: message.emailReferences,
        subject: message.subject,
        hasAttachments: message.attachmentCount > 0,
        authentication: options.counterfactualAuthenticated ? "pass" : "unknown",
    };
}

export type BacktestOutcome = {
    message: HistoricalInboundEmail;
    decision: EmailIngressDecision;
    /** Set when the gate threw. A backtest records failures rather than dropping rows. */
    error: string | null;
};

/**
 * Evaluate one message. Never throws — a gate error is a RESULT.
 *
 * A backtest that aborted on one bad row would report a smaller, cleaner corpus than the
 * one it was given, and the missing rows would be exactly the interesting ones.
 */
export function backtestMessage(params: {
    message: HistoricalInboundEmail;
    policy: EmailIngressPolicy;
    senderRelationships: SenderRelationship[];
    senderPersonIds: string[];
    counterfactualAuthenticated?: boolean;
}): BacktestOutcome {
    try {
        const decision = evaluateEmailIngressEligibility({
            envelope: reconstructEnvelope(params.message, {
                counterfactualAuthenticated: params.counterfactualAuthenticated,
            }),
            policy: params.policy,
            senderRelationships: params.senderRelationships,
            senderPersonIds: params.senderPersonIds,
            resolvedAlloyThreadId: params.message.resolvedAlloyThreadId,
        });
        return { message: params.message, decision, error: null };
    } catch (cause) {
        return {
            message: params.message,
            decision: null as unknown as EmailIngressDecision,
            error: cause instanceof Error ? cause.message : String(cause),
        };
    }
}

export type BacktestMatrix = {
    totalEvaluated: number;
    wouldIngest: number;
    wouldReject: number;
    wouldRequireReview: number;
    laneA: number;
    laneB: number;
    laneC: number;
    laneD: number;
    laneExplicitAllow: number;
    ambiguous: number;
    unmatched: number;
    gateErrors: number;
    byReasonCode: Record<string, number>;
};

/**
 * The matrix, with `ambiguous` and `unmatched` given precise meanings.
 *
 *   ambiguous — the sender address resolves to more than one Person, so the relationship
 *               is real and names nobody. NOT the same as "the gate was unsure": the gate
 *               is never unsure, it is sometimes correct that the data is.
 *   unmatched — nothing in the organization recognises the sender AND no other lane
 *               admitted. This is the population a mixed inbox would have refused.
 */
export function summarizeBacktest(outcomes: readonly BacktestOutcome[]): BacktestMatrix {
    const ok = outcomes.filter((o) => o.error === null);
    const byReasonCode: Record<string, number> = {};
    for (const o of ok) byReasonCode[o.decision.reasonCode] = (byReasonCode[o.decision.reasonCode] ?? 0) + 1;
    const count = (p: (o: BacktestOutcome) => boolean) => ok.filter(p).length;
    return {
        totalEvaluated: outcomes.length,
        wouldIngest: count((o) => o.decision.disposition === "WOULD_INGEST"),
        wouldReject: count((o) => o.decision.disposition === "WOULD_REJECT"),
        wouldRequireReview: count((o) => o.decision.disposition === "WOULD_REQUIRE_REVIEW"),
        laneA: count((o) => o.decision.lane === "conversation_continuity"),
        laneB: count((o) => o.decision.lane === "relationship_watch"),
        laneC: count((o) => o.decision.lane === "purpose_intake"),
        laneD: count((o) => o.decision.lane === "acquisition"),
        laneExplicitAllow: count((o) => o.decision.lane === "explicit_allow"),
        ambiguous: count((o) => o.decision.senderAssertion.kind === "shared_endpoint"),
        unmatched: count((o) => o.decision.reasonCode === "REJECT_NO_ADMITTING_EVIDENCE"),
        gateErrors: outcomes.filter((o) => o.error !== null).length,
        byReasonCode,
    };
}

/**
 * The cases a human must look at, chosen by rule rather than by sampling everything.
 *
 * The selection is the argument: every case where the gate said something other than a
 * plain yes/no, every case where it refused mail that canonical history says became a real
 * conversation, and every case that exercised the strongest lane. Those are where a
 * deterministic policy is wrong in ways counts cannot show.
 */
export function selectAuditSample(
    outcomes: readonly BacktestOutcome[],
    options: { laneBSample?: number; unmatchedSample?: number } = {}
): Array<BacktestOutcome & { auditReason: string }> {
    const ok = outcomes.filter((o) => o.error === null);
    const picked = new Map<string, BacktestOutcome & { auditReason: string }>();
    const take = (o: BacktestOutcome, auditReason: string) => {
        if (!picked.has(o.message.messageId)) picked.set(o.message.messageId, { ...o, auditReason });
    };

    for (const o of ok) if (o.decision.disposition === "WOULD_REQUIRE_REVIEW") take(o, "every WOULD_REQUIRE_REVIEW");
    for (const o of ok) if (o.decision.senderAssertion.kind === "shared_endpoint") take(o, "ambiguous sender endpoint");
    for (const o of ok) if (o.decision.lane === "conversation_continuity") take(o, "every Lane A");
    for (const o of ok) if (o.decision.lane === "purpose_intake" || o.decision.lane === "acquisition") take(o, "every Lane C/D");
    // A refusal of mail somebody REPLIED to is the single most informative case in the
    // corpus: the organization demonstrably treated it as work, and the gate says it
    // should never have been looked at. Deliberately keyed on an outbound message in the
    // thread rather than on the thread existing — ingestion creates a thread for every
    // message it accepts, so "has a canonical thread" selects the entire corpus and
    // discriminates nothing.
    for (const o of ok) {
        if (o.decision.disposition === "WOULD_REJECT" && o.message.canonicalThreadOutboundCount > 0) {
            take(o, "WOULD_REJECT although the organization replied in this thread");
        }
    }
    for (const o of ok) {
        if (o.decision.disposition === "WOULD_REJECT" && o.message.canonicalThreadMessageCount > 1) {
            take(o, "WOULD_REJECT in a thread that holds other messages");
        }
    }

    const stride = <T,>(items: T[], n: number): T[] => {
        if (items.length <= n) return items;
        // Evenly spaced rather than random: a backtest must give the same sample every
        // time it runs, or two audits of the same corpus cannot be compared.
        const step = items.length / n;
        return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]!);
    };

    for (const o of stride(ok.filter((x) => x.decision.lane === "relationship_watch"), options.laneBSample ?? 5)) {
        take(o, "Lane B sample");
    }
    for (const o of stride(
        ok.filter((x) => x.decision.reasonCode === "REJECT_NO_ADMITTING_EVIDENCE"),
        options.unmatchedSample ?? 10
    )) {
        take(o, "unmatched WOULD_REJECT sample");
    }

    return [...picked.values()];
}

/* ---------------------------------------------------------------------------
 * CANDIDATE SIGNAL — endpoint provenance + organizational engagement
 * ------------------------------------------------------------------------- */

/**
 * Would a "we have talked to this endpoint before" rule change this decision?
 *
 * Evaluated in TWO forms, because the difference between them is the finding:
 *
 *   causal    outbound sent BEFORE this message arrived. The only form a gate could
 *             actually use, because a gate runs at arrival.
 *   hindsight any outbound in the thread, including the reply this message provoked.
 *             Not implementable — listed so the gap between the two is visible rather
 *             than accidentally claimed as a result.
 *
 * The function reports; it decides nothing. Nothing in the gate calls it, and adopting the
 * signal would be a separate, explicit change.
 */
export type EngagementCandidate = {
    messageId: string;
    currentDisposition: EmailIngressDecision["disposition"];
    currentReasonCode: EmailIngressDecision["reasonCode"];
    /** Ingestion's own correlation, which is what "endpoint provenance" means here. */
    correlationMethod: string | null;
    causalEngagement: boolean;
    hindsightEngagement: boolean;
    /** What may be believed about the sender — the false-positive axis for this signal. */
    senderAssertion: string;
    matchedRelationshipType: string | null;
};

export function evaluateEngagementCandidate(outcomes: readonly BacktestOutcome[]): {
    candidates: EngagementCandidate[];
    recoveredByCausal: number;
    recoveredByHindsight: number;
} {
    const candidates = outcomes
        .filter((o) => o.error === null && o.decision.disposition === "WOULD_REJECT")
        .map((o) => ({
            messageId: o.message.messageId,
            currentDisposition: o.decision.disposition,
            currentReasonCode: o.decision.reasonCode,
            correlationMethod: o.message.correlationMethod,
            // Endpoint provenance is a PRECONDITION of the candidate rule: the signal is
            // "this endpoint already has a conversation", not "somebody once replied".
            causalEngagement:
                o.message.correlationMethod === "endpoint_provenance" &&
                o.message.canonicalThreadOutboundBeforeCount > 0,
            hindsightEngagement: o.message.canonicalThreadOutboundCount > 0,
            senderAssertion: o.decision.senderAssertion.kind,
            matchedRelationshipType:
                o.decision.senderAssertion.kind === "unknown" ? null : (o.decision.senderAssertion.relationship?.kind ?? null),
        }));
    return {
        candidates,
        recoveredByCausal: candidates.filter((c) => c.causalEngagement).length,
        recoveredByHindsight: candidates.filter((c) => c.hindsightEngagement).length,
    };
}
