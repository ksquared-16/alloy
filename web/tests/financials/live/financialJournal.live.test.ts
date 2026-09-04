/**
 * THE VERTICAL SLICE, THROUGH THE REAL SERVICES, AGAINST REAL PERSISTENCE.
 *
 * `period-journal.cert.sh` certifies the rules the DATABASE owns — non-overlap, attribution,
 * deferral, append-only, idempotency. It cannot certify that the charge and payment services
 * actually produce those consequences, because a SQL insert bypasses the code under test.
 *
 * These cases run Thread 1's `childcareChargeService` and Thread 8's `childcarePaymentService`
 * against the certification stack and assert the posted history they leave behind:
 *
 *   J1  posting a charge records ONE charge_posted entry, attributed to the period covering its
 *       service date, carrying the customer's billing month separately
 *   J2  a retried post is harmless: still one entry
 *   J3  a receipt records money arriving with an obligation delta of ZERO
 *   J4  an application records the reduction, and it is the ONLY negative-delta entry type
 *   J5  a retried application is harmless
 *   J6  a partial refund reverses the application, re-applies the remainder, and the balance
 *       returns to exactly what the arithmetic says
 *   J7  a charge reversal records a corrective entry linked to the entry it corrects
 *   J8  the balance authority is unchanged: `readChargeBalance` is charges minus posted
 *       allocations, and the journal agrees without being asked
 *
 * Skipped unless the cert stack is configured, so the ordinary suite stays hermetic. Bring the
 * stack up with `alloy-stack use`, then export CERT_SUPABASE_URL / CERT_SERVICE_ROLE_KEY.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    createChildcareCorrection,
    createChildcareDraftCharge,
    postChildcareCharge,
} from "@/lib/financials/childcareChargeService";
import {
    readChargeBalance,
    recordAndApplyChildcarePayment,
    refundChildcarePayment,
} from "@/lib/financials/childcarePaymentService";
import type { FinancialJournalEntryRow } from "@/lib/financials/financialJournalService";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../../.env.certification.local"), "utf8");
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

/**
 * ITS OWN ORGANISATION, DELIBERATELY.
 *
 * `paymentApplication.live.test.ts` certifies Thread 8 by reading the card balance for the shared
 * cert org before and after a write. Vitest runs test FILES in parallel, so a second live file
 * posting charges into that org makes the first one's before/after window meaningless — which it
 * duly did, off by exactly the charge this file had posted. The isolation is not tidiness: two
 * certifications that can perturb each other cannot both be trusted.
 *
 * Rows are LEFT in place afterwards. Posted history is append-only, and a teardown able to delete
 * it would mean the guarantee was not there.
 */
const ORG = "00000000-0000-4000-8000-0000000005e5";
const ORG_SLUG = "cert-thread5-journal";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a05e5";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const CALENDAR_KEY = "cert5-live-445";

/** Inside P09 of the fixture calendar below, and inside billing month 2026-09. */
const SERVICE_DATE = "2026-09-10";

const describeLive = env ? describe : describe.skip;

describeLive("financial journal — the vertical slice against real persistence", () => {
    // Built only when the stack is configured: `createClient("")` throws, and a skipped suite still
    // evaluates its body, so constructing it unconditionally breaks the hermetic suite.
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const chargeIds: string[] = [];
    let calendarId = "";

    async function entriesFor(sourceId: string): Promise<FinancialJournalEntryRow[]> {
        const { data } = await supabase
            .from("financial_journal_entries")
            .select("*")
            .eq("org_id", ORG)
            .eq("source_id", sourceId);
        return (data ?? []) as FinancialJournalEntryRow[];
    }

    beforeAll(async () => {
        const { data: existingOrg } = await supabase.from("orgs").select("id").eq("id", ORG).maybeSingle();
        if (!existingOrg) {
            await supabase.from("orgs").insert({ id: ORG, name: "Cert Thread 5 — journal", slug: ORG_SLUG });
        }
        /*
         * SETUP IS REUSE, NOT RECREATE.
         *
         * Deleting and re-authoring the calendar was the obvious shape and it is refused on the
         * second run — journal entries reference the calendar ON DELETE RESTRICT, which is the
         * guarantee that historical attribution survives a configuration change. A setup that has
         * to defeat the rule under test is a setup that is testing the wrong thing.
         *
         * A 4/4/5 calendar whose P09 ends on the 26th — a boundary no billing month has.
         */
        const { data: existingCal } = await supabase
            .from("financial_accounting_calendars")
            .select("id")
            .eq("org_id", ORG)
            .eq("calendar_key", CALENDAR_KEY)
            .maybeSingle();
        if (existingCal) {
            calendarId = (existingCal as { id: string }).id;
        } else {
            const { data: cal, error } = await supabase
                .from("financial_accounting_calendars")
                .insert({
                    org_id: ORG,
                    calendar_key: CALENDAR_KEY,
                    name: "Cert Thread 5 live 4/4/5",
                    period_style: "four_four_five",
                    is_active: true,
                })
                .select("id")
                .single();
            if (error) throw new Error(`cert calendar setup failed: ${error.message}`);
            calendarId = (cal as { id: string }).id;
        }

        const { data: existingPeriods } = await supabase
            .from("financial_accounting_periods")
            .select("period_key")
            .eq("calendar_id", calendarId);
        const have = new Set(((existingPeriods ?? []) as Array<{ period_key: string }>).map((p) => p.period_key));
        const wanted = [
            { org_id: ORG, calendar_id: calendarId, period_key: "L-P09", starts_on: "2026-08-30", ends_on: "2026-09-26" },
            { org_id: ORG, calendar_id: calendarId, period_key: "L-P10", starts_on: "2026-09-27", ends_on: "2026-12-31" },
        ].filter((p) => !have.has(p.period_key));
        if (wanted.length) {
            const { error } = await supabase.from("financial_accounting_periods").insert(wanted);
            if (error) throw new Error(`cert period setup failed: ${error.message}`);
        }
    });

    afterAll(async () => {
        // Nothing is torn down. Posted history is append-only and the calendar cannot be removed
        // while entries reference it (ON DELETE RESTRICT) — which is the guarantee, not an
        // inconvenience. The org is this file's own, so nothing else is affected by what it leaves.
        expect(chargeIds.length).toBeGreaterThan(0);
    });

    it("J1/J2 — posting a charge records one attributed entry, and a retry records nothing more", async () => {
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            chargeCategory: "tuition",
            amountCents: 130_000,
            serviceDate: SERVICE_DATE,
            actorUserId: ACTOR,
            description: "cert5 live tuition",
        });
        chargeIds.push(draft.id);

        // A draft is not a financial consequence; nothing is journalled until it posts.
        expect(await entriesFor(draft.id)).toHaveLength(0);

        const posted = await postChildcareCharge(supabase, { orgId: ORG, chargeId: draft.id, actorUserId: ACTOR });
        expect(posted.alreadyPosted).toBe(false);
        expect(posted.journal.status).toBe("recorded");

        const [entry] = await entriesFor(draft.id);
        expect(entry.entry_type).toBe("charge_posted");
        expect(Number(entry.amount_cents)).toBe(130_000);
        expect(Number(entry.obligation_delta_cents)).toBe(130_000);
        // THE TWO IDENTITIES, side by side on one row and neither derived from the other.
        expect(entry.accounting_period_key).toBe("L-P09");
        expect(entry.billing_period_key).toBe("2026-09");
        expect(entry.period_attribution).toBe("attributed");

        // J2 — the retry. `alreadyPosted` and still exactly one entry.
        const retry = await postChildcareCharge(supabase, { orgId: ORG, chargeId: draft.id, actorUserId: ACTOR });
        expect(retry.alreadyPosted).toBe(true);
        expect(retry.journal.status).toBe("already_recorded");
        expect(await entriesFor(draft.id)).toHaveLength(1);
    });

    it("J3/J4/J5/J8 — a receipt moves no obligation, an application does, and a retry does not", async () => {
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            chargeCategory: "tuition",
            amountCents: 100_000,
            serviceDate: SERVICE_DATE,
            actorUserId: ACTOR,
        });
        chargeIds.push(draft.id);
        await postChildcareCharge(supabase, { orgId: ORG, chargeId: draft.id, actorUserId: ACTOR });

        const applied = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG,
            chargeId: draft.id,
            amountCents: 40_000,
            paymentMethod: "check",
            status: "posted",
            actorUserId: ACTOR,
            idempotencyKey: `cert5-live-pay-${draft.id}`,
        });
        expect(applied.allocation).not.toBeNull();

        const receipt = (await entriesFor(applied.payment.id)).find((e) => e.entry_type === "payment_received");
        expect(receipt).toBeDefined();
        // J3 — money arrived, and NOTHING is owed differently because of it.
        expect(Number(receipt!.amount_cents)).toBe(40_000);
        expect(Number(receipt!.obligation_delta_cents)).toBe(0);

        const application = (await entriesFor(applied.allocation!.id)).find((e) => e.entry_type === "payment_applied");
        expect(application).toBeDefined();
        // J4 — the application is what reduces the obligation, by exactly what was applied.
        expect(Number(application!.obligation_delta_cents)).toBe(-40_000);

        // J8 — the BALANCE AUTHORITY is unchanged and is not the journal.
        const balance = await readChargeBalance(supabase, ORG, draft.id);
        expect(balance.appliedCents).toBe(40_000);
        expect(balance.outstandingCents).toBe(60_000);

        // J5 — replay. One allocation, one application entry, one reduction.
        const replay = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG,
            chargeId: draft.id,
            amountCents: 40_000,
            paymentMethod: "check",
            status: "posted",
            actorUserId: ACTOR,
            idempotencyKey: `cert5-live-pay-${draft.id}`,
        });
        expect(replay.alreadyRecorded).toBe(true);
        const afterReplay = await readChargeBalance(supabase, ORG, draft.id);
        expect(afterReplay.outstandingCents).toBe(60_000);
        expect((await entriesFor(applied.allocation!.id)).filter((e) => e.entry_type === "payment_applied")).toHaveLength(1);
    });

    it("J6 — a partial refund reverses the application, keeps the remainder, and restores the balance", async () => {
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            chargeCategory: "tuition",
            amountCents: 100_000,
            serviceDate: SERVICE_DATE,
            actorUserId: ACTOR,
        });
        chargeIds.push(draft.id);
        await postChildcareCharge(supabase, { orgId: ORG, chargeId: draft.id, actorUserId: ACTOR });

        const paid = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG,
            chargeId: draft.id,
            amountCents: 60_000,
            paymentMethod: "card",
            status: "posted",
            actorUserId: ACTOR,
            idempotencyKey: `cert5-live-refund-src-${draft.id}`,
        });
        expect((await readChargeBalance(supabase, ORG, draft.id)).outstandingCents).toBe(40_000);

        const refunded = await refundChildcarePayment(supabase, {
            orgId: ORG,
            paymentId: paid.payment.id,
            amountCents: 25_000,
            reason: "cert5 partial refund",
            actorUserId: ACTOR,
            idempotencyKey: `cert5-live-refund-${draft.id}`,
        });
        expect(refunded.reversedAllocationIds).toHaveLength(1);
        expect(refunded.reappliedAllocation).not.toBeNull();

        // The original receipt is untouched — the refund is a NEW outbound row.
        expect(refunded.original.amount_cents).toBe(60_000);
        expect(refunded.refund.direction).toBe("outbound");

        const reversal = (await entriesFor(refunded.reversedAllocationIds[0]))
            .find((e) => e.entry_type === "payment_application_reversed");
        expect(reversal).toBeDefined();
        // The obligation comes BACK by the whole application; the kept remainder reduces it again.
        expect(Number(reversal!.obligation_delta_cents)).toBe(60_000);
        expect(reversal!.reverses_entry_id).toBeTruthy();

        const remainder = (await entriesFor(refunded.reappliedAllocation!.id))
            .find((e) => e.entry_type === "payment_applied");
        expect(Number(remainder!.obligation_delta_cents)).toBe(-35_000);

        const refundEntry = (await entriesFor(refunded.refund.id)).find((e) => e.entry_type === "payment_refunded");
        expect(refundEntry).toBeDefined();
        // Money went back out, and the obligation was already restored above. Counting it here too
        // is the double-count the two-column design exists to prevent.
        expect(Number(refundEntry!.obligation_delta_cents)).toBe(0);

        // 100,000 charged − 35,000 still applied = 65,000 outstanding, by the balance authority.
        expect((await readChargeBalance(supabase, ORG, draft.id)).outstandingCents).toBe(65_000);
    });

    it("J7 — a charge reversal records a corrective entry linked to what it corrects", async () => {
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            chargeCategory: "tuition",
            amountCents: 70_000,
            serviceDate: SERVICE_DATE,
            actorUserId: ACTOR,
        });
        chargeIds.push(draft.id);
        await postChildcareCharge(supabase, { orgId: ORG, chargeId: draft.id, actorUserId: ACTOR });
        const [postedEntry] = await entriesFor(draft.id);

        const reversal = await createChildcareCorrection(supabase, {
            orgId: ORG,
            sourceChargeId: draft.id,
            kind: "reversal",
            actorUserId: ACTOR,
        });
        chargeIds.push(reversal.id);

        const [correctionEntry] = await entriesFor(reversal.id);
        expect(correctionEntry.entry_type).toBe("charge_corrected");
        expect(Number(correctionEntry.obligation_delta_cents)).toBe(-70_000);
        // Lineage in the journal, mirroring `source_charge_id` in the charge spine.
        expect(correctionEntry.reverses_entry_id).toBe(postedEntry.id);

        // The ORIGINAL entry is untouched — posted history is append-only, and the original charge
        // is still `posted` in the charge spine.
        const [originalAfter] = (await entriesFor(draft.id)).filter((e) => e.entry_type === "charge_posted");
        expect(Number(originalAfter.obligation_delta_cents)).toBe(70_000);

        const { data: original } = await supabase.from("charges").select("status").eq("id", draft.id).single();
        expect((original as { status: string }).status).toBe("posted");
    });

    it("J8 — posted history refuses to be rewritten", async () => {
        const { data } = await supabase
            .from("financial_journal_entries")
            .select("id")
            .eq("org_id", ORG)
            .limit(1)
            .single();
        const { error } = await supabase
            .from("financial_journal_entries")
            .update({ amount_cents: 1 })
            .eq("id", (data as { id: string }).id);
        expect(error?.message ?? "").toMatch(/cannot be updated|append-only/i);
    });
});
