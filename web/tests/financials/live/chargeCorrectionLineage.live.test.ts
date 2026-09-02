/**
 * THE READ MODEL, AGAINST THE REAL DATABASE.
 *
 * `buildFinancialsCardVM` is certified against mocks everywhere else, and a mock is exactly what let
 * `chargeLifecycleService` write `updated_by` for months against a column that did not exist. These
 * cases run the composer against the certification stack (`alloy-cert`) over rows this file posts,
 * reverses and credits through real persistence.
 *
 * Thread 1 requirements certified here:
 *   R4  the read model derives the original as `reversed` WITHOUT rewriting its persisted `posted`
 *   R5  original + reversal net correctly in the reconciliation
 *   R11 partial credits reduce the outstanding and the past-due amount correctly
 *
 * Skipped unless the cert stack is configured, so the ordinary suite stays hermetic. Bring the stack
 * up and write the env file with certification/alloy-certify up && certification/alloy-certify env, or export
 * CERT_SUPABASE_URL / CERT_SERVICE_ROLE_KEY.
 *
 * Fixture: certification/fixtures/financials-charge-spine.sql (apply it first).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import {
    buildFinancialsCardVM,
    pastDueFor,
    reconcileRows,
} from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

/** The cert env file is the canonical place these live; fall back to the process env. */
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
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);

const written: string[] = [];

async function post(supabase: SupabaseClient, amountCents: number, dueDate: string | null) {
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
            due_date: dueDate,
            description: "live read-model certification",
            metadata: {},
            created_by: ACTOR,
            updated_by: ACTOR,
        })
        .select("id")
        .single();
    if (error) throw new Error(error.message);
    const id = (draft as { id: string }).id;
    written.push(id);
    const { error: postError } = await supabase
        .from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id)
        .eq("status", "draft");
    if (postError) throw new Error(postError.message);
    return id;
}

async function correct(
    supabase: SupabaseClient,
    sourceId: string,
    kind: "reversal" | "credit",
    amountCents: number,
    dueDate: string | null,
) {
    const { data, error } = await supabase
        .from("charges")
        .insert({
            org_id: ORG,
            job_id: null,
            billable_source_type: "enrollment_agreement",
            billable_source_id: AGREEMENT,
            source_charge_id: sourceId,
            charge_type: "fee",
            charge_category: "credit",
            status: "posted",
            currency_code: "USD",
            amount_cents: amountCents,
            service_date: TODAY,
            occurs_on: TODAY,
            billable_on: TODAY,
            due_date: dueDate,
            posted_at: new Date().toISOString(),
            description: `${kind} of ${sourceId}`,
            metadata: { correction_kind: kind, source_charge_id: sourceId },
            created_by: ACTOR,
            updated_by: ACTOR,
            posted_by: ACTOR,
        })
        .select("id")
        .single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    written.push(id);
    return id;
}

describe.skipIf(!env)("financials read model — live, against the certification database", () => {
    const supabase = env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null;

    afterAll(async () => {
        // Corrections first: an original cannot be removed while a correction references it.
        if (!supabase || written.length === 0) return;
        await supabase.from("charges").delete().in("source_charge_id", written);
        await supabase.from("charges").delete().in("id", written);
    });

    it("R4 — derives `reversed` while the persisted row still says `posted`", async () => {
        const client = supabase!;
        const original = await post(client, 130_000, null);
        const reversal = await correct(client, original, "reversal", -130_000, null);

        // What the DATABASE holds is unchanged: posting is authoritative and immutable.
        const { data: persisted } = await client
            .from("charges")
            .select("id, status, amount_cents, source_charge_id, posted_by")
            .eq("id", original)
            .single();
        expect((persisted as { status: string }).status).toBe("posted");
        expect((persisted as { amount_cents: number }).amount_cents).toBe(130_000);
        expect((persisted as { posted_by: string }).posted_by).toBe(ACTOR);

        // What the OPERATOR is shown is the derived reading of that same row.
        const vm = await buildFinancialsCardVM(client, { orgId: ORG, customerId: HOUSEHOLD, today: TODAY });
        const originalRow = vm.rows.find((r) => r.chargeId === original);
        const reversalRow = vm.rows.find((r) => r.chargeId === reversal);
        expect(originalRow, "the posted charge must appear in the ledger").toBeDefined();
        expect(originalRow!.lifecycleStatus).toBe("reversed");
        expect(originalRow!.status).toBe("posted");
        expect(originalRow!.reversedByChargeId).toBe(reversal);
        // R6's data half: the ledger carries the relationship, so the surface can render it.
        expect(reversalRow!.correctsChargeId).toBe(original);
        expect(reversalRow!.correctionKind).toBe("reversal");
        // R7's data half: `offersReverse` is what the card renders the button from. Neither row
        // offers anything once the reversal exists.
        expect(originalRow!.offersReverse).toBe(false);
        expect(reversalRow!.offersReverse).toBe(false);
    });

    it("R5 — the reversed pair nets to zero in the reconciliation over real rows", async () => {
        const client = supabase!;
        const original = await post(client, 44_000, null);
        const reversal = await correct(client, original, "reversal", -44_000, null);
        const vm = await buildFinancialsCardVM(client, { orgId: ORG, customerId: HOUSEHOLD, today: TODAY });
        const pair = vm.rows.filter((r) => r.chargeId === original || r.chargeId === reversal);
        expect(pair).toHaveLength(2);
        const out = reconcileRows(pair, vm.period.key, TODAY);
        expect(out.responsibilityCents).toBe(0);
        expect(out.balanceCents).toBe(0);
    });

    it("R11 — partial credits reduce the outstanding and the past-due amount", async () => {
        const client = supabase!;
        const overdue = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
        const original = await post(client, 100_000, overdue);
        const credit = await correct(client, original, "credit", -30_000, overdue);
        const vm = await buildFinancialsCardVM(client, { orgId: ORG, customerId: HOUSEHOLD, today: TODAY });
        const rows = vm.rows.filter((r) => r.chargeId === original || r.chargeId === credit);
        expect(rows).toHaveLength(2);

        const out = reconcileRows(rows, vm.period.key, TODAY);
        expect(out.responsibilityCents).toBe(70_000);

        // A credit is partial, so what remains overdue is the charge net of it — not zero, and not
        // the gross. Only a reversal takes a charge out of past due entirely.
        const pastDue = pastDueFor(rows, TODAY);
        expect(pastDue?.amountCents).toBe(70_000);
        expect(rows.find((r) => r.chargeId === original)!.lifecycleStatus).toBe("posted");
    });
});
