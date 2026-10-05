/**
 * S5 — PROSPECTIVE POST-CLOSE CORRECTIONS, against a real database.
 *
 * The Director's example, exactly: November finalizes at $1,075, November closes, and December
 * receives a correction that references November without touching it. Both truths hold at once —
 * the source belongs to a closed period, the correction belongs to an open one.
 *
 * Not mocked, because every claim here is a claim about the interaction of the binder, the
 * reduction authority, two triggers and the close guards. A fake client would agree with whatever
 * the code handed it, and the thing most worth catching is a correction that silently lands in the
 * source's period instead of its own.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createChildcareDraftCharge, postChildcareCharge } from "@/lib/financials/childcareChargeService";
import { applyPaymentToCharge, readChargeBalance, recordChildcarePayment } from "@/lib/financials/childcarePaymentService";
import { applyManualReduction, reverseManualReduction } from "@/lib/financials/reductions/manualReductionService";
import { closeBillingPeriod } from "@/lib/financials/billingPeriods/closeBillingPeriod";
import { resolveChargeBillingPeriodBinding } from "@/lib/financials/billingPeriods/bindChargeBillingPeriod";
import {
    correctionDirectionSentence,
    previewProspectiveCorrection,
    resolveProspectiveCorrection,
} from "@/lib/financials/corrections/prospectiveCorrection";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";

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

/** Run-unique: posted charges are immutable, so cleanup cannot remove them. */
const RUN = randomUUID().slice(0, 8);

type Household = {
    customer: string; member: string; person: string; agreement: string; location: string; policy: string;
};

function ids(tag: string): Household {
    const p = `fd3${tag}${RUN.slice(0, 4)}-0000-4000-8000-`;
    return {
        customer: `${p}0000000c0001`,
        member: `${p}0000000d0001`,
        person: `${p}0000000e0001`,
        agreement: `${p}0000000a0001`,
        location: `${p}0000000b0001`,
        policy: `${p}0000000f0001`,
    };
}

const MONTHLY = ids("0");
const WEEKLY = ids("1");
/* The 50b19065 topology, reproduced synthetically: two locations, no account calendar. */
const AMBIGUOUS = ids("2");

describeLive("S5 — a correction belongs to its own period, its source to history", () => {
    let db: SupabaseClient;
    let novemberId: string;
    let decemberId: string;
    let novemberTuitionId: string;
    let novemberFeeId: string;

    async function seedHousehold(h: Household, cadence: string, anchorOn: string | null, label: string) {
        const seed = async (table: string, row: Record<string, unknown>) => {
            const { error } = await db.from(table).upsert(row);
            expect(error, `seeding ${table}: ${error?.message ?? ""}`).toBeNull();
        };
        await seed("customers", { id: h.customer, org_id: ORG, name: `${label} ${RUN}`, customer_type: "household" });
        await seed("locations", {
            id: h.location, org_id: ORG, customer_id: h.customer, label: `${label} site ${RUN}`,
            location_type: "site", is_active: true,
        });
        await seed("persons", { id: h.person, org_id: ORG, first_name: label, last_name: "Proof" });
        await seed("customer_members", {
            id: h.member, org_id: ORG, customer_id: h.customer, person_id: h.person,
            display_name: `${label} Proof`, relationship: "child", is_active: true,
        });
        await seed("child_enrollment_agreements", {
            id: h.agreement, org_id: ORG, customer_id: h.customer, customer_member_id: h.member,
            person_id: h.person, site_location_id: h.location, status: "active", start_date: "2026-01-01",
        });
        await seed("financial_policies", {
            id: h.policy, org_id: ORG, scope_type: "customer", customer_id: h.customer, location_id: null,
            policy_type: "billing_calendar", is_active: true,
            effective_start: "2026-01-01", effective_end: null,
            value: { cadence, anchor_on: anchorOn },
        });
    }

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        await seedHousehold(MONTHLY, "monthly", null, "S5 monthly");
        await seedHousehold(WEEKLY, "weekly", "2026-01-05", "S5 weekly");

        novemberId = (await resolveChargeBillingPeriodBinding(db, {
            orgId: ORG, billableSourceType: "enrollment_agreement",
            billableSourceId: MONTHLY.agreement, placementDate: "2026-11-01",
        })).billing_period_id!;
        decemberId = (await resolveChargeBillingPeriodBinding(db, {
            orgId: ORG, billableSourceType: "enrollment_agreement",
            billableSourceId: MONTHLY.agreement, placementDate: "2026-12-01",
        })).billing_period_id!;
        expect(novemberId).toBeTruthy();
        expect(decemberId).not.toBe(novemberId);

        /* November's economics: $1,000 tuition + $75 fee = $1,075, both posted while it is open. */
        const tuition = await createChildcareDraftCharge(db, {
            orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, chargeCategory: "tuition",
            chargeType: "service", amountCents: 100_000, currencyCode: "USD", serviceDate: "2026-11-01",
            description: "November tuition", actorUserId: ACTOR, metadata: { source: "s5_proof" },
        } as never);
        novemberTuitionId = (tuition as { id: string }).id;
        await postChildcareCharge(db, { orgId: ORG, chargeId: novemberTuitionId, actorUserId: ACTOR });

        const fee = await createChildcareDraftCharge(db, {
            orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, chargeCategory: "late_pickup",
            chargeType: "fee", amountCents: 7_500, currencyCode: "USD", serviceDate: "2026-11-20",
            description: "November late pickup", actorUserId: ACTOR, metadata: { source: "s5_proof" },
        } as never);
        novemberFeeId = (fee as { id: string }).id;
        await postChildcareCharge(db, { orgId: ORG, chargeId: novemberFeeId, actorUserId: ACTOR });

        expect(await periodEconomics(db, novemberId)).toBe(107_500);

        /* And November closes. Everything after this is post-finalization. */
        const closed = await closeBillingPeriod(db, {
            orgId: ORG, billingPeriodId: novemberId, closeActor: "operator",
            actorUserId: ACTOR, todayYmd: "2026-12-01",
        });
        expect(closed.transitioned).toBe(true);
    });

    afterAll(async () => {
        for (const h of [MONTHLY, WEEKLY, AMBIGUOUS, ids("3")]) {
            await db.from("financial_reduction_applications").delete().eq("org_id", ORG).eq("customer_id", h.customer);
            await db.from("charges").delete().eq("org_id", ORG).eq("billable_source_id", h.agreement).eq("status", "draft");
        }
    });

    it("PREVIEW answers in business language, and names both periods", async () => {
        const preview = await previewProspectiveCorrection(db, {
            orgId: ORG,
            enrollmentAgreementId: MONTHLY.agreement,
            customerId: MONTHLY.customer,
            amountCents: -2_500,
            effectiveDate: "2026-12-05",
            sourceChargeId: novemberFeeId,
        });

        /* Direction is stated, never left as a sign for the operator to decode. */
        expect(preview.summary).toBe("Reduces what the family owes by $25.00");
        const text = preview.changes.join(" | ");
        expect(text).toContain("November late pickup");
        expect(text).toContain("2026-11");
        /*
         * ── THE WORDING CHANGED DELIBERATELY IN THE ADJUSTMENT UX SLICE ───────────────────────
         *
         * This asserted "which is closed and stays unchanged", appended to "That charge belongs to
         * 2026-11". §8 asks for the stronger pair: the finalized period is named AS finalized and
         * said to be unchanged, and the destination says "Recorded in" rather than "Applies to" —
         * because "applies to" reads like the correction reaching into that period.
         */
        expect(text).toContain("2026-11 is finalized, and nothing in it changes");
        expect(text).toContain("Recorded in 2026-12");

        /* The resolution is explicit about the two truths. */
        expect(preview.resolution.destination.periodKey).toBe("2026-12");
        expect(preview.resolution.destination.billingPeriodId).toBe(decemberId);
        expect(preview.resolution.destination.status).toBe("open");
        expect(preview.resolution.source?.billingPeriodId).toBe(novemberId);
        expect(preview.resolution.sourceIsFinalized).toBe(true);

        /* And it wrote nothing. */
        expect(await periodEconomics(db, novemberId)).toBe(107_500);
        expect(await chargeCount(db, decemberId)).toBe(0);
    });

    it("NEGATIVE correction: −$25 into December, referencing a CLOSED November", async () => {
        const result = await applyManualReduction(db, {
            orgId: ORG,
            enrollmentAgreementId: MONTHLY.agreement,
            customerId: MONTHLY.customer,
            customerMemberId: MONTHLY.member,
            chargeCategory: "credit",
            amountCents: -2_500,
            currencyCode: "USD",
            reason: "November late pickup was overstated by $25",
            effectiveDate: "2026-12-05",
            sourceChargeId: novemberFeeId,
            actorUserId: ACTOR,
            idempotencyKey: `s5-${RUN}-negative`,
        });
        expect(result.amountCents).toBe(-2_500);

        /* NOVEMBER IS UNCHANGED — the whole point. */
        expect(await periodEconomics(db, novemberId)).toBe(107_500);
        const source = await readCharge(db, novemberFeeId);
        expect(source.amount_cents).toBe(7_500);
        expect(source.status).toBe("posted");
        expect(source.billing_period_id).toBe(novemberId);
        expect((await readPeriod(db, novemberId)).status).toBe("closed");

        /* DECEMBER CARRIES IT, and the application names November as provenance. */
        const app = await readApplication(db, `s5-${RUN}-negative`);
        expect(app.source_charge_id).toBe(novemberFeeId);
        expect(app.billing_period_id).toBe(decemberId);
        expect(app.billing_period_generation).toBe("canonical");
        expect(await periodEconomics(db, decemberId)).toBe(-2_500);

        /* BOTH TRUTHS AT ONCE, stated as the inequality that matters. */
        expect(app.billing_period_id).not.toBe(source.billing_period_id);
    });

    it("POSITIVE correction: +$25 into December — S5 is correction, not only crediting", async () => {
        const result = await applyManualReduction(db, {
            orgId: ORG,
            enrollmentAgreementId: MONTHLY.agreement,
            customerId: MONTHLY.customer,
            customerMemberId: MONTHLY.member,
            chargeCategory: "adjustment",
            amountCents: 2_500,
            currencyCode: "USD",
            reason: "November late pickup was understated by $25",
            effectiveDate: "2026-12-06",
            sourceChargeId: novemberTuitionId,
            actorUserId: ACTOR,
            idempotencyKey: `s5-${RUN}-positive`,
        });
        expect(result.amountCents).toBe(2_500);

        expect(await periodEconomics(db, novemberId)).toBe(107_500);
        expect((await readPeriod(db, novemberId)).status).toBe("closed");

        const app = await readApplication(db, `s5-${RUN}-positive`);
        expect(app.source_charge_id).toBe(novemberTuitionId);
        expect(app.billing_period_id).toBe(decemberId);
        expect(app.amount_cents).toBe(2_500);

        /* December now carries −25 and +25 together: the family owes $25 more than the credit alone. */
        expect(await periodEconomics(db, decemberId)).toBe(0);

        expect(correctionDirectionSentence(2_500)).toBe("Increases what the family owes by $25.00");
    });

    it("REFUSES a correction whose own destination period is CLOSED — and names it", async () => {
        /* Not "hop forward to the next open period". The operator chooses the effective date. */
        await expect(
            resolveProspectiveCorrection(db, {
                orgId: ORG,
                enrollmentAgreementId: MONTHLY.agreement,
                customerId: MONTHLY.customer,
                amountCents: -1_000,
                effectiveDate: "2026-11-15",
                sourceChargeId: novemberFeeId,
            }),
        ).rejects.toThrow(/2026-11.*is closed/);

        await expect(
            applyManualReduction(db, {
                orgId: ORG,
                enrollmentAgreementId: MONTHLY.agreement,
                customerId: MONTHLY.customer,
                customerMemberId: MONTHLY.member,
                chargeCategory: "credit",
                amountCents: -1_000,
                currencyCode: "USD",
                reason: "an ordinary reduction into a finalized period",
                effectiveDate: "2026-11-15",
                sourceChargeId: novemberFeeId,
                actorUserId: ACTOR,
                idempotencyKey: `s5-${RUN}-into-closed`,
            }),
        ).rejects.toThrow(/closed/);

        /* S3/S4 finality is not weakened: no new November economics, no escape hatch. */
        expect(await periodEconomics(db, novemberId)).toBe(107_500);
        expect(await chargeCount(db, novemberId)).toBe(2);
    });

    it("PREVIEW and EXECUTE agree on the refusal, not just on the happy path", async () => {
        /*
         * The failure this prevents: an operator previews successfully, commits, and is refused.
         * Both sides resolve through the same calendar authority and the same closed-period rule.
         */
        let previewError: unknown = null;
        try {
            await previewProspectiveCorrection(db, {
                orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
                amountCents: -1_000, effectiveDate: "2026-11-15", sourceChargeId: novemberFeeId,
            });
        } catch (e) { previewError = e; }
        expect(previewError).not.toBeNull();
        expect(String((previewError as Error).message)).toContain("closed");
    });

    it("IDEMPOTENT: the same correction submitted twice is one economic consequence", async () => {
        const before = await periodEconomics(db, decemberId);
        const again = await applyManualReduction(db, {
            orgId: ORG,
            enrollmentAgreementId: MONTHLY.agreement,
            customerId: MONTHLY.customer,
            customerMemberId: MONTHLY.member,
            chargeCategory: "credit",
            amountCents: -2_500,
            currencyCode: "USD",
            reason: "November late pickup was overstated by $25",
            effectiveDate: "2026-12-05",
            sourceChargeId: novemberFeeId,
            actorUserId: ACTOR,
            idempotencyKey: `s5-${RUN}-negative`,
        });
        expect(again.idempotent).toBe(true);
        expect(await periodEconomics(db, decemberId)).toBe(before);

        const { data } = await db
            .from("financial_reduction_applications")
            .select("id")
            .eq("org_id", ORG)
            .eq("idempotency_key", `s5-${RUN}-negative`);
        expect(data ?? []).toHaveLength(1);
    });

    it("PAYMENT IS NOT REWRITTEN: a fully paid November source still corrects into December", async () => {
        /* Pay November's tuition in full, as history would have. */
        const payment = await recordChildcarePayment(db, {
            orgId: ORG, billableSourceType: "enrollment_agreement", billableSourceId: MONTHLY.agreement,
            customerId: MONTHLY.customer, amountCents: 100_000, currency: "USD",
            paymentMethod: "check", status: "posted", actorUserId: ACTOR,
        } as never);
        await applyPaymentToCharge(db, {
            orgId: ORG, paymentId: payment.payment.id, chargeId: novemberTuitionId, actorUserId: ACTOR,
        });
        expect((await readChargeBalance(db, ORG, novemberTuitionId)).outstandingCents).toBe(0);

        await applyManualReduction(db, {
            orgId: ORG,
            enrollmentAgreementId: MONTHLY.agreement,
            customerId: MONTHLY.customer,
            customerMemberId: MONTHLY.member,
            chargeCategory: "credit",
            amountCents: -1_500,
            currencyCode: "USD",
            reason: "overcharged on a fully paid November tuition",
            effectiveDate: "2026-12-07",
            sourceChargeId: novemberTuitionId,
            actorUserId: ACTOR,
            idempotencyKey: `s5-${RUN}-paid-source`,
        });

        /* The November payment is untouched — not reversed to make the correction fit. */
        const { data: paymentRow } = await db
            .from("payments").select("id, amount_cents, status")
            .eq("org_id", ORG).eq("id", payment.payment.id).maybeSingle();
        expect((paymentRow as { status: string }).status).toBe("posted");
        expect((paymentRow as { amount_cents: number }).amount_cents).toBe(100_000);
        expect((await readChargeBalance(db, ORG, novemberTuitionId)).outstandingCents).toBe(0);
        expect(await periodEconomics(db, novemberId)).toBe(107_500);

        /* And the correction landed in December. */
        const app = await readApplication(db, `s5-${RUN}-paid-source`);
        expect(app.billing_period_id).toBe(decemberId);
    });

    it("AUTOPAY sees only current collectible truth — it is never told about November", async () => {
        /*
         * The positive December correction creates a contra charge of its own. Whether Autopay
         * collects it is decided by ordinary collectible rules, with no S5-specific arithmetic:
         * the correction's charge is an ordinary childcare charge on the same spine.
         */
        const app = await readApplication(db, `s5-${RUN}-positive`);
        const position = await resolveFamilyCollectible(db, { orgId: ORG, chargeId: app.charge_id });
        expect(position.chargeId).toBe(app.charge_id);
        /* A real position, computed by the canonical resolver rather than by anything S5 added. */
        expect(typeof position.currentlyCollectibleCents).toBe("number");
    });

    it("LEGACY SOURCE: corrects a legacy charge without inventing a historical canonical period", async () => {
        /*
         * MOST HISTORY IS LEGACY — 8,967 legacy charges against 143 canonical ones on deployed — so
         * a correction authority that could only reference canonical sources would be unable to
         * correct almost everything that exists.
         *
         * A legacy charge carries `legacy_billing_period_key` and NO `billing_period_id`. The
         * census showed all 40 deployed applications-with-a-source already point at exactly this
         * shape, so the lineage supports it today; this binds that it keeps working, and that the
         * correction itself is still canonical.
         */
        const legacySource = {
            id: randomUUID(),
            org_id: ORG,
            billable_source_type: "enrollment_agreement",
            billable_source_id: MONTHLY.agreement,
            charge_type: "service",
            charge_category: "tuition",
            status: "posted",
            currency_code: "USD",
            amount_cents: 50_000,
            service_date: "2026-08-01",
            description: "August tuition, billed before canonical periods existed",
            metadata: { source: "s5_legacy_proof" },
            /* The legacy shape: a key, no period row. */
            billing_period_generation: "legacy",
            legacy_billing_period_key: "2026-08",
            billing_period_id: null,
            posted_at: new Date().toISOString(),
            created_by: ACTOR,
            updated_by: ACTOR,
            updated_at: new Date().toISOString(),
        };
        const { error: seedError } = await db.from("charges").insert(legacySource);
        expect(seedError, `seeding the legacy source: ${seedError?.message ?? ""}`).toBeNull();

        const preview = await previewProspectiveCorrection(db, {
            orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
            amountCents: -3_000, effectiveDate: "2026-12-08", sourceChargeId: legacySource.id,
        });

        /* Provenance reads the legacy KEY, and reports no status because there is no period row. */
        expect(preview.resolution.source?.generation).toBe("legacy");
        expect(preview.resolution.source?.periodLabel).toBe("2026-08");
        expect(preview.resolution.source?.billingPeriodId).toBeNull();
        expect(preview.resolution.source?.periodStatus).toBeNull();
        expect(preview.resolution.sourceIsFinalized).toBe(false);
        /* And the correction is CANONICAL regardless of its source's generation. */
        expect(preview.resolution.destination.periodKey).toBe("2026-12");
        expect(preview.resolution.destination.billingPeriodId).toBe(decemberId);

        await applyManualReduction(db, {
            orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
            customerMemberId: MONTHLY.member, chargeCategory: "credit", amountCents: -3_000,
            currencyCode: "USD", reason: "August was overstated", effectiveDate: "2026-12-08",
            sourceChargeId: legacySource.id, actorUserId: ACTOR,
            idempotencyKey: `s5-${RUN}-legacy-source`,
        });

        const app = await readApplication(db, `s5-${RUN}-legacy-source`);
        expect(app.source_charge_id).toBe(legacySource.id);
        expect(app.billing_period_id).toBe(decemberId);
        expect(app.billing_period_generation).toBe("canonical");

        /* NO canonical period was invented for August. */
        const { data: august } = await db
            .from("financial_billing_periods").select("id")
            .eq("org_id", ORG).eq("customer_id", MONTHLY.customer).eq("period_key", "2026-08");
        expect(august ?? []).toHaveLength(0);

        /* And the legacy source itself is untouched. */
        const after = await readCharge(db, legacySource.id);
        expect(after.amount_cents).toBe(50_000);
        expect(after.billing_period_generation).toBe("legacy");
        expect(after.billing_period_id).toBeNull();
    });

    it("§29 — an UNCONFIGURED multi-location household REFUSES a correction, in business language", async () => {
        /*
         * Customer 50b19065 on deployed is multi-location with no account calendar, and the
         * Director left it deliberately unconfigured: period-bound economics must refuse until an
         * authorised operator chooses its calendar. That customer is NOT touched here — this
         * reproduces its topology on a synthetic household, which is the same proof without
         * mutating a household that is itself a standing decision.
         */
        const second = `${AMBIGUOUS.location.slice(0, -1)}2`;
        const secondAgreement = `${AMBIGUOUS.agreement.slice(0, -1)}2`;
        const seed = async (table: string, row: Record<string, unknown>) => {
            const { error } = await db.from(table).upsert(row);
            expect(error, `seeding ${table}: ${error?.message ?? ""}`).toBeNull();
        };
        await seed("customers", {
            id: AMBIGUOUS.customer, org_id: ORG, name: `S5 ambiguous ${RUN}`, customer_type: "household",
        });
        for (const [locId, label] of [[AMBIGUOUS.location, "A"], [second, "B"]] as const) {
            await seed("locations", {
                id: locId, org_id: ORG, customer_id: AMBIGUOUS.customer,
                label: `S5 ambiguous site ${label} ${RUN}`, location_type: "site", is_active: true,
            });
        }
        await seed("persons", { id: AMBIGUOUS.person, org_id: ORG, first_name: "S5", last_name: "Ambiguous" });
        await seed("customer_members", {
            id: AMBIGUOUS.member, org_id: ORG, customer_id: AMBIGUOUS.customer, person_id: AMBIGUOUS.person,
            display_name: "S5 Ambiguous", relationship: "child", is_active: true,
        });
        /* Two ACTIVE agreements at two different locations, and NO customer calendar policy. */
        await seed("child_enrollment_agreements", {
            id: AMBIGUOUS.agreement, org_id: ORG, customer_id: AMBIGUOUS.customer,
            customer_member_id: AMBIGUOUS.member, person_id: AMBIGUOUS.person,
            site_location_id: AMBIGUOUS.location, status: "active", start_date: "2026-01-01",
        });
        await seed("child_enrollment_agreements", {
            id: secondAgreement, org_id: ORG, customer_id: AMBIGUOUS.customer,
            customer_member_id: AMBIGUOUS.member, person_id: AMBIGUOUS.person,
            site_location_id: second, status: "active", start_date: "2026-01-01",
        });

        let thrown: unknown = null;
        try {
            await resolveProspectiveCorrection(db, {
                orgId: ORG, enrollmentAgreementId: AMBIGUOUS.agreement,
                customerId: AMBIGUOUS.customer, amountCents: -1_000, effectiveDate: "2026-12-10",
            });
        } catch (e) { thrown = e; }

        expect(thrown, "an unconfigured household must refuse").not.toBeNull();
        const message = String((thrown as Error).message);
        /* Operator-resolvable language, naming what to do — not internal vocabulary. */
        expect(message).toMatch(/billing calendar/i);
        expect(message.toLowerCase()).not.toContain("internal");
        expect(message.toLowerCase()).not.toContain("constraint");
        expect(message.toLowerCase()).not.toContain("pgrst");
        /* And the canonical code, so the route boundary answers 409 rather than 500. */
        expect((thrown as { code?: string }).code).toBe("billing_calendar_ambiguous");

        /* Nothing was created for the household the refusal protects. */
        const { data: periods } = await db
            .from("financial_billing_periods").select("id")
            .eq("org_id", ORG).eq("customer_id", AMBIGUOUS.customer);
        expect(periods ?? []).toHaveLength(0);
    });

    it("§29 — a LEGACY MONTHLY source corrects into a BIWEEKLY canonical period", async () => {
        /*
         * The 29944d3e topology: legacy monthly history, explicit biweekly canonical future. It is
         * the sharpest statement of source-vs-economic-period independence, because the two truths
         * do not even share a CADENCE — a monthly key on one side, a biweekly period id on the
         * other. Proven on a synthetic household; 29944d3e itself is untouched.
         */
        const BIWEEKLY = ids("3");
        const seed = async (table: string, row: Record<string, unknown>) => {
            const { error } = await db.from(table).upsert(row);
            expect(error, `seeding ${table}: ${error?.message ?? ""}`).toBeNull();
        };
        await seed("customers", { id: BIWEEKLY.customer, org_id: ORG, name: `S5 biweekly ${RUN}`, customer_type: "household" });
        await seed("locations", {
            id: BIWEEKLY.location, org_id: ORG, customer_id: BIWEEKLY.customer,
            label: `S5 biweekly site ${RUN}`, location_type: "site", is_active: true,
        });
        await seed("persons", { id: BIWEEKLY.person, org_id: ORG, first_name: "S5", last_name: "Biweekly" });
        await seed("customer_members", {
            id: BIWEEKLY.member, org_id: ORG, customer_id: BIWEEKLY.customer, person_id: BIWEEKLY.person,
            display_name: "S5 Biweekly", relationship: "child", is_active: true,
        });
        await seed("child_enrollment_agreements", {
            id: BIWEEKLY.agreement, org_id: ORG, customer_id: BIWEEKLY.customer,
            customer_member_id: BIWEEKLY.member, person_id: BIWEEKLY.person,
            site_location_id: BIWEEKLY.location, status: "active", start_date: "2026-01-01",
        });
        await seed("financial_policies", {
            id: BIWEEKLY.policy, org_id: ORG, scope_type: "customer", customer_id: BIWEEKLY.customer,
            location_id: null, policy_type: "billing_calendar", is_active: true,
            effective_start: "2026-01-01", effective_end: null,
            value: { cadence: "biweekly", anchor_on: "2026-01-05" },
        });

        /* LEGACY MONTHLY history: a monthly key, no canonical period row. */
        const legacyMonthly = {
            id: randomUUID(),
            org_id: ORG,
            billable_source_type: "enrollment_agreement",
            billable_source_id: BIWEEKLY.agreement,
            charge_type: "service",
            charge_category: "tuition",
            status: "posted",
            currency_code: "USD",
            amount_cents: 80_000,
            service_date: "2026-07-01",
            description: "July tuition, billed monthly before the account moved to biweekly",
            metadata: { source: "s5_biweekly_proof" },
            billing_period_generation: "legacy",
            legacy_billing_period_key: "2026-07",
            billing_period_id: null,
            posted_at: new Date().toISOString(),
            created_by: ACTOR,
            updated_by: ACTOR,
            updated_at: new Date().toISOString(),
        };
        const { error: legacyError } = await db.from("charges").insert(legacyMonthly);
        expect(legacyError, `seeding the legacy monthly source: ${legacyError?.message ?? ""}`).toBeNull();

        const preview = await previewProspectiveCorrection(db, {
            orgId: ORG, enrollmentAgreementId: BIWEEKLY.agreement, customerId: BIWEEKLY.customer,
            amountCents: -4_000, effectiveDate: "2026-12-10", sourceChargeId: legacyMonthly.id,
        });

        /* SOURCE: a monthly key, legacy, no period row. */
        expect(preview.resolution.source?.generation).toBe("legacy");
        expect(preview.resolution.source?.periodLabel).toBe("2026-07");
        expect(preview.resolution.source?.billingPeriodId).toBeNull();
        /* DESTINATION: a BIWEEKLY canonical period — a different cadence entirely. */
        expect(preview.resolution.destination.periodKey).toMatch(/^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/);
        expect(preview.resolution.destination.status).toBe("open");

        await applyManualReduction(db, {
            orgId: ORG, enrollmentAgreementId: BIWEEKLY.agreement, customerId: BIWEEKLY.customer,
            customerMemberId: BIWEEKLY.member, chargeCategory: "credit", amountCents: -4_000,
            currencyCode: "USD", reason: "July was overstated", effectiveDate: "2026-12-10",
            sourceChargeId: legacyMonthly.id, actorUserId: ACTOR,
            idempotencyKey: `s5-${RUN}-monthly-to-biweekly`,
        });

        const app = await readApplication(db, `s5-${RUN}-monthly-to-biweekly`);
        expect(app.source_charge_id).toBe(legacyMonthly.id);
        expect(app.billing_period_generation).toBe("canonical");
        const landed = await readPeriod(db, app.billing_period_id!);
        expect(landed.period_key).toBe(preview.resolution.destination.periodKey);

        /* The legacy monthly source is untouched, and no canonical July was invented. */
        const after = await readCharge(db, legacyMonthly.id);
        expect(after.amount_cents).toBe(80_000);
        expect(after.billing_period_id).toBeNull();
        const { data: july } = await db
            .from("financial_billing_periods").select("id")
            .eq("org_id", ORG).eq("customer_id", BIWEEKLY.customer).eq("period_key", "2026-07");
        expect(july ?? []).toHaveLength(0);
    });

    it("CROSS-CADENCE: a weekly household corrects into a weekly period, with no YYYY-MM anywhere", async () => {
        const weekOne = (await resolveChargeBillingPeriodBinding(db, {
            orgId: ORG, billableSourceType: "enrollment_agreement",
            billableSourceId: WEEKLY.agreement, placementDate: "2026-11-02",
        })).billing_period_id!;

        const charge = await createChildcareDraftCharge(db, {
            orgId: ORG, enrollmentAgreementId: WEEKLY.agreement, chargeCategory: "tuition",
            chargeType: "service", amountCents: 20_000, currencyCode: "USD", serviceDate: "2026-11-02",
            description: "weekly tuition", actorUserId: ACTOR,
        } as never);
        const weeklySourceId = (charge as { id: string }).id;
        await postChildcareCharge(db, { orgId: ORG, chargeId: weeklySourceId, actorUserId: ACTOR });

        await closeBillingPeriod(db, {
            orgId: ORG, billingPeriodId: weekOne, closeActor: "system", todayYmd: "2026-11-16",
        });

        const preview = await previewProspectiveCorrection(db, {
            orgId: ORG, enrollmentAgreementId: WEEKLY.agreement, customerId: WEEKLY.customer,
            amountCents: -1_000, effectiveDate: "2026-11-16", sourceChargeId: weeklySourceId,
        });

        /* A weekly key, never a month. This is what a YYYY-MM-only parser would get wrong. */
        expect(preview.resolution.destination.periodKey).toMatch(/^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/);
        expect(preview.resolution.destination.periodKey).not.toMatch(/^\d{4}-\d{2}$/);
        expect(preview.resolution.destination.billingPeriodId).not.toBe(weekOne);
        expect(preview.resolution.source?.billingPeriodId).toBe(weekOne);
        expect(preview.resolution.sourceIsFinalized).toBe(true);

        await applyManualReduction(db, {
            orgId: ORG, enrollmentAgreementId: WEEKLY.agreement, customerId: WEEKLY.customer,
            customerMemberId: WEEKLY.member, chargeCategory: "credit", amountCents: -1_000,
            currencyCode: "USD", reason: "weekly overcharge", effectiveDate: "2026-11-16",
            sourceChargeId: weeklySourceId, actorUserId: ACTOR,
            idempotencyKey: `s5-${RUN}-weekly`,
        });

        const app = await readApplication(db, `s5-${RUN}-weekly`);
        expect(app.billing_period_id).not.toBe(weekOne);

        /*
         * PARITY IS ON THE PERIOD, NOT ON AN ID THAT DOES NOT EXIST YET.
         *
         * The preview said `willBeCreated: true` with a null id, which is correct and is the whole
         * reason preview does not write: the destination period had not been materialized. Execute
         * then materialized it. So the claim worth binding is that execute landed in exactly the
         * period preview NAMED — same key, same bounds — rather than in some other one.
         */
        expect(preview.resolution.destination.willBeCreated).toBe(true);
        expect(preview.resolution.destination.billingPeriodId).toBeNull();
        const landed = await readPeriod(db, app.billing_period_id!);
        expect(landed.period_key).toBe(preview.resolution.destination.periodKey);
        expect(landed.status).toBe("open");

        /* The closed weekly source is unchanged. */
        expect(await periodEconomics(db, weekOne)).toBe(20_000);
    });

    /* ══ ADJUSTMENT UX CONVERGENCE ════════════════════════════════════════════════════════════ */

    /**
     * §13. Preview must say who bears the NEW economics, from the canonical responsibility
     * authority — not from the source charge's allocations, which answer a different question and
     * may have been decided by an arrangement since superseded.
     */
    it("RESPONSIBILITY is stated from the canonical arrangement, not copied from the source", async () => {
        const preview = await previewProspectiveCorrection(db, {
            orgId: ORG,
            enrollmentAgreementId: MONTHLY.agreement,
            customerId: MONTHLY.customer,
            customerMemberId: MONTHLY.member,
            amountCents: -1_500,
            effectiveDate: "2026-12-08",
            sourceChargeId: novemberTuitionId,
        });

        /*
         * This household has no arrangement, so the household bears it. That is a TRUE answer and
         * the ordinary one — it must be said out loud rather than left as an empty line, because
         * silence there reads as "responsibility could not be worked out".
         */
        expect(preview.resolution.responsibility.kind).toBe("household");
        expect(preview.resolution.responsibility.parties).toEqual([]);
        expect(preview.changes.join(" | ")).toContain("The household owes this, by the standing arrangement.");

        /* And it still wrote nothing. */
        expect(await periodEconomics(db, novemberId)).toBe(107_500);
    });

    /**
     * §14. An increase is a collectible obligation; a reduction is not.
     *
     * THE DEFECT: the reduction path never called the due-date authority at all, so an increase was
     * written with `due_date: null` even where the organisation had configured terms — while every
     * generated charge carried one.
     */
    it("DUE DATE: an increase resolves one from its OWN dates; a reduction is given none", async () => {
        /* With no due-date policy, "no configured terms" is the truth and must be said out loud. */
        const unconfigured = await previewProspectiveCorrection(db, {
            orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
            amountCents: 2_500, effectiveDate: "2026-12-09", sourceChargeId: novemberFeeId,
        });
        expect(unconfigured.resolution.due.applicable).toBe(true);
        expect(unconfigured.resolution.due.reason).toBe("no_policy");
        expect(unconfigured.resolution.due.dueDate).toBeNull();
        expect(unconfigured.changes.join(" | ")).toContain("No due date");

        /* A REDUCTION IS NOT ASKED THE QUESTION. Nothing is collected, so there is no date to miss. */
        const reduction = await previewProspectiveCorrection(db, {
            orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
            amountCents: -2_500, effectiveDate: "2026-12-09", sourceChargeId: novemberFeeId,
        });
        expect(reduction.resolution.due.applicable).toBe(false);
        expect(reduction.resolution.due.reason).toBe("not_applicable");
        expect(reduction.changes.join(" | ")).not.toContain("due");

        /*
         * ── NOW CONFIGURE TERMS, AND GIVE THE SOURCE A DIFFERENT DUE DATE ────────────────────
         *
         * THIS SEEDING EXISTS BECAUSE THE PLANT COULD NOT OTHERWISE FIRE.
         *
         * The first version of this test asserted "the source's due date was not inherited" as
         * `if (source.due_date) expect(...)` — and the fixture's November fee has no due date,
         * because nothing configured terms and the draft writer resolves none. So the assertion
         * never ran: planting the inheritance defect left this test GREEN. A conditional assertion
         * guarding the only thing it was written to catch is a false green, and the fix is the
         * fixture, not a softer claim.
         *
         * So terms are configured (due 10 days after the invoice date) and a source charge is
         * created carrying a due date that no policy would ever produce for the correction's own
         * dates. An inherited date is then unmistakable.
         */
        /* Same shape as `ids()` above: 8 hex, then the fixed groups. A longer first group is not a uuid. */
        const duePolicyId = `fd3d${RUN.slice(0, 4)}-0000-4000-8000-0000000f0002`;
        const seeded = await db.from("financial_policies").upsert({
            id: duePolicyId, org_id: ORG, scope_type: "customer", customer_id: MONTHLY.customer,
            location_id: null, policy_type: "due_date", is_active: true,
            effective_start: "2026-01-01", effective_end: null,
            value: { strategy: "days_after_invoice", offset_days: 10 },
        });
        expect(seeded.error, seeded.error?.message ?? "").toBeNull();

        try {
            /*
             * THE SOURCE SITS IN THE OPEN PERIOD, not in closed November — the close guard
             * correctly refuses a new charge there, which is S3/S4 working and not an obstacle to
             * route around. Source finality is not what this test is about: §14's prohibition is
             * that the correction must not inherit the SOURCE's due date, whichever period the
             * source lives in. `2026-12-31` is a date no policy here could produce for the
             * correction's own dates, so an inherited one is unmistakable.
             */
            const sourceWithDue = await createChildcareDraftCharge(db, {
                orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, chargeCategory: "late_pickup",
                chargeType: "fee", amountCents: 5_000, currencyCode: "USD", serviceDate: "2026-12-02",
                dueDate: "2026-12-31", description: "December fee with terms",
                actorUserId: ACTOR, metadata: { source: "s5_proof" },
            } as never);
            const sourceWithDueId = (sourceWithDue as { id: string }).id;
            expect((await readCharge(db, sourceWithDueId)).due_date).toBe("2026-12-31");

            const increase = await previewProspectiveCorrection(db, {
                orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
                amountCents: 2_500, effectiveDate: "2026-12-09", sourceChargeId: sourceWithDueId,
            });
            /* Ten days after the CORRECTION's own effective date. */
            expect(increase.resolution.due.reason).toBe("resolved");
            expect(increase.resolution.due.dueDate).toBe("2026-12-19");
            expect(increase.changes.join(" | ")).toContain("Due 2026-12-19");

            /*
             * ── AND THE PREVIEW AGREES WITH WHAT WAS WRITTEN ──────────────────────────────────
             *
             * The only way these cannot drift is that both go through `resolveCorrectionDueDate`.
             */
            const written = await applyManualReduction(db, {
                orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
                customerMemberId: MONTHLY.member, chargeCategory: "adjustment", amountCents: 2_500,
                currencyCode: "USD", reason: "December correction, due-date proof",
                effectiveDate: "2026-12-09", sourceChargeId: sourceWithDueId, actorUserId: ACTOR,
                idempotencyKey: `s5-${RUN}-due`,
            });
            const row = await readCharge(db, written.chargeId);
            expect(row.due_date).toBe(increase.resolution.due.dueDate);
            /* NOT THE SOURCE'S. §14's prohibition, now actually reachable. */
            expect(row.due_date).not.toBe("2026-12-31");

            /* A reduction against the same source, with terms configured, still carries none. */
            const credit = await applyManualReduction(db, {
                orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
                customerMemberId: MONTHLY.member, chargeCategory: "credit", amountCents: -500,
                currencyCode: "USD", reason: "No due date on a credit",
                effectiveDate: "2026-12-09", sourceChargeId: sourceWithDueId, actorUserId: ACTOR,
                idempotencyKey: `s5-${RUN}-due-credit`,
            });
            expect((await readCharge(db, credit.chargeId)).due_date).toBeNull();
        } finally {
            await db.from("financial_policies").delete().eq("org_id", ORG).eq("id", duePolicyId);
        }
    });

    /**
     * §17. Reversing a correction after its period closed must become prospective economics in an
     * open period rather than rewriting history.
     *
     * THE DEFECT: `reverseManualReduction` dated the reversal `today` — correct — and then handed
     * `applyManualReduction` the ORIGINAL's `period_key`. The canonical `billing_period_id` came
     * out right because the S2 binder resolves it from the charge's own date, and the STATED period
     * contradicted it, so every surface reading `period_key` showed the reversal inside closed
     * history.
     */
    it("REVERSAL is prospective: it does not carry the original's period key", async () => {
        const original = await applyManualReduction(db, {
            orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
            customerMemberId: MONTHLY.member, chargeCategory: "credit", amountCents: -3_300,
            currencyCode: "USD", reason: "Correction to be reversed",
            effectiveDate: "2026-12-10", sourceChargeId: novemberTuitionId, actorUserId: ACTOR,
            idempotencyKey: `s5-${RUN}-reversal-original`,
        });

        /*
         * The original is forced to STATE a historical period, which is the shape a correction
         * raised before this repair would have had — and the shape the reversal used to copy.
         */
        const forced = await db
            .from("financial_reduction_applications")
            .update({ period_key: "2026-11" })
            .eq("org_id", ORG)
            .eq("id", original.applicationId);
        expect(forced.error).toBeNull();

        const reversal = await reverseManualReduction(db, {
            orgId: ORG, applicationId: original.applicationId,
            reason: "The correction was itself wrong", actorUserId: ACTOR,
        });

        const reversalApp = await readApplicationById(db, reversal.applicationId);

        /*
         * ── THE REVERSAL'S PERIOD IS TODAY'S, NOT THE ORIGINAL'S AND NOT DECEMBER'S ──────────
         *
         * This assertion first read `toBe(decemberId)` and failed, which was my error and a useful
         * one: `reverseManualReduction` dates the reversal `today` — the real wall-clock day — and
         * not the original's effective date. That is the correct behaviour and it is what §17 asks
         * for: undoing a correction is a decision taken NOW, so its economics belong to the period
         * open now. The fixture's December is a fabricated future period; binding a reversal to it
         * would be back-dating by a different route.
         *
         * So what is bound here is the property rather than a particular period: not November,
         * resolved from the reversal's own date, OPEN, and with the stated key agreeing with the
         * period row it points at — that last agreement being precisely what the defect broke.
         */
        expect(reversalApp.period_key).not.toBe("2026-11");
        expect(reversalApp.billing_period_id).not.toBe(novemberId);
        expect(reversalApp.billing_period_id).toBeTruthy();
        const reversalPeriod = await readPeriod(db, reversalApp.billing_period_id!);
        expect(reversalApp.period_key).toBe(reversalPeriod.period_key);
        expect(reversalPeriod.status).toBe("open");

        /* And it is TODAY's period — the reversal is dated now, by the account's own calendar. */
        const todayYmd = new Date().toISOString().slice(0, 10);
        const todaysBinding = await resolveChargeBillingPeriodBinding(db, {
            orgId: ORG, billableSourceType: "enrollment_agreement",
            billableSourceId: MONTHLY.agreement, placementDate: todayYmd,
        });
        expect(reversalApp.billing_period_id).toBe(todaysBinding.billing_period_id);

        /* NOVEMBER IS STILL UNTOUCHED, and the original row still stands. */
        expect(await periodEconomics(db, novemberId)).toBe(107_500);
        const originalApp = await readApplicationById(db, original.applicationId);
        expect(originalApp.amount_cents).toBe(-3_300);
        expect(originalApp.reversed_by_id).toBe(reversal.applicationId);
        expect(reversalApp.reverses_id).toBe(original.applicationId);
        /* One reversal only. */
        await expect(
            reverseManualReduction(db, {
                orgId: ORG, applicationId: original.applicationId,
                reason: "A second attempt", actorUserId: ACTOR,
            }),
        ).rejects.toThrow(/already been reversed/i);
    });

    /**
     * §11. S5 must not make every adjustment prospective merely because S5 exists. A source and a
     * correction that legitimately belong to the SAME open period stay in it, by the ordinary path.
     */
    it("OPEN PERIOD: a source and correction in the same open period stay there", async () => {
        const decemberCharge = await createChildcareDraftCharge(db, {
            orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, chargeCategory: "late_pickup",
            chargeType: "fee", amountCents: 4_000, currencyCode: "USD", serviceDate: "2026-12-11",
            description: "December late pickup", actorUserId: ACTOR, metadata: { source: "s5_proof" },
        } as never);
        const decemberChargeId = (decemberCharge as { id: string }).id;
        await postChildcareCharge(db, { orgId: ORG, chargeId: decemberChargeId, actorUserId: ACTOR });

        const preview = await previewProspectiveCorrection(db, {
            orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
            amountCents: -1_000, effectiveDate: "2026-12-12", sourceChargeId: decemberChargeId,
        });

        /* The source is NOT finalized, so nothing says anything about finality. */
        expect(preview.resolution.sourceIsFinalized).toBe(false);
        expect(preview.resolution.source?.billingPeriodId).toBe(decemberId);
        expect(preview.resolution.destination.billingPeriodId).toBe(decemberId);
        expect(preview.changes.join(" | ")).not.toContain("finalized");

        const applied = await applyManualReduction(db, {
            orgId: ORG, enrollmentAgreementId: MONTHLY.agreement, customerId: MONTHLY.customer,
            customerMemberId: MONTHLY.member, chargeCategory: "credit", amountCents: -1_000,
            currencyCode: "USD", reason: "December fee was overstated",
            effectiveDate: "2026-12-12", sourceChargeId: decemberChargeId, actorUserId: ACTOR,
            idempotencyKey: `s5-${RUN}-openperiod`,
        });
        const app = await readApplicationById(db, applied.applicationId);
        /* ONE period for both. No hop forward, because there was nothing to hop over. */
        expect(app.billing_period_id).toBe(decemberId);
        expect(app.period_key).toBe("2026-12");
    });
});

/* ── readers ─────────────────────────────────────────────────────────────────────────────────── */

async function readPeriod(db: SupabaseClient, id: string) {
    const { data } = await db
        .from("financial_billing_periods")
        .select("id, status, closed_at, period_key, starts_on, ends_on")
        .eq("id", id).maybeSingle();
    return data as { id: string; status: string; closed_at: string | null; period_key: string };
}

async function readCharge(db: SupabaseClient, id: string) {
    const { data } = await db
        .from("charges")
        /*
         * `due_date` IS NAMED. An explicit select list that omits a column hands back `undefined`,
         * and an assertion written against it can pass for the wrong reason — the §14 proof is
         * exactly a comparison of this column against what the preview said, so a dropped column
         * would turn the strongest claim in that test into a false green.
         */
        .select("id, status, amount_cents, due_date, billing_period_id, billing_period_generation, posted_at")
        .eq("id", id).maybeSingle();
    return data as {
        id: string; status: string; amount_cents: number; due_date: string | null;
        billing_period_id: string | null; billing_period_generation: string; posted_at: string | null;
    };
}

/**
 * One application BY ITS OWN ID.
 *
 * `readApplication` below keys on the idempotency key, which a caller supplies. A reversal's key is
 * composed by the service (`fred:reverse:<id>`), so reconstructing it in a test would be asserting
 * against our own guess at an implementation detail rather than reading the row the service
 * returned.
 */
async function readApplicationById(db: SupabaseClient, id: string) {
    const { data } = await db
        .from("financial_reduction_applications")
        .select("id, charge_id, source_charge_id, amount_cents, billing_period_id, period_key, reason, reverses_id, reversed_by_id")
        .eq("org_id", ORG).eq("id", id).maybeSingle();
    expect(data, `no application ${id}`).not.toBeNull();
    return data as {
        id: string; charge_id: string; source_charge_id: string | null; amount_cents: number;
        billing_period_id: string | null; period_key: string | null; reason: string | null;
        reverses_id: string | null; reversed_by_id: string | null;
    };
}

async function readApplication(db: SupabaseClient, idempotencyKey: string) {
    const { data } = await db
        .from("financial_reduction_applications")
        .select("id, charge_id, source_charge_id, amount_cents, billing_period_id, billing_period_generation, period_key, reason")
        .eq("org_id", ORG).eq("idempotency_key", idempotencyKey).maybeSingle();
    expect(data, `no application for ${idempotencyKey}`).not.toBeNull();
    return data as {
        id: string; charge_id: string; source_charge_id: string | null; amount_cents: number;
        billing_period_id: string | null; billing_period_generation: string; period_key: string | null;
        reason: string | null;
    };
}

/** A period's commercial economics: its posted, non-void charges. */
async function periodEconomics(db: SupabaseClient, periodId: string): Promise<number> {
    const { data } = await db
        .from("charges").select("amount_cents")
        .eq("org_id", ORG).eq("billing_period_id", periodId)
        .eq("status", "posted").is("voided_at", null);
    return (data ?? []).reduce((sum, r) => sum + Number((r as { amount_cents: number }).amount_cents), 0);
}

async function chargeCount(db: SupabaseClient, periodId: string): Promise<number> {
    const { data } = await db.from("charges").select("id").eq("org_id", ORG).eq("billing_period_id", periodId);
    return (data ?? []).length;
}
