/**
 * THE ENROLLMENT FEE REQUIREMENT, AGAINST THE REAL DATABASE.
 *
 * The projection's arithmetic is covered by pure tests. What those cannot answer is whether the
 * figures a family is shown are the figures Postgres holds after money actually moves — the class of
 * question a mock has never once answered correctly on this platform.
 *
 * Certified here, over rows this file records through the canonical payment service:
 *   A  no fee configured — NOT_APPLICABLE, and not one query issued against Financials
 *   F  a partial payment leaves an exact residual and reads PARTIALLY_SATISFIED; the rest settles it
 *
 * The other cases (grain, idempotent replay, correction, an invalid definition, security) are
 * certified over HTTP against the running app, because they are behaviours of the route rather than
 * of the read model.
 *
 * Skipped unless the cert stack is configured. Bring it up with
 *   alloy-stack use && certification/alloy-certify env
 * Fixture: certification/fixtures/financials-charge-spine.sql
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { recordAndApplyChildcarePayment } from "@/lib/financials/childcarePaymentService";
import { readEnrollmentFeeProjection } from "@/lib/enrollment/financial/readEnrollmentFeeProjection";
import { parseStageRequirementsV1 } from "@/lib/lifecycle/stageRequirementsV1";

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
const ORG = "00000000-0000-4000-8000-000000000001";
const HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
const CHILD = "fc500000-0000-4000-8000-0000000d0001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);

/** Unique per run, so one run's charge is never mistaken for a replay of the last. */
const RUN = Date.now();
const TEMPLATE_KEY = `cert_enrollment_fee_${RUN}`;

const writtenPayments: string[] = [];

/** One financial requirement, parsed through the canonical parser rather than hand-shaped. */
function feeRequirements(templateKey: string) {
    const section = parseStageRequirementsV1({
        version: 1,
        requirements: [
            {
                requirement_id: `fee_${templateKey}`,
                kind: "financial",
                charge_template_key: templateKey,
                level: "required",
                scope: "each_child",
                timing: "stage_exit",
                enforcement: "blocking",
            },
        ],
    });
    return section?.requirements ?? [];
}

async function postedFeeCharge(supabase: SupabaseClient, amountCents: number): Promise<string> {
    const { data: draft, error } = await supabase
        .from("charges")
        .insert({
            org_id: ORG,
            job_id: null,
            billable_source_type: "enrollment_agreement",
            billable_source_id: AGREEMENT,
            charge_type: "fee",
            charge_category: "fee",
            status: "draft",
            currency_code: "USD",
            amount_cents: amountCents,
            service_date: TODAY,
            occurs_on: TODAY,
            billable_on: TODAY,
            description: "enrollment fee certification",
            // The stamp the read model finds an existing obligation by — the same key
            // `writeTemplateDraftCharge` writes when the route mints one.
            metadata: { charge_template_key: TEMPLATE_KEY },
            created_by: ACTOR,
            updated_by: ACTOR,
        })
        .select("id")
        .single();
    if (error) throw new Error(error.message);
    const id = (draft as { id: string }).id;
    const { error: postError } = await supabase
        .from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id)
        .eq("status", "draft");
    if (postError) throw new Error(postError.message);
    return id;
}

function readProjection(supabase: SupabaseClient, templateKey: string, due = true) {
    return readEnrollmentFeeProjection(supabase, {
        orgId: ORG,
        customerId: HOUSEHOLD,
        enrollingChildren: [{ customerMemberId: CHILD, agreementId: AGREEMENT }],
        requirements: feeRequirements(templateKey),
        due,
    });
}

describe.skipIf(!env)("the enrollment fee requirement — live, against the certification database", () => {
    const supabase = env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null;

    /*
     * A posted childcare payment refuses DELETE, so this cannot tidy up — and asserting the refusal
     * turns that into evidence rather than untidiness. The same reasoning, and the same reclaim path
     * (the charge-spine fixture), as the payment-application certification.
     */
    afterAll(async () => {
        if (!supabase || writtenPayments.length === 0) return;
        const attempted = await supabase.from("payments").delete().in("id", writtenPayments);
        expect(
            attempted.error?.message ?? "",
            "a posted childcare payment must refuse DELETE, including this test's own rows",
        ).toMatch(/is immutable/);
    });

    it("A — a stage with no fee is NOT_APPLICABLE, and asks Financials nothing", async () => {
        if (!supabase) return;
        let queries = 0;
        const counted = new Proxy(supabase, {
            get(target, prop, receiver) {
                if (prop === "from") {
                    return (table: string) => {
                        queries += 1;
                        return (target as unknown as { from: (t: string) => unknown }).from(table);
                    };
                }
                return Reflect.get(target, prop, receiver);
            },
        }) as SupabaseClient;

        const out = await readEnrollmentFeeProjection(counted, {
            orgId: ORG,
            customerId: HOUSEHOLD,
            enrollingChildren: [{ customerMemberId: CHILD, agreementId: AGREEMENT }],
            requirements: [],
            due: true,
        });

        expect(out.state).toBe("NOT_APPLICABLE");
        expect(out.obligations).toEqual([]);
        expect(out.amounts.grossCents).toBe(0);
        // A fee nobody configured must not cost a database round trip, let alone report a figure.
        expect(queries, "no fee configured must read nothing from Financials").toBe(0);
    });

    it("F — a partial payment leaves an exact residual, and the rest satisfies the fee", async () => {
        if (!supabase) return;
        const chargeId = await postedFeeCharge(supabase, 7500);

        const owed = await readProjection(supabase, TEMPLATE_KEY);
        expect(owed.state).toBe("DUE");
        expect(owed.obligations).toHaveLength(1);
        expect(owed.obligations[0].position?.chargeId).toBe(chargeId);
        expect(owed.amounts.grossCents).toBe(7500);
        expect(owed.amounts.appliedCents).toBe(0);
        expect(owed.amounts.outstandingCents).toBe(7500);

        const first = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG,
            chargeId,
            amountCents: 3000,
            paymentMethod: "check",
            receivedAt: TODAY,
            actorUserId: ACTOR,
            idempotencyKey: `cert-fee-${RUN}-partial`,
        });
        writtenPayments.push(first.payment.id);

        const partial = await readProjection(supabase, TEMPLATE_KEY);
        expect(partial.state).toBe("PARTIALLY_SATISFIED");
        expect(partial.amounts.appliedCents).toBe(3000);
        expect(partial.amounts.outstandingCents).toBe(4500);
        expect(partial.explanation).toContain("30.00");

        const second = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG,
            chargeId,
            amountCents: 4500,
            paymentMethod: "check",
            receivedAt: TODAY,
            actorUserId: ACTOR,
            idempotencyKey: `cert-fee-${RUN}-settle`,
        });
        writtenPayments.push(second.payment.id);

        const settled = await readProjection(supabase, TEMPLATE_KEY);
        expect(settled.state).toBe("SATISFIED");
        expect(settled.amounts.appliedCents).toBe(7500);
        expect(settled.amounts.outstandingCents).toBe(0);
        expect(settled.amounts.collectibleNowCents).toBe(0);
        // The first payment is still there — settling is not a rewrite of what came before.
        expect(settled.obligations[0].position?.chargeId).toBe(chargeId);
    });

    it("F2 — a fee that is configured but not yet due does not ask for money", async () => {
        if (!supabase) return;
        const notDue = await readProjection(supabase, `${TEMPLATE_KEY}_absent`, false);
        expect(notDue.state).toBe("NOT_DUE");
        expect(notDue.amounts.collectibleNowCents).toBe(0);
    });
});
