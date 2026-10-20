/**
 * W7-F001 — FOUR REASONS A DRAFT IS A DRAFT, AND THEY ARE NOT THE SAME WORK.
 *
 * The Director's finding was that the product presented them as one: "Awaiting posting", a count of
 * drafts, and an operator trained to treat every one as a task. Three of the four are not.
 *
 * `operatorActionable` is the load-bearing field here, because it is what the band and the row tone
 * read. A charge waiting for the first of the month must never be counted as somebody's work, and
 * the historical drafts must never be given a reason nobody recorded.
 */
import { describe, expect, it } from "vitest";

import {
    awaitingPostingReason,
    operatorActionableCount,
} from "@/lib/financials/posting/awaitingPostingReason";

describe("awaitingPostingReason", () => {
    it("a charge waiting for its billing period is nobody's work, and names the day", () => {
        const r = awaitingPostingReason({ post_gate: "period_not_started", post_not_before: "2026-11-01" });
        expect(r.key).toBe("period_not_started");
        /* W7-F027: the operator's word is Scheduled; W7-F015: a human date, never ISO. */
        expect(r.label).toBe("Scheduled · activates Nov 1, 2026");
        expect(r.postsOn).toBe("2026-11-01");
        expect(r.operatorActionable).toBe(false);
        expect(r.explanation).toContain("Nothing to do");
    });

    it("still says what it is when the date was never recorded", () => {
        const r = awaitingPostingReason({ post_gate: "period_not_started" });
        expect(r.key).toBe("period_not_started");
        expect(r.operatorActionable).toBe(false);
        expect(r.label).not.toContain("undefined");
        expect(r.label).not.toContain("null");
    });

    it("a review boundary is a person's work", () => {
        const r = awaitingPostingReason({ post_gate: "review_required" });
        expect(r.key).toBe("review_required");
        expect(r.operatorActionable).toBe(true);
    });

    it("recognises the template's own review flag, not only the gate the auto-post path wrote", () => {
        /* `review_required` on metadata predates `post_gate` and is still written by the lifecycle
         * service. A draft held by it must not be classified as unrecorded. */
        const r = awaitingPostingReason({ review_required: true });
        expect(r.key).toBe("review_required");
    });

    /*
     * W7-F027: NOTHING RETRIES A FAILED POST — `shouldRetryPost` has no caller and the activation
     * job only picks up `period_not_started`. "Will retry" promised what never happens, so every
     * failure is a person's, whatever its attempt record says.
     */
    it("every failed post is attention work — no failure is described as retrying itself", () => {
        const attention = awaitingPostingReason({
            post_gate: "post_failed",
            post_attempt: { attempts: 5, attention_required: true, retryable: false },
        });
        expect(attention.key).toBe("post_failed");
        expect(attention.operatorActionable).toBe(true);
        expect(attention.label).toBe("Posting failed");

        const once = awaitingPostingReason({
            post_gate: "post_failed",
            post_attempt: { attempts: 1, attention_required: false, retryable: true },
        });
        expect(once.operatorActionable).toBe(true);
        expect(once.label).not.toMatch(/retry/i);
        expect(once.explanation).toMatch(/not retried on its own/);
    });

    it("a FAILURE outranks a review boundary and a calendar", () => {
        /*
         * A charge that tried and could not is the only one of the four that may be losing money
         * quietly, so it must not be hidden behind a reassuring label.
         */
        const r = awaitingPostingReason({
            post_gate: "post_failed",
            review_required: true,
            post_not_before: "2026-11-01",
            post_attempt: { attempts: 5, attention_required: true, retryable: false },
        });
        expect(r.key).toBe("post_failed");
    });

    it("a review boundary outranks a calendar", () => {
        /* A future-period charge held for review is held for review. It must not be presented as
         * something that will sort itself out. */
        const r = awaitingPostingReason({ post_gate: "review_required", post_not_before: "2026-11-01" });
        expect(r.key).toBe("review_required");
    });

    it("the historical drafts are Legacy drafts — named for what they are, and not today's work", () => {
        /*
         * W7-F027 census, deployed staging 2026-10-20: all 34 rows in Needs attention were these —
         * created Aug–Sep, before automatic posting. They never activate on their own and someone
         * may still post or cancel one, but they must not define the modern workflow.
         */
        for (const metadata of [null, undefined, {}, { source: "charge_template" }]) {
            const r = awaitingPostingReason(metadata);
            expect(r.key).toBe("unclassified");
            expect(r.label).toBe("Legacy draft");
            expect(r.operatorActionable).toBe(false);
            expect(r.explanation).toMatch(/before automatic posting/);
            expect(r.explanation).toMatch(/will not activate on its own/);
        }
    });
});

describe("operatorActionableCount", () => {
    it("counts what a person does, not how many drafts exist", () => {
        const reasons = [
            awaitingPostingReason({ post_gate: "period_not_started", post_not_before: "2026-11-01" }),
            awaitingPostingReason({ post_gate: "period_not_started", post_not_before: "2026-12-01" }),
            awaitingPostingReason({ post_gate: "review_required" }),
            awaitingPostingReason({}),
        ];
        expect(reasons.length).toBe(4);
        /* Only the review hold. The legacy draft is listed apart, not counted as work. */
        expect(operatorActionableCount(reasons)).toBe(1);
    });
});
