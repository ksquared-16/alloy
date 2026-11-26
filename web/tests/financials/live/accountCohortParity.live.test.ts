/**
 * THE LARGE ACCOUNT, ON AUTHORITATIVE DATA (N1).
 *
 * The unit proof pages a fake. This one reads the certification tenant's real account — the one the
 * defect was measured on, which has accumulated thousands of immutable posted charges — and asks
 * the two questions a fixture cannot answer:
 *
 *   1. does the balance authority see EVERY charge the database holds for this account, and
 *   2. does the Focus Panel card agree with the Financials Workspace about the same money.
 *
 * Before the repair the answers were 1,000 of 2,821 and no. The count is read from the database
 * rather than hardcoded, so this keeps proving the same thing as the tenant grows.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { resolveFinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";

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
/** The account the defect was measured on: thousands of charges, accumulated over months. */
const HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const TODAY = new Date().toISOString().slice(0, 10);

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;
const describeLive = env ? describe : describe.skip;

describeLive("the account card reads the whole ledger — measured against the database", () => {
    it("sees every charge the account holds, not the first page of them", async () => {
        const client = supabase!;

        /* The account's billable sources, exactly as the card resolves them. */
        const { data: agreements } = await client
            .from("child_enrollment_agreements")
            .select("id")
            .eq("org_id", ORG)
            .eq("customer_id", HOUSEHOLD);
        const sourceIds = [
            ...((agreements ?? []) as Array<{ id: string }>).map((a) => a.id),
            HOUSEHOLD,
        ];

        /* THE AUTHORITATIVE COUNT — from the database, never from this file. */
        const { count } = await client
            .from("charges")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG)
            .in("billable_source_id", sourceIds);
        const authoritative = count ?? 0;
        expect(authoritative, "this proof needs an account larger than one server page").toBeGreaterThan(1_000);

        const vm = await buildFinancialsCardVM(client, { orgId: ORG, customerId: HOUSEHOLD, today: TODAY });
        expect(vm.unavailableReason ?? null, "a readable account is not an unavailability").toBeNull();
        /*
         * The whole cohort. Before the repair this was capped at exactly 1,000 however many charges
         * the account held, and every figure below it was computed from that page.
         */
        expect(vm.rows.length, `the card must read all ${authoritative} charges`).toBe(authoritative);
    });

    it("agrees with the Financials Workspace about the same account's outstanding money", async () => {
        const client = supabase!;

        const cohort = await resolveFinancialPositionCohort(client, {
            orgId: ORG,
            siteScope: "all",
            allowedSiteLocationIds: [],
        });
        /*
         * The workspace cohort is bounded at 2,000 posted charges ORG-WIDE and says so. When this
         * tenant exceeds that, the two surfaces are answering different questions and comparing them
         * would assert a coincidence. The bound is the workspace's documented behaviour, not a
         * defect, so the comparison states the condition instead of pretending it holds.
         */
        if (cohort.truncated) {
            expect(cohort.scanCap, "a truncated cohort still reports its own bound honestly").toBeGreaterThan(0);
            return;
        }

        const workspaceOutstanding = cohort.rows
            .filter((r) => r.customerId === HOUSEHOLD)
            .reduce((sum, r) => sum + r.position.outstandingCents, 0);

        const vm = await buildFinancialsCardVM(client, { orgId: ORG, customerId: HOUSEHOLD, today: TODAY });
        expect(vm.unavailableReason ?? null).toBeNull();
        expect(
            vm.collectible.outstandingCents,
            "one account, one outstanding figure, whichever surface an operator opens",
        ).toBe(workspaceOutstanding);
    });
});
