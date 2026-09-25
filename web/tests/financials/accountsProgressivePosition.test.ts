/**
 * THE PROGRESSIVE-POSITION CONTRACT, GATE BY GATE.
 *
 * The account list renders as soon as subjects answers. Position decorates the rows it cannot add,
 * remove or reorder. Everything below is the difference between that being a performance win and
 * that being a lie about somebody's balance.
 *
 * Each `it` is one of the required effect-level gates.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { accountMoneyIsKnown, accountState, joinAccounts } from "@/lib/financials/workspace/accountsRail";
import { filterAccounts, stateCounts, unresolvedCount, NO_ACCOUNT_FILTER } from "@/lib/financials/workspace/accountQueue";
import { createGenerationGate } from "@/lib/financials/workspace/latestResponseWins";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const subject = (id: string, name: string) => ({
    customerId: id, householdName: name, siteLocationIds: ["site-1"],
    hasEnrollmentAgreement: true, childNames: [], contactNames: [], programs: [], rooms: [],
});
const SUBJECTS = {
    subjects: [subject("cust-1", "Certhouse"), subject("cust-2", "Ashgrove")],
    scope: { siteLocationId: null, siteScope: "all" }, truncated: false, scanCap: 2000,
} as never;

/** A position cohort that owes money on cust-1 and says nothing about cust-2. */
const OWING = {
    rows: [{
        customerId: "cust-1", customerMemberId: null, householdName: "Certhouse", locationScope: "site",
        position: {
            chargeId: "chg-1", currencyCode: "USD", outstandingCents: 202_387,
            currentlyCollectibleCents: 202_387, submittedClaimSuppressionCents: 0,
            unresolvedVarianceCents: 0, amountCents: 202_387,
        },
    }],
    totals: {}, truncated: false,
} as never;

describe("A/B — the rows exist and are choosable before position answers", () => {
    it("A: subjects known, position pending -> rows are composed", () => {
        const rows = joinAccounts(SUBJECTS, null, "pending");
        expect(rows.map((r) => r.customerId).sort()).toEqual(["cust-1", "cust-2"]);
    });

    it("B: the list does not wait on position to become interactive", () => {
        /*
         * The component composes from `subjects.data` alone and gates `loading` on subjects only.
         * Waiting on both was ~685ms of measured gate for a branch that cannot change the row set.
         */
        const src = read("app/adminV2/financials/sections/FinancialsAccounts.tsx");
        expect(src).toContain("subjects.data ? joinAccounts(subjects.data, position.data ?? null, positionTruth) : []");
        expect(src).toContain("const loading = subjects.loading && accounts.length === 0;");
        expect(src, "a position failure is a row state, not an empty queue").toContain("const readError = subjects.error;");
    });
});

describe("C/D — an unanswered position is never a zero and never a settled account", () => {
    it("C: financial decoration is NOT YET KNOWN, not zero", () => {
        for (const row of joinAccounts(SUBJECTS, null, "pending")) {
            expect(row.financialTruth).toBe("not_yet_known");
            expect(accountMoneyIsKnown(row)).toBe(false);
            expect(row.noActivity, "'no activity' is an answer nobody gave").toBe(false);
        }
    });

    it("C: and the row renders a reserved figure rather than $0.00", () => {
        const src = read("app/adminV2/financials/sections/FinancialsAccounts.tsx");
        expect(src).toContain('accountMoneyIsKnown(account) ? moneyExact(account.outstandingCents, account.currencyCode) : "—"');
    });

    it("D: an unresolved row is not falsely settled", () => {
        for (const row of joinAccounts(SUBJECTS, null, "pending")) {
            expect(["settled", "no_activity"]).not.toContain(accountState(row));
            expect(accountState(row)).toBe("not_yet_known");
        }
    });
});

describe("E — the Outstanding filter does not silently lose an unresolved row", () => {
    it("E: filtering by Outstanding keeps rows whose money is unknown", () => {
        const rows = joinAccounts(SUBJECTS, null, "pending");
        const shown = filterAccounts(rows, { ...NO_ACCOUNT_FILTER, state: "outstanding" });
        expect(shown.map((r) => r.customerId).sort(), "neither household may vanish").toEqual(["cust-1", "cust-2"]);
    });

    it("E: and the counts never attribute an unresolved row to a money state", () => {
        const rows = joinAccounts(SUBJECTS, null, "pending");
        expect(Object.values(stateCounts(rows)).reduce((a, b) => a + b, 0)).toBe(0);
        expect(unresolvedCount(rows), "the operator can be told how many are still resolving").toBe(2);
    });
});

describe("F/G — the transitions when position lands", () => {
    it("F: a household position answered with nothing becomes KNOWN ZERO", () => {
        const rows = joinAccounts(SUBJECTS, { rows: [], totals: {}, truncated: false } as never, "resolved");
        for (const row of rows) {
            expect(row.financialTruth).toBe("known_zero");
            expect(row.noActivity).toBe(true);
            expect(accountState(row)).toBe("no_activity");
            expect(accountMoneyIsKnown(row), "a real zero IS known").toBe(true);
        }
    });

    it("G: a household with money becomes KNOWN, with the amount and the state", () => {
        const rows = joinAccounts(SUBJECTS, OWING, "resolved");
        const certhouse = rows.find((r) => r.customerId === "cust-1")!;
        expect(certhouse.financialTruth).toBe("known");
        expect(certhouse.outstandingCents).toBe(202_387);
        expect(accountState(certhouse)).toBe("outstanding");
        /* And the household position did not speak for is a genuine zero, not an unknown. */
        const ashgrove = rows.find((r) => r.customerId === "cust-2")!;
        expect(ashgrove.financialTruth).toBe("known_zero");
        expect(filterAccounts(rows, { ...NO_ACCOUNT_FILTER, state: "outstanding" }).map((r) => r.customerId))
            .toEqual(["cust-1"]);
    });
});

describe("H — a stale response cannot decorate newer truth", () => {
    it("H: a superseded request writes nothing at all", () => {
        const gate = createGenerationGate();
        const first = gate.begin();
        const second = gate.begin();
        expect(second(), "the newest request is the one that may write").toBe(true);
        expect(first(), "A's response must not land on B").toBe(false);
        /* And a third supersedes the second in turn. */
        const third = gate.begin();
        expect(second()).toBe(false);
        expect(third()).toBe(true);
    });

    it("H: the hook drops a superseded response before data, error AND loading", () => {
        /*
         * Dropping only `setData` is not enough: a stale error would still blank the screen, and a
         * stale `finally` would clear the loading flag the newer request is still holding.
         */
        const src = read("app/adminV2/financials/useFinancialsReads.ts");
        expect(src).toContain("const current = gate.current.begin();");
        const body = src.slice(src.indexOf("const current = gate.current.begin();"));
        expect(body.indexOf("if (!current()) return;"), "the success path checks first").toBeGreaterThan(-1);
        expect((body.match(/if \(!current\(\)\) return;/g) ?? []).length, "success AND catch both check").toBeGreaterThanOrEqual(2);
        expect(body).toContain("if (current()) setLoading(false);");
    });
});

describe("I — a position failure leaves the row usable", () => {
    it("I: the household is still listed, and its decoration says UNAVAILABLE", () => {
        const rows = joinAccounts(SUBJECTS, null, "unavailable");
        expect(rows.length, "a household an operator cannot reach is worse than an unreadable balance").toBe(2);
        for (const row of rows) {
            expect(row.financialTruth).toBe("unavailable");
            expect(accountState(row)).toBe("unavailable");
            expect(accountMoneyIsKnown(row)).toBe(false);
            expect(row.noActivity).toBe(false);
        }
        expect(filterAccounts(rows, { ...NO_ACCOUNT_FILTER, search: "certhouse" }).length,
            "and it can still be found by name").toBe(1);
    });
});
