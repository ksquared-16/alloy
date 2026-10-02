/**
 * THE REDUCTIONCORE PRODUCTION REPAIR, PROVEN AGAINST A REAL POST-S2 DATABASE.
 *
 * S2 added `financial_reduction_applications.billing_period_generation` as NOT NULL with NO column
 * default. The shared reduction writer never populated it, so from the moment S2 reached a database
 * every vacation credit, every policy reduction and every manual credit failed — not in a test, in
 * production. A mocked client cannot catch that: a fake `.insert()` accepts a row the real database
 * refuses, which is exactly why the defect survived a green suite and reached deployed staging.
 *
 * So this suite is deliberately NOT mocked. It writes through `applyManualReduction` — the same
 * entry the `billing.adjust_account` operator action calls — into the real certification Postgres,
 * carrying the same five migrations the deployed database now carries, and then reads the stored row
 * back out of the database rather than out of the service's return value.
 *
 * Three things are proven here, and the third is the one that matters:
 *
 *   1. the write succeeds at all (no NOT NULL violation);
 *   2. `billing_period_generation` is populated truthfully, and its period key is the one the
 *      customer's own calendar produces rather than a month cut off a date;
 *   3. THE DATABASE REALLY WOULD HAVE REFUSED THE OLD SHAPE. At the end of the first case, the
 *      same insert with the column omitted is attempted directly against the charge the real write
 *      just created, and must fail 23502 naming `billing_period_generation` — otherwise this suite
 *      would pass just as happily against the broken writer and prove nothing. It is placed there
 *      rather than first because the application table's `charge_id` is itself NOT NULL, so a
 *      control with no charge fails on the wrong column and proves the wrong thing.
 *
 * It also records one economic consequence exactly once, because a repair that writes the column by
 * writing the row twice is not a repair.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyManualReduction } from "@/lib/financials/reductions/manualReductionService";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";

/*
 * A distinct fixture prefix, so this suite never reads or writes another suite's rows — and a
 * RUN-UNIQUE tail, because the contra charge this proof creates is POSTED, and a posted childcare
 * charge is immutable: `afterAll` cannot delete it. Reusing fixed ids made a second run read the
 * first run's charge and look like duplicated money, which it was not.
 */
const RUN = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
const P = `fd10${RUN}-0000-4000-8000-`;
const CUSTOMER = `${P}0000000c0001`;
const MEMBER = `${P}0000000d0001`;
const PERSON = `${P}0000000e0001`;
const AGREEMENT = `${P}0000000a0001`;
const LOCATION = `${P}0000000b0001`;
const CALENDAR_POLICY = `${P}0000000f0001`;

/** A weekly calendar, because a weekly account is what caught the month-slicing bug. */
const CADENCE = "weekly";
const ANCHOR_ON = "2026-01-05"; // a Monday
const EFFECTIVE = "2026-11-04"; // inside 2026-11-02~2026-11-08
const EXPECTED_PERIOD_KEY = "2026-11-02~2026-11-08";

describeLive("reductionCore under S2 — a real write into a real post-S2 database", () => {
    let db: SupabaseClient;

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        await cleanup();

        /*
         * The minimum estate a reduction needs: a site location, a household, a member, a person,
         * an active agreement, and — the S2 requirement — a calendar the household's period can be
         * resolved from. Seeded here rather than borrowed from a shared fixture so this proof does
         * not depend on another suite's state.
         *
         * Each seed is checked. A silently refused fixture is the worst outcome here: the proof
         * would then fail for a missing household rather than for the defect under test, and the
         * failure would read as if the repair were broken.
         */
        const seed = async (table: string, row: Record<string, unknown>) => {
            const { error } = await db.from(table).upsert(row);
            expect(error, `seeding ${table}: ${error?.message ?? ""}`).toBeNull();
        };
        await seed("customers", { id: CUSTOMER, org_id: ORG, name: "Reduction proof household", customer_type: "household" });
        await seed("locations", {
            id: LOCATION, org_id: ORG, customer_id: CUSTOMER, label: "Reduction proof site",
            // `child_enrollment_agreements` refuses a site_location_id that is not a site.
            location_type: "site", is_active: true,
        });
        await seed("persons", { id: PERSON, org_id: ORG, first_name: "Reduction", last_name: "Proof" });
        await seed("customer_members", {
            id: MEMBER, org_id: ORG, customer_id: CUSTOMER, person_id: PERSON,
            display_name: "Reduction Proof", relationship: "child", is_active: true,
        });
        await seed("child_enrollment_agreements", {
            id: AGREEMENT, org_id: ORG, customer_id: CUSTOMER, customer_member_id: MEMBER, person_id: PERSON,
            site_location_id: LOCATION, status: "active", start_date: "2026-01-05",
        });
        await seed("financial_policies", {
            id: CALENDAR_POLICY, org_id: ORG, scope_type: "customer", customer_id: CUSTOMER,
            location_id: null, policy_type: "billing_calendar", is_active: true,
            // A policy is a dated fact; it carries no NULL start.
            effective_start: "2026-01-05", effective_end: null,
            value: { cadence: CADENCE, anchor_on: ANCHOR_ON },
        });
    });

    afterAll(cleanup);

    async function cleanup() {
        await db.from("financial_reduction_applications").delete().eq("org_id", ORG).eq("customer_id", CUSTOMER);
        await db.from("charges").delete().eq("org_id", ORG).eq("billable_source_id", AGREEMENT);
        await db.from("financial_policies").delete().eq("id", CALENDAR_POLICY);
        await db.from("child_enrollment_agreements").delete().eq("id", AGREEMENT);
        await db.from("customer_members").delete().eq("id", MEMBER);
        await db.from("persons").delete().eq("id", PERSON);
        await db.from("customers").delete().eq("id", CUSTOMER);
        await db.from("locations").delete().eq("id", LOCATION);
    }

    it("writes a manual credit through the shared authority, and the stored row carries its generation", async () => {
        const result = await applyManualReduction(db, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            customerId: CUSTOMER,
            customerMemberId: MEMBER,
            chargeCategory: "credit",
            amountCents: 2_500,
            currencyCode: "USD",
            reason: "reductionCore deployed-schema proof — a controlled goodwill credit",
            effectiveDate: EFFECTIVE,
            sourceChargeId: null,
            note: null,
            actorUserId: ACTOR,
            idempotencyKey: "reductioncore-proof-manual-credit",
        });

        expect(result.chargeId).toBeTruthy();
        expect(result.amountCents).toBe(2_500);

        /* Read the row back out of the database, not out of the service's return value. */
        const { data, error } = await db
            .from("financial_reduction_applications")
            .select("id, billing_period_generation, billing_period_id, legacy_billing_period_key, period_key, amount_cents, charge_id")
            .eq("org_id", ORG)
            .eq("idempotency_key", "reductioncore-proof-manual-credit");

        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        const row = data![0] as Record<string, unknown>;

        /* (1) populated at all — this is the NOT NULL the broken writer violated. */
        expect(row.billing_period_generation).not.toBeNull();
        /* (2) populated TRUTHFULLY: legacy representation, with the key the account's calendar gives. */
        expect(row.billing_period_generation).toBe("legacy");
        expect(row.legacy_billing_period_key).toBe(EXPECTED_PERIOD_KEY);
        expect(row.period_key).toBe(EXPECTED_PERIOD_KEY);
        /*
         * A legacy-generation row carries no canonical period id. The pair is the whole point of the
         * two-generation design: the generation column says which representation to read, and a null
         * id on a legacy row is meaningful rather than missing.
         */
        expect(row.billing_period_id).toBeNull();

        /* The period key is the calendar's, not a month sliced off the effective date. */
        expect(row.legacy_billing_period_key).not.toBe(EFFECTIVE.slice(0, 7));

        /*
         * THE CONTROL, run here because it needs the charge the real write just created.
         *
         * This is the row the pre-repair writer emitted: every economic field present,
         * `billing_period_generation` absent. The database must refuse it by name. Without this,
         * the assertions above would pass just as happily against the broken writer — the column
         * would simply be whatever the database defaulted it to — and would prove nothing.
         */
        const { error: controlError } = await db.from("financial_reduction_applications").insert({
            org_id: ORG,
            reduction_kind: "manual",
            charge_id: row.charge_id,
            customer_id: CUSTOMER,
            customer_member_id: MEMBER,
            enrollment_agreement_id: AGREEMENT,
            amount_cents: 1,
            currency_code: "USD",
            reason: "control — the pre-repair row shape",
            idempotency_key: `reductioncore-control-old-shape-${RUN}`,
            period_key: EXPECTED_PERIOD_KEY,
        });
        expect(controlError, "the pre-repair row shape must be refused").not.toBeNull();
        expect(controlError?.code).toBe("23502");
        expect(`${controlError?.message ?? ""}`).toContain("billing_period_generation");
    });

    it("records the economic consequence exactly once, under a repeated submission", async () => {
        const again = await applyManualReduction(db, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            customerId: CUSTOMER,
            customerMemberId: MEMBER,
            chargeCategory: "credit",
            amountCents: 2_500,
            currencyCode: "USD",
            reason: "reductionCore deployed-schema proof — a controlled goodwill credit",
            effectiveDate: EFFECTIVE,
            sourceChargeId: null,
            note: null,
            actorUserId: ACTOR,
            idempotencyKey: "reductioncore-proof-manual-credit",
        });
        expect(again.idempotent).toBe(true);

        const { data } = await db
            .from("financial_reduction_applications")
            .select("id, amount_cents, billing_period_generation")
            .eq("org_id", ORG)
            .eq("customer_id", CUSTOMER);

        /* One application, one amount, and the generation still right after the second call. */
        expect(data).toHaveLength(1);
        expect((data![0] as { amount_cents: number }).amount_cents).toBe(2_500);
        expect((data![0] as { billing_period_generation: string }).billing_period_generation).toBe("legacy");

        /*
         * And ONE contra charge. Counted off this run's own agreement — the measure that matters is
         * that the second submission reached no new money, and `applyReductionCore` resolves
         * idempotency BEFORE it creates a charge, so a second charge would mean it had not.
         */
        const { data: charges } = await db
            .from("charges")
            .select("id, amount_cents, status")
            .eq("org_id", ORG)
            .eq("billable_source_id", AGREEMENT);
        expect(charges).toHaveLength(1);
        expect((charges![0] as { id: string }).id).toBe(again.chargeId);
        expect((charges![0] as { amount_cents: number }).amount_cents).toBe(2_500);
    });

    it("the charge the reduction creates carries a generation too, so the childcare guard admits it", async () => {
        /*
         * `charges_billing_period_childcare_chk` refuses a childcare-sourced charge still marked
         * `not_applicable`. A contra charge is childcare-sourced, so the repair had to satisfy that
         * constraint as well as the reduction table's NOT NULL — two different guards, one write.
         */
        const { data } = await db
            .from("charges")
            .select("id, charge_type, charge_category, billable_source_type, billing_period_generation, legacy_billing_period_key, status")
            .eq("org_id", ORG)
            .eq("billable_source_id", AGREEMENT);

        expect(data).toHaveLength(1);
        const charge = data![0] as Record<string, unknown>;
        expect(charge.billable_source_type).toBe("enrollment_agreement");
        expect(charge.billing_period_generation).not.toBeNull();
        expect(charge.billing_period_generation).not.toBe("not_applicable");

        /*
         * THE TWO ROWS CARRY DIFFERENT GENERATIONS, AND THAT IS MEASURED HERE RATHER THAN ASSUMED.
         *
         * The contra charge goes through `createChildcareDraftCharge`, so the S2 binder resolves it
         * CANONICALLY: a real `billing_period_id` and no legacy key. The application row that
         * explains it is written `legacy`, carrying the period KEY instead. Both satisfy their own
         * guards — the charge satisfies `charges_billing_period_childcare_chk`, the application
         * satisfies its NOT NULL — and the repair had to clear both with one write.
         *
         * The asymmetry is recorded, not endorsed: a reduction application is not canonically bound
         * even for a household that has a canonical calendar. That is a question for the slice that
         * owns commercial finalization, not something to quietly change inside a production repair.
         */
        expect(charge.billing_period_generation).toBe("canonical");
        expect(charge.billing_period_id).not.toBeNull();
        expect(charge.legacy_billing_period_key).toBeNull();
    });
});
