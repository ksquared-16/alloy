/**
 * THE PICKER, AGAINST THE TENANT IT WAS EMPTY IN.
 *
 * The hermetic suite proves the rules; this proves the TABLE. Manage Responsibility offered nobody
 * on every account in the product because it read `contacts`, which holds zero rows here, while the
 * canonical household edge `customer_persons` holds 1,802. No rule was wrong — the read was aimed
 * at a table the tenant does not populate, and a unit test with a mocked database would have gone
 * on passing forever. Only a live read can catch that, which is why this file exists.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { resolveResponsibilityPartyCandidates } from "@/lib/financials/responsibility/responsibilityPartyCandidates";

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
const describeLive = env ? describe : describe.skip;
const ORG = "00000000-0000-4000-8000-000000000001";
/** The demo fixture's Alvarez household: real outstanding money, two adults, no arrangement. */
const ALVAREZ = "fd000000-0000-4000-8000-0000000c0001";

describeLive("who this household's obligation can be put on — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    it("offers the account's real adults — the defect was that it offered nobody", async () => {
        const out = await resolveResponsibilityPartyCandidates(supabase, { orgId: ORG, customerId: ALVAREZ });

        expect(
            out.length,
            "an account with two adults on the canonical edge must not present an empty picker",
        ).toBeGreaterThanOrEqual(2);
        const names = out.map((c) => c.name);
        expect(names).toContain("Dana Alvarez");
        expect(names, "a relationship whose status was never set is not a departure").toContain("Rosa Alvarez");
    }, 60_000);

    it("never offers the child", async () => {
        const out = await resolveResponsibilityPartyCandidates(supabase, { orgId: ORG, customerId: ALVAREZ });
        /*
         * Ana carries the `child` role on this household AND a person identity, so she is reachable
         * by the same read that finds her parents. Excluding her is a decision the resolver makes,
         * not an accident of children lacking person rows.
         */
        expect(out.map((c) => c.name), "a child may not be made to owe their own tuition").not.toContain(
            "Ana Alvarez",
        );
    }, 60_000);

    it("says what each person is, so the operator knows who they are picking", async () => {
        const out = await resolveResponsibilityPartyCandidates(supabase, { orgId: ORG, customerId: ALVAREZ });
        const dana = out.find((c) => c.name === "Dana Alvarez");
        const rosa = out.find((c) => c.name === "Rosa Alvarez");
        expect(dana?.roleLabel).toBe("Parent");
        expect(rosa?.roleLabel, "the vocabulary is read, not one hard-coded role").toBe("Guardian");
    }, 60_000);

    /*
     * THE LIST IS NOT THE AUTHORIZATION — but it must not leak either. The org comes from the
     * caller's gate, so a customer id from outside it can only ever resolve to nobody.
     */
    it("resolves nobody for an account that is not this org's", async () => {
        const foreign = await resolveResponsibilityPartyCandidates(supabase, {
            orgId: "00000000-0000-4000-8000-0000000000ff",
            customerId: ALVAREZ,
        });
        expect(foreign, "another tenant's caller cannot read this household").toEqual([]);

        const invented = await resolveResponsibilityPartyCandidates(supabase, {
            orgId: ORG,
            customerId: "fd000000-0000-4000-8000-00000000dead",
        });
        expect(invented, "an id that names nothing resolves to nobody, not to everybody").toEqual([]);
    }, 60_000);

    /*
     * THE STATE THE ROUND TRIP STARTS FROM. If something has already written an arrangement for this
     * household, the certification below would be proving edit rather than creation — the case that
     * was actually unreachable.
     */
    it("starts from no arrangement at all, which is the case that was unreachable", async () => {
        const { data, error } = await supabase
            .from("financial_responsibility_arrangements")
            .select("id")
            .eq("org_id", ORG)
            .eq("customer_id", ALVAREZ);
        expect(error, error?.message).toBeNull();
        expect((data ?? []).length, "Alvarez must begin with no arrangement").toBe(0);
    }, 60_000);
});
