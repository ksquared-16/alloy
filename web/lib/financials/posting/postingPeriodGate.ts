/**
 * A CHARGE IN A PERIOD THAT HAS NOT BEGUN IS NOT YET OWED.
 *
 * ── THE DEFECT THIS CLOSES (W7-F001) ──
 *
 * Posting asked one question about a billing period — is it CLOSED? — and nothing about whether it
 * had STARTED. A charge dated into next month therefore became financially effective the moment it
 * was created: it entered what is owed, it aged, it reached autopay's due-date gate, and the only
 * thing marking it as belonging to a future cycle was its own `billable_on`. The Director's
 * walkthrough found the other half of the same gap from the opposite side — ordinary charges sitting
 * as drafts with no review policy configured anywhere, waiting for a human to perform a posting step
 * that no business rule had asked for.
 *
 * So the lifecycle has one shape and this is the half that was missing:
 *
 *   CURRENT period  → posted immediately, subject to a configured `posting_review` boundary
 *   FUTURE period   → a draft, not financially effective, and it says WHY
 *   period begins   → posted automatically, by the clock, through the same authority
 *
 * ── IT ADDS NO BILLING-PERIOD STATE ──
 *
 * `financial_billing_periods.status` is CHECK-constrained to exactly ('open','closed') and defaults
 * to 'open', so a materialised future period is open from the moment it exists. That is correct and
 * is deliberately left alone: "open" is a statement about FINALITY, not about having begun, and
 * conflating the two would make close semantics answer a calendar question. The calendar question is
 * answered where calendar questions belong — by comparing the period's own `starts_on` against the
 * organisation's business date.
 *
 * ── WHY THE ORGANISATION'S BUSINESS DATE AND NOT UTC ──
 *
 * `starts_on` is a date a human chose in their own commercial calendar. Comparing it to a UTC date
 * posts a period's first charges up to a day early for every organisation west of UTC — the same
 * defect this programme already fixed in the Financials card and in the close schedule. There is one
 * answer to "what day is it here" (`fetchOrgBusinessDate`) and this uses it.
 *
 * ── IT IS A PURE COMPARISON, SEPARATELY TESTABLE ──
 *
 * Nothing in this module reads a database. The gate's RULE lives here so it can be proven against a
 * table of dates and timezones, and the gate's PLACEMENT lives in `postChildcareCharge` — the single
 * posting authority — so every charge writer inherits it rather than every charge writer remembering
 * it.
 */
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

/**
 * The fourth reason a charge can be a draft, and the only one that resolves itself.
 *
 * It sits alongside `review_required` (a human was asked for) and `post_failed` (we tried and could
 * not) on `metadata.post_gate`, and it is deliberately distinct from both: review is a business
 * control nobody should be able to bypass by waiting, and a failure is attention work. This is
 * neither — it is a calendar, and the clock clears it.
 */
export const PERIOD_NOT_STARTED_GATE = "period_not_started";

/** The structural marker on a refusal, so no caller has to match on message text. */
export const PERIOD_NOT_STARTED_DETAIL_KEY = "postingGate";

export type PeriodNotStartedFacts = {
    chargeId: string;
    billingPeriodId: string;
    periodKey: string;
    /** The first day the period covers, in the organisation's own calendar. */
    periodStartsOn: string;
    /** The organisation's business date at the moment of the attempt. */
    businessDate: string;
};

/**
 * Has this charge's billing period begun?
 *
 * Both arguments are `yyyy-MM-dd` in the SAME calendar — the organisation's — so a lexical
 * comparison is a chronological one, which is why no Date is constructed here. Constructing one
 * would reintroduce a timezone at exactly the point the caller just removed it.
 *
 * A missing `starts_on` is NOT treated as "not started". A period with no start date is a
 * configuration fault, and refusing to post because of one would stop ordinary billing for a reason
 * the operator cannot see or fix from the charge. The calendar gate answers only the question it can
 * answer.
 */
export function billingPeriodHasBegun(args: {
    periodStartsOn: string | null | undefined;
    businessDate: string;
}): boolean {
    const starts = (args.periodStartsOn ?? "").trim();
    const today = (args.businessDate ?? "").trim();
    if (!starts || !today) return true;
    return starts <= today;
}

/**
 * The sentence an operator reads. It states the fact, names the date, and says what will happen —
 * because nothing is wrong here and a refusal that sounds like a fault would send someone looking
 * for a problem that does not exist.
 */
export function periodNotStartedMessage(facts: Pick<PeriodNotStartedFacts, "periodStartsOn">): string {
    return (
        `This charge belongs to the billing period beginning ${facts.periodStartsOn}, which has not started yet, `
        + "so it is not owed and has been kept as a draft. It will post on its own when that period begins."
    );
}

/** The canonical refusal. One construction site, so the marker and the message cannot drift apart. */
export function periodNotStartedRefusal(facts: PeriodNotStartedFacts): OperationalEnrollmentServiceError {
    return new OperationalEnrollmentServiceError("conflict", periodNotStartedMessage(facts), {
        [PERIOD_NOT_STARTED_DETAIL_KEY]: PERIOD_NOT_STARTED_GATE,
        chargeId: facts.chargeId,
        billingPeriodId: facts.billingPeriodId,
        periodKey: facts.periodKey,
        periodStartsOn: facts.periodStartsOn,
        businessDate: facts.businessDate,
    });
}

/**
 * Recognise the refusal STRUCTURALLY.
 *
 * `isRetryablePostFailure` next door classifies failures by searching the message for words like
 * "closed", which works because those messages are ours but is a contract made of prose. A gate the
 * retry path and the operator surfaces both have to act on deserves better than that, so the marker
 * is a key in `details` and this is the only reader of it.
 *
 * Returns the facts rather than a boolean, because every caller that recognises this refusal needs
 * the date in order to say anything useful about it.
 */
export function periodNotStartedFacts(error: unknown): PeriodNotStartedFacts | null {
    if (!(error instanceof OperationalEnrollmentServiceError)) return null;
    const details = error.details ?? {};
    if (details[PERIOD_NOT_STARTED_DETAIL_KEY] !== PERIOD_NOT_STARTED_GATE) return null;
    const s = (key: string): string => {
        const v = details[key];
        return v == null ? "" : String(v);
    };
    return {
        chargeId: s("chargeId"),
        billingPeriodId: s("billingPeriodId"),
        periodKey: s("periodKey"),
        periodStartsOn: s("periodStartsOn"),
        businessDate: s("businessDate"),
    };
}
