/**
 * COMPENSATION IS A HISTORY, AND IT IS THE FIRST GATED STAFF FACT.
 *
 * Two things are being protected here. That a raise never destroys what somebody
 * was earning in March — the reason this is effective-dated rows rather than a
 * `pay_rate` column. And that pay is not visible to everyone who can open a staff
 * record, which is a new sentence in this estate: every other staff route is
 * declared `status: "none"` precisely because staff operational reads are not
 * gated anywhere.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    COMPENSATION_READ_PERMISSION_KEY,
    COMPENSATION_WRITE_PERMISSION_KEY,
    requireCompensationCapability,
} from "@/lib/access/compensationAuthority";
import {
    formatCompensationRate,
    payBasisLabel,
    rateUnitForBasis,
    resolveCurrentTerm,
    resolveFutureTerms,
    resolveHistoricalTerms,
    toCompensationTerm,
    type CompensationTerm,
} from "@/lib/employmentCompensation/employmentCompensationModel";

const code = (rel: string) => readFileSync(join(__dirname, "../../", rel), "utf8");
function statements(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
}

const term = (over: Partial<CompensationTerm> = {}): CompensationTerm => ({
    id: "t1", payBasis: "hourly", rateAmount: 22, rateUnit: "hour", currency: "USD",
    effectiveStart: "2026-01-01", effectiveEnd: null, supersedesId: null, isActive: true, note: null,
    ...over,
});

describe("what they earn is a question about a date", () => {
    const march = term({ id: "march", rateAmount: 22, effectiveStart: "2026-01-01", effectiveEnd: "2026-05-31" });
    const now = term({ id: "now", rateAmount: 25, effectiveStart: "2026-06-01", effectiveEnd: null, supersedesId: "march" });
    const raise = term({ id: "raise", rateAmount: 28, effectiveStart: "2027-01-01", effectiveEnd: null });
    const all = [march, now, raise];

    it("resolves the term in force, not the newest row", () => {
        expect(resolveCurrentTerm(all, "2026-09-21")?.id).toBe("now");
    });

    it("still answers what they were earning in March — the point of not overwriting", () => {
        expect(resolveCurrentTerm(all, "2026-03-15")?.id).toBe("march");
        expect(resolveCurrentTerm(all, "2026-03-15")?.rateAmount).toBe(22);
    });

    it("a recorded future raise is not current", () => {
        expect(resolveCurrentTerm(all, "2026-09-21")?.id).not.toBe("raise");
        expect(resolveFutureTerms(all, "2026-09-21").map((t) => t.id)).toEqual(["raise"]);
    });

    it("keeps ended terms as history rather than discarding them", () => {
        expect(resolveHistoricalTerms(all, "2026-09-21").map((t) => t.id)).toEqual(["march"]);
    });

    it("an inactive term is in force on no date at all", () => {
        expect(resolveCurrentTerm([term({ isActive: false })], "2026-09-21")).toBeNull();
    });

    it("an employment with no terms answers null, never zero", () => {
        // Zero is a rate. "We have not recorded one" is not.
        expect(resolveCurrentTerm([], "2026-09-21")).toBeNull();
    });
});

describe("basis and unit cannot disagree", () => {
    it("derives the unit from the basis rather than accepting one", () => {
        expect(rateUnitForBasis("hourly")).toBe("hour");
        expect(rateUnitForBasis("salary")).toBe("annual");
    });

    it("reads a salary as a year and an hourly rate as an hour", () => {
        expect(formatCompensationRate(term({ payBasis: "hourly", rateAmount: 24.5 }))).toBe("$24.50 / hour");
        expect(formatCompensationRate(term({ payBasis: "salary", rateUnit: "annual", rateAmount: 62000 })))
            .toBe("$62,000 / year");
    });

    it("never renders a bare number, because 24.50 means nothing without its unit", () => {
        expect(formatCompensationRate(term())).toMatch(/\/ (hour|year)$/);
    });

    it("carries a non-USD currency rather than assuming dollars", () => {
        expect(formatCompensationRate(term({ currency: "GBP", rateAmount: 19 }))).toMatch(/£/);
    });

    it("speaks the operator's words for the basis", () => {
        expect(payBasisLabel("salary")).toBe("Salary");
        expect(payBasisLabel("hourly")).toBe("Hourly");
    });

    it("reads numeric(12,2) arriving as a string without losing the amount", () => {
        const row = toCompensationTerm({
            id: "x", employment_id: "e", pay_basis: "hourly", rate_amount: "24.50", rate_unit: "hour",
            rate_currency: "USD", effective_start: "2026-01-01", effective_end: null,
            supersedes_id: null, is_active: true, note: null,
        });
        expect(row.rateAmount).toBe(24.5);
    });
});

describe("pay is not visible to everyone who can open a staff record", () => {
    it("denies a principal holding no compensation capability", () => {
        const denied = requireCompensationCapability({ permissionKeys: ["crm.customers.read"] }, COMPENSATION_READ_PERMISSION_KEY);
        expect(denied).not.toBeNull();
        expect(denied!.status).toBe(403);
    });

    it("denies a principal with no keys at all", () => {
        expect(requireCompensationCapability({ permissionKeys: null }, COMPENSATION_READ_PERMISSION_KEY)).not.toBeNull();
    });

    it("admits only the exact key", () => {
        expect(requireCompensationCapability({ permissionKeys: [COMPENSATION_READ_PERMISSION_KEY] }, COMPENSATION_READ_PERMISSION_KEY)).toBeNull();
    });

    it("reading a rate is not permission to change one", () => {
        // Separate keys, checked separately. A viewer must not inherit the writer.
        expect(requireCompensationCapability({ permissionKeys: [COMPENSATION_READ_PERMISSION_KEY] }, COMPENSATION_WRITE_PERMISSION_KEY)).not.toBeNull();
    });

    it("does not reuse the Financials key — a bookkeeper is not a payroll clerk", () => {
        expect(requireCompensationCapability({ permissionKeys: ["fin.read", "fin.write"] }, COMPENSATION_READ_PERMISSION_KEY)).not.toBeNull();
    });
});

describe("the migration closes both doors in the file that opens them", () => {
    const sql = code("../supabase/migrations/20260928120000_employment_compensation_v1.sql");

    it("enables RLS and revokes the default authenticated grant", () => {
        // Slice 3 shipped four tables with RLS off and a default privilege that let
        // every authenticated principal read another organization's credentials.
        expect(sql).toMatch(/enable row level security/i);
        expect(sql).toMatch(/revoke all on public\.employment_compensation_terms from authenticated/i);
        expect(sql).toMatch(/revoke all on public\.employment_compensation_terms from anon/i);
    });

    it("admits owner and admin only — narrower than the staff norm", () => {
        expect(sql).toMatch(/has_org_role\(org_id, array\['owner', 'admin'\]\)/i);
        expect(sql, "manager and ops read qualifications to run a day; that is not a reason to see salary")
            .not.toMatch(/array\['owner', 'admin', 'ops', 'manager'\]/i);
    });

    it("forbids two open terms, so today's rate is never ambiguous", () => {
        expect(sql).toMatch(/unique index[\s\S]{0,200}where is_active and effective_end is null/i);
    });

    it("constrains basis against unit in the database, not only in code", () => {
        expect(sql).toMatch(/pay_basis = 'hourly' and rate_unit = 'hour'/i);
    });
});

describe("a same-day change is refused in words, not as a 500", () => {
    it("guards on >= so the close date can never precede its own start", () => {
        // The bug: closing the open term on the day BEFORE a same-day successor sets
        // its end before its start, which `end_after_start` rejects — so the operator
        // got a 500 carrying a raw constraint name. Found by mounted QA on the
        // deployed build; the guard is the fix and this is what holds it.
        const src = statements(code("lib/employmentCompensation/employmentCompensationService.ts"));
        expect(src).toMatch(/open\.effective_start >= effectiveStart/);
        expect(src, "a strict > lets equal dates through and reproduces the 500")
            .not.toMatch(/open\.effective_start > effectiveStart/);
    });

    it("says what happened rather than naming a constraint", () => {
        // `statements`, not the raw file: the comment above the guard NAMES the
        // constraint in order to explain it, and asserting on raw source fails on
        // the very sentence documenting the fix.
        const src = statements(code("lib/employmentCompensation/employmentCompensationService.ts"));
        expect(src).toMatch(/A term already begins on that date/);
        expect(src).not.toMatch(/end_after_start/);
    });
});

describe("compensation has no payroll or financial consequence", () => {
    it("the service writes only compensation terms", () => {
        const src = statements(code("lib/employmentCompensation/employmentCompensationService.ts"));
        const writes = [...src.matchAll(/from\(\s*["']([a-z_]+)["']\s*\)\s*\.\s*(insert|update|upsert|delete)/g)]
            .map((m) => m[1]);
        expect([...new Set(writes)]).toEqual(["employment_compensation_terms"]);
    });

    it("nothing in the compensation path reaches payroll, journals or invoices", () => {
        for (const rel of [
            "lib/employmentCompensation/employmentCompensationService.ts",
            "app/api/admin/staff-compensation/route.ts",
        ]) {
            const src = statements(code(rel));
            expect(src).not.toMatch(/payroll|journal|invoice|ledger_entry|paycheck|withholding|w2|tax/i);
        }
    });

    it("it does not touch the other staff authorities", () => {
        const src = statements(code("lib/employmentCompensation/employmentCompensationService.ts"));
        expect(src).not.toMatch(/staff_qualifications|staff_availability|staff_presence_events|schedule_assignments/);
    });
});
