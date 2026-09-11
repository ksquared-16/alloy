/**
 * A financial policy that already decided money cannot be deleted.
 *
 * Two independent protections, proved independently, because the whole point is
 * that neither is the only one:
 *
 *   the SERVICE  refuses in the domain's own words, before attempting anything
 *   the DATABASE refuses via ON DELETE RESTRICT, for any caller arriving by
 *                another route
 *
 * A test that only exercised the service would pass just as happily if somebody
 * later removed the constraint "because the service checks anyway".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

import {
    createFinancialPolicy,
    createFinancialPolicyVersion,
    voidScheduledFinancialPolicy,
} from "@/lib/financials/policies/financialPolicyService";

function certEnv(): { url: string; serviceKey: string } | null {
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
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

const ORG = "00000000-0000-4000-8000-000000000001";
const run = Date.now();
/** Every fixture policy starts in 2027, so voiding is a legal move for all of them. */
const TODAY = "2026-09-11";

describeLive("voiding a financial policy that produced money — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const policyIds: string[] = [];
    const reductionIds: string[] = [];

    afterEach(async () => {
        // Reductions first: they hold the RESTRICT reference under test.
        if (reductionIds.length) {
            await supabase.from("financial_reduction_applications").delete().in("id", reductionIds);
            reductionIds.length = 0;
        }
        if (policyIds.length) {
            await supabase.from("financial_policies").delete().in("id", policyIds);
            policyIds.length = 0;
        }
    });

    /** A SCHEDULED (future) policy — the only shape `voidFinancialPolicy` accepts. */
    async function scheduledPolicy() {
        const row = await createFinancialPolicy(supabase, {
            orgId: ORG,
            policyType: "vacation_credit",
            scopeType: "org",
            value: { treatment: "credit" },
            effectiveStart: "2027-01-01",
        });
        policyIds.push(row.id);
        return row;
    }

    async function reductionUnder(policyId: string) {
        const { data: charge } = await supabase.from("charges").select("id").eq("org_id", ORG).limit(1).single();
        const { data, error } = await supabase
            .from("financial_reduction_applications")
            .insert({
                org_id: ORG,
                charge_id: (charge as { id: string }).id,
                reduction_kind: "policy",
                policy_kind: "vacation_credit",
                financial_policy_id: policyId,
                commercial_policy_id: null,
                amount_cents: -4000,
                currency_code: "USD",
                capped: false,
                idempotency_key: `void-guard-${run}-${policyId.slice(0, 8)}`,
            })
            .select("id")
            .single();
        if (error) throw new Error(`reduction fixture failed: ${error.message}`);
        const id = (data as { id: string }).id;
        reductionIds.push(id);
        return id;
    }

    it("an unused policy still voids exactly as it always did", async () => {
        const policy = await scheduledPolicy();
        const result = await voidScheduledFinancialPolicy(supabase, { orgId: ORG, id: policy.id, todayYmd: TODAY });
        expect(result.voided).toBe(true);

        const { data } = await supabase.from("financial_policies").select("id").eq("id", policy.id);
        expect(data ?? []).toHaveLength(0);
        // Already gone; nothing for cleanup to remove.
        policyIds.length = 0;
    });

    it("a policy that produced a reduction is refused in the domain's own words", async () => {
        const policy = await scheduledPolicy();
        const reductionId = await reductionUnder(policy.id);

        const failure = await voidScheduledFinancialPolicy(supabase, {
            orgId: ORG,
            id: policy.id,
            todayYmd: TODAY,
        }).then(
            () => null,
            (e: Error) => e,
        );

        expect(failure?.message).toMatch(/already been used for a financial reduction/i);
        // It names no constraint, no error code, no SQL — and it says what to do instead.
        expect(failure?.message).not.toMatch(/constraint|23503|foreign key|fkey/i);
        expect(failure?.message).toMatch(/retire/i);

        // BOTH survive: the policy, and the record of why the money moved.
        const { data: stillThere } = await supabase.from("financial_policies").select("id").eq("id", policy.id);
        expect(stillThere ?? []).toHaveLength(1);
        const { data: reduction } = await supabase
            .from("financial_reduction_applications")
            .select("id, financial_policy_id")
            .eq("id", reductionId)
            .single();
        expect(reduction).toMatchObject({ financial_policy_id: policy.id });
    });

    it("the DATABASE refuses too, so the service message is not the only protection", async () => {
        const policy = await scheduledPolicy();
        await reductionUnder(policy.id);

        /*
         * Deleting directly, bypassing the service entirely — the route a future
         * script, backfill or console session would take. ON DELETE RESTRICT is
         * what stands there, and it must keep standing even though the service
         * now preflights.
         */
        const { error } = await supabase.from("financial_policies").delete().eq("id", policy.id);
        // 23503 is foreign_key_violation — RESTRICT, not RLS or a missed row.
        expect(error?.code).toBe("23503");
        expect(`${error?.message} ${error?.details ?? ""}`).toMatch(/financial_reduction_applications/);

        const { data } = await supabase.from("financial_policies").select("id").eq("id", policy.id);
        expect(data ?? []).toHaveLength(1);
    });

    it("a refused void leaves the superseded prior version exactly as it was", async () => {
        /*
         * The refusal happens before ANY write. A void that reopens the prior
         * version and then refuses would leave the org with two live policies
         * and no indication that anything happened.
         */
        const prior = await createFinancialPolicy(supabase, {
            orgId: ORG,
            policyType: "vacation_credit",
            scopeType: "org",
            value: { treatment: "no_credit" },
            effectiveStart: "2026-10-01",
        });
        policyIds.push(prior.id);

        const version = await createFinancialPolicyVersion(supabase, {
            orgId: ORG,
            priorId: prior.id,
            effectiveStart: "2027-01-01",
            value: { treatment: "credit" },
        });
        policyIds.push(version.policy.id);
        await reductionUnder(version.policy.id);

        const { data: before } = await supabase
            .from("financial_policies").select("effective_end").eq("id", prior.id).single();

        await expect(
            voidScheduledFinancialPolicy(supabase, { orgId: ORG, id: version.policy.id, todayYmd: TODAY }),
        ).rejects.toThrow(/already been used for a financial reduction/i);

        const { data: after } = await supabase
            .from("financial_policies").select("effective_end").eq("id", prior.id).single();
        expect(after).toEqual(before);
        expect((after as { effective_end: string | null }).effective_end).not.toBeNull();
    });
});
