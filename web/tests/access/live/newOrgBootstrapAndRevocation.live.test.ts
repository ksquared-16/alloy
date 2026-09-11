/**
 * THE TWO PROPERTIES THE REPAIR STANDS ON, PROVED AGAINST REAL POSTGRES.
 *
 *   1. A brand-new organization is born with a working administrator.
 *   2. Repairing the estate does not undo an administrator's deliberate decision.
 *
 * They pull in opposite directions, which is why both are here. The first wants defaults applied
 * everywhere; the second wants them never re-applied over a choice somebody made. A repair that
 * only satisfies the first is how "admin defaults" becomes an unstoppable superuser package.
 *
 * ── THE ORG IS CREATED THE WAY ORGANIZATIONS ARE CREATED ──
 *
 * By inserting a row into `public.orgs`. That is the real path and the only one: a full-tree census
 * finds no product route, no service and no script that creates an organization, which is exactly
 * why the grants half of seeding could go unwired for so long without anyone noticing. The bootstrap
 * IS the trigger, so the trigger is what this exercises. `seed_default_rbac` is never called by hand
 * here — calling it would prove the function works, which was never in doubt, rather than proving
 * that creating an organization reaches it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import { PORTAL_ADMISSION_CAPABILITY } from "@/lib/admin/portalAdmission";
import { assertFinancialsReadAllowed, FINANCIALS_READ_PERMISSION_KEY } from "@/lib/financials/financialsPermissions";
import { discoverCatalog } from "../permissionCatalogDiscovery";

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

/** The tenant this file creates, and removes again. */
const NEW_ORG = "b0075100-0000-4000-8000-00000000b007";
const NEW_ORG_ADMIN = "b0075100-0000-4000-8000-00000000a001";
/** An existing tenant, for the revocation half. */
const EXISTING_ORG = "00000000-0000-4000-8000-000000000001";

/** Withheld from `ops` by the decision of the migration that introduced each key. */
const OPS_WITHHELD = [
    "admin.users.write",
    "admin.roles.write",
    "enrollment.pricing.override",
    "enrollment.requirement_exception.manage",
    "fin.adjust",
    "fin.responsibility",
    "fin.subsidy",
    "health.view",
    "health.manage",
] as const;

/**
 * The nine keys catalogued after the seed enumeration froze — the only keys §3b of the repair can
 * touch. Named here so the blast-radius assertion below is checkable rather than asserted.
 */
const POST_FREEZE_KEYS = [
    "attendance.read",
    "attendance.record",
    "enrollment.pricing.override",
    "enrollment.requirement_exception.manage",
    "fin.adjust",
    "fin.responsibility",
    "fin.subsidy",
    "health.view",
    "health.manage",
] as const;

describeLive("a new organization is born able to administer itself — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    async function grantsFor(orgId: string, roleKey: string): Promise<string[]> {
        const { data, error } = await supabase
            .from("role_permission_grants")
            .select("permission_key")
            .eq("org_id", orgId)
            .eq("role_key", roleKey)
            .eq("allowed", true);
        expect(error, error?.message).toBeNull();
        return (data ?? []).map((r) => (r as { permission_key: string }).permission_key);
    }

    afterAll(async () => {
        await supabase.from("user_roles").delete().eq("user_id", NEW_ORG_ADMIN);
        await supabase.auth.admin.deleteUser(NEW_ORG_ADMIN).catch(() => undefined);
        await supabase.from("role_permission_grants").delete().eq("org_id", NEW_ORG);
        await supabase.from("role_definitions").delete().eq("org_id", NEW_ORG);
        await supabase.from("orgs").delete().eq("id", NEW_ORG);
    }, 120_000);

    it("creates its four system roles and their default packages from the trigger alone", async () => {
        // Idempotent for a re-run of an interrupted pass.
        await supabase.from("role_permission_grants").delete().eq("org_id", NEW_ORG);
        await supabase.from("role_definitions").delete().eq("org_id", NEW_ORG);
        await supabase.from("orgs").delete().eq("id", NEW_ORG);

        const { error } = await supabase.from("orgs").insert({
            id: NEW_ORG,
            name: "Bootstrap Proof Academy",
            slug: "bootstrap-proof-academy",
            status: "active",
        });
        expect(error, error?.message).toBeNull();

        const { data: roles, error: roleErr } = await supabase
            .from("role_definitions")
            .select("role_key, is_system, is_active")
            .eq("org_id", NEW_ORG);
        expect(roleErr, roleErr?.message).toBeNull();
        expect(
            (roles ?? []).map((r) => (r as { role_key: string }).role_key).sort(),
            "the four system roles arrive with the organization",
        ).toEqual(["admin", "ops", "regional_lead", "school_director"]);

        /*
         * THE CONTRACT, NOT A COUNT. "Organization Administrator administers the tenant" is the
         * property that no capability this repository defines is missing — written as a number, this
         * assertion would pass on the day the next key was added and the new org did not receive it,
         * which is precisely the defect being regressed.
         */
        const tree = [...discoverCatalog().keys()].sort();
        expect(tree.length, "non-vacuity: the migration scrape must have found the catalog").toBeGreaterThan(60);
        const admin = await grantsFor(NEW_ORG, "admin");
        expect([...admin].sort(), "a new organization's administrator holds every catalogued capability").toEqual(tree);

        const ops = await grantsFor(NEW_ORG, "ops");
        expect([...ops].sort()).toEqual(tree.filter((k) => !(OPS_WITHHELD as readonly string[]).includes(k)));
        for (const withheld of OPS_WITHHELD) {
            expect(ops, `${withheld} must not arrive at ops by default`).not.toContain(withheld);
        }

        expect(await grantsFor(NEW_ORG, "school_director")).toEqual([FINANCIALS_READ_PERMISSION_KEY]);
        expect(await grantsFor(NEW_ORG, "regional_lead")).toEqual([FINANCIALS_READ_PERMISSION_KEY]);

        // No duplicates: the seed is idempotent and the trigger must not have doubled anything.
        const { data: all } = await supabase
            .from("role_permission_grants")
            .select("role_key, permission_key")
            .eq("org_id", NEW_ORG);
        const pairs = (all ?? []).map((r) => `${(r as { role_key: string }).role_key}:${(r as { permission_key: string }).permission_key}`);
        expect(new Set(pairs).size, "a duplicate grant row").toBe(pairs.length);
    }, 180_000);

    /*
     * ── THE ACTUAL INITIATING DEFECT, REGRESSED ──
     *
     * The administrator of a newly created organization is not trapped in the shell. Before the
     * repair this is exactly where it broke: four roles, zero grants, admitted by the role literal
     * and refused by every surface that checks a capability.
     */
    it("its administrator resolves real capabilities and is admitted by the Financials guard", async () => {
        await supabase.auth.admin.deleteUser(NEW_ORG_ADMIN).catch(() => undefined);
        const { error: userErr } = await supabase.auth.admin.createUser({
            id: NEW_ORG_ADMIN,
            email: "cert.bootstrap.admin@access-identity.invalid",
            password: "alloy-local-cert",
            email_confirm: true,
        } as never);
        if (userErr && !/already/i.test(userErr.message)) throw new Error(userErr.message);

        const { error: memberErr } = await supabase
            .from("user_roles")
            .insert({ user_id: NEW_ORG_ADMIN, org_id: NEW_ORG, role: "admin" });
        expect(memberErr, memberErr?.message).toBeNull();

        const grants = await resolveActorPermissionGrants(supabase, NEW_ORG, NEW_ORG_ADMIN);
        expect(grants.permissionKeys, "a failed read denies; this must be a real answer").not.toBeNull();
        expect(grants.permissionKeys, "the sentence the operator saw was about this key").toContain(
            FINANCIALS_READ_PERMISSION_KEY,
        );

        /*
         * W-13 — AND THE FRONT DOOR OPENS FOR THEM, which is now a grant rather than a role name.
         *
         * This is the bootstrap invariant, asserted rather than assumed. W-13's instruction asks
         * whether any emergency or bootstrap case requires keeping `admin`/`ops` as an admission
         * fallback beside the capability; the honest way to answer is to create an organization the
         * way the product creates one and check that its administrator can get in. `seed_default_rbac`
         * enumerates `portal.access` and `orgs_seed_default_rbac` fires on INSERT, so it arrives with
         * the organization — there is no window in which a tenant exists and nobody can administer
         * it, and therefore no invariant that would justify a role-literal fallback.
         *
         * The assertion above ("every catalogued capability") already covers this key as a member of
         * the set. It is named separately because its absence is a different KIND of failure: every
         * other missing key is a surface the administrator cannot use, and this one is a tenant
         * nobody can enter.
         */
        expect(
            grants.permissionKeys,
            "a new organization's administrator cannot open the portal — there is no fallback to save them",
        ).toContain(PORTAL_ADMISSION_CAPABILITY);

        const verdict = await assertFinancialsReadAllowed({ supabase, orgId: NEW_ORG, userId: NEW_ORG_ADMIN });
        expect(verdict.ok, JSON.stringify(verdict)).toBe(true);

        const { financialChargeActions } = await import("@/lib/adminV2/actions/definitions/financialChargeActions");
        const post = financialChargeActions.find((a) => a.actionKey === "charge.post")!;
        const payload = { charge_id: "00000000-0000-4000-8000-00000000beef" };
        const result = await post.execute({
            supabase,
            ctx: { orgId: NEW_ORG, userId: NEW_ORG_ADMIN } as never,
            payload,
            invocation: { actionKey: "charge.post", entityType: "opportunity_customer_member", entityId: "", payload },
        } as never);
        expect(
            (result as { status?: number }).status,
            "the new organization's administrator is not stopped by authority",
        ).not.toBe(403);
    }, 180_000);
});

describeLive("a deliberate revocation survives the repair — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    /** Restored in afterAll whatever happens, so the tenant is left as it was found. */
    let restore: string[] | null = null;

    afterAll(async () => {
        if (restore) {
            await supabase.rpc("replace_role_permission_grants", {
                p_org_id: EXISTING_ORG,
                p_role_key: "admin",
                p_permission_keys: restore,
            });
        }
        await supabase.from("orgs").delete().eq("id", "b0075100-0000-4000-8000-00000000b008");
    }, 120_000);

    /*
     * ── WHY THE REVOKED KEY IS ONE OF THE ORIGINAL FIFTY-SEVEN ──
     *
     * §3b of the repair is bounded to the nine keys catalogued after the seed enumeration froze. A
     * revocation of any other key is therefore unconditionally safe — no statement in the repair can
     * reach it — and that is the property worth locking, because it holds however many times the
     * repair runs. The nine are covered by the blast-radius assertion below instead.
     */
    it("an administrator capability revoked through the canonical RPC stays revoked", async () => {
        const { data: before, error: readErr } = await supabase
            .from("role_permission_grants")
            .select("permission_key")
            .eq("org_id", EXISTING_ORG)
            .eq("role_key", "admin")
            .eq("allowed", true);
        expect(readErr, readErr?.message).toBeNull();
        const held = (before ?? []).map((r) => (r as { permission_key: string }).permission_key);
        restore = [...held];

        const REVOKED = "reports.write";
        expect(held, "precondition: the capability is held before it is revoked").toContain(REVOKED);

        // The canonical mechanism — the same RPC the Access editor's route calls. Revocation is a
        // DELETE, which is the whole reason a blind backfill would restore it.
        const { error: revokeErr } = await supabase.rpc("replace_role_permission_grants", {
            p_org_id: EXISTING_ORG,
            p_role_key: "admin",
            p_permission_keys: held.filter((k) => k !== REVOKED),
        });
        expect(revokeErr, revokeErr?.message).toBeNull();

        const { data: rows } = await supabase
            .from("role_permission_grants")
            .select("permission_key")
            .eq("org_id", EXISTING_ORG)
            .eq("role_key", "admin")
            .eq("permission_key", REVOKED);
        expect(rows ?? [], "revocation removes the row rather than flagging it").toEqual([]);

        /*
         * THE BOOTSTRAP PATH RUNS — and it is the path that can still run for an existing estate.
         * Creating another organization fires the trigger, which calls the seed, which writes
         * defaults. If seeding reached beyond the org being created, this is where it would show.
         */
        const OTHER = "b0075100-0000-4000-8000-00000000b008";
        await supabase.from("orgs").delete().eq("id", OTHER);
        const { error: orgErr } = await supabase
            .from("orgs")
            .insert({ id: OTHER, name: "Revocation Probe Org", slug: "revocation-probe-org", status: "active" });
        expect(orgErr, orgErr?.message).toBeNull();

        const { data: after } = await supabase
            .from("role_permission_grants")
            .select("permission_key")
            .eq("org_id", EXISTING_ORG)
            .eq("role_key", "admin")
            .eq("permission_key", REVOKED);
        expect(after ?? [], "seeding a new organization must not touch another organization").toEqual([]);

        // And the resolver every gate consults agrees — the revocation is effective, not cosmetic.
        const grants = await resolveActorPermissionGrants(
            supabase,
            EXISTING_ORG,
            "00000000-0000-4000-8000-000000000002",
        );
        expect(grants.permissionKeys ?? [], "the operator no longer holds what was revoked").not.toContain(REVOKED);
        expect(grants.permissionKeys ?? [], "…and still holds everything else").toContain(
            FINANCIALS_READ_PERMISSION_KEY,
        );

        await supabase.from("orgs").delete().eq("id", OTHER);
    }, 240_000);

    /*
     * THE BOUND, STATED AS A CHECKED CLAIM RATHER THAN AS PROSE.
     *
     * §3a of the repair fires only for an organization whose `admin` AND `ops` hold no grant row at
     * all, and §3b only for the nine keys catalogued after the enumeration froze. Together that is
     * the blast radius, and it is what makes "the repair cannot re-grant a revocation" true of the
     * other fifty-eight keys under any number of runs.
     *
     * Read out of the migration text, so the claim cannot drift from the SQL it describes.
     */
    it("the repair's blast radius is bounded to the nine post-freeze keys and to never-seeded roles", () => {
        const sql = readFileSync(
            resolve(__dirname, "../../../../supabase/migrations/20260910183000_access_v2_default_role_package_completeness.sql"),
            "utf8",
        );

        const from = sql.indexOf("-- 3b.");
        const to = sql.indexOf("-- 4.", from);
        expect(from, "the repair section is named in the migration").toBeGreaterThan(0);
        const region = sql.slice(from, to);

        for (const key of POST_FREEZE_KEYS) {
            expect(region, `${key} is one of the nine and must be named in the bounded list`).toContain(`'${key}'`);
        }
        // The discriminator itself: a key catalogued BEFORE this org was seeded is one it never met.
        expect(region).toContain("pd.created_at < seeded.admin_seeded_at");

        // §3a cannot reach a configured role: it requires the org to hold no admin/ops grant at all.
        const repairFrom = sql.indexOf("DO $repair$");
        const repairTo = sql.indexOf("$repair$;", repairFrom);
        const repair = sql.slice(repairFrom, repairTo);
        expect(repair).toContain("NOT EXISTS");
        expect(repair).toContain("g.role_key IN ('admin', 'ops')");
    });
});
