/**
 * OLD PAYMENT-VIEW ACQUISITION vs NEW — the same views, or the cutover does not happen.
 *
 * The old path read every inbound receipt in the ORGANISATION and then resolved each billable
 * source's household one at a time to decide which were this family's. The new path selects them
 * by the household's billable sources, which the account fact bundle already resolved.
 *
 * That is a change to WHICH ROWS ARRIVE, so it is not enough that the new path is faster: it must
 * produce the same payment views, field for field, on the real tenant. This runs the resolver BOTH
 * ways against the certification tenant and compares the outputs it actually returns.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { resolveHouseholdPaymentViews } from "@/lib/financials/paymentApplicationView";
import { readAccountFactBundle } from "@/lib/financials/workspace/readAccountFactBundle";

function certEnv(): { url: string; serviceKey: string } | null {
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
const HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const d = env ? describe : describe.skip;

d("the household payment views survive the move off the org-wide scan", () => {
    const supabase: SupabaseClient = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });

    it("the same views, field for field, on the real tenant", async () => {
        /* OLD: no supplied rows, so the resolver scans the org and resolves per source. */
        const oldViews = await resolveHouseholdPaymentViews(supabase, { orgId: ORG, customerId: HOUSEHOLD });

        /* NEW: the bundle's rows, selected by this household's billable sources. */
        const bundle = await readAccountFactBundle(supabase, {
            orgId: ORG, customerId: HOUSEHOLD, customerMemberId: null,
        });
        const newViews = await resolveHouseholdPaymentViews(supabase, { orgId: ORG, customerId: HOUSEHOLD }, {
            payments: bundle.paymentsBySource,
            allocations: bundle.paymentAllocations,
            charges: bundle.chargesForAllocations,
            payers: bundle.payerCustomers,
            refunds: bundle.paymentRefunds,
        });

        expect(oldViews.length, "the old path found receipts to compare").toBeGreaterThan(0);
        expect(newViews.length, "same number of views").toBe(oldViews.length);

        /* Field for field, keyed by payment id — order is not part of the contract, content is. */
        const key = (v: unknown) => JSON.stringify(v, Object.keys(v as object).sort());
        const byId = (vs: typeof oldViews) => new Map(vs.map((v) => [v.paymentId, key(v)]));
        const a = byId(oldViews), b = byId(newViews);
        const diffs: string[] = [];
        for (const id of new Set([...a.keys(), ...b.keys()])) {
            if (a.get(id) !== b.get(id)) {
                diffs.push(`payment ${id}\n  old=${(a.get(id) ?? "ABSENT").slice(0, 300)}\n  new=${(b.get(id) ?? "ABSENT").slice(0, 300)}`);
            }
        }
        expect(diffs.slice(0, 3), `${diffs.length} of ${oldViews.length} views differ`).toEqual([]);
    }, 900_000);

    it("a household with no receipts is empty both ways, and that is not a failure", async () => {
        const empty = "00000000-0000-4000-8000-00000000dead";
        const oldViews = await resolveHouseholdPaymentViews(supabase, { orgId: ORG, customerId: empty });
        const bundle = await readAccountFactBundle(supabase, { orgId: ORG, customerId: empty, customerMemberId: null });
        const newViews = await resolveHouseholdPaymentViews(supabase, { orgId: ORG, customerId: empty }, {
            payments: bundle.paymentsBySource,
            allocations: bundle.paymentAllocations,
            charges: bundle.chargesForAllocations,
            payers: bundle.payerCustomers,
            refunds: bundle.paymentRefunds,
        });
        expect(oldViews).toEqual([]);
        expect(newViews, "KNOWN ZERO, identically").toEqual([]);
    }, 600_000);
});
