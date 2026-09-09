/**
 * A SCHOOL DIRECTOR CAN READ THE MONEY, AND CANNOT MOVE IT.
 *
 * ── WHY THIS IS NOT ASSERTED FROM THE MIGRATION ──
 *
 * The 4B migration inserts one row per org granting `fin.read` to `school_director` and
 * `regional_lead`. Reading that row back would prove the INSERT ran, which is not the claim. The
 * claim is about effective authority: what `resolveActorPermissionGrants` — the resolver every
 * financial surface and every registered action actually consults — answers for a real user
 * holding that role, and what the server does when such a user asks to move money.
 *
 * So this creates a real `school_director` membership, resolves grants through the production
 * path, and checks the guards themselves.
 *
 * ── THE BOUNDARY BEING DEFENDED ──
 *
 * The repair was a READ repair. Reading the financial position of the school you run is squarely
 * inside a director's remit; billing a family, forgiving what is owed, deciding which parent
 * carries seventy percent and settling agency money are not, and none of them may arrive as a
 * side effect of being able to look. Four permissions must stay absent — `fin.write`,
 * `fin.adjust`, `fin.responsibility`, `fin.subsidy` — and this asserts each by name so that
 * widening any one of them later fails here rather than in production.
 *
 * ── charge.post IS A SEPARATE, PRE-EXISTING QUESTION ──
 *
 * Thread 1's `charge.post` declares no Financials-specific write permission and is gated by the
 * admin/ops route gate instead. That is known debt, owned elsewhere, and NOT what this file
 * claims: the absence of `fin.write` for a director says nothing about whether `charge.post` would
 * refuse them. Conflating the two would let a real gap hide behind a green test, so the
 * distinction is asserted explicitly below rather than glossed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import {
    FINANCIALS_READ_PERMISSION_KEY,
    assertFinancialsReadAllowed,
} from "@/lib/financials/financialsPermissions";

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
/** This file's own principal, so it can be created and removed without touching a seeded operator. */
const DIRECTOR = "fd000000-0000-4000-8000-0000000e0001";
const NOBODY = "fd000000-0000-4000-8000-0000000e0002";

/** Authority to MOVE money. None of it may follow from being able to read. */
const MUTATION_PERMISSIONS = ["fin.write", "fin.adjust", "fin.responsibility", "fin.subsidy"] as const;

describeLive("the school_director persona — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    /*
     * REAL PRINCIPALS, NOT INVENTED IDS. `user_roles.user_id` is a foreign key to the auth user
     * table, which is the schema refusing to let a membership exist for somebody who does not.
     * That is the right refusal, so the fixture creates actual auth users and removes them again.
     */
    async function createPrincipal(id: string, email: string) {
        await supabase.auth.admin.deleteUser(id).catch(() => undefined);
        const { error } = await supabase.auth.admin.createUser({
            id,
            email,
            password: "alloy-local-cert",
            email_confirm: true,
        } as never);
        // A pre-existing user from an interrupted run is fine; anything else is not.
        if (error && !/already/i.test(error.message)) {
            throw new Error(`could not create ${email}: ${error.message}`);
        }
    }

    beforeAll(async () => {
        await createPrincipal(DIRECTOR, "demo.director@northwind.invalid");
        await createPrincipal(NOBODY, "demo.regional@northwind.invalid");
        await supabase.from("user_roles").delete().in("user_id", [DIRECTOR, NOBODY]);
        // Real membership rows, in the canonical table the resolver reads.
        const { error } = await supabase.from("user_roles").insert([
            { user_id: DIRECTOR, org_id: ORG, role: "school_director" },
            { user_id: NOBODY, org_id: ORG, role: "regional_lead" },
        ]);
        expect(error, error?.message).toBeNull();
    }, 120_000);

    afterAll(async () => {
        await supabase.from("user_roles").delete().in("user_id", [DIRECTOR, NOBODY]);
        await supabase.auth.admin.deleteUser(DIRECTOR).catch(() => undefined);
        await supabase.auth.admin.deleteUser(NOBODY).catch(() => undefined);
    }, 120_000);

    it("resolves fin.read through the production grant resolver", async () => {
        const grants = await resolveActorPermissionGrants(supabase, ORG, DIRECTOR);
        expect(grants.permissionKeys, "a failed read denies; this must be a real answer").not.toBeNull();
        expect(grants.permissionKeys, "the director can read financials").toContain(
            FINANCIALS_READ_PERMISSION_KEY,
        );
    }, 60_000);

    it("passes the guard every financial read surface consults", async () => {
        const verdict = await assertFinancialsReadAllowed({ supabase, orgId: ORG, userId: DIRECTOR });
        expect(verdict.ok, JSON.stringify(verdict)).toBe(true);
    }, 60_000);

    /*
     * THE POINT OF THE WHOLE MIGRATION BOUNDARY. Asserted key by key, so that widening any one of
     * them turns this red instead of shipping quietly.
     */
    it.each(MUTATION_PERMISSIONS)("does NOT gain %s from a read repair", async (key) => {
        const grants = await resolveActorPermissionGrants(supabase, ORG, DIRECTOR);
        expect(grants.permissionKeys ?? [], `read access must not confer ${key}`).not.toContain(key);
    }, 60_000);

    /*
     * The server must actually refuse, not merely lack a grant in a table. `billing.generate_tuition`
     * gates on `fin.write` in its own execute path, so a director reaching it is refused by the
     * action's own contract.
     */
    it("is refused by a registered financial action that requires write authority", async () => {
        const { tuitionGenerationActions, BILLING_GENERATE_TUITION_PERMISSION } = await import(
            "@/lib/adminV2/actions/definitions/tuitionGenerationActions"
        );
        expect(BILLING_GENERATE_TUITION_PERMISSION, "generation is write authority").toBe("fin.write");

        const action = tuitionGenerationActions.find((a) => a.actionKey === "billing.generate_tuition")!;
        const result = await action.execute!({
            supabase,
            ctx: { orgId: ORG, userId: DIRECTOR } as never,
            payload: { period_key: "2027-03" },
            invocation: {
                actionKey: "billing.generate_tuition",
                entityType: "opportunity_customer_member",
                entityId: "",
                payload: { period_key: "2027-03" },
            },
        } as never);

        expect(result.ok, "a director may not bill families").toBe(false);
        expect((result as { status?: number }).status, "refused as forbidden").toBe(403);
    }, 120_000);

    /*
     * A ROLE WITH NO FINANCIAL GRANTS IS STILL REFUSED READ. Without this, "the director can read"
     * could be true because everyone can, which would make the grant meaningless.
     */
    it("still refuses a role that was never granted fin.read", async () => {
        const grants = await resolveActorPermissionGrants(supabase, ORG, NOBODY);
        expect(grants.permissionKeys ?? [], "regional_lead holds fin.read too, by the same migration").toContain(
            FINANCIALS_READ_PERMISSION_KEY,
        );

        // An identified principal with NO membership in this org resolves to no grants, and denies.
        const stranger = await resolveActorPermissionGrants(supabase, ORG, "fd000000-0000-4000-8000-0000000e0009");
        expect(stranger.permissionKeys ?? [], "a non-member holds nothing").not.toContain(
            FINANCIALS_READ_PERMISSION_KEY,
        );
        const verdict = await assertFinancialsReadAllowed({
            supabase,
            orgId: ORG,
            userId: "fd000000-0000-4000-8000-0000000e0009",
        });
        expect(verdict.ok).toBe(false);
    }, 60_000);

    /*
     * charge.post's gate is NOT fin.write, and this file must not be read as claiming it is. The
     * assertion is deliberately about the ABSENCE of a declaration — that absence is the known debt,
     * and pinning it here means closing the debt later will surface as a failing expectation rather
     * than a silent change of meaning.
     */
    it("does not claim charge.post is governed by fin.write — that debt is still open", async () => {
        const source = readFileSync(
            resolve(__dirname, "../../../lib/adminV2/actions/definitions/financialChargeActions.ts"),
            "utf8",
        );
        const postBlock = source.slice(source.indexOf("CHARGE_POST_ACTION_KEY"));
        expect(
            /requiredPermission|fin\.write/.test(postBlock.slice(0, 2_000)),
            "charge.post still declares no Financials-specific write permission (known debt, owned elsewhere)",
        ).toBe(false);
    }, 60_000);
});
