/**
 * HOUSEHOLD FINANCIAL TRUTH SURVIVES CHILD ATTENTION — and the headline earns its slot.
 *
 * ── THE GRAIN RULE, AND WHY IT IS NOT A GUESS ───────────────────────────────────────────────────
 *
 * `buildFinancialsCardVM` states it where the rows are built: "Every id this account can be charged
 * against: its enrolment agreements, and the household. A charge whose source is the household has
 * no child subject, which the ledger renders as the account rather than inventing an attribution."
 *
 * A row's subject is `memberByAgreement.get(billable_source_id)`. A household charge has no
 * agreement, so it resolves to null DELIBERATELY. `null` means household-grain — it belongs to the
 * account — not "unknown" and not "not applicable".
 *
 * The Focus Panel sets its subject filter to the child attention is on, and every row filter read
 * `r.subjectMemberId === subjectFilter`. That is false for every household row, so entering the
 * panel through a child made the account's own charges vanish from the summary, from the ledger and
 * from payment eligibility — the Payment control simply disappeared, because it is computed from the
 * filtered rows.
 *
 * A child-scoped panel says which child the operator is working on. It does not turn a household
 * account into a child's account.
 */

import { describe, expect, it } from "vitest";

import {
    financialsRowsInSubjectScope,
    rowInFinancialsSubjectScope,
} from "@/lib/adminV2/runtime/focusPanel/financials/financialsRowScope";
import { adaptFinancialsVmToFinancialsCard } from "@/lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard";
import type { FinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

const CHILD_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const CHILD_B = "bbbbbbbb-0000-4000-8000-00000000000b";

/** The fields these rules read. Typed rather than cast, so the scope helper keeps its element type. */
type TestRow = {
    chargeId: string;
    subjectMemberId: string | null;
    periodKey: string | null;
    description: string;
    outstandingCents: number;
    offersPayment: boolean;
};

const row = (subjectMemberId: string | null, extra: Partial<TestRow> = {}): TestRow =>
    ({
        chargeId: `c-${subjectMemberId ?? "household"}-${extra.description ?? "x"}`,
        date: "2026-09-01",
        periodKey: "2026-09",
        periodBasis: "billable_on",
        subjectMemberId,
        subjectName: null,
        categoryKey: "tuition",
        categoryLabel: "Tuition",
        description: "Charge",
        amountCents: 4300,
        currencyCode: "USD",
        status: "posted",
        outstandingCents: 4300,
        offersPayment: true,
        ...extra,
    }) as TestRow;

describe("financial row grain — what a subject scope includes", () => {
    it("CASE 1 — a household row stays in scope through Child A AND through Child B", () => {
        const household = row(null);
        // The account's own charge is visible from anywhere inside the account.
        expect(rowInFinancialsSubjectScope(household, CHILD_A)).toBe(true);
        expect(rowInFinancialsSubjectScope(household, CHILD_B)).toBe(true);
        expect(rowInFinancialsSubjectScope(household, "all")).toBe(true);
    });

    it("CASE 2 — a row attributed to Child A is in A's scope and NOT in B's", () => {
        /*
         * The narrowing that IS legitimate. A charge billed to Child A's enrolment agreement is that
         * child's; showing it under a sibling would be inventing an attribution in the other
         * direction. This is the canonical contract, not a convenience.
         */
        const childA = row(CHILD_A);
        expect(rowInFinancialsSubjectScope(childA, CHILD_A)).toBe(true);
        expect(rowInFinancialsSubjectScope(childA, CHILD_B)).toBe(false);
        expect(rowInFinancialsSubjectScope(childA, "all")).toBe(true);
    });

    it("CASE 3 — a mixed account resolves each scope explicitly", () => {
        const rows = [row(null, { description: "household" }), row(CHILD_A, { description: "a" }), row(CHILD_B, { description: "b" })];
        const desc = (scope: string) => financialsRowsInSubjectScope(rows, scope).map((r) => r.description);

        expect(desc("all")).toEqual(["household", "a", "b"]);
        // Each child sees its own row plus the account's — never its sibling's.
        expect(desc(CHILD_A)).toEqual(["household", "a"]);
        expect(desc(CHILD_B)).toEqual(["household", "b"]);
    });

    it("CASE 1b — PAYMENT ELIGIBILITY follows the corrected scope, not the button", () => {
        /*
         * THE SYMPTOM, AT ITS SOURCE.
         *
         * `payableRows` is `visibleRows.filter(offersPayment)`, so the Payment control disappeared
         * because the rows were filtered away, not because payment was unavailable. Proving it here
         * — over the shared scope rule — is what makes the fix one authority rather than a
         * special case at the control.
         */
        const rows = [
            row(null, { description: "household fee", outstandingCents: 7500, offersPayment: true }),
            row(CHILD_A, { description: "a tuition", outstandingCents: 0, offersPayment: false }),
        ];
        const payableFor = (scope: string) =>
            financialsRowsInSubjectScope(rows, scope)
                .filter((r) => r.offersPayment)
                .map((r) => r.description);

        // The household owes $75 and it is payable — from either child's panel, and from the account.
        expect(payableFor(CHILD_A)).toEqual(["household fee"]);
        expect(payableFor(CHILD_B)).toEqual(["household fee"]);
        expect(payableFor("all")).toEqual(["household fee"]);
    });

    it("CASE 4 — a fully paid current period still offers nothing to pay", () => {
        /*
         * The Wrigley control: this must keep producing "no Payment" for the RIGHT reason — nothing
         * outstanding — rather than because the rows were filtered out from under it.
         */
        const rows = [
            row(null, { description: "materials", outstandingCents: 0, offersPayment: false }),
            row(null, { description: "late pickup", outstandingCents: 0, offersPayment: false }),
        ];
        for (const scope of [CHILD_A, CHILD_B, "all"]) {
            const payable = financialsRowsInSubjectScope(rows, scope).filter((r) => r.offersPayment);
            expect(payable, `scope ${scope} found something payable in a settled period`).toEqual([]);
        }
    });

    it("does not let a null scope value swallow the household rule", () => {
        // Guarding the shape rather than the happy path: "all" is the only wildcard.
        expect(rowInFinancialsSubjectScope(row(CHILD_A), "")).toBe(false);
        expect(rowInFinancialsSubjectScope(row(null), "")).toBe(true);
    });
});

/** A bounded VM — the shape the producer actually ships, with no deep collections. */
function vmWith(opts: { balanceCents: number; pastDue: FinancialsCardVM["pastDue"] }): FinancialsCardVM {
    return {
        account: { customerId: "cust-1", label: "Household" },
        period: { key: "2026-09", start: "2026-09-01", end: "2026-09-30", label: "September 2026" },
        payers: [],
        responsibility: { parties: [], unassignedCents: 0, allocatedCents: 0, hasUnresolvedCharges: false },
        expectedFunding: [],
        collectible: {
            outstandingCents: 0,
            expectedSubsidyCents: 0,
            submittedClaimSuppressionCents: 0,
            actualSubsidyReceivedCents: 0,
            unresolvedVarianceCents: 0,
            currentlyCollectibleCents: 0,
        },
        subjects: [],
        reductions: [],
        rows: [],
        reconciliation: {
            grossCents: 4300,
            discountsCents: 0,
            fundingCents: 0,
            adjustmentsCents: 0,
            responsibilityCents: 4300,
            paymentsCents: 4300 - opts.balanceCents,
            balanceCents: opts.balanceCents,
            scheduledCents: 0,
            draftCents: 0,
        },
        reconciliationBySubject: {},
        pastDue: opts.pastDue,
        pastDueBySubject: {},
        ledgerPeriods: [],
        payments: [],
        chargeTemplates: [],
        unavailable: [],
        paymentSetup: null,
        paymentCapabilities: null,
        payerCandidates: [],
        achAvailable: false,
        openCollections: [],
        unavailableReason: null,
    } as unknown as FinancialsCardVM;
}

const compactFor = (balanceCents: number, pastDue: FinancialsCardVM["pastDue"] = null) => {
    const vm = vmWith({ balanceCents, pastDue });
    return adaptFinancialsVmToFinancialsCard({
        vm,
        reconciliation: vm.reconciliation,
        pastDue: vm.pastDue,
        rows: [],
        currency: "USD",
    }).compact;
};

describe("the compact headline says something the lines do not", () => {
    it("STATE 1 — balance $0, nothing past due: no headline, one Current balance", () => {
        const c = compactFor(0);
        expect(c.dueLine, "a $0.00 headline sat directly over Current balance $0.00").toBeNull();
        expect(c.lines.find((l) => l.label === "Current balance")?.value).toBe("$0.00");
    });

    it("STATE 2 — balance > $0, nothing past due: still no headline, the figure is labelled", () => {
        const c = compactFor(4300);
        expect(c.dueLine).toBeNull();
        expect(c.lines.find((l) => l.label === "Current balance")?.value).toBe("$43.00");
        // Responsibility is untouched — this changes presentation, never arithmetic.
        expect(c.lines.find((l) => l.label === "Responsibility")?.value).toBe("$43.00");
    });

    it("STATE 3 — past due: the headline survives, because it states a CONDITION", () => {
        const c = compactFor(7500, { amountCents: 7500, oldestDueDate: "2026-08-01", agingDays: 31 } as never);
        expect(c.dueLine).toBe("$75.00 past due");
        // And the balance line is still there beneath it — the headline replaced nothing.
        expect(c.lines.find((l) => l.label === "Current balance")?.value).toBe("$75.00");
    });

    it("never renders a headline that merely repeats Current balance", () => {
        // The property, over every balance rather than the three sampled above.
        for (const cents of [0, 1, 4300, 999999]) {
            const c = compactFor(cents);
            const balance = c.lines.find((l) => l.label === "Current balance")?.value;
            expect(c.dueLine, `headline duplicated Current balance at ${cents}`).not.toBe(balance);
        }
    });
});
