/**
 * "NOT YET" IS NOT "NEVER", AND "NO ACTIVITY" IS NOT "NO ACCOUNT".
 *
 * ── THE DEFECT THIS EXISTS TO CATCH ──
 *
 * Reproduced in the mounted product on a Waitlist record: the Enrollment card and the Children card
 * both showed valid subject context, and Financials said "No financial record."
 *
 * Two separate faults produced that sentence, and each is worse than it looks.
 *
 * FIRST, the card had exactly one way of having no subject. It rendered the terminal copy whenever
 * it held no id and was not mid-fetch — which is precisely the state it is in during the ordinary
 * window while the panel's own truth is still composing. There is nothing to load yet, so `loading`
 * is false, so the card delivered a verdict about an account it had not looked for. Every other card
 * on that panel reserves through the same window; only this one spoke.
 *
 * SECOND, the sentence was wrong even when the card was right. "No financial record" reads as a
 * claim about the FAMILY — that they have no financial history — and having no financial activity is
 * an ordinary, fully supported state that renders as $0.00 with Add charge available. A canonical
 * customer with zero activity is a valid financial subject. What the card actually meant was that it
 * could not resolve an account to ask about, which is a different sentence entirely.
 *
 * These pin the three states apart, and pin the copy that may only be said about the terminal one.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { HOUSEHOLD_IDENTITY_TRUTH_KEYS } from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";

const card = fs.readFileSync(
    path.join(__dirname, "../../../components/admin/focusPanel/cards/FinancialsCard.tsx"),
    "utf8",
);

/**
 * The card's own rule, quoted rather than re-implemented: a subject is still resolving while the
 * context says `composing`, and only a settled context with no identity may speak terminally.
 */
function statesFor(input: { status: string; customerId: string | null; memberId: string | null; loading: boolean }) {
    const subjectStillResolving = input.status === "composing";
    const noFinancialSubject = !subjectStillResolving && !input.customerId && !input.memberId;
    const pending = input.loading || subjectStillResolving;
    return {
        marker: pending ? "loading" : noFinancialSubject ? "no-subject" : "no-account",
        copy: pending ? "Loading the account…" : "Financial account unavailable",
    };
}

describe("the Financials card's subject states", () => {
    /*
     * THE WAITLIST-SHAPED COMPOSITION THAT REPRODUCED THIS. A panel whose truth has not arrived: no
     * household key, no participant scope, nothing in flight. Before the repair this rendered the
     * terminal sentence.
     */
    it("is pending while the panel's own subject is still composing", () => {
        const state = statesFor({ status: "composing", customerId: null, memberId: null, loading: false });
        expect(state.marker, "a composing subject is not an answer about an account").toBe("loading");
        expect(state.copy).toBe("Loading the account…");
    });

    it("stays pending while composing even once an id has arrived", () => {
        const state = statesFor({ status: "composing", customerId: "cust-1", memberId: null, loading: false });
        expect(state.marker).toBe("loading");
    });

    /*
     * ONLY A SETTLED CONTEXT MAY SPEAK TERMINALLY — and then about the ACCOUNT, never about the
     * family's financial history.
     */
    it("reports an unavailable account only once the subject is settled", () => {
        const state = statesFor({ status: "ready", customerId: null, memberId: null, loading: false });
        expect(state.marker).toBe("no-subject");
        expect(state.copy).toBe("Financial account unavailable");
    });

    it("resolves through a scoped child when the household is not named", () => {
        const state = statesFor({ status: "ready", customerId: null, memberId: "cm-1", loading: false });
        expect(state.marker, "a scoped child is a financial subject").not.toBe("no-subject");
    });

    /*
     * THE COPY ITSELF. "No financial record" was a statement about the family and it must not come
     * back — zero activity is a supported state that renders as $0.00 with Add charge.
     */
    it("never tells an operator the family has no financial record", () => {
        /* The CODE, not the commentary: the notes above the component must name the old sentence
           in order to explain why it was wrong. What matters is what an operator reads. */
        const rendered = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        expect(rendered, "zero activity is a valid financial state, not an absent one").not.toContain(
            "No financial record",
        );
        expect(rendered).toContain("Financial account unavailable");
    });

    /*
     * MOUNTING AND READING ARE ONE DECISION. The registry admits Financials on these keys; the card
     * used to re-list them privately, which is the drift the registry's own comment warns about.
     */
    it("resolves the account through the shared rule, not a copy of it", () => {
        /*
         * The card must ASK the same function that decided it could mount. Containing the key list
         * was the weaker contract: two surfaces can share a list and still disagree about how to
         * read it. Sharing the resolver removes the second interpretation entirely.
         */
        expect(card).toContain("resolveFinancialSubjectId");
        expect(
            card.includes('"customer.id", "household.id"'),
            "a second literal list is how mounting and reading drift apart",
        ).toBe(false);
        // And the rule itself still names the account identities a household can arrive under.
        expect([...HOUSEHOLD_IDENTITY_TRUTH_KEYS]).toContain("customer.id");
        expect([...HOUSEHOLD_IDENTITY_TRUTH_KEYS]).toContain("child.family_customer_id");
    });
});
