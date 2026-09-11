/**
 * A TWO-CHILD FAMILY IS NOT ONE BALANCE — AND A BALANCE MUST EXPLAIN ITSELF.
 *
 * ── WHAT THIS EXISTS TO CATCH ──
 *
 * The charge always knew which child it concerned. An `enrollment_agreement` billable source
 * carries the agreement's `customer_member_id`; a `customer` source is childless by construction,
 * because a registration fee belongs to the family rather than to one of its children. Draft
 * resolution, responsibility, both reduction paths and the card's own per-child reconciliation all
 * preserve that distinction.
 *
 * The Accounts cohort alone discarded it — it selected the agreement's household and site and not
 * its child — so a family with two enrolled children arrived at the one surface an operator uses to
 * look a family up as a single undifferentiated balance, with no way to ask which child a charge
 * was for.
 *
 * The second assertion is about the same projection being able to say WHY. `outstandingCents` was
 * always posted gross minus applied money, but only the difference survived: a surface could say
 * what a family still owed and none could say what had already been paid. That is the shape in
 * which a presentation layer starts subtracting figures back out and quietly becomes a second
 * source of financial truth.
 *
 * Both are asserted against real persistence, semantically — no household is named, so a fixture
 * rename cannot satisfy them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { resolveFinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";

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

describeLive("the Accounts cohort keeps child attribution and explains its balances — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    it("tells a child-scoped obligation apart from a household-level one", async () => {
        const cohort = await resolveFinancialPositionCohort(supabase, orgWide as never);
        expect(cohort.rows.length, "the cohort resolved real work").toBeGreaterThan(0);

        const childScoped = cohort.rows.filter((r) => r.customerMemberId);
        const householdLevel = cohort.rows.filter((r) => !r.customerMemberId);

        expect(
            childScoped.length,
            "no charge in the cohort names a child — the projection has dropped attribution again",
        ).toBeGreaterThan(0);
        expect(
            householdLevel.length,
            "no charge is household-level, so the childless case is not being exercised",
        ).toBeGreaterThan(0);

        /*
         * MORE THAN ONE CHILD, or the distinction is unproven: a cohort in which every attributed
         * charge names the same child cannot show that two children stay apart.
         */
        expect(
            new Set(childScoped.map((r) => r.customerMemberId)).size,
            "every attributed charge names the same child — two children cannot be told apart",
        ).toBeGreaterThan(1);
    }, 180_000);

    it("never invents a child for a household-level charge", async () => {
        const cohort = await resolveFinancialPositionCohort(supabase, orgWide as never);
        const invented = cohort.rows.filter(
            (r) => r.customerMemberId && !r.enrollmentAgreementId,
        );
        expect(
            invented.map((r) => r.position.chargeId),
            "a charge with no agreement is carrying a child it cannot have",
        ).toEqual([]);
    }, 180_000);

    it("reports the money that was applied, not only what is left", async () => {
        const cohort = await resolveFinancialPositionCohort(supabase, orgWide as never);

        const settled = cohort.rows.filter(
            (r) => r.position.explanation.netCents > 0 && r.position.outstandingCents === 0,
        );
        expect(
            settled.length,
            "nothing in the cohort is paid in full, so applied money cannot be shown to be reported",
        ).toBeGreaterThan(0);
        for (const row of settled.slice(0, 25)) {
            expect(
                row.position.explanation.appliedCents,
                "a fully settled obligation reports no applied money",
            ).toBeGreaterThan(0);
        }

        /*
         * THE IDENTITY THE SURFACE MUST NOT HAVE TO RE-DERIVE. Where nothing was reduced, what is
         * still owed is exactly what was billed less what was paid. Asserting it here is what lets
         * a presentation layer render both figures instead of subtracting one out of the other.
         */
        for (const row of cohort.rows.filter((r) => r.position.explanation.reductionsCents === 0).slice(0, 50)) {
            const { grossCents, appliedCents } = row.position.explanation;
            expect(
                row.position.outstandingCents,
                `outstanding disagrees with gross − applied on charge ${row.position.chargeId}`,
            ).toBe(Math.max(0, grossCents - appliedCents));
        }
    }, 180_000);
});
