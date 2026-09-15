/**
 * ACCOUNTS LISTS FINANCIAL SUBJECTS, NOT FINANCIAL ACTIVITY.
 *
 * The rail used to be the position cohort grouped by household, so a family appeared on it only
 * once somebody had billed them. A household with no transaction had no reachable financial
 * surface at all — which is exactly when an operator needs one, because raising the first charge is
 * the work. These tests hold the repaired shape: `eligible financial subjects LEFT JOIN current
 * financial position`, with zero activity rendered as the legitimate financial state it is and
 * NEVER confused with a read that failed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { accountState, joinAccounts } from "@/lib/financials/workspace/accountsRail";
import type { FinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";
import {
    isFinancialSubjectVisible,
    resolveFinancialSubjectCohort,
    type FinancialSubjectCohort,
} from "@/lib/financials/workspace/resolveFinancialSubjects";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────

const subject = (customerId: string, householdName: string, siteLocationIds: string[] = []) => ({
    customerId,
    householdName,
    siteLocationIds,
    hasEnrollmentAgreement: siteLocationIds.length > 0,
});

const subjects = (...rows: ReturnType<typeof subject>[]): FinancialSubjectCohort => ({
    subjects: rows,
    scope: { siteLocationId: null, siteScope: "all" },
    truncated: false,
    scanCap: 2000,
});

/** One posted charge's contribution, exactly as the position resolver reports it. */
const positionRow = (
    customerId: string,
    householdName: string,
    figures: { outstanding: number; collectible: number; suppression?: number; variance?: number },
) => ({
    position: {
        currencyCode: "USD",
        outstandingCents: figures.outstanding,
        currentlyCollectibleCents: figures.collectible,
        submittedClaimSuppressionCents: figures.suppression ?? 0,
        unresolvedVarianceCents: figures.variance ?? 0,
    },
    customerId,
    householdName,
    customerMemberId: null,
    enrollmentAgreementId: null,
    serviceDate: null,
    postedAt: null,
    periodKey: null,
    locationScope: "site" as const,
    siteLocationId: "site-north",
});

const cohort = (...rows: ReturnType<typeof positionRow>[]): FinancialPositionCohort =>
    ({
        rows,
        totals: {},
        counts: { charges: rows.length, households: 0, chargesWithOutstanding: 0, chargesWithOpenVariance: 0, chargesWithUnassignedResponsibility: 0 },
        scope: { siteLocationId: null, siteScope: "all" },
        truncated: false,
        scanCap: 2000,
    }) as unknown as FinancialPositionCohort;

// ── the cohort contract ─────────────────────────────────────────────────────────────────────────

describe("the Accounts cohort", () => {
    it("INCLUDES an eligible household with zero financial activity", () => {
        const rows = joinAccounts(subjects(subject("c-zero", "Alvarez Household (demo)", ["site-north"])), cohort());
        const alvarez = rows.find((r) => r.customerId === "c-zero")!;
        expect(alvarez, "a household with no money is still a financial subject").toBeTruthy();
        expect(alvarez.noActivity).toBe(true);
        expect(alvarez.outstandingCents).toBe(0);
        expect(alvarez.charges).toBe(0);
        expect(accountState(alvarez)).toBe("no_activity");
    });

    it("INCLUDES an eligible household with posted activity, with the server's own figures", () => {
        const rows = joinAccounts(
            subjects(subject("c-owing", "Brennan Household", ["site-north"])),
            cohort(
                positionRow("c-owing", "Brennan Household", { outstanding: 12_000, collectible: 9_000, suppression: 3_000 }),
                positionRow("c-owing", "Brennan Household", { outstanding: 500, collectible: 500 }),
            ),
        );
        const brennan = rows.find((r) => r.customerId === "c-owing")!;
        expect(brennan.noActivity).toBe(false);
        expect(brennan.charges).toBe(2);
        // Summed from what the server produced — never recomputed from anything else.
        expect(brennan.outstandingCents).toBe(12_500);
        expect(brennan.collectibleCents).toBe(9_500);
        expect(brennan.suppressionCents).toBe(3_000);
        expect(accountState(brennan)).toBe("outstanding");
    });

    it("INCLUDES an eligible household that has settled, and calls that settled — not empty", () => {
        const rows = joinAccounts(
            subjects(subject("c-settled", "Okafor Household", ["site-north"])),
            cohort(positionRow("c-settled", "Okafor Household", { outstanding: 0, collectible: 0 })),
        );
        const okafor = rows.find((r) => r.customerId === "c-settled")!;
        expect(okafor.outstandingCents).toBe(0);
        expect(okafor.noActivity, "money moved here; it simply netted to nothing").toBe(false);
        expect(accountState(okafor)).toBe("settled");
    });

    it("EXCLUDES a household the location contract does not admit, activity or not", () => {
        // The subject cohort is what decides admission; an excluded household never reaches the join.
        const rows = joinAccounts(subjects(subject("c-in", "In Scope", ["site-north"])), cohort());
        expect(rows.map((r) => r.customerId)).toEqual(["c-in"]);

        expect(
            isFinancialSubjectVisible({
                siteLocationIds: ["site-south"],
                siteScope: "all",
                allowedSiteLocationIds: [],
                activeSiteLocationId: "site-north",
            }),
            "a site filter admits only households enrolled at that site",
        ).toBe(false);

        expect(
            isFinancialSubjectVisible({
                siteLocationIds: [],
                siteScope: "restricted",
                allowedSiteLocationIds: ["site-north"],
                activeSiteLocationId: null,
            }),
            "an org-scoped household account is not inside any site a restricted operator holds",
        ).toBe(false);
    });

    it("never loses a household that carries posted money, even if the subject page did not reach it", () => {
        /*
         * The subject read is capped. Dropping an account with money because it fell off the far
         * side of a household page would be this repair reintroducing its own defect backwards.
         */
        const rows = joinAccounts(
            subjects(subject("c-zero", "Alvarez Household (demo)", ["site-north"])),
            cohort(positionRow("c-unlisted", "Vasquez Household", { outstanding: 4_200, collectible: 4_200 })),
        );
        expect(rows.map((r) => r.customerId).sort()).toEqual(["c-unlisted", "c-zero"]);
        expect(rows.find((r) => r.customerId === "c-unlisted")!.outstandingCents).toBe(4_200);
    });

    it("floats what needs a decision and sinks what does not", () => {
        const rows = joinAccounts(
            subjects(
                subject("c-zero", "Zero", ["site-north"]),
                subject("c-settled", "Settled", ["site-north"]),
                subject("c-owing", "Owing", ["site-north"]),
            ),
            cohort(
                positionRow("c-settled", "Settled", { outstanding: 0, collectible: 0 }),
                positionRow("c-owing", "Owing", { outstanding: 900, collectible: 900 }),
            ),
        );
        expect(rows.map((r) => r.customerId)).toEqual(["c-owing", "c-settled", "c-zero"]);
    });
});

// ── site scope, narrowing only ──────────────────────────────────────────────────────────────────

describe("subject visibility reuses the location contract and can only narrow", () => {
    it("admits an org-scoped household account only at org scope, and only org-wide", () => {
        const args = { siteLocationIds: [] as string[], allowedSiteLocationIds: [] as string[] };
        expect(isFinancialSubjectVisible({ ...args, siteScope: "all", activeSiteLocationId: null })).toBe(true);
        expect(isFinancialSubjectVisible({ ...args, siteScope: "all", activeSiteLocationId: "site-north" })).toBe(false);
        expect(isFinancialSubjectVisible({ ...args, siteScope: "restricted", activeSiteLocationId: null })).toBe(false);
    });

    it("admits an enrolled household at its own site, and to an operator who holds it", () => {
        expect(isFinancialSubjectVisible({
            siteLocationIds: ["site-north"], siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: "site-north",
        })).toBe(true);
        expect(isFinancialSubjectVisible({
            siteLocationIds: ["site-north"], siteScope: "restricted", allowedSiteLocationIds: ["site-north"], activeSiteLocationId: null,
        })).toBe(true);
        expect(isFinancialSubjectVisible({
            siteLocationIds: ["site-north"], siteScope: "restricted", allowedSiteLocationIds: ["site-south"], activeSiteLocationId: null,
        }), "holding another site is not holding this one").toBe(false);
    });

    it("asks the same function the charge grain asks, rather than restating the rule", () => {
        const src = read("lib/financials/workspace/resolveFinancialSubjects.ts");
        expect(src).toContain("isFinancialWorkVisible");
        expect(src).toContain("resolveFinancialWorkLocation");
    });
});

// ── a failed read is not a zero balance ─────────────────────────────────────────────────────────

describe("a failed read is never rendered as a legitimate zero", () => {
    it("throws rather than returning an empty cohort when the household read fails", async () => {
        const supabase = fakeSupabase({ customersError: "connection reset" });
        await expect(
            resolveFinancialSubjectCohort(supabase, { orgId: "org", siteScope: "all", allowedSiteLocationIds: [] }),
        ).rejects.toThrow(/households could not be read/i);
    });

    it("composes rows only when BOTH sides were read", () => {
        /*
         * A $0 row is a claim that the account was looked at and carries nothing. If the position
         * read failed, that claim is false for every household on the rail — so the rail must not
         * be composed from the subject cohort alone.
         */
        const src = read("app/adminV2/financials/sections/FinancialsAccounts.tsx");
        expect(src).toContain("subjects.data && position.data ? joinAccounts(subjects.data, position.data) : []");
        expect(src).toContain("position.error ?? subjects.error");
        // The error branch precedes the rows, so a failure is never a screen of zeroes.
        expect(src.indexOf("data-financials-accounts-error")).toBeLessThan(src.indexOf("data-financials-account-row"));
    });

    it("keeps the empty rail honest about what is missing", () => {
        const src = read("app/adminV2/financials/sections/FinancialsAccounts.tsx");
        expect(src, "the rail no longer claims accounts are defined by activity")
            .not.toContain("No account carries financial activity");
        expect(src).toContain("No household account in scope");
    });
});

// ── eligibility is the existing authority, not a new one ────────────────────────────────────────

describe("eligibility reuses the censused authority", () => {
    it("does not gate the cohort on an enrolment agreement", () => {
        const src = read("lib/financials/workspace/resolveFinancialSubjects.ts");
        // Reported for explanation; never used to filter.
        expect(src).toContain("hasEnrollmentAgreement");
        expect(src, "an agreement is a billable source, not eligibility for Financials")
            .not.toMatch(/if\s*\(\s*!?\w*\.?hasEnrollmentAgreement\s*\)/);
        expect(src).not.toMatch(/\.eq\(\s*["']status["']\s*,\s*["']active["']\s*\)/);
    });

    it("lists a household with no enrolment at all, at org scope", () => {
        const rows = joinAccounts(subjects(subject("c-prospect", "Prospect Household", [])), cohort());
        expect(rows).toHaveLength(1);
        expect(rows[0].hasEnrollmentAgreement).toBe(false);
        expect(rows[0].noActivity).toBe(true);
    });
});

// ── a small fake of the reads this resolver makes ───────────────────────────────────────────────

type Row = Record<string, unknown>;

function fakeSupabase(opts: {
    customers?: Row[];
    agreements?: Row[];
    orphanAgreements?: Row[];
    members?: Row[];
    customersError?: string;
}) {
    const table = (name: string) => {
        const state: { isNullCustomer: boolean; from: number; to: number } = { isNullCustomer: false, from: 0, to: 0 };
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        for (const method of ["select", "eq", "in", "order"]) builder[method] = chain;
        builder.is = () => {
            state.isNullCustomer = true;
            return builder;
        };
        builder.range = (from: number, to: number) => {
            state.from = from;
            state.to = to;
            return builder;
        };
        builder.then = (resolve: (r: { data: Row[] | null; error: { message: string } | null }) => unknown) => {
            if (name === "customers") {
                if (opts.customersError) return resolve({ data: null, error: { message: opts.customersError } });
                return resolve({ data: (opts.customers ?? []).slice(state.from, state.to + 1), error: null });
            }
            if (name === "child_enrollment_agreements") {
                const rows = state.isNullCustomer ? (opts.orphanAgreements ?? []) : (opts.agreements ?? []);
                return resolve({
                    data: state.isNullCustomer ? rows.slice(state.from, state.to + 1) : rows,
                    error: null,
                });
            }
            return resolve({ data: opts.members ?? [], error: null });
        };
        return builder;
    };
    return { from: (name: string) => table(name) } as never;
}

describe("the subject cohort read", () => {
    it("lists every household in the org at org scope, enrolled or not", async () => {
        const supabase = fakeSupabase({
            customers: [
                { id: "c1", name: "Alvarez Household (demo)" },
                { id: "c2", name: "Prospect Household" },
            ],
            agreements: [{ customer_id: "c1", site_location_id: "site-north" }],
        });
        const result = await resolveFinancialSubjectCohort(supabase, {
            orgId: "org", siteScope: "all", allowedSiteLocationIds: [],
        });
        expect(result.subjects.map((s) => s.customerId)).toEqual(["c1", "c2"]);
        expect(result.subjects[0].siteLocationIds).toEqual(["site-north"]);
        expect(result.subjects[1].hasEnrollmentAgreement).toBe(false);
        expect(result.truncated).toBe(false);
    });

    it("narrows to the enrolled households when a site filter is active", async () => {
        const supabase = fakeSupabase({
            customers: [
                { id: "c1", name: "Alvarez Household (demo)" },
                { id: "c2", name: "Prospect Household" },
                { id: "c3", name: "Southside Household" },
            ],
            agreements: [
                { customer_id: "c1", site_location_id: "site-north" },
                { customer_id: "c3", site_location_id: "site-south" },
            ],
        });
        const result = await resolveFinancialSubjectCohort(supabase, {
            orgId: "org", siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: "site-north",
        });
        expect(result.subjects.map((s) => s.customerId)).toEqual(["c1"]);
    });

    it("takes the second hop for an agreement that names only the child", async () => {
        const supabase = fakeSupabase({
            customers: [{ id: "c1", name: "Alvarez Household (demo)" }],
            agreements: [],
            orphanAgreements: [{ customer_member_id: "m1", site_location_id: "site-north" }],
            members: [{ id: "m1", customer_id: "c1" }],
        });
        const result = await resolveFinancialSubjectCohort(supabase, {
            orgId: "org", siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: "site-north",
        });
        expect(result.subjects.map((s) => s.customerId)).toEqual(["c1"]);
    });
});
