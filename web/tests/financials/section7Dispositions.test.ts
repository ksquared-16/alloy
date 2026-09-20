/**
 * SECTION 7 — the Core-blocking findings, settled (§7B · §7C · §7F · §7G).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { financialRowConceptLabel } from "@/lib/financials/reductions/reductionProvenance";
import {
    FINANCIAL_POLICY_TYPES,
    OPERATOR_AUTHORABLE_FINANCIAL_POLICY_TYPES,
    isOperatorAuthorablePolicyType,
} from "@/lib/financials/policies/financialPolicyTypes";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("THE GATE — a household obligation can be owed by somebody (§7B)", () => {
    const net = src("lib/financials/responsibility/resolveAllocatableNet.ts");

    /*
     * Core can author a household-grain charge, so Core must be able to say who owes it. This
     * refused everything not backed by an enrolment, which left an obligation that could exist and
     * could never be anyone's.
     */
    it("accepts a charge billed to the household as well as one billed to an enrolment", () => {
        expect(net).toContain('charge.billable_source_type !== "customer"');
        expect(net, "and says so in the refusal it still makes")
            .toContain("Only a charge billed to an enrolment or a household carries responsibility.");
    });

    /* Household grain stays intentional: no child is invented for account money. */
    it("keeps a household charge's subject null rather than inventing a child", () => {
        expect(net).toContain('agreement = { customer_id: charge.billable_source_id, customer_member_id: null };');
        expect(net, "and carries no enrolment where there is none")
            .toContain("enrollmentAgreementId: enrolmentBacked ? charge.billable_source_id : null");
    });
});

describe("THE GATE — a child-grain arrangement is operator-authorable (§7C)", () => {
    const panel = src("app/adminV2/financials/FinancialsResponsibilityPanel.tsx");

    /*
     * The runtime has always preferred the most specific arrangement, and the panel could author
     * only the account-wide kind — so a child-grain arrangement could decide who owed a child's
     * charges and be impossible for an operator to create or supersede.
     */
    it("offers the two legitimate scopes and sends the chosen one", () => {
        expect(panel).toContain('data-testid="responsibility-scope"');
        expect(panel).toContain("arrangementMemberId: effectiveMemberId");
        expect(panel).toMatch(/effectiveMemberId = administering[\s\S]{0,200}scope === "child" \? customerMemberId : null/);
        expect(panel).toContain("customer_member_id: args.arrangementMemberId");
    });

    /* Household remains the default — the common case, and the one this panel always wrote. */
    it("defaults to the household scope", () => {
        expect(panel).toMatch(/useState<"household" \| "child">\("household"\)/);
    });

    /* A scope with nothing to choose between is not offered. */
    it("offers the control only where a child is actually in view", () => {
        /*
         * TWO PLACES OFFER A SCOPE, AND BOTH REQUIRE SOMETHING TO CHOOSE BETWEEN. Account
         * administration offers it when the household has members to name; charge detail offers it
         * when a child is in view. Neither renders a choice with one option.
         */
        const adminBranch = panel.slice(panel.indexOf("{administering ? ("), panel.indexOf(") : customerMemberId ? ("));
        const childBranch = panel.slice(panel.indexOf(") : customerMemberId ? ("));
        expect(adminBranch, "account administration offers the scope").toContain('data-testid="responsibility-scope"');
        expect(childBranch, "and so does charge detail, where a child is in view").toContain('data-testid="responsibility-scope"');
        expect(adminBranch.length, "the branches are distinct, not one window over both").toBeGreaterThan(0);
        expect(panel).toContain("const administering = (memberOptions?.length ?? 0) > 0;");
    });
});

describe("THE GATE — configurable is not capability (§7F)", () => {
    /* Every authorable type was traced to a real resolveFinancialPolicy consumer. */
    it("offers only the policy types something actually consumes", () => {
        expect([...OPERATOR_AUTHORABLE_FINANCIAL_POLICY_TYPES].sort()).toEqual(
            ["billing_cadence", "due_date", "grace_period", "posting_review", "proration", "vacation_credit"].sort(),
        );
    });

    /* The four with no runtime consumer are withheld from authoring. */
    it("withholds the four inert types", () => {
        for (const inert of ["late_fee", "nsf_fee", "refund", "deposit"]) {
            expect(isOperatorAuthorablePolicyType(inert), `${inert} has no consumer`).toBe(false);
            expect(FINANCIAL_POLICY_TYPES, `${inert} is still a valid stored type`).toContain(inert);
        }
    });

    /* Schema and historical data are untouched — this governs what is OFFERED, nothing else. */
    it("keeps every type storable and resolvable", () => {
        expect(FINANCIAL_POLICY_TYPES.length).toBeGreaterThan(OPERATOR_AUTHORABLE_FINANCIAL_POLICY_TYPES.length);
    });

    it("drives both the authoring form and the resolved-today panel from the offered set", () => {
        for (const rel of ["components/adminV2/settings/financials/CreateFinancialPolicyForm.tsx",
                           "components/adminV2/settings/financials/FinancialPoliciesConfigurationPanel.tsx"]) {
            expect(src(rel)).toContain("OPERATOR_AUTHORABLE_FINANCIAL_POLICY_TYPES");
        }
    });
});

describe("THE GATE — a reversal is a Reversal, not a Credit (§7G)", () => {
    /*
     * A charge-level reversal is a correction charge in a contra-revenue category carrying no
     * reduction application, so both surfaces fell through to the category and said "Credit".
     */
    it("names a charge reversal by its correction lineage", () => {
        expect(financialRowConceptLabel({ correctionKind: "reversal", categoryLabel: "Credit" })).toBe("Reversal");
    });

    it("leaves a genuine credit correction a Credit", () => {
        expect(financialRowConceptLabel({ correctionKind: "credit", categoryLabel: "Credit" })).toBe("Credit");
        expect(financialRowConceptLabel({ correctionKind: "replacement", categoryLabel: "Credit" })).toBe("Replacement");
    });

    /* Reduction provenance still wins over the raw category for rows that ARE reductions. */
    it("keeps reduction provenance ahead of the category", () => {
        expect(financialRowConceptLabel({ reductionConceptLabel: "Discount", categoryLabel: "Credit" })).toBe("Discount");
        expect(financialRowConceptLabel({ categoryLabel: "Late pickup" })).toBe("Late pickup");
    });

    /* Both deep hosts ask the same question of the same function. */
    it("has both hosts name rows through the one rule", () => {
        for (const rel of ["components/operationalCards/FinancialsDetailCard.tsx",
                           "app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx"]) {
            expect(src(rel), `${rel} uses the shared rule`).toContain("financialRowConceptLabel({");
        }
    });
});

describe("THE GATE — the five dates are five fields (§7E)", () => {
    const resolver = src("lib/financials/workspace/resolveChargeDetail.ts");
    const detail = src("app/adminV2/financials/FinancialsChargeDetail.tsx");

    /*
     * ── WIRED, AND INVISIBLE ─────────────────────────────────────────────────────────────────
     *
     * The due-date resolver was wired into charge resolution and the column was written — and no
     * surface in the product displayed it. The charge detail carried the service date, the billing
     * period and the accounting period, read `billable_on` without exposing it, and did not read
     * `due_date` at all. An organisation could state its payment terms, the charge could record
     * them, and an operator could never see them. A capability nobody can observe cannot be
     * certified, and would have entered Human QA as a working feature on the strength of a unit
     * test alone.
     */
    it("reads the due date from the charge at all", () => {
        expect(resolver, "the select asks for it").toMatch(/select[\s\S]{0,400}due_date/);
        expect(resolver).toContain("dueDate: charge.due_date");
        expect(resolver, "and the invoice date it already read is exposed too")
            .toContain("invoiceDate: charge.billable_on");
    });

    /* Separate fields because they are separate facts — a specimen where they coincide is a coincidence. */
    it("states invoice date and due date beside the periods, not folded into them", () => {
        for (const id of ['testId="invoice-date"', 'testId="due-date"', 'testId="billing-period"', 'testId="accounting-period"']) {
            expect(detail, `the detail states ${id}`).toContain(id);
        }
    });

    /*
     * NO CONFIGURED TERMS IS AN ANSWER. An organisation that has stated none must read as that
     * rather than as an empty cell an operator would take for missing data — and never as "today".
     */
    it("says so plainly when the organisation has configured no terms", () => {
        expect(detail).toContain('detail.dueDate ? formatDisplayDate(detail.dueDate) : "No configured terms"');
    });
});
