/**
 * A SETTLED ACCOUNT IS STILL AN ACCOUNT — AND ITS PAYMENTS STILL COUNT AT SCALE.
 *
 * ── THE DEFECT THIS EXISTS TO CATCH ──
 *
 * The Accounts cohort read every per-charge fact with a single
 * `.in("charge_id", chargeIds)` covering the whole cohort, and dropped the error:
 * `const { data } = …`. Past a few hundred charges the request URI exceeds the server's limit,
 * PostgREST answers `URI too long`, and `data` is null. Null applications do not read as "we could
 * not find out" — they read as "nothing was ever paid. So every account's outstanding was
 * overstated by exactly the payments applied to it, and a household that had settled in full was
 * shown owing the whole charge while Thread 2's detail answered zero for the same charge.
 *
 * The failure is invisible in a small tenant, which is why it survived a green certification: the
 * URI only overflows once the org has enough charges. Scale, not an edit, produced it.
 *
 * ── WHAT IS ASSERTED, AND WHY IT IS NOT ABOUT BRENNAN ──
 *
 * The contract is semantic, so the test is too. It finds an account whose ledger is square —
 * posted money fully applied — WITHOUT naming it, and requires:
 *
 *   1. the cohort agrees with Thread 2 for that charge (no divergence);
 *   2. its outstanding is zero (payments counted);
 *   3. it is still IN the cohort (membership is financial activity, not attention).
 *
 * A fixture rename cannot make this pass, and shrinking the tenant cannot either — the scale guard
 * below asserts the cohort survives more charges than a single URI can carry.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { resolveFinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";

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

const orgWide = {
    orgId: ORG,
    siteScope: "all" as const,
    allowedSiteLocationIds: [] as string[],
    activeSiteLocationId: null,
};

describeLive("a settled account stays in the Accounts cohort — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    /*
     * THE SCALE GUARD. This is the condition that produced the defect: enough charges that a single
     * `.in()` of every id cannot fit in one request URI. If the tenant ever shrinks below it, this
     * file is no longer testing what it claims to, and says so rather than passing quietly.
     */
    it("exercises a cohort large enough to have overflowed a single request URI", async () => {
        const { count, error } = await supabase
            .from("charges")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG)
            .eq("status", "posted");
        expect(error, error?.message).toBeNull();
        expect(
            count ?? 0,
            "the certification tenant no longer has enough posted charges to prove the batching",
        ).toBeGreaterThan(150);
    }, 120_000);

    it("counts applied payments, so a squared-off account reads as settled", async () => {
        const cohort = await resolveFinancialPositionCohort(supabase, orgWide as never);
        expect(cohort.rows.length, "the cohort resolved real work").toBeGreaterThan(0);

        /*
         * Find a charge that is fully applied — posted money with nothing left outstanding —
         * WITHOUT naming a household. If the batched reads regress, every application vanishes and
         * there is no such charge at all, which is itself the failure.
         */
        /*
         * A SETTLED OBLIGATION, NOT A ZERO. `outstandingCents === 0` alone also describes a credit
         * or a fully-reduced line, which never owed anything and which Thread 2 correctly refuses
         * to allocate responsibility over. The claim here is about money that WAS owed and has
         * since been paid, so the net obligation must be positive before the zero means anything.
         */
        const settledRow = cohort.rows.find(
            (r) => r.position.outstandingCents === 0 && r.position.explanation.netCents > 0,
        );
        expect(
            settledRow,
            "no posted obligation in the cohort is fully settled — applied payments are not being counted",
        ).toBeTruthy();

        // AND THE TWO PATHS AGREE. Divergence here is the defect restated.
        const family = await resolveFamilyCollectible(supabase, {
            orgId: ORG,
            chargeId: settledRow!.position.chargeId,
        } as never);
        expect(
            (family as never as { outstandingCents: number }).outstandingCents,
            "Thread 2 and the Accounts cohort must answer the same for one charge",
        ).toBe(settledRow!.position.outstandingCents);
    }, 180_000);

    /*
     * MEMBERSHIP IS FINANCIAL ACTIVITY, NOT ATTENTION. An account whose balance is square must
     * still be reachable on the surface an operator uses to look a family up — otherwise "did they
     * pay?" is answered by an empty list that looks exactly like "no such family".
     */
    it("keeps a settled account in the cohort rather than filtering it out", async () => {
        const cohort = await resolveFinancialPositionCohort(supabase, orgWide as never);
        const settledAccounts = new Set(
            cohort.rows
                .filter(
                    (r) =>
                        r.position.outstandingCents === 0
                        && r.position.explanation.netCents > 0
                        && r.customerId,
                )
                .map((r) => r.customerId as string),
        );
        expect(
            settledAccounts.size,
            "a settled account has been dropped from the cohort — Accounts is a collections queue again",
        ).toBeGreaterThan(0);

        // Its charges are present, which is what makes it discoverable and rankable.
        const [someSettled] = [...settledAccounts];
        const rowsForAccount = cohort.rows.filter((r) => r.customerId === someSettled);
        expect(rowsForAccount.length, "the settled account still carries its financial history").toBeGreaterThan(0);
    }, 180_000);

    /*
     * A FAILED READ MUST NOT BECOME A CHEAPER TRUTH. The old code turned an unreadable fact into
     * "nothing was paid". This pins the fail-closed rule at the source it is owned by.
     */
    it("reads facts in batches and refuses to invent an empty result", () => {
        const source = readFileSync(
            resolve(__dirname, "../../../lib/financials/workspace/resolveFinancialPosition.ts"),
            "utf8",
        );
        expect(source, "cohort reads are issued in bounded batches").toContain("ID_BATCH");
        expect(source, "a failed read throws rather than resolving to nothing").toMatch(
            /if \(error\)[\s\S]{0,120}throw new Error/,
        );
        /*
         * THE RULE, NOT A LIST OF NAMES. The first version of this pin enumerated the four
         * charge-scoped facts, so it went on passing while the read keyed by PAYMENT — the one that
         * decides whether an application counts at all — kept dropping its error two hundred lines
         * further down. Any `const { data: x } = await …` in this file is that same defect again,
         * whatever the variable is called.
         */
        const droppedErrorReads = [...source.matchAll(/const \{ data: (\w+) \}/g)].map((m) => m[1]);
        expect(
            droppedErrorReads,
            "a cohort read in this file discards its error and will fail open into wrong money",
        ).toEqual([]);
        // Every id-keyed read goes through the one fail-closed seam.
        expect(source, "the payments behind applied money are read in batches too").toMatch(
            /readInBatches<[^>]*>\(\s*\n?\s*"payments backing applied money"/,
        );
    });
});
