/**
 * OLD ACQUISITION vs NEW ACQUISITION — the same rows, or the cutover does not happen.
 *
 * The server-side bundle exists to collapse five dependent network waves into one. That is only
 * allowed to change WHEN and HOW the rows arrive. This reads each fact set both ways against the
 * certification tenant's real accounts and compares them exactly — same rows, same columns, same
 * values — because a select-list drift or a predicate that quietly widened is indistinguishable
 * from a faster read until someone's balance is wrong.
 *
 * Read only. Computes nothing. It is the gate the cutover stands on.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { readAccountFactBundle, type FactRow } from "@/lib/financials/workspace/readAccountFactBundle";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (k: string) =>
            file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const ORG = "00000000-0000-4000-8000-000000000001";
/** The tenant's largest account: thousands of charges, accumulated over months. */
const HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const d = env ? describe : describe.skip;

/** Order-independent, exact-value comparison keyed on the whole row. */
const key = (r: FactRow) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k] ?? null]));
function compare(label: string, oldRows: FactRow[], newRows: FactRow[], columns: string[]) {
    const project = (r: FactRow) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null]));
    const bag = (rows: FactRow[]) => {
        const m = new Map<string, number>();
        for (const r of rows) { const k = key(project(r)); m.set(k, (m.get(k) ?? 0) + 1); }
        return m;
    };
    const a = bag(oldRows), b = bag(newRows);
    const diffs: string[] = [];
    for (const k of new Set([...a.keys(), ...b.keys()])) {
        const x = a.get(k) ?? 0, y = b.get(k) ?? 0;
        if (x !== y) diffs.push(`${label}: old×${x} new×${y} ${k.slice(0, 160)}`);
    }
    expect(diffs.slice(0, 6), `${label}: ${oldRows.length} old rows, ${newRows.length} new rows`).toEqual([]);
    expect(newRows.length, `${label} row count`).toBe(oldRows.length);
}

/** Pages past the PostgREST cap exactly as the production reader does. */
async function pageAll(run: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>) {
    const out: FactRow[] = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await run(from, from + 999);
        if (error) throw new Error(String((error as { message?: string }).message ?? error));
        const rows = (data ?? []) as FactRow[];
        out.push(...rows);
        if (rows.length < 1000) break;
    }
    return out;
}
const chunk = <T,>(xs: T[], n = 80) => {
    const out: T[][] = [];
    for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
    return out;
};
async function inBatches(ids: string[], run: (batch: string[]) => PromiseLike<{ data: unknown; error: unknown }>) {
    const out: FactRow[] = [];
    for (const batch of chunk(ids)) {
        const { data, error } = await run(batch);
        if (error) throw new Error(String((error as { message?: string }).message ?? error));
        out.push(...((data ?? []) as FactRow[]));
    }
    return out;
}

d("the bundle returns exactly what the five waves returned", () => {
    const supabase: SupabaseClient = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });

    it("every dependent fact set matches, row for row", async () => {
        const bundle = await readAccountFactBundle(supabase, {
            orgId: ORG, customerId: HOUSEHOLD, customerMemberId: null,
        });

        /* WAVE 1 — the billable sources. */
        const { data: agreementRows } = await supabase
            .from("child_enrollment_agreements")
            .select("id, customer_member_id, customer_id, status")
            .eq("org_id", ORG).eq("customer_id", HOUSEHOLD);
        const agreements = (agreementRows ?? []) as FactRow[];
        compare("agreements", agreements, bundle.agreements,
            ["id", "customer_member_id", "customer_id", "status"]);

        const agreementIds = agreements.map((a) => String(a.id));
        const memberIds = [...new Set(agreements.map((a) => String(a.customer_member_id)))];
        const sourceIds = [...agreementIds, HOUSEHOLD];

        /* WAVE 2 — what the agreements unlock. */
        const { data: memberRows } = await supabase
            .from("customer_members")
            .select("id, first_name, last_name, display_name, person_id")
            .eq("org_id", ORG).in("id", memberIds);
        compare("members", (memberRows ?? []) as FactRow[], bundle.members,
            ["id", "first_name", "last_name", "display_name", "person_id"]);

        const charges = await pageAll((from, to) =>
            supabase.from("charges")
                .select("id, billable_source_type, billable_source_id, source_charge_id, charge_category, charge_type, status, amount_cents, currency_code, charge_template_id, service_date, occurs_on, billable_on, due_date, posted_at, voided_at, description, metadata, created_at")
                .eq("org_id", ORG).in("billable_source_id", sourceIds)
                .order("id", { ascending: true }).range(from, to) as never);
        compare("charges", charges, bundle.charges,
            ["id", "billable_source_type", "billable_source_id", "source_charge_id", "charge_category",
             "charge_type", "status", "amount_cents", "currency_code", "charge_template_id",
             "service_date", "occurs_on", "billable_on", "due_date", "posted_at", "voided_at", "description", "created_at"]);

        const chargeIds = charges.map((c) => String(c.id));

        /* WAVE 3+ — the charge-keyed facts and what they unlock. */
        const allocations = await inBatches(chargeIds, (batch) =>
            supabase.from("payment_allocations")
                .select("id, charge_id, allocated_amount_cents, status, payment_id")
                .eq("org_id", ORG).in("charge_id", batch) as never);
        compare("payment_allocations", allocations, bundle.paymentAllocations,
            ["id", "charge_id", "allocated_amount_cents", "status", "payment_id"]);

        const respAllocs = await inBatches(chargeIds, (batch) =>
            supabase.from("financial_responsibility_allocations")
                .select("id, charge_id, responsible_party_id, is_unassigned, assigned_amount_cents, share_id")
                .eq("org_id", ORG).eq("state", "active").in("charge_id", batch) as never);
        compare("responsibility_allocations", respAllocs, bundle.responsibilityAllocations,
            ["id", "charge_id", "responsible_party_id", "is_unassigned", "assigned_amount_cents", "share_id"]);

        const claimLines = await inBatches(chargeIds, (batch) =>
            supabase.from("financial_subsidy_claim_lines")
                .select("id, charge_id, claim_id, claimed_amount_cents")
                .eq("org_id", ORG).in("charge_id", batch) as never);
        compare("subsidy_claim_lines", claimLines, bundle.subsidyClaimLines,
            ["id", "charge_id", "claim_id", "claimed_amount_cents"]);

        const reductionsByCharge = await inBatches(chargeIds, (batch) =>
            supabase.from("financial_reduction_applications")
                .select("source_charge_id, amount_cents")
                .eq("org_id", ORG).in("source_charge_id", batch) as never);
        compare("reductions_by_charge", reductionsByCharge, bundle.reductionsByCharge,
            ["source_charge_id", "amount_cents"]);

        const paymentIds = [...new Set(allocations.map((a) => String(a.payment_id)).filter((v) => v && v !== "null"))];
        const paymentsBacking = await inBatches(paymentIds, (batch) =>
            supabase.from("payments").select("id, status, payer_entity_type")
                .eq("org_id", ORG).in("id", batch) as never);
        compare("payments_backing", paymentsBacking, bundle.paymentsBacking,
            ["id", "status", "payer_entity_type"]);

        const allocIds = respAllocs.map((a) => String(a.id));
        const shareIds = [...new Set(respAllocs.map((a) => a.share_id).filter(Boolean).map(String))];
        if (allocIds.length) {
            const { data: attributions } = await supabase
                .from("payment_responsibility_attributions")
                .select("responsibility_allocation_id, amount_cents")
                .eq("org_id", ORG).in("responsibility_allocation_id", allocIds);
            compare("responsibility_attributions", (attributions ?? []) as FactRow[], bundle.responsibilityAttributions,
                ["responsibility_allocation_id", "amount_cents"]);
        }
        if (shareIds.length) {
            const { data: fundingShare } = await supabase
                .from("financial_expected_funding")
                .select("expected_amount_cents, percent_basis_points, basis, allocation_id, share_id")
                .eq("org_id", ORG).eq("state", "active").is("allocation_id", null).in("share_id", shareIds);
            compare("funding_by_share", (fundingShare ?? []) as FactRow[], bundle.fundingByShare,
                ["expected_amount_cents", "percent_basis_points", "basis", "allocation_id", "share_id"]);
        }

        const claimIds = [...new Set(claimLines.map((l) => String(l.claim_id)))];
        if (claimIds.length) {
            const { data: claims } = await supabase.from("financial_subsidy_claims")
                .select("id, state").eq("org_id", ORG).in("id", claimIds);
            compare("subsidy_claims", (claims ?? []) as FactRow[], bundle.subsidyClaims, ["id", "state"]);
        }

        const attempts = await inBatches(chargeIds, (batch) =>
            supabase.from("payment_collection_attempts")
                .select("id, rail, processor_state, provider_action_type, charge_id, requested_amount_cents, currency, updated_at, canonical_payment_id")
                .eq("org_id", ORG).in("charge_id", batch).is("canonical_payment_id", null) as never);
        compare("collection_attempts", attempts, bundle.collectionAttempts,
            ["id", "rail", "processor_state", "provider_action_type", "charge_id",
             "requested_amount_cents", "currency", "canonical_payment_id"]);

        /* KNOWN ZERO is reported as a count, not inferred from an empty array. */
        expect(bundle.counts.charges, "the bundle reports what it gathered").toBe(charges.length);
        expect(bundle.counts.agreements).toBe(agreements.length);
    }, 900_000);

    it("a household from another tenant resolves to nothing, not to that tenant's ledger", async () => {
        const wrongOrg = await readAccountFactBundle(supabase, {
            orgId: "11111111-1111-4111-8111-111111111111",
            customerId: HOUSEHOLD, customerMemberId: null,
        });
        expect(wrongOrg.charges, "org scope is enforced inside the function").toEqual([]);
        expect(wrongOrg.agreements).toEqual([]);
        expect(wrongOrg.counts.charges).toBe(0);
    }, 300_000);
});
