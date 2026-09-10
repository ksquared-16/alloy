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
 * ── charge.post WAS A SEPARATE QUESTION, AND IS NO LONGER ──
 *
 * This file used to carry the opposite assertion: that `charge.post` declared no Financials-specific
 * write permission, was gated by the admin/ops route gate instead, and that the absence of
 * `fin.write` for a director therefore said NOTHING about whether posting would refuse them. It was
 * pinned as an absence precisely so that closing the debt would surface here as a failing
 * expectation rather than a silent change of meaning. It did.
 *
 * `charge.add` and `charge.post` now require `fin.write` and `charge.reverse` requires `fin.adjust`,
 * enforced in the action bodies — so the four absent grants below are load-bearing rather than
 * decorative, and the claim this file makes has become the stronger one: a director cannot move
 * money because the server refuses, not merely because a table lacks a row.
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
/**
 * The seeded certification operator — a real `admin` membership in this org.
 *
 * Present so a refusal can be shown to be about AUTHORITY rather than about the arguments: the same
 * nonsense payload that stops the director at 403 must reach the domain when an administrator sends
 * it. Without a contrasting principal, "the director was refused" is compatible with "everybody is
 * refused, and the gate proves nothing".
 */
const ADMIN_USER = "00000000-0000-4000-8000-000000000002";

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
     * ── THE DEBT THIS FILE USED TO PIN, NOW CLOSED AND PROVED AS BEHAVIOUR ──
     *
     * The old assertion read the source of `financialChargeActions.ts` and required `charge.post` to
     * name no Financials permission. Reading source was the right instrument for pinning an ABSENCE;
     * it is the wrong one for a presence, because a file that mentions `fin.write` in a comment
     * would satisfy it. So the replacement asks the server.
     *
     * A school director holds `fin.read` and none of the four mutation keys. All three charge
     * actions must refuse them, and refuse with 403 rather than by failing to find something.
     */
    it.each([
        ["charge.add", { template_id: "any", customer_id: "any", today: "2027-03-01" }, "fin.write"],
        ["charge.post", { charge_id: "any" }, "fin.write"],
        ["charge.reverse", { charge_id: "any" }, "fin.adjust"],
    ])("refuses %s to a school director, server-side", async (actionKey, payload, requiredKey) => {
        const { financialChargeActions } = await import(
            "@/lib/adminV2/actions/definitions/financialChargeActions"
        );
        const action = financialChargeActions.find((a) => a.actionKey === actionKey)!;
        expect(action, `${actionKey} is registered`).toBeTruthy();

        const result = await action.execute!({
            supabase,
            ctx: { orgId: ORG, userId: DIRECTOR } as never,
            payload,
            invocation: {
                actionKey,
                entityType: "opportunity_customer_member",
                entityId: "",
                payload,
            },
        } as never);

        expect(result.ok, `a director may not ${actionKey}`).toBe(false);
        expect((result as { status?: number }).status, "refused as forbidden").toBe(403);
        expect((result as { error?: string }).error ?? "").toContain(requiredKey);
    }, 120_000);

    /*
     * AND THE REFUSAL IS ABOUT AUTHORITY, NOT ABOUT THE ARGUMENTS.
     *
     * Every payload above names ids that do not exist. If the capability check ran after the domain
     * lookups, a director would be refused with 404 or 409 and this file would read as proof of a
     * gate that is not there — the failure mode the source-reading assertion had in the other
     * direction. The administrator, holding the same nonsense payload, must get PAST the gate and be
     * refused by the domain instead: a different status is what shows the gate is the thing that
     * stopped the director.
     */
    it("refuses the director at the gate, not at the lookup", async () => {
        const { financialChargeActions } = await import(
            "@/lib/adminV2/actions/definitions/financialChargeActions"
        );
        const post = financialChargeActions.find((a) => a.actionKey === "charge.post")!;
        const payload = { charge_id: "00000000-0000-4000-8000-00000000beef" };
        const invocation = { actionKey: "charge.post", entityType: "opportunity_customer_member", entityId: "", payload };

        const asDirector = await post.execute!({
            supabase, ctx: { orgId: ORG, userId: DIRECTOR } as never, payload, invocation,
        } as never);
        const asAdmin = await post.execute!({
            supabase, ctx: { orgId: ORG, userId: ADMIN_USER } as never, payload, invocation,
        } as never);

        expect((asDirector as { status?: number }).status, "the director is stopped by the gate").toBe(403);
        expect(asAdmin.ok, "the admin gets past the gate and fails on the missing charge").toBe(false);
        expect(
            (asAdmin as { status?: number }).status,
            "an administrator holding fin.write is refused by the DOMAIN, not by authority",
        ).not.toBe(403);
    }, 120_000);
});
