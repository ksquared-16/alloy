/**
 * WHY IS THIS DRAFT WAITING? FOUR ANSWERS, AND THEY ARE NOT THE SAME WORK.
 *
 * ── THE DEFECT THIS CLOSES ──
 *
 * "Awaiting posting" was one bucket, and `status = 'draft'` was its whole definition. Four
 * unrelated situations arrived in it looking identical:
 *
 *   * a charge for next month, which is not owed yet and which nobody should touch;
 *   * a charge a configured `posting_review` policy is holding for a person to approve;
 *   * a charge posting tried to make real and could not — attention work, with a reason;
 *   * a draft from before any of this was recorded, whose reason is genuinely unknown.
 *
 * Presenting those as one queue taught the operator the wrong lesson: that a draft is a task. Three
 * of the four are not. The Director's walkthrough found exactly that — being asked to post an
 * ordinary charge by hand because no rule had said otherwise.
 *
 * ── IT CLASSIFIES, IT DOES NOT DECIDE ──
 *
 * Nothing here changes what posts or when. `postChildcareCharge` owns the gates and
 * `metadata.post_gate` is what they wrote; this is the single reader that turns that record into
 * words, so a row, a tab, a detail panel and a count cannot describe the same draft differently.
 *
 * ── `unclassified` IS AN HONEST ANSWER ──
 *
 * Drafts created before the auto-post repair carry no `post_gate` at all, and the deployed estate
 * holds thirty-five of them. Guessing a reason for those would be worse than saying so: the whole
 * point of distinguishing the reasons is that each one implies different work, and inventing one
 * implies work that may not exist. They are named as unrecorded, and nothing claims they are
 * waiting for anything in particular.
 */

/** The reasons a charge can be a draft, in the order an operator should care about them. */
export type AwaitingPostingReasonKey =
    | "post_failed"
    | "review_required"
    | "period_not_started"
    | "unclassified";

export type AwaitingPostingReason = {
    key: AwaitingPostingReasonKey;
    /** Short enough for a row or a chip. */
    label: string;
    /** One sentence: what this is, and whose move it is. */
    explanation: string;
    /**
     * Whether a HUMAN has to do something. False for a charge waiting on the calendar — the clock
     * owns it — and that distinction is what stops the queue from reading as a to-do list.
     */
    operatorActionable: boolean;
    /** The date it posts on, when the reason is a calendar. */
    postsOn: string | null;
};

const UNCLASSIFIED: AwaitingPostingReason = {
    key: "unclassified",
    label: "Awaiting posting",
    explanation:
        "Why this draft is waiting was never recorded — it predates automatic posting. Review the amount, then post it if it is right.",
    operatorActionable: true,
    postsOn: null,
};

function text(value: unknown): string | null {
    const s = value == null ? "" : String(value).trim();
    return s || null;
}

/**
 * Classify one draft from the metadata the posting authority wrote.
 *
 * Order matters and is deliberate: a FAILURE outranks everything, because a charge that tried and
 * could not is the only one of the four that may be losing money quietly. Review outranks the
 * calendar, because a review boundary binds whether or not the period has begun — a future-period
 * charge held for review is held for review, and must not be presented as "it will sort itself out".
 */
export function awaitingPostingReason(
    metadata: Record<string, unknown> | null | undefined,
): AwaitingPostingReason {
    const md = metadata ?? {};
    const gate = text(md["post_gate"]);

    if (gate === "post_failed") {
        const attempt = (md["post_attempt"] ?? {}) as Record<string, unknown>;
        const attentionRequired = attempt["attention_required"] === true;
        const attempts = Number(attempt["attempts"] ?? 0);
        return {
            key: "post_failed",
            label: attentionRequired ? "Posting failed — needs attention" : "Posting failed — will retry",
            explanation: attentionRequired
                ? `Posting was attempted ${attempts || 1} time(s) and could not complete, and it will not be retried on its own. This one needs a person.`
                : `Posting was attempted ${attempts || 1} time(s) and could not complete. It will be retried automatically.`,
            operatorActionable: attentionRequired,
            postsOn: null,
        };
    }

    if (gate === "review_required" || md["review_required"] === true) {
        return {
            key: "review_required",
            label: "Waiting for review",
            explanation:
                "A posting-review policy holds this for a person to approve before it becomes owed. Posting it is the approval.",
            operatorActionable: true,
            postsOn: null,
        };
    }

    if (gate === "period_not_started") {
        const postsOn = text(md["post_not_before"]);
        return {
            key: "period_not_started",
            label: postsOn ? `Posts ${postsOn}` : "Waiting for its billing period",
            explanation: postsOn
                ? `Not owed yet. Its billing period begins on ${postsOn}, and it posts on its own that day. Nothing to do.`
                : "Not owed yet — its billing period has not begun. It posts on its own when the period starts. Nothing to do.",
            operatorActionable: false,
            postsOn,
        };
    }

    return UNCLASSIFIED;
}

/**
 * How many drafts are actually a person's work.
 *
 * The number beside "Awaiting posting" was a count of drafts, which is not a count of anything an
 * operator does. This counts the ones whose reason says a human is needed.
 */
export function operatorActionableCount(
    reasons: readonly Pick<AwaitingPostingReason, "operatorActionable">[],
): number {
    return reasons.filter((r) => r.operatorActionable).length;
}
