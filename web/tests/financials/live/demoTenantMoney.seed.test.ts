/**
 * THE MONEY THE DEMO TENANT IS ABOUT — EARNED THROUGH THE CANONICAL SERVICES, NOT DECLARED.
 *
 * `certification/fixtures/financials-demo-tenant.sql` builds the STRUCTURE: four households, four
 * children, four agreements across the tenant's two real campuses. It writes no money, deliberately.
 * Charges, postings and payment applications carry invariants — posting rules, journal attribution,
 * allocation limits that refuse to over-apply a receipt — and a fixture that INSERTed past them
 * would seed a tenant the product could never have produced, and then certify against it.
 *
 * So this drives the same services an operator's clicks reach:
 *
 *   createChildcareDraftCharge → postChildcareCharge → recordChildcarePayment → applyPaymentToCharge
 *
 * Whatever it leaves behind is therefore reachable, postable and applicable by definition.
 *
 * ── WHY THIS IS SHAPED LIKE A TEST ──
 *
 * It runs under vitest for the module aliases and the certification env the live proofs already
 * resolve, and it is a `describe.skip` unless CERT_SEED_DEMO=1 — so an ordinary suite run never
 * writes money into the shared tenant. It ASSERTS what it seeded rather than trusting the calls,
 * because a seed that silently half-succeeds produces exactly the empty workspace this whole pass
 * exists to fix.
 *
 * ── THE FOUR CHARACTERS ──
 *
 *   Alvarez  — two posted charges, part-paid. Real outstanding money; the account opened first.
 *   Brennan  — one posted charge, paid in full. "Current" is a state the surface must be able to show.
 *   Chen     — posted charge left unpaid, standing behind the agency authorization the fixture
 *              created. The subsidy case.
 *   Okafor   — money received and deliberately NOT applied. The unapplied case.
 *
 * Amounts are distinct primes-ish values so a wrong row is obvious in a screenshot rather than
 * plausible.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import {
    createChildcareDraftCharge,
    postChildcareCharge,
} from "@/lib/financials/childcareChargeService";
import {
    applyPaymentToCharge,
    recordChildcarePayment,
    readPaymentUnappliedCents,
} from "@/lib/financials/childcarePaymentService";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
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
/** Never writes money into the shared tenant unless a harness explicitly asked for it. */
const describeSeed = env && process.env.CERT_SEED_DEMO === "1" ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";

/** The fixture's own namespace — these must match `financials-demo-tenant.sql`. */
const HH = {
    alvarez: "fd000000-0000-4000-8000-0000000c0001",
    brennan: "fd000000-0000-4000-8000-0000000c0002",
    chen: "fd000000-0000-4000-8000-0000000c0003",
    okafor: "fd000000-0000-4000-8000-0000000c0004",
} as const;
const AGR = {
    alvarez: "fd000000-0000-4000-8000-0000000a0001",
    brennan: "fd000000-0000-4000-8000-0000000a0002",
    chen: "fd000000-0000-4000-8000-0000000a0003",
    okafor: "fd000000-0000-4000-8000-0000000a0004",
} as const;

const ymd = (offsetDays: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
};

describeSeed("demo tenant money — seeded through the canonical services", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    async function draftAndPost(agreementId: string, amountCents: number, description: string, dayOffset: number) {
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG,
            enrollmentAgreementId: agreementId,
            chargeCategory: "tuition",
            amountCents,
            serviceDate: ymd(dayOffset),
            description,
            actorUserId: ACTOR,
        });
        const posted = await postChildcareCharge(supabase, {
            orgId: ORG,
            chargeId: draft.id,
            actorUserId: ACTOR,
        });
        expect(posted.charge.status, `${description} must post`).toBe("posted");
        return posted.charge;
    }

    beforeAll(() => {
        expect(env, "the certification stack must be configured").toBeTruthy();
    });

    it("Alvarez owes real money after a partial payment", async () => {
        const first = await draftAndPost(AGR.alvarez, 121_000, "Tuition — prior month", -35);
        const second = await draftAndPost(AGR.alvarez, 121_000, "Tuition — current month", -5);

        // Received less than billed, on purpose: outstanding is the point of this account.
        const payment = await recordChildcarePayment(supabase, {
            orgId: ORG,
            billableSourceType: "enrollment_agreement",
            billableSourceId: AGR.alvarez,
            customerId: HH.alvarez,
            amountCents: 150_000,
            paymentMethod: "ach",
            actorUserId: ACTOR,
        } as never);
        await applyPaymentToCharge(supabase, {
            orgId: ORG,
            paymentId: payment.payment.id,
            chargeId: first.id,
            amountCents: 121_000,
            actorUserId: ACTOR,
        } as never);
        await applyPaymentToCharge(supabase, {
            orgId: ORG,
            paymentId: payment.payment.id,
            chargeId: second.id,
            amountCents: 29_000,
            actorUserId: ACTOR,
        } as never);

        // 242,000 billed, 150,000 received: 92,000 still owed, and nothing left unapplied.
        const unapplied = await readPaymentUnappliedCents(supabase, ORG, payment.payment.id, 150_000);
        expect(unapplied, "the whole receipt was applied").toBe(0);
    }, 180_000);

    it("Brennan is settled — a paid-in-full account the surface can show as current", async () => {
        const charge = await draftAndPost(AGR.brennan, 98_000, "Tuition — current month", -5);
        const payment = await recordChildcarePayment(supabase, {
            orgId: ORG,
            billableSourceType: "enrollment_agreement",
            billableSourceId: AGR.brennan,
            customerId: HH.brennan,
            amountCents: 98_000,
            paymentMethod: "card",
            actorUserId: ACTOR,
        } as never);
        await applyPaymentToCharge(supabase, {
            orgId: ORG,
            paymentId: payment.payment.id,
            chargeId: charge.id,
            amountCents: 98_000,
            actorUserId: ACTOR,
        } as never);
        expect(await readPaymentUnappliedCents(supabase, ORG, payment.payment.id, 98_000)).toBe(0);
    }, 180_000);

    /*
     * Chen's charge stands behind the agency authorization the SQL fixture created. The family owes
     * its copay; the agency owes the rest. Left unpaid so Thread 9's surfaces have something real to
     * claim against rather than a settled account with nothing outstanding.
     */
    it("Chen has agency-funded money still owed", async () => {
        const charge = await draftAndPost(AGR.chen, 90_000, "Tuition — agency funded", -5);
        expect(charge.amount_cents).toBe(90_000);
    }, 180_000);

    /*
     * Okafor's receipt is deliberately never applied. "Unapplied payments" is one of the workspace's
     * shipped KPIs and one of its Needs-a-Decision rows, and neither can be demonstrated by an
     * account where every receipt found a charge.
     */
    it("Okafor has money received and not yet applied to anything", async () => {
        await draftAndPost(AGR.okafor, 76_000, "Tuition — current month", -5);
        const payment = await recordChildcarePayment(supabase, {
            orgId: ORG,
            billableSourceType: "enrollment_agreement",
            billableSourceId: AGR.okafor,
            customerId: HH.okafor,
            amountCents: 40_000,
            paymentMethod: "check",
            actorUserId: ACTOR,
        } as never);
        const unapplied = await readPaymentUnappliedCents(supabase, ORG, payment.payment.id, 40_000);
        expect(unapplied, "the whole receipt is still unapplied").toBe(40_000);
    }, 180_000);

    /*
     * A draft nobody has posted. "Charges awaiting posting" is a shipped KPI and the Charges
     * section's first cohort; both are empty in a tenant where every charge is already posted.
     */
    it("leaves a draft charge awaiting posting", async () => {
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGR.chen,
            chargeCategory: "tuition",
            amountCents: 90_000,
            serviceDate: ymd(25),
            description: "Tuition — next month (awaiting posting)",
            actorUserId: ACTOR,
        });
        expect(draft.status).toBe("draft");
    }, 180_000);

    /** The seed is worthless if it half-succeeded, so it says out loud what it produced. */
    it("leaves a tenant with several accounts carrying money", async () => {
        const { data: charges } = await supabase
            .from("charges")
            .select("billable_source_id, status")
            .eq("org_id", ORG)
            .eq("billable_source_type", "enrollment_agreement")
            .in("billable_source_id", Object.values(AGR));
        const rows = (charges ?? []) as Array<{ billable_source_id: string; status: string }>;
        const accounts = new Set(rows.map((r) => r.billable_source_id));
        expect(accounts.size, "more than one account carries money").toBeGreaterThanOrEqual(4);
        expect(rows.filter((r) => r.status === "posted").length).toBeGreaterThanOrEqual(4);
        expect(rows.filter((r) => r.status === "draft").length).toBeGreaterThanOrEqual(1);
    }, 180_000);
});
