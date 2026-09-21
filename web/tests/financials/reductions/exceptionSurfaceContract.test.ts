/**
 * THE ASSIGNMENT SURFACE ASKS FOR AN EXCEPTION. IT DOES NOT OWN A SWITCH.
 *
 * ── THE SHAPE THIS FEATURE MUST NOT BECOME ────────────────────────────────────────────────────
 *
 * The easy version of "this family does not get the sibling discount" is a checkbox on the
 * assignment. It is wrong in three ways that only show up later: it has no reason, so nobody can
 * say why six months on; it has no dates, so it silently rewrites what was true last period; and
 * it makes the assignment a second place where commercial policy is decided, which is how the
 * ledger and the surface come to disagree.
 *
 * So these are locks on the surface's SOURCE, over comment-stripped text — prose describing the
 * rule cannot satisfy them. What the source is held to: the surface asks the registered action,
 * refuses to submit without a reason, and nowhere carries a boolean for a discount.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CARD = "components/admin/focusPanel/cards/SchedulingCard.tsx";

/** Comments stripped, so a lock can never be satisfied by a comment that describes the rule. */
function source(path: string): string {
    return readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const card = source(CARD);

/* The discount section only — an assertion over the whole 2,500-line card proves nothing. */
const discountSection = (() => {
    const start = card.indexOf('data-assignment-discount-forecast');
    expect(start, "the discount forecast section is still in the card").toBeGreaterThan(-1);
    const end = card.indexOf("THE STALE-TERM REVIEW STATE", start);
    return card.slice(start, end > start ? end : start + 9000);
})();

describe("the surface asks the one authority", () => {
    it("posts the registered exception action, and no other writer", () => {
        expect(card).toContain('"billing.except_commercial_policy"');
        expect(card).toContain('"billing.end_commercial_policy_exception"');
        /* Never the table. A surface that writes rows directly is a second authority. */
        expect(card).not.toContain("commercial_policy_exceptions");
    });

    it("sends the assignment as the subject, not a household or a child", () => {
        const call = card.slice(card.indexOf("async function commitException"), card.indexOf("async function commitException") + 1200);
        expect(call).toContain('entity_type: "opportunity_customer_member"');
        expect(call).toContain("pricingView?.opportunityCustomerMemberId");
    });

    /*
     * AFTER THE WRITE, RE-READ. Patching the forecast locally would make the surface the author of
     * an effect it does not decide — and the first time the two disagreed, the operator would
     * believe the screen.
     */
    it("re-reads the forecast after authoring rather than predicting the effect", () => {
        const call = card.slice(card.indexOf("async function commitException"), card.indexOf("async function commitException") + 1600);
        expect(call).toContain("setForecastNonce");
        expect(call).not.toMatch(/setForecast\(\s*\{/);
    });
});

describe("it is an exceptional action, not a setting", () => {
    it("carries no discount boolean anywhere in the card", () => {
        for (const forbidden of ["discount_enabled", "discountEnabled", "discountsEnabled"]) {
            expect(card, `${forbidden} would make the assignment a second place policy is decided`).not.toContain(forbidden);
        }
    });

    it("offers no checkbox or toggle in the discount section", () => {
        expect(discountSection).not.toMatch(/type="checkbox"/);
        expect(discountSection).not.toMatch(/<input[^>]*type=\{?["']?(checkbox|radio)/);
        expect(discountSection).not.toMatch(/role="switch"/);
    });

    /* The affordance is a link beside the policy it acts on — quiet, and not a primary control. */
    it("offers the exception beside the policy it would exclude", () => {
        expect(discountSection).toContain("data-add-policy-exception");
        expect(discountSection).toContain("Add exception");
    });
});

describe("a reason is not optional in the surface either", () => {
    it("disables the commit until a reason has been typed", () => {
        const draft = discountSection.slice(discountSection.indexOf("data-policy-exception-confirm"));
        expect(draft).toMatch(/disabled=\{[^}]*reason\.trim\(\)\.length === 0/);
    });

    it("labels the field as required rather than hinting at it", () => {
        expect(discountSection).toContain("WHY (REQUIRED)");
        expect(discountSection).toContain("data-policy-exception-reason");
    });

    /*
     * THE PREVIEW PROMISES APPLICABILITY, NOT MONEY, and says posted history is safe. Both halves
     * matter: the operator is about to make a decision whose cost is decided elsewhere.
     */
    it("previews what the exception means before it is recorded", () => {
        const preview = discountSection.slice(
            discountSection.indexOf("data-policy-exception-preview"),
            discountSection.indexOf("data-policy-exception-confirm"),
        );
        expect(preview).toContain("will not apply");
        expect(preview).toContain("already posted");
        expect(preview, "no figure is promised here").not.toMatch(/\$\{?[a-zA-Z]*[Cc]ents|toLocaleString/);
    });
});

describe("what is excluded is visible, with its reason", () => {
    it("renders the decision and the words its author gave", () => {
        const list = discountSection.slice(discountSection.indexOf("data-policy-exception"), discountSection.indexOf("data-policy-exception-draft"));
        expect(list).toContain("excluded for this assignment");
        expect(list).toContain("e.reason");
    });

    /* Ending is a dated close, never a delete — the surface must not offer the other thing. */
    it("offers ending an exception, and nothing that removes one", () => {
        expect(discountSection).toContain("data-end-policy-exception");
        expect(discountSection).toContain("End exception");
        expect(discountSection).not.toMatch(/\bDelete\b|\bRemove exception\b/);
    });

    /*
     * The domain's own word reaches the operator in operator language. Without this mapping the
     * surface renders `excluded_by_exception` raw, or worse, falls back to a reason that sends
     * them looking for configuration that is not missing.
     */
    it("speaks the domain's exclusion reason in operator words", () => {
        expect(card).toContain("excluded_by_exception:");
        expect(card).toContain('"Excluded for this assignment"');
    });
});
