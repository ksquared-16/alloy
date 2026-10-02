/**
 * S2 — COMMERCIAL MEMBERSHIP IS A PERMANENT FACT, AND A ROW ALWAYS SAYS WHICH SEMANTICS SET IT.
 *
 * Three groups:
 *   · BINDING      — a new childcare charge resolves and persists its canonical period, server-side,
 *                    and REFUSES rather than falling back when the household's calendar is undecided.
 *   · IMMUTABILITY — the database refuses to move membership, and deliberately does NOT constrain a
 *                    correction's period to its source's, because that is what S5 needs.
 *   · CADENCE      — no monthly-only parser, no `slice(0, 7)` authority, no `YYYY-MM`-only
 *                    validation survives as a definition of "billing period".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    BILLING_AGREEMENT_ID,
    BILLING_CUSTOMER_ID,
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    seedCanonicalBillingChain,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import { createChildcareDraftCharge } from "@/lib/financials/childcareChargeService";
import {
    BillingPeriodBindingError,
    NOT_APPLICABLE_BINDING,
    isChildcareBillableSource,
    resolveChargeBillingPeriodBinding,
} from "@/lib/financials/billingPeriods/bindChargeBillingPeriod";

const src = (rel: string) => readFileSync(resolve(__dirname, "../../", rel), "utf8");

/**
 * The file with its comments removed.
 *
 * These assertions are about what the code DOES. Several of these files deliberately DISCUSS the
 * patterns being forbidden — naming the old expression is how the next reader learns why it went —
 * and a source-text assertion that cannot tell prose from code would forbid explaining itself.
 */
const code = (rel: string) =>
    src(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//"))
        .join("\n");
const migration = () =>
    readFileSync(
        resolve(__dirname, "../../../supabase/migrations/20261115120000_billing_period_generations.sql"),
        "utf8",
    );
/* The CONTRACT half. Split from the expand so neither writer generation is ever broken. */
const guardMigration = () =>
    readFileSync(
        resolve(__dirname, "../../../supabase/migrations/20261116120000_billing_period_childcare_guard.sql"),
        "utf8",
    );

function chain(extra: Record<string, unknown> = {}) {
    const store = createOperationalEnrollmentMockStore({ ...seedCanonicalBillingChain(), ...extra });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

describe("a new childcare charge binds to a canonical customer period", () => {
    it("persists generation canonical and a real period id, with no legacy key", async () => {
        const { store, supabase } = chain();
        const charge = await createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: BILLING_AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 100000,
            serviceDate: "2026-11-12",
        });
        const row = charge as unknown as Record<string, unknown>;
        expect(row.billing_period_generation).toBe("canonical");
        expect(row.billing_period_id, "a real persisted period, not null").toBeTruthy();
        expect(row.legacy_billing_period_key, "canonical rows carry no legacy label").toBeNull();

        /* The id names a period that EXISTS and contains the charge's date. */
        const period = store.financial_billing_periods.find((p) => p.id === row.billing_period_id);
        expect(period, "the id resolves to a persisted period").toBeTruthy();
        expect(period!.customer_id).toBe(BILLING_CUSTOMER_ID);
        expect(String(period!.starts_on) <= "2026-11-12").toBe(true);
        expect(String(period!.ends_on) >= "2026-11-12").toBe(true);
    });

    it("materialises the period through the canonical authority when it does not yet exist", async () => {
        const { store, supabase } = chain();
        expect(store.financial_billing_periods).toHaveLength(0);
        await createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: BILLING_AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 1000,
            serviceDate: "2026-11-12",
        });
        /* Current AND next, which is the bounded rolling window S1 certified. */
        expect(store.financial_billing_periods.length).toBeGreaterThanOrEqual(2);
        for (const p of store.financial_billing_periods) {
            expect(p.customer_id).toBe(BILLING_CUSTOMER_ID);
            expect(p.status).toBe("open");
        }
    });

    it("REFUSES before writing when the household attends two locations with no account calendar", async () => {
        /* Two live agreements at two locations, and no customer-scoped calendar to decide between. */
        const { store, supabase } = chain({
            child_enrollment_agreements: [
                {
                    id: BILLING_AGREEMENT_ID, org_id: ORG_ID, customer_member_id: "member-1",
                    customer_id: BILLING_CUSTOMER_ID, site_location_id: "site-1",
                    status: "active", start_date: "2026-01-01", end_date: null,
                },
                {
                    id: "agr-2", org_id: ORG_ID, customer_member_id: "member-1",
                    customer_id: BILLING_CUSTOMER_ID, site_location_id: "site-2",
                    status: "active", start_date: "2026-01-01", end_date: null,
                },
            ],
            financial_policies: [
                {
                    id: "pol-a", org_id: ORG_ID, scope_type: "location", location_id: "site-1",
                    service_id: null, rate_plan_id: null, customer_id: null,
                    policy_type: "billing_calendar", value: { cadence: "monthly", anchor_on: null },
                    is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
                },
                {
                    id: "pol-b", org_id: ORG_ID, scope_type: "location", location_id: "site-2",
                    service_id: null, rate_plan_id: null, customer_id: null,
                    policy_type: "billing_calendar", value: { cadence: "weekly", anchor_on: "2026-01-05" },
                    is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
                },
            ],
        });
        const before = store.charges.length;
        await expect(createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: BILLING_AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 1000,
            serviceDate: "2026-11-12",
        })).rejects.toMatchObject({ code: "billing_calendar_ambiguous" });

        /* THE ECONOMIC FACT WAS NOT WRITTEN. A refusal after the insert would be no refusal at all. */
        expect(store.charges.length, "no charge was created").toBe(before);
        expect(store.financial_billing_periods, "and no period was invented").toHaveLength(0);
    });

    it("does not fall back to legacy semantics when canonical resolution fails", async () => {
        /* No calendar at any scope. The writer must refuse, not quietly write a monthly key. */
        const { store, supabase } = chain({ financial_policies: [] });
        await expect(createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: BILLING_AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 1000,
            serviceDate: "2026-11-12",
        })).rejects.toBeInstanceOf(BillingPeriodBindingError);
        expect(store.charges, "no legacy escape hatch").toHaveLength(0);
    });

    it("an explicit account calendar resolves the ambiguity", async () => {
        const { store, supabase } = chain({
            child_enrollment_agreements: [
                {
                    id: BILLING_AGREEMENT_ID, org_id: ORG_ID, customer_member_id: "member-1",
                    customer_id: BILLING_CUSTOMER_ID, site_location_id: "site-1",
                    status: "active", start_date: "2026-01-01", end_date: null,
                },
                {
                    id: "agr-2", org_id: ORG_ID, customer_member_id: "member-1",
                    customer_id: BILLING_CUSTOMER_ID, site_location_id: "site-2",
                    status: "active", start_date: "2026-01-01", end_date: null,
                },
            ],
            financial_policies: [
                {
                    id: "pol-acct", org_id: ORG_ID, scope_type: "customer", location_id: null,
                    service_id: null, rate_plan_id: null, customer_id: BILLING_CUSTOMER_ID,
                    policy_type: "billing_calendar", value: { cadence: "biweekly", anchor_on: "2026-01-05" },
                    is_active: true, effective_start: "2026-01-01", effective_end: null, metadata: {},
                },
            ],
        });
        const charge = await createChildcareDraftCharge(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: BILLING_AGREEMENT_ID,
            chargeCategory: "tuition",
            amountCents: 1000,
            serviceDate: "2026-11-12",
        });
        expect((charge as unknown as Record<string, unknown>).billing_period_generation).toBe("canonical");
        const period = store.financial_billing_periods.find(
            (p) => p.id === (charge as unknown as Record<string, unknown>).billing_period_id);
        expect(period!.cadence, "the ACCOUNT's cadence, not either location's").toBe("biweekly");
        expect(period!.calendar_scope).toBe("customer");
        expect(period!.calendar_source_location_id, "asserts no location membership").toBeNull();
    });

    it("an off-spine source carries no commercial period, and says so", async () => {
        expect(isChildcareBillableSource("job")).toBe(false);
        expect(isChildcareBillableSource("customer")).toBe(true);
        expect(isChildcareBillableSource("enrollment_agreement")).toBe(true);
        const { supabase } = chain();
        const binding = await resolveChargeBillingPeriodBinding(supabase, {
            orgId: ORG_ID, billableSourceType: "job", billableSourceId: "job-1",
            placementDate: "2026-11-12",
        });
        expect(binding).toEqual(NOT_APPLICABLE_BINDING);
        expect(binding.billing_period_generation).toBe("not_applicable");
    });
});

describe("the migration freezes membership, and leaves one thing deliberately unconstrained", () => {
    const sql = migration();

    it("names the three generations and nothing else", () => {
        expect(sql).toContain("charges_billing_period_generation_chk");
        expect(sql).toContain("ARRAY['legacy'::text, 'canonical'::text, 'not_applicable'::text]");
        /* Reductions have no exempt vertical, so they admit only two. */
        expect(sql).toContain("fin_reduction_billing_period_generation_chk");
        expect(sql).toContain("CHECK (billing_period_generation = ANY (ARRAY['legacy'::text, 'canonical'::text]))");
    });

    it("forbids a childcare charge from taking the not_applicable default — in the CONTRACT half", () => {
        const guard = guardMigration();
        expect(guard).toContain("charges_billing_period_childcare_chk");
        expect(guard).toContain("billing_period_generation <> 'not_applicable'");

        /*
         * And it must NOT be in the expand half. Shipping it there breaks childcare charge creation
         * for as long as the old writers are still serving, which is the window the split exists to
         * remove — proven on a real database: with the expand applied and this withheld, an old
         * writer's childcare insert succeeds.
         */
        expect(sql, "the expand half must not carry the constraint").not.toContain(
            "ADD CONSTRAINT charges_billing_period_childcare_chk");

        /* The contract converts anything the window produced rather than failing on it. */
        expect(guard).toContain("SET billing_period_generation = 'legacy'");
        expect(guard).toContain("coalesce(c.billable_on, c.occurs_on, c.service_date, c.created_at::date)");
    });

    it("refuses to move membership, on both tables, in the database", () => {
        expect(sql).toContain("enforce_charge_billing_period_immutability");
        expect(sql).toContain("charge_billing_period_generation_frozen");
        expect(sql).toContain("charge_billing_period_frozen");
        expect(sql).toContain("charge_legacy_billing_period_frozen");
        expect(sql).toContain("trg_enforce_charge_billing_period_immutability");
        expect(sql).toContain("enforce_reduction_billing_period_immutability");
        expect(sql).toContain("reduction_billing_period_frozen");
        expect(sql).toContain("trg_enforce_reduction_billing_period_immutability");
    });

    it("backfills from HISTORICAL dates, never from a current calendar", () => {
        expect(sql).toContain("coalesce(c.billable_on, c.occurs_on, c.service_date, c.created_at::date)");
        expect(sql).toContain("'YYYY-MM'");
        for (const forbidden of ["resolveCustomerBillingCalendar", "financial_policies", "site_location_id"]) {
            expect(sql, `backfill must not consult ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("does NOT tie a correction's period to its source's — the constraint S5 could not survive", () => {
        /*
         * Asserted as an ABSENCE on purpose. A later slice adding this by reflex would make a
         * prospective December correction of a closed November unrepresentable, which is the whole
         * reason reductions bind directly instead of deriving through `charge_id`.
         */
        /* Comment lines stripped: the migration DISCUSSES the forbidden rule at length, and the
         * assertion is about what the schema DOES, not about what the prose mentions. */
        const code = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
        expect(code).not.toMatch(/billing_period_id\s*=\s*\(?\s*SELECT[^)]*source_charge/i);
        expect(code).not.toContain("source_charge.billing_period_id");
        expect(code.toLowerCase()).not.toContain("correction_period_matches_source");
    });

    it("adds no 'period must be open' guard — that is S4's, and the guard point is named", () => {
        expect(sql).not.toMatch(/status\s*=\s*'open'/);
        expect(sql).toContain("S4");
    });
});

describe("no monthly-only definition of a billing period survives", () => {
    it("the monthly-only parser is gone", () => {
        expect(() => src("lib/financials/reductions/reductionPeriod.ts")).toThrow();
    });

    it("every former caller consumes the canonical bounds authority", () => {
        for (const f of [
            "lib/financials/reductions/applyFinancialReductions.ts",
            "lib/financials/reductions/forecastAssignmentReductions.ts",
            "lib/adminV2/actions/definitions/financialReductionActions.ts",
            "app/api/admin/financials/proposed-charge-discounts/route.ts",
        ]) {
            const s = src(f);
            expect(s, `${f} uses the canonical parser`).toContain("billingPeriodFromKey");
            expect(s, `${f} no longer imports the monthly-only one`).not.toContain("reductions/reductionPeriod");
            expect(code(f), `${f} keeps no monthly-only bounds helper`).not.toContain("billingPeriodBounds");
        }
    });

    it("no reduction path cuts a period identity out of a date", () => {
        for (const f of [
            "lib/financials/reductions/applyFinancialReductions.ts",
            "lib/financials/reductions/forecastAssignmentReductions.ts",
            "lib/financials/reductions/manualReductionService.ts",
            "lib/financials/reductions/readAssignmentDiscountPosition.ts",
            "app/api/admin/financials/proposed-charge-discounts/route.ts",
        ]) {
            expect(code(f), `${f} must not slice a month out of a date`).not.toMatch(/slice\(0,\s*7\)/);
        }
    });

    it("and no `YYYY-MM`-only regex defines a period anywhere in the reduction layer", () => {
        for (const f of [
            "lib/financials/reductions/applyFinancialReductions.ts",
            "lib/financials/reductions/forecastAssignmentReductions.ts",
            "lib/financials/reductions/manualReductionService.ts",
        ]) {
            expect(code(f), f).not.toMatch(/\^\\d\{4\}-\\d\{2\}\$/);
        }
    });
});
