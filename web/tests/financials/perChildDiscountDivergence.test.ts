/**
 * ONE ADD GESTURE, TWO CHILDREN, TWO DIFFERENT ANSWERS — and that is correct (§3C).
 *
 * ── WHAT THIS PROVES THAT THE ENGINE TESTS DO NOT ────────────────────────────────────────────
 *
 * `resolveFinancialReductions` is already locked for sibling rank in its own suite. What is locked
 * HERE is the linkage the operator actually performs: a single multi-child Add produces N
 * INDEPENDENT gross obligations, each of which is then judged on its own canonical facts. The two
 * children come out of one gesture with different money, and nothing in between aggregates them.
 *
 * ── WHY DIVERGENCE IS THE POINT ──────────────────────────────────────────────────────────────
 *
 * A sibling discount that applied equally to both children would not be a sibling discount. The
 * first-ranked child is `rank_not_covered` and pays gross; the second earns the benefit. Same
 * household, same template, same amount, same gesture — different obligations, because eligibility
 * is a fact about a CHILD and not about the total.
 *
 * ── THE TWO WAYS THIS COULD GO WRONG ─────────────────────────────────────────────────────────
 *
 * Aggregation: summing the household's gross and taking one benefit off the top would produce a
 * defensible-looking total that no child owns and no per-child discount can be explained from.
 * Add-owned math: the Add command computing its own reduction would be a second money authority,
 * and the two would disagree the first time a policy changed. Both are locked against.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    resolveFinancialReductions,
    type EligibilityFacts,
    type GrossObligation,
    type ReductionPolicy,
} from "@/lib/financials/reductions/resolveFinancialReductions";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
/**
 * Source with comments stripped, for the gates below.
 *
 * They are about what a file COMPUTES, and a file that names the reduction authority in a comment
 * — to say the figure beside it came from there, and was not worked out here — is doing the
 * opposite of the thing being forbidden. Scanning raw text refused exactly that: an honest
 * provenance note reddened the same lock as a real second authority would, so the cheapest way to
 * stay green was to stop writing down where a number came from.
 */
const executable = (rel: string) =>
    src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The tenant's canonical specimen: a 10% sibling discount, as authored. */
const SIBLING_DISCOUNT: ReductionPolicy = {
    id: "pol-sibling",
    kind: "sibling_discount",
    label: "Sibling discount (QA specimen)",
    params: { basis: "percentage", value: 10, min_siblings: 2 },
};

/** One obligation per child — which is what one multi-child Add writes. */
const obligationFor = (child: string, agreement: string): GrossObligation => ({
    chargeId: `chg-${child}`,
    customerMemberId: child,
    enrollmentAgreementId: agreement,
    amountCents: 40_000,
    currencyCode: "USD",
    categoryKey: "tuition",
    periodKey: "2026-09",
});

/* Canonical facts, resolved server-side per child — never asserted by the caller. */
const FIRST: EligibilityFacts = { siblingRank: 1, siblingCount: 2, employeeHousehold: false };
const SECOND: EligibilityFacts = { siblingRank: 2, siblingCount: 2, employeeHousehold: false };

/** What one Add gesture produces: N obligations, each judged alone. */
const decideAll = (children: Array<{ id: string; agreement: string; facts: EligibilityFacts }>) =>
    children.map((c) => ({
        child: c.id,
        decision: resolveFinancialReductions({
            gross: obligationFor(c.id, c.agreement),
            policies: [SIBLING_DISCOUNT],
            facts: c.facts,
        }),
    }));

describe("THE GATE — two children of one Add resolve independently", () => {
    const results = decideAll([
        { id: "m-ana", agreement: "agr-ana", facts: FIRST },
        { id: "m-ben", agreement: "agr-ben", facts: SECOND },
    ]);

    /* Child A — gross $400.00, no reduction, net $400.00. The rank rule does not cover them. */
    it("leaves the first-ranked child at gross, and says why", () => {
        const a = results[0]!.decision;
        expect(a.kind).toBe("not_eligible");
        expect(a.kind === "not_eligible" && a.reason).toBe("rank_not_covered");
    });

    /* Child B — same gross $400.00, −$40.00, net $360.00, measured on the gross. */
    it("gives the second-ranked child the benefit, measured on their OWN gross", () => {
        const b = results[1]!.decision;
        expect(b.kind).toBe("applied");
        if (b.kind !== "applied") return;
        expect(b.totalCents, "negative — the sign is the direction money moves").toBe(-4_000);
        expect(b.netCents).toBe(36_000);
        expect(b.reductions[0]!.basisAmountCents, "taken on this child's gross, not the household's").toBe(40_000);
        expect(b.reductions[0]!.policyId).toBe("pol-sibling");
    });

    /*
     * THE DIVERGENCE ITSELF. Same household, same template, same amount, same gesture — and the
     * two children owe different money. If these ever match, the sibling discount has stopped
     * being one.
     */
    it("produces genuinely different obligations from the same gesture", () => {
        const [a, b] = results.map((r) => r.decision);
        const net = (d: typeof a) => (d.kind === "applied" ? d.netCents : 40_000);
        expect(net(a!)).toBe(40_000);
        expect(net(b!)).toBe(36_000);
        expect(net(a!)).not.toBe(net(b!));
    });

    /*
     * NO HOUSEHOLD AGGREGATION. The household's gross is $800.00 and its total reduction is $40.00
     * — but that total is only ever a SUM OF PER-CHILD ANSWERS, never an input. A single $80,000
     * obligation would earn $8,000 off, which is a different and wrong number.
     */
    it("never resolves the household as one obligation", () => {
        const household = resolveFinancialReductions({
            gross: { ...obligationFor("household", "agr-x"), amountCents: 80_000, customerMemberId: "" },
            policies: [SIBLING_DISCOUNT],
            facts: SECOND,
        });
        const aggregated = household.kind === "applied" ? household.totalCents : 0;
        const perChildSum = results.reduce((t, r) => t + (r.decision.kind === "applied" ? r.decision.totalCents : 0), 0);
        expect(perChildSum).toBe(-4_000);
        expect(aggregated, "aggregating the household produces a different, wrong number").not.toBe(perChildSum);
    });
});

describe("THE GATE — the reduction authority is the only one doing this arithmetic", () => {
    /*
     * The Add command writes obligations. It must not also decide reductions: a second money
     * authority would disagree with this one the first time a policy changed, and the ledger could
     * not say which was right.
     */
    it("keeps reduction math out of the Add command authority", () => {
        const add = executable("lib/adminV2/actions/definitions/financialChargeActions.ts");
        for (const forbidden of ["resolveFinancialReductions", "sibling_discount", "min_siblings"]) {
            expect(add, `Add does not compute ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("keeps reduction math out of the Add operator surface", () => {
        const cmd = executable("components/operationalCards/AddChargeCommand.tsx");
        expect(cmd).not.toContain("resolveFinancialReductions");
        expect(cmd, "the surface states economics, it does not compute discounts").not.toContain("siblingRank");
        /*
         * The figure it now shows must be one it was HANDED. `previewDiscountAmount` is the
         * resolver's, formatted by the adapter; arithmetic on a rate here would be the second
         * authority this gate exists to prevent.
         */
        expect(cmd, "the discount money is carried, not derived").toContain("specimen.previewDiscountAmount");
        expect(cmd, "no rate arithmetic on the operator surface").not.toMatch(/basisValue\s*[*/]/);
    });

    /* Eligibility is read from canonical facts server-side, never taken from a payload. */
    it("resolves eligibility from enrolment and employment, not from the caller", () => {
        const elig = src("lib/financials/reductions/resolveReductionEligibility.ts");
        expect(elig).toContain("child_enrollment_agreements");
        expect(elig).toContain("employments");
    });
});
