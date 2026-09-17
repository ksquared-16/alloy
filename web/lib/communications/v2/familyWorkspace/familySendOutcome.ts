/**
 * WHAT A SEND ACTUALLY DID — the one place that reads a send summary.
 *
 * The canonical send route is truthful: it returns `{requested, ready, sent, blocked, failed}` and
 * gates its OWN side effects on `summary.sent > 0`. The composer did not read any of it. Its only
 * failure branch was `!res.ok`, so an HTTP 200 carrying `sent: 0, failed: 1` walked straight into the
 * success path — the operator was told "Email sent to Tourb Tourb0913" for a message that was never
 * delivered, and the post-send `mark_sent` audit recorded a delivery that did not happen.
 *
 * Measured live: the public-origin guard correctly refused a participant link pointing at localhost
 * ("the configured public site address points at localhost, which no recipient can open"), the route
 * reported `requested 1 / sent 0 / failed 1`, and the UI announced success anyway.
 *
 * ── HTTP SUCCESS IS NOT DELIVERY. THREAD CREATION IS NOT DELIVERY. ──
 *
 * A thread is created by composing; delivery is a separate fact about a message leaving. Both can be
 * true independently, and reading either as the other is how an audit trail starts describing events
 * that never occurred.
 *
 * ── THE DOCTRINE IS THE ROUTE'S OWN, NOT A NEW ONE ──
 *
 * `delivered()` is `sent > 0`, which is exactly the rule `/api/admin/communications/family-send`
 * already applies to its contact-attempt association and its message-id linkage. Partial delivery
 * therefore counts as delivered for anything keyed on "did this reach someone", because it did —
 * while `classify` keeps partial distinguishable so presentation can say what did not.
 */

export type FamilySendSummary = {
    requested: number;
    ready: number;
    sent: number;
    blocked: number;
    failed: number;
};

export type FamilySendOutcome =
    /** Everything asked for went out. */
    | "full_success"
    /** Something went out and something did not. Never presented as either extreme. */
    | "partial_delivery"
    /** Nothing went out, and at least one attempt failed or was blocked. */
    | "total_failure"
    /** Nothing was asked for. Not a failure — there was nothing to do. */
    | "nothing_requested";

export function classifyFamilySendOutcome(summary: FamilySendSummary | null | undefined): FamilySendOutcome {
    const requested = Number(summary?.requested ?? 0);
    const sent = Number(summary?.sent ?? 0);
    const failed = Number(summary?.failed ?? 0);
    const blocked = Number(summary?.blocked ?? 0);

    if (requested <= 0) return "nothing_requested";
    if (sent <= 0) return "total_failure";
    // Blocked counts against completeness: a recipient the platform refused to contact did not get
    // the message, and calling that a full success would hide a consent or reachability problem.
    if (failed > 0 || blocked > 0 || sent < requested) return "partial_delivery";
    return "full_success";
}

/**
 * Did this send reach anyone at all?
 *
 * The existing route rule, named. Anything recording that contact HAPPENED — a contact attempt, a
 * `mark_sent` audit — keys on this, and must never key on the HTTP status.
 */
export function familySendDelivered(summary: FamilySendSummary | null | undefined): boolean {
    return Number(summary?.sent ?? 0) > 0;
}

type FamilySendRecipientResult = {
    status: string;
    display_name?: string | null;
    reason?: string | null;
};

/**
 * The operator-facing reason a send did not deliver.
 *
 * Carried verbatim from the canonical send owner rather than paraphrased: the reasons are already
 * written to be acted on ("the configured public site address points at localhost, which no recipient
 * can open"), and re-wording them here would put this module in the business of explaining failures
 * it does not own. The generic sentence is the last resort, not the default.
 */
export function familySendFailureMessage(
    results: readonly FamilySendRecipientResult[] | null | undefined,
): string {
    const reasons = [
        ...new Set(
            (results ?? [])
                .filter((r) => r.status !== "sent")
                .map((r) => (r.reason ?? "").trim())
                .filter(Boolean),
        ),
    ];
    if (reasons.length === 1) return reasons[0]!;
    if (reasons.length > 1) return reasons.join(" ");
    return "This message could not be sent.";
}

/**
 * What a PARTIAL delivery says: who it reached, and that some did not.
 *
 * Presented as neither extreme, because it is neither. The counts come from the summary the route
 * returned, so the sentence cannot drift from the fact.
 */
export function familySendPartialMessage(input: {
    channel: "email" | "sms";
    summary: FamilySendSummary;
}): string {
    const channelLabel = input.channel === "sms" ? "SMS" : "Email";
    const undelivered = Math.max(0, input.summary.requested - input.summary.sent);
    return `${channelLabel} sent to ${input.summary.sent} of ${input.summary.requested} recipients · ${undelivered} could not be sent`;
}
