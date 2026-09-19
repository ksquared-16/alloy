/**
 * LENSES FILTER; THEY DO NOT CALCULATE.
 *
 * The Accounts workspace gained an angle-selector over one account's canonical rows. The danger in
 * that is not the filtering — it is that a tab with a number beside it starts wanting to be a
 * subtotal, and a subtotal computed here would be a second financial answer with no owner. These
 * hold the classification, the filters, the "do not offer a control that does not divide anything"
 * rule, and the absence of any arithmetic on money.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { financialsRowsInSubjectScope } from "@/lib/adminV2/runtime/focusPanel/financials/financialsRowScope";

import {
    ACCOUNT_LENSES,
    HOUSEHOLD_SUBJECT,
    filterLedger,
    filterPayments,
    hasChoice,
    ledgerLensOf,
    lensCounts,
    payerOptions,
    periodOptions,
    subjectOptions,
    subjectTokenOf,
    responsiblePartyOptions,
    NO_FILTER,
    UNASSIGNED_PARTY,
} from "@/lib/financials/workspace/accountLenses";
import type { FinancialsLedgerRow } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

const row = (over: Partial<FinancialsLedgerRow>): FinancialsLedgerRow =>
    ({
        chargeId: "c1",
        date: "2026-09-01",
        periodKey: "2026-09",
        periodBasis: "billable_on",
        subjectMemberId: null,
        subjectName: null,
        categoryKey: "tuition",
        categoryLabel: "Tuition",
        description: null,
        amountCents: 10_000,
        currencyCode: "USD",
        status: "posted",
        lifecycleStatus: "posted",
        correctsChargeId: null,
        correctionKind: null,
        reversedByChargeId: null,
        offersReverse: true,
        appliedCents: 0,
        outstandingCents: 10_000,
        offersPayment: true,
        dueDate: null,
        glCode: null,
        glAccountName: null,
        source: null,
        ...over,
    }) as FinancialsLedgerRow;

describe("what kind of row this is", () => {
    it("files an ordinary charge under Charges", () => {
        expect(ledgerLensOf(row({ categoryKey: "tuition" }))).toBe("charges");
        expect(ledgerLensOf(row({ categoryKey: "registration_fee" }))).toBe("charges");
    });

    it("files a discount and an adjustment under Credits & adjustments", () => {
        expect(ledgerLensOf(row({ categoryKey: "discount" }))).toBe("credits");
        expect(ledgerLensOf(row({ categoryKey: "adjustment" }))).toBe("credits");
    });

    it("files a correction under Credits & adjustments, whatever it corrects", () => {
        expect(ledgerLensOf(row({ categoryKey: "tuition", correctsChargeId: "c0" }))).toBe("credits");
    });

    /*
     * A subsidy offset is a reduction AND a funding row. An operator asking what the agency covers
     * does not want it filed under discounts, so funding is tested first — one row, one lens.
     */
    it("files a subsidy offset under Funding rather than under Credits", () => {
        expect(ledgerLensOf(row({ categoryKey: "subsidy_offset" }))).toBe("funding");
    });

    it("keeps its funding set equal to the account reader's classification", () => {
        /*
         * The reader's FUNDING_CATEGORIES is module-private. This asserts the two agree by their
         * OBSERVABLE consequence: every key this module calls funding must also be an offset row to
         * the reader, so a category added there and not here cannot silently misfile.
         */
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts"),
            "utf8",
        );
        const declared = /const FUNDING_CATEGORIES = new Set\(\[([^\]]*)\]\)/.exec(src)?.[1] ?? "";
        const keys = [...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
        expect(keys.length, "the reader still declares a funding set").toBeGreaterThan(0);
        for (const key of keys) {
            expect(ledgerLensOf(row({ categoryKey: key })), `${key} is funding on both sides`).toBe("funding");
        }
    });
});

describe("filtering", () => {
    const rows = [
        row({ chargeId: "t1", categoryKey: "tuition", subjectMemberId: "m-ana", subjectName: "Ana", periodKey: "2026-09" }),
        row({ chargeId: "t2", categoryKey: "tuition", subjectMemberId: "m-rio", subjectName: "Rio", periodKey: "2026-09" }),
        row({ chargeId: "d1", categoryKey: "discount", subjectMemberId: "m-ana", subjectName: "Ana", periodKey: "2026-09" }),
        row({ chargeId: "s1", categoryKey: "subsidy_offset", subjectMemberId: "m-ana", subjectName: "Ana", periodKey: "2026-08" }),
        row({ chargeId: "r1", categoryKey: "registration_fee", subjectMemberId: null, periodKey: "2026-08" }),
    ];

    it("shows everything under All", () => {
        expect(filterLedger(rows, { ...NO_FILTER, lens: "all", subject: null, periodKey: null })).toHaveLength(5);
    });

    it("narrows to one lens", () => {
        expect(filterLedger(rows, { ...NO_FILTER, lens: "charges", subject: null, periodKey: null }).map((r) => r.chargeId))
            .toEqual(["t1", "t2", "r1"]);
        expect(filterLedger(rows, { ...NO_FILTER, lens: "credits", subject: null, periodKey: null }).map((r) => r.chargeId))
            .toEqual(["d1"]);
        expect(filterLedger(rows, { ...NO_FILTER, lens: "funding", subject: null, periodKey: null }).map((r) => r.chargeId))
            .toEqual(["s1"]);
    });

    /*
     * DOCTRINE REVERSED, DELIBERATELY — this assertion used to expect ["t1", "d1", "s1"].
     *
     * It encoded an exact-match subject predicate private to this module, under which selecting a
     * child DROPPED the household's own rows: the registration fee, the account fee, the family's
     * credits. The Focus Panel had the same defect and repaired it with `financialsRowScope`; this
     * surface kept the old rule, so the two surfaces disagreed about what "Ana's financial scope"
     * means while showing the same account.
     *
     * The converged rule: a child scope is the child's rows AND the household's, because a
     * household charge is the account's and the child is inside the account. The household token is
     * now the one scope that is deliberately NARROWER — an explicit request to see the account by
     * itself, which is a different question from an attention context.
     */
    it("gives a child the household's rows too, and keeps Household as the deliberate narrow view", () => {
        expect(filterLedger(rows, { ...NO_FILTER, lens: "all", subject: "m-ana", periodKey: null }).map((r) => r.chargeId))
            .toEqual(["t1", "d1", "s1", "r1"]);
        // A sibling's rows stay out: child scope is child + household, MINUS siblings.
        expect(filterLedger(rows, { ...NO_FILTER, lens: "all", subject: "m-ana", periodKey: null }).map((r) => r.chargeId))
            .not.toContain("t2");
        expect(filterLedger(rows, { ...NO_FILTER, lens: "all", subject: HOUSEHOLD_SUBJECT, periodKey: null }).map((r) => r.chargeId))
            .toEqual(["r1"]);
        expect(subjectTokenOf(rows[4])).toBe(HOUSEHOLD_SUBJECT);
    });

    /* THE POINT OF THE CONVERGENCE: both surfaces now answer this question identically. */
    it("filters exactly as the Focus Panel's canonical scope authority does", () => {
        for (const scope of ["all", "m-ana", "m-rio", HOUSEHOLD_SUBJECT]) {
            expect(
                filterLedger(rows, { ...NO_FILTER, lens: "all", subject: scope === "all" ? null : scope, periodKey: null })
                    .map((r) => r.chargeId),
                `scope ${scope} agrees with financialsRowScope`,
            ).toEqual(financialsRowsInSubjectScope(rows, scope).map((r) => r.chargeId));
        }
    });

    it("narrows to one billing period", () => {
        expect(filterLedger(rows, { ...NO_FILTER, lens: "all", subject: null, periodKey: "2026-08" }).map((r) => r.chargeId))
            .toEqual(["s1", "r1"]);
    });

    it("combines lens, child and period", () => {
        expect(filterLedger(rows, { ...NO_FILTER, lens: "funding", subject: "m-ana", periodKey: "2026-08" }).map((r) => r.chargeId))
            .toEqual(["s1"]);
    });

    /* The payments lens reads receipts, not the ledger. It must never show obligations. */
    it("shows no ledger rows under the Payments lens", () => {
        expect(filterLedger(rows, { ...NO_FILTER, lens: "payments", subject: null, periodKey: null })).toEqual([]);
    });

    it("narrows payments by who actually paid", () => {
        const payments = [
            { paymentId: "p1", payerLabel: "Dana Alvarez" },
            { paymentId: "p2", payerLabel: "Rosa Alvarez" },
            { paymentId: "p3", payerLabel: null },
        ];
        expect(filterPayments(payments, { payerLabel: null })).toHaveLength(3);
        expect(filterPayments(payments, { payerLabel: "Rosa Alvarez" }).map((p) => p.paymentId)).toEqual(["p2"]);
    });

    it("counts rows per lens, never cents", () => {
        const counts = lensCounts(rows, [{ paymentId: "p1" }], { subject: null, periodKey: null, responsibleParty: null });
        expect(counts).toEqual({ all: 5, charges: 3, credits: 1, funding: 1, payments: 1 });
        /*
         * Was 3 / 1. The counts follow the filter through the SAME authority, so a badge cannot
         * promise rows the lens will not show — before the convergence the two disagreed by exactly
         * the household rows. Ana's scope is t1 + d1 + s1 + the household's r1; two of those are
         * charges (t1, r1).
         */
        const forAna = lensCounts(rows, [{ paymentId: "p1" }], { subject: "m-ana", periodKey: null, responsibleParty: null });
        expect(forAna.all).toBe(4);
        expect(forAna.charges).toBe(2);
        expect(forAna.all, "the badge counts what the lens shows").toBe(
            filterLedger(rows, { ...NO_FILTER, lens: "all", subject: "m-ana", periodKey: null }).length,
        );
    });
});

describe("a control is offered only when it divides something", () => {
    it("reports no choice for a single child, a single period or a single payer", () => {
        const one = [row({ subjectMemberId: "m-ana", subjectName: "Ana", periodKey: "2026-09" })];
        expect(hasChoice(subjectOptions(one))).toBe(false);
        expect(hasChoice(periodOptions(one))).toBe(false);
        expect(hasChoice(payerOptions([{ paymentId: "p1", payerLabel: "Dana" }]))).toBe(false);
    });

    it("reports a choice once there are two", () => {
        const two = [
            row({ subjectMemberId: "m-ana", subjectName: "Ana", periodKey: "2026-09" }),
            row({ subjectMemberId: "m-rio", subjectName: "Rio", periodKey: "2026-08" }),
        ];
        expect(hasChoice(subjectOptions(two))).toBe(true);
        expect(hasChoice(periodOptions(two))).toBe(true);
    });

    it("puts Household last and children in name order", () => {
        const rows = [
            row({ subjectMemberId: null }),
            row({ subjectMemberId: "m-rio", subjectName: "Rio" }),
            row({ subjectMemberId: "m-ana", subjectName: "Ana" }),
        ];
        expect(subjectOptions(rows).map((o) => o.label)).toEqual(["Ana", "Rio", "Household"]);
    });

    it("puts the newest billing period first", () => {
        const rows = [row({ periodKey: "2026-07" }), row({ periodKey: "2026-09" }), row({ periodKey: "2026-08" })];
        expect(periodOptions(rows).map((o) => o.value)).toEqual(["2026-09", "2026-08", "2026-07"]);
    });

    it("ignores an unnamed payer rather than offering a blank choice", () => {
        expect(payerOptions([{ paymentId: "p1", payerLabel: null }, { paymentId: "p2", payerLabel: "  " }]))
            .toEqual([]);
    });
});

describe("no second financial answer", () => {
    it("does no arithmetic on money at all", () => {
        const src = readFileSync(join(process.cwd(), "lib/financials/workspace/accountLenses.ts"), "utf8");
        /* Every lens is a subset or a count of rows. Cents are carried, never combined. */
        expect(src).not.toMatch(/amountCents\s*[+\-*/]/);
        expect(src).not.toMatch(/[+\-*/]=\s*\w*[Cc]ents/);
        expect(src).not.toMatch(/reduce\(/);
        expect(src).not.toContain("outstandingCents");
    });

    it("names every lens exactly once", () => {
        expect(new Set(ACCOUNT_LENSES).size).toBe(ACCOUNT_LENSES.length);
    });
});

/**
 * WHO OWES IT — the third question, kept distinct from the other two.
 *
 * A row can concern Ana while responsibility belongs to a parent, and the money may ultimately
 * arrive from a third person entirely. Subject, responsible party and payer are three different
 * questions answered from three different authorities, and collapsing any two of them is how an
 * operator chases the wrong person.
 */
describe("responsible party is not the subject and not the payer", () => {
    const rows = [
        row({ chargeId: "a", subjectMemberId: "m-ana", subjectName: "Ana", responsiblePartyName: "Kelly Kurzman" }),
        row({ chargeId: "b", subjectMemberId: "m-ana", subjectName: "Ana", responsiblePartyName: "Kristi Kurzman" }),
        row({ chargeId: "c", subjectMemberId: "m-rio", subjectName: "Rio", responsiblePartyName: "Kelly Kurzman" }),
        row({ chargeId: "d", subjectMemberId: null, responsiblePartyName: null }),
    ] as unknown as Parameters<typeof filterLedger>[0];

    it("offers only the parties the account's rows actually name", () => {
        const opts = responsiblePartyOptions(rows as never);
        expect(opts.map((o) => o.label)).toEqual(["Kelly Kurzman", "Kristi Kurzman", "Unassigned"]);
        // Unassigned sorts LAST: it is a state, not a person.
        expect(opts.at(-1)!.value).toBe(UNASSIGNED_PARTY);
    });

    /* ONE CHILD, TWO RESPONSIBLE PARTIES — the case that proves the two questions are different. */
    it("splits one child's rows across the parties responsible for them", () => {
        const kelly = filterLedger(rows, { ...NO_FILTER, responsibleParty: "Kelly Kurzman" });
        expect(kelly.map((r) => r.chargeId)).toEqual(["a", "c"]);
        const kristi = filterLedger(rows, { ...NO_FILTER, responsibleParty: "Kristi Kurzman" });
        expect(kristi.map((r) => r.chargeId)).toEqual(["b"]);
    });

    /* "Who has nobody answering for it" is the work, so it is a real choice rather than an absence. */
    it("makes unassigned obligations selectable", () => {
        expect(filterLedger(rows, { ...NO_FILTER, responsibleParty: UNASSIGNED_PARTY }).map((r) => r.chargeId))
            .toEqual(["d"]);
    });

    /* The two dimensions compose; neither stands in for the other. */
    it("combines subject scope with responsibility scope", () => {
        const anaAndKelly = filterLedger(rows, { ...NO_FILTER, subject: "m-ana", responsibleParty: "Kelly Kurzman" });
        // Ana's scope is Ana + household − siblings; of those, only "a" is Kelly's.
        expect(anaAndKelly.map((r) => r.chargeId)).toEqual(["a"]);
    });

    /* A badge that counted differently from the ledger would promise rows that are not there. */
    it("counts through the same predicate the ledger filters with", () => {
        const counts = lensCounts(rows as never, [], { subject: null, periodKey: null, responsibleParty: "Kelly Kurzman" });
        expect(counts.all).toBe(filterLedger(rows, { ...NO_FILTER, responsibleParty: "Kelly Kurzman" }).length);
    });
});
