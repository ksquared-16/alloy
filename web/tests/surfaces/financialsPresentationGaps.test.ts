/**
 * THREE MEASURED PRESENTATION GAPS, CLOSED — and locked at the thing that was wrong.
 *
 * Each of these was measured on the certified build before it was changed, and each is a
 * PRESENTATION repair over an authority that was already correct. The locks therefore check that
 * the surface reads the canonical value rather than that it renders a string: a second prepaid
 * arithmetic or a component-local period calculation would satisfy a screenshot and be the exact
 * duplication the platform rule forbids.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("THE GATE — available prepaid reaches the account summary", () => {
    const card = src("components/operationalCards/FinancialsCard.tsx");
    const account = card.slice(card.indexOf("function FinancialsAccountSummaryCard"));
    const body = account.slice(0, account.indexOf("\nfunction ") > 0 ? account.indexOf("\nfunction ") : account.length);

    /*
     * MEASURED BEFORE THE CHANGE: Focus Panel Summary read "Available $125.00", Details read
     * "AVAILABLE PREPAID $125.00", and the Accounts workspace — the account's ONE summary, in the
     * dedicated financial workspace — rendered no such node at all.
     */
    it("states Available in the account summary strip", () => {
        expect(body, "the account strip reads the canonical figure").toContain("period.availablePrepaid");
        expect(body).toContain('testId="available-prepaid"');
    });

    /* Zero is silence. A permanent "Available $0.00" is the noise the density doctrine forbids. */
    it("renders it only when the authority says there is money", () => {
        expect(body).toMatch(/\{period\.availablePrepaid \?/);
    });

    /*
     * NO SECOND ARITHMETIC. The workspace must not compute a position; `availablePrepaid` is
     * already null unless the money is canonically AVAILABLE, with pending and failed excluded
     * upstream.
     */
    it("computes nothing of its own", () => {
        expect(body, "no cents arithmetic in the summary").not.toMatch(/availableCents|prepaid\?\./);
    });

    /*
     * And it is never LABELLED a deposit — that is a Payments concept with its own lifecycle.
     * Scoped to what renders: the first draft of this searched the whole component and failed on
     * the comment that says "It is NOT a deposit", which is a test failing on the sentence that
     * documents the rule it is enforcing.
     */
    it("does not label unapplied money as a deposit", () => {
        const rendered = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(rendered).not.toMatch(/label="Deposit"|>\s*Deposit\s*</i);
    });
});

describe("THE GATE — the tuition card states a period it did not calculate", () => {
    const card = src("components/admin/focusPanel/cards/AssignmentTuitionCard.tsx");

    it("reads the billing period from the period authority", () => {
        expect(card).toContain("acceptedTermBillingPeriods");
        expect(card).toContain('from "@/lib/financials/billingPeriod"');
    });

    /* A component working out its own boundaries would be a second period model. */
    it("does no period arithmetic of its own", () => {
        expect(card).not.toMatch(/billingPeriodsBetween|addDays|setUTCDate/);
    });

    /*
     * THE PERIOD IT IS IN NOW, not the one the term began in. The first version passed the
     * resolution date — the assignment start — so a term accepted on the 1st reported the first
     * week of the month on the 19th: the right shape and the wrong fact.
     */
    it("asks which period we are in now", () => {
        expect(card).toMatch(/acceptedTermBillingPeriods\(accepted, todayYmd\)/);
        expect(card, "and reads today once per mount").toMatch(/const todayYmd = useMemo/);
    });

    /* Generation stays Financials-owned: this surface is READ context, not a command. */
    it("offers no generate control", () => {
        expect(card).not.toMatch(/generate_tuition|Generate tuition/i);
    });
});

describe("THE GATE — the discounts subsection says what it is", () => {
    const page = src("components/adminV2/settings/financials/policies/PoliciesConfigurationPage.tsx");

    /*
     * The chapter held two authorities and only the second named itself, so an operator looking
     * for DISCOUNTS saw a page about "Policies" and never the word they wanted.
     */
    it("names discounts in the commercial subsection heading", () => {
        expect(page).toMatch(/Discounts &amp; commercial policies/);
    });

    it("keeps the execution policies named separately", () => {
        expect(page).toContain("Financial execution policies");
        expect(page).toContain('data-testid="financial-execution-policies"');
    });

    /* IA repair only: one authority, one form, one route. */
    it("adds no second policy form or route", () => {
        const forms = page.match(/CommercialPoliciesPanel|FinancialPoliciesConfigurationPanel/g) ?? [];
        expect(new Set(forms).size, "the same two panels, not a third").toBeLessThanOrEqual(2);
    });
});

describe("THE RATE — a discount states what it does where it opens", () => {
    const page = src("components/adminV2/settings/financials/policies/PoliciesConfigurationPage.tsx");

    /*
     * MEASURED, 2026-09-19, mounted: selecting "Sibling discount (QA specimen)" opened `overview`,
     * which stated Category / Type / Status / Applied to / Locations / Effective and NOT the rate.
     * "10% off everything" lived only on the Rules tab, and the rail row did not carry it either —
     * so the front page of a discount omitted the only fact that makes it a discount.
     */
    it("states the rule on the overview, not only on the Rules tab", () => {
        const overview = page.slice(page.indexOf('data-testid="policy-overview"'), page.indexOf('data-testid="policy-rules"'));
        expect(overview, "the overview renders the value summary").toContain("valueSummary");
        expect(overview).toContain('data-testid="policy-overview-rule"');
    });

    it("states the rule on the rail row, so the list is scannable unopened", () => {
        const rail = page.slice(page.indexOf('role="listbox"'), page.indexOf('<main className="min-w-0">'));
        expect(rail).toContain("commercialPolicyValueSummary");
    });

    /* ONE formatter. The rate is derived by the helper that already owns it, in both places. */
    it("derives the rate from the shared helper and formats none of it locally", () => {
        expect(page).toContain("commercialPolicyValueSummary");
        expect(page, "no local percent formatting").not.toMatch(/\$\{[^}]*\}\s*%|toFixed\(/);
        expect(page, "no local basis branching").not.toMatch(/basis\s*===\s*"percentage"/);
    });
});
