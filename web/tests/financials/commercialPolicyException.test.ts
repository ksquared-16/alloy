/**
 * COMMERCIAL POLICY EXCEPTIONS — the behaviour, proved where it can be proved.
 *
 * ── WHAT IS AND IS NOT CERTIFIED HERE ─────────────────────────────────────────────────────────
 *
 * The eligibility behaviour is DETERMINISTIC and is proved outright: `resolveFinancialReductions`
 * is pure, so "an excepted policy does not reduce, and says why" is a fact about a function and
 * needs no database.
 *
 * The hosted half is NOT certified and is not pretended to be. Migration 20260924120000 is applied
 * to the local certification stack only; the deployed schema follows staging lineage, so the table
 * cannot reach the QA runtime's database before promotion. Everything requiring that table is
 * listed in certification/financials/11b-setup/PROMOTION-GATED-PROOFS.md and is classified
 * PROMOTION_GATED_MOUNTED_PROOF.
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
import { exceptionAppliesOn, type CommercialPolicyException } from "@/lib/financials/reductions/commercialPolicyExceptionService";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const SIBLING: ReductionPolicy = {
    id: "pol-sibling",
    kind: "sibling_discount",
    params: { basis: "percentage", value: 10, applies_to: "all", min_siblings: 2, label: "Sibling discount" },
    label: "Sibling discount",
};
const GROSS: GrossObligation = {
    chargeId: "chg-1",
    customerMemberId: "certa",
    enrollmentAgreementId: "agr-1",
    amountCents: 18500,
    currencyCode: "USD",
    categoryKey: "tuition",
    periodKey: "2026-09",
};
/** Two enrolled siblings: the policy's own condition is satisfied, so exclusion is the only variable. */
const FACTS: EligibilityFacts = { siblingRank: 2, siblingCount: 2, employeeHousehold: false };

const exception = (over: Partial<CommercialPolicyException> = {}): CommercialPolicyException => ({
    id: "exc-1",
    policyId: "pol-sibling",
    opportunityCustomerMemberId: "ocm-1",
    customerMemberId: "certa",
    effectiveStart: "2026-09-01",
    effectiveEnd: null,
    reason: "Special commercial agreement",
    createdBy: "user-1",
    createdAt: "2026-09-01T00:00:00Z",
    supersedesExceptionId: null,
    supersededAt: null,
    ...over,
});

describe("§6 · forecast and application share one answer", () => {
    it("without an exception the policy applies", () => {
        const d = resolveFinancialReductions({ gross: GROSS, policies: [SIBLING], facts: FACTS });
        expect(d.kind).toBe("applied");
        if (d.kind !== "applied") return;
        expect(d.reductions[0]!.policyId).toBe("pol-sibling");
        expect(d.reductions[0]!.amountCents, "10% of $185.00, negative").toBe(-1850);
        expect(d.netCents).toBe(16650);
    });

    it("with the exception the policy does not apply, and the reason says so", () => {
        const d = resolveFinancialReductions({
            gross: GROSS, policies: [SIBLING], facts: FACTS, excludedPolicyIds: ["pol-sibling"],
        });
        expect(d.kind).toBe("not_eligible");
        if (d.kind !== "not_eligible") return;
        expect(d.reason).toBe("excluded_by_exception");
    });

    it("an excluded policy is NOT reported as no policy configured", () => {
        /*
         * The distinction the whole reason code exists for: told "no policy configured", an
         * operator goes looking for configuration that exists and that a colleague deliberately
         * set aside.
         */
        const d = resolveFinancialReductions({
            gross: GROSS, policies: [SIBLING], facts: FACTS, excludedPolicyIds: ["pol-sibling"],
        });
        if (d.kind !== "not_eligible") throw new Error("expected not_eligible");
        expect(d.reason).not.toBe("no_policy_configured");
    });

    it("excluding a different policy changes nothing", () => {
        const d = resolveFinancialReductions({
            gross: GROSS, policies: [SIBLING], facts: FACTS, excludedPolicyIds: ["pol-someone-else"],
        });
        expect(d.kind, "policy scoped").toBe("applied");
    });

    it("no exceptions at all behaves exactly as before", () => {
        const withEmpty = resolveFinancialReductions({ gross: GROSS, policies: [SIBLING], facts: FACTS, excludedPolicyIds: [] });
        const without = resolveFinancialReductions({ gross: GROSS, policies: [SIBLING], facts: FACTS });
        expect(JSON.stringify(withEmpty)).toBe(JSON.stringify(without));
    });
});

describe("§8 · effective dating", () => {
    it("before the start it does not exclude", () => {
        expect(exceptionAppliesOn(exception({ effectiveStart: "2026-10-01" }), "2026-09-15")).toBe(false);
    });

    it("on the start it excludes — boundaries are inclusive", () => {
        expect(exceptionAppliesOn(exception({ effectiveStart: "2026-09-15" }), "2026-09-15")).toBe(true);
    });

    it("within an open window it excludes", () => {
        expect(exceptionAppliesOn(exception(), "2030-01-01")).toBe(true);
    });

    it("on the end it still excludes, and after it does not", () => {
        const ended = exception({ effectiveEnd: "2026-09-30" });
        expect(exceptionAppliesOn(ended, "2026-09-30")).toBe(true);
        expect(exceptionAppliesOn(ended, "2026-10-01")).toBe(false);
    });

    it("a superseded exception never excludes, whatever its dates say", () => {
        expect(exceptionAppliesOn(exception({ supersededAt: "2026-09-20T00:00:00Z" }), "2026-09-21")).toBe(false);
    });
});

describe("§10 · supersession restores eligibility", () => {
    it("ended exception, later obligation: the policy applies again", () => {
        const ended = exception({ effectiveEnd: "2026-09-30" });
        const stillExcluded = exceptionAppliesOn(ended, "2026-09-20") ? [ended.policyId] : [];
        const laterExcluded = exceptionAppliesOn(ended, "2026-10-05") ? [ended.policyId] : [];
        expect(resolveFinancialReductions({ gross: GROSS, policies: [SIBLING], facts: FACTS, excludedPolicyIds: stillExcluded }).kind)
            .toBe("not_eligible");
        expect(resolveFinancialReductions({ gross: GROSS, policies: [SIBLING], facts: FACTS, excludedPolicyIds: laterExcluded }).kind)
            .toBe("applied");
    });

    it("the service supersedes rather than deleting", () => {
        const svc = src("lib/financials/reductions/commercialPolicyExceptionService.ts");
        expect(svc).toContain("supersedes_exception_id: live?.id ?? null");
        expect(svc).toContain("superseded_at: new Date().toISOString()");
        expect(strip(svc), "nothing is deleted").not.toMatch(/\.delete\(/);
    });

    it("ending sets an end date and records who, rather than removing the row", () => {
        const svc = src("lib/financials/reductions/commercialPolicyExceptionService.ts");
        const fn = svc.slice(svc.indexOf("export async function endPolicyException"));
        expect(fn).toContain("effective_end: args.effectiveEnd");
        expect(fn).toContain("ended_by: args.actorUserId");
        expect(fn).not.toMatch(/\.delete\(/);
    });
});

describe("§9 · an exception is not a history editor", () => {
    it("the service writes to no reduction, charge or ledger table", () => {
        const svc = strip(src("lib/financials/reductions/commercialPolicyExceptionService.ts"));
        expect(svc).not.toMatch(/financial_reduction_applications/);
        expect(svc).not.toMatch(/financial_charges|financial_journal_entries/);
    });

    it("exclusion is evaluated per obligation date, so past periods keep their own answer", () => {
        /* A September obligation is judged by September's exceptions, not today's. */
        const octoberOnly = exception({ effectiveStart: "2026-10-01" });
        expect(exceptionAppliesOn(octoberOnly, "2026-09-15"), "September untouched").toBe(false);
        expect(exceptionAppliesOn(octoberOnly, "2026-10-15")).toBe(true);
    });
});

describe("§11 · integrity", () => {
    const svc = src("lib/financials/reductions/commercialPolicyExceptionService.ts");

    it("a reason is required", () => {
        expect(svc).toContain('code: "reason_required"');
        expect(svc).toContain("An exception to commercial policy must say why");
    });

    it("the policy and the assignment must belong to the organisation", () => {
        expect(svc).toContain('code: "policy_not_found"');
        expect(svc).toContain('code: "assignment_not_found"');
        expect(svc).toMatch(/from\("commercial_policies"\)[\s\S]{0,200}\.eq\("org_id", args\.orgId\)/);
        expect(svc).toMatch(/from\("opportunity_customer_members"\)[\s\S]{0,200}\.eq\("org_id", args\.orgId\)/);
    });

    it("the subject is read from the assignment, never taken from the caller", () => {
        expect(svc).toContain("customer_member_id: assignment.customer_member_id");
    });

    it("dates must be ordered", () => {
        expect(svc).toContain('code: "dates_out_of_order"');
    });

    it("a failed read is never reported as no exceptions", () => {
        const fn = svc.slice(svc.indexOf("export async function readExcludedPolicyIds"));
        expect(fn.slice(0, 900)).toContain("throw new Error");
    });
});

describe("§5 · one authority, both consumers", () => {
    it("the forecast reads exceptions from the service", () => {
        const f = src("lib/financials/reductions/forecastAssignmentReductions.ts");
        expect(f).toContain("readExcludedPolicyIds");
        expect(f).toContain("excludedPolicyIds,");
    });

    it("the application path reads them from the same service", () => {
        const a = src("lib/financials/reductions/applyFinancialReductions.ts");
        expect(a).toContain("readExcludedPolicyIds");
        expect(a).toContain("excludedPolicyIds:");
    });

    it("the resolver is extended, not forked", () => {
        expect(src("lib/financials/reductions/resolveFinancialReductions.ts")).toContain("excludedPolicyIds?: readonly string[]");
        for (const bad of ["resolveFinancialReductionsWithExceptions", "forecastExceptionResolver", "resolveExceptions("]) {
            for (const f of [
                "lib/financials/reductions/forecastAssignmentReductions.ts",
                "lib/financials/reductions/applyFinancialReductions.ts",
                "lib/financials/reductions/commercialPolicyExceptionService.ts",
            ]) {
                expect(src(f), `${f} must not define ${bad}`).not.toContain(bad);
            }
        }
    });

    it("neither consumer decides eligibility itself", () => {
        for (const f of [
            "lib/financials/reductions/forecastAssignmentReductions.ts",
            "lib/financials/reductions/commercialPolicyExceptionService.ts",
        ]) {
            expect(strip(src(f)), `${f} does no discount arithmetic`).not.toMatch(/basisValue|percent_basis_points|\* 0?\.\d/);
        }
    });
});

describe("§13 · it is an exception, not a switch", () => {
    it("nothing anywhere introduces a discounts on/off flag", () => {
        for (const f of [
            "lib/financials/reductions/commercialPolicyExceptionService.ts",
            "lib/financials/reductions/forecastAssignmentReductions.ts",
            "lib/financials/reductions/applyFinancialReductions.ts",
        ]) {
            expect(strip(src(f)), f).not.toMatch(/discount_enabled|discountsEnabled|disableDiscounts/);
        }
    });
});
