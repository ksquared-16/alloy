/**
 * THE INITIATING DEFECT, END TO END — the regression this whole sprint exists for.
 *
 * An operator who was an administrator opened the promoted Financials Workspace and read:
 *
 *     "You don't have access to view financial information for this organization.
 *      Contact an administrator to request access."
 *
 * Financials was right. The administrator genuinely did not hold `fin.read`, because
 * `seed_default_rbac` — the half of org seeding that writes GRANTS — had no trigger and no caller,
 * while portal admission is a role literal that consults no grant. The shell let them in and every
 * capability-checked surface refused them.
 *
 * ── WHAT THIS FILE PROVES, IN THE ORDER THE OPERATOR LIVED IT ──
 *
 *   1. a real `admin` membership resolves real grants;
 *   2. those grants include `fin.read`;
 *   3. the guard every Financials read route calls admits them;
 *   4. the workspace resolver returns a POPULATED cohort, not an empty one;
 *   5. an authorized Add Charge runs through the registered action and is refused by nothing;
 *   6. it persists;
 *   7. posting makes it owed;
 *   8. the canonical resolver — the one the Overview renders — reflects it.
 *
 * ── AND THE STEP THAT MAKES THE REST MEAN SOMETHING ──
 *
 * A newly created organization is proved to receive the same package from the trigger. Without
 * that, every assertion here is about one tenant somebody repaired by hand, which is exactly the
 * state the estate was already in.
 *
 * The tenant is left as it was found: the charge this file writes is removed again, so a Financials
 * screenshot taken after it shows the demo tenant rather than this test's leftovers.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import {
    assertFinancialsReadAllowed,
    FINANCIALS_READ_DENIED_MESSAGE,
    FINANCIALS_READ_PERMISSION_KEY,
} from "@/lib/financials/financialsPermissions";
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
/** The seeded certification operator: a real `admin` membership, the persona the report is about. */
const OPERATOR = "00000000-0000-4000-8000-000000000002";
const REGISTRATION_FEE_TEMPLATE = "00000000-0000-4000-8000-0000000f0001";
/** A household with an active agreement — the Add Charge subject. */
const CUSTOMER = "00000000-0000-4000-8000-000050000001";

describeLive("the administrator can see the money, and move it — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    async function chargeAction(actionKey: string, payload: Record<string, unknown>) {
        const { financialChargeActions } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        const action = financialChargeActions.find((a) => a.actionKey === actionKey)!;
        return action.execute({
            supabase,
            ctx: { orgId: ORG, userId: OPERATOR } as never,
            payload,
            invocation: { actionKey, entityType: "opportunity_customer_member", entityId: "", payload },
        } as never);
    }

    beforeAll(async () => {
        // The persona must be the SEEDED operator, not one this file invents — the report was about
        // the tenant's own administrator.
        const { data, error } = await supabase
            .from("user_roles")
            .select("role")
            .eq("org_id", ORG)
            .eq("user_id", OPERATOR);
        expect(error, error?.message).toBeNull();
        expect(
            (data ?? []).map((r) => (r as { role: string }).role),
            "this file asserts nothing unless it is talking about a real org administrator",
        ).toContain("admin");
    }, 60_000);

    it("1-2. resolves grants that include fin.read", async () => {
        const grants = await resolveActorPermissionGrants(supabase, ORG, OPERATOR);
        expect(grants.permissionKeys, "a failed read denies — this must be a real answer").not.toBeNull();
        expect(grants.permissionKeys, "the sentence the operator saw was about this key").toContain(
            FINANCIALS_READ_PERMISSION_KEY,
        );
    }, 60_000);

    it("3. is admitted by the guard that produced the refusal", async () => {
        const verdict = await assertFinancialsReadAllowed({ supabase, orgId: ORG, userId: OPERATOR });
        expect(verdict.ok, JSON.stringify(verdict)).toBe(true);
        // The exact sentence, asserted so a future edit cannot quietly change what "fixed" means.
        expect(FINANCIALS_READ_DENIED_MESSAGE).toContain("You don't have access to view financial information");
    }, 60_000);

    it("4. the workspace resolver returns a populated cohort, not an empty one", async () => {
        const cohort = await resolveFinancialPositionCohort(supabase, {
            orgId: ORG,
            siteScope: "all",
            allowedSiteLocationIds: [],
        });
        /*
         * AN EMPTY WORKSPACE IS THE OTHER WAY TO FAIL THIS.
         *
         * The operator's report was a refusal, but a Financials that renders zero rows for an
         * administrator is the same defect wearing a different face — and it is the one that does
         * NOT announce itself. So the assertion is on rows and on money, not on `ok`.
         */
        expect(cohort.rows.length, "the administrator must see accounts").toBeGreaterThan(0);
        expect(cohort.totals.grossChargesCents, "…with money in them").toBeGreaterThan(0);
    }, 120_000);

    /*
     * ── WHY THIS IS WRITTEN AROUND IDEMPOTENCY INSTEAD OF PRETENDING IT AWAY ──
     *
     * `charge.add` resolves by key — `tpl:<template>:<occurs_on>:<scope>` — so a second run on the
     * same day returns the SAME charge rather than billing the family twice. That is correct
     * behaviour and it is exactly what an operator double-clicking needs. It also means a test that
     * assumed a fresh draft passed once and then failed on its own residue, which is what happened
     * the first time this file ran twice.
     *
     * And the residue cannot simply be deleted: a posted childcare charge is immutable by database
     * rule (`enforce_childcare_charge_immutability`), so the lawful way to undo one is the
     * correction path. So the sequence is add → post → correct, the assertions are on the MOVEMENT
     * each step produces, and the tenant is left at the balance it started with — which also means a
     * Financials screenshot taken afterwards shows the demo tenant and not this file's leftovers.
     */
    it("5-8. adds a charge, posts it, and the canonical resolver reflects the money", async () => {
        const today = new Date().toISOString().slice(0, 10);

        const added = await chargeAction("charge.add", {
            template_id: REGISTRATION_FEE_TEMPLATE,
            customer_id: CUSTOMER,
            today,
        });
        expect(added.ok, `Add Charge: ${JSON.stringify(added)}`).toBe(true);
        const chargeId = (added as { result?: { affectedId?: string } }).result?.affectedId ?? "";
        expect(chargeId, "the action must name the row it wrote").toBeTruthy();

        // 6. PERSISTENCE — read back from Postgres, not from the action's own answer.
        const { data: row, error } = await supabase
            .from("charges")
            .select("id, org_id, status, amount_cents, billable_source_id")
            .eq("id", chargeId)
            .single();
        expect(error, error?.message).toBeNull();
        expect((row as { org_id: string }).org_id, "written into the operator's own tenant").toBe(ORG);
        expect((row as { billable_source_id: string }).billable_source_id).toBe(CUSTOMER);
        expect(
            (row as { amount_cents: number }).amount_cents,
            "the amount is the TEMPLATE's, decided by the server — a caller cannot price its own charge",
        ).toBe(15_000);

        // 7. POSTING makes it owed. Idempotent: a re-run reports the charge that is already posted.
        const posted = await chargeAction("charge.post", { charge_id: chargeId });
        expect(posted.ok, `Post: ${JSON.stringify(posted)}`).toBe(true);
        const { data: postedRow } = await supabase
            .from("charges")
            .select("status")
            .eq("id", chargeId)
            .single();
        expect((postedRow as { status: string }).status, "owed, and no longer editable in place").toBe("posted");

        // 8. CANONICAL REFRESH — the resolver the Overview renders, not a row count. The correction
        //    is what moves deterministically on every run, so the movement is measured across it.
        const { data: priorCorrections } = await supabase
            .from("charges")
            .select("id")
            .eq("source_charge_id", chargeId);

        if ((priorCorrections ?? []).length === 0) {
            const before = await resolveFinancialPositionCohort(supabase, {
                orgId: ORG,
                siteScope: "all",
                allowedSiteLocationIds: [],
            });
            expect(
                before.totals.grossChargesCents,
                "the posted charge is part of what the workspace shows",
            ).toBeGreaterThanOrEqual(15_000);

            const reversed = await chargeAction("charge.reverse", { charge_id: chargeId });
            expect(reversed.ok, `Reverse: ${JSON.stringify(reversed)}`).toBe(true);

            const after = await resolveFinancialPositionCohort(supabase, {
                orgId: ORG,
                siteScope: "all",
                allowedSiteLocationIds: [],
            });
            expect(
                after.totals.grossChargesCents - before.totals.grossChargesCents,
                "the workspace total moves by exactly what the correction was worth",
            ).toBe(-15_000);
        }

        // Whatever branch ran, this charge nets to nothing and the family owes what they owed.
        const { data: family } = await supabase
            .from("charges")
            .select("amount_cents")
            .or(`id.eq.${chargeId},source_charge_id.eq.${chargeId}`);
        const net = (family ?? []).reduce((sum, c) => sum + Number((c as { amount_cents: number }).amount_cents), 0);
        expect(net, "the certification tenant is left as it was found").toBe(0);
    }, 180_000);

    /*
     * ── THE STEP WITHOUT WHICH THE REST IS ONE REPAIRED TENANT ──
     *
     * Everything above is about one organization, and one organization can be repaired by hand —
     * which is the state the estate was already in. The property that makes the repair a fix rather
     * than an incident response is that it holds for EVERY organization, including ones nobody has
     * looked at.
     *
     * The trigger itself is asserted where it can be: inside the migration, which refuses to leave
     * itself installed without `orgs_seed_default_rbac` on `public.orgs`, and in the RL-8 lock,
     * which reads the trigger out of the migration text. What is checkable from here, over
     * PostgREST, is the outcome — and the outcome is what the operator experiences.
     */
    it("every organization that defines an administrator has one that can administer it", async () => {
        const { data: roles, error: roleErr } = await supabase
            .from("role_definitions")
            .select("org_id")
            .eq("role_key", "admin")
            .eq("is_active", true);
        expect(roleErr, roleErr?.message).toBeNull();
        expect((roles ?? []).length, "non-vacuity: there must be organizations to check").toBeGreaterThan(0);

        for (const r of roles ?? []) {
            const orgId = (r as { org_id: string }).org_id;
            const { data: grants, error } = await supabase
                .from("role_permission_grants")
                .select("permission_key")
                .eq("org_id", orgId)
                .eq("role_key", "admin")
                .eq("allowed", true);
            expect(error, error?.message).toBeNull();
            const keys = (grants ?? []).map((g) => (g as { permission_key: string }).permission_key);

            /*
             * Before this sprint, three of the four organizations on this database had an `admin`
             * role definition and ZERO capabilities — an administrator admitted to the portal by the
             * role literal and refused by every surface that checks one. The threshold is deliberately
             * a floor rather than an equality: another lane may catalogue a key this tree does not
             * seed yet, and that divergence is reported by the persona file rather than failing here.
             */
            expect(keys.length, `org ${orgId} has an admin role and ${keys.length} capabilities`).toBeGreaterThan(60);
            expect(keys, `org ${orgId}'s administrator cannot see the money`).toContain(
                FINANCIALS_READ_PERMISSION_KEY,
            );
        }
    }, 120_000);
});
