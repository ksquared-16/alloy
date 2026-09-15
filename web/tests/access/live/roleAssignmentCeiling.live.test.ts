/**
 * W-18's OTHER HALF — ROLE ASSIGNMENT IS DELEGATION, AND IT IS BOUNDED.
 *
 * `20260915130000` bounded the grant editor and left membership unbounded, so the escalation the
 * ceiling was written to stop remained reachable by a second door. Measured on promoted truth before
 * the fix: an actor holding three capabilities conferred EIGHTY on two principals — once through
 * `assign_member_role_audited`, once through `create_membership_with_access_profile`, which asked for
 * no actor at all and so could not be bounded by anything.
 *
 * The rule is W-18's, applied to membership:
 *
 *     GAINED = effective(target after) - effective(target before)
 *     GAINED ⊆ effective(actor)
 *
 * The DELTA is what makes this usable rather than merely safe. Every case below that expects an
 * ALLOW exists because a package-based rule would have refused it, and a ceiling that refuses lateral
 * moves, reductions and overlapping packages would make delegated user administration useless while
 * looking rigorous.
 *
 * Every assertion reads RESOURCE STATE — the membership rows and the effective union — rather than a
 * status code, because a refusal that still wrote a row is the failure worth catching.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

/** This file's own tenant, so a failure cannot strand a shared organization. */
const ORG = "ce110000-0000-4000-8000-0000000cea11";
const OTHER_ORG = "ce110000-0000-4000-8000-0000000cea22";

const ROLE = {
    /** admin.users.write + reports.read — the delegating administrator's own package. */
    userAdmin: "cert_ac_user_admin",
    /** reports.read only — everything in it is already the actor's. */
    harmless: "cert_ac_harmless",
    /** fin.adjust + reports.read — one key beyond the actor. */
    powerful: "cert_ac_powerful",
    /** Same grants as `powerful`, but seeded-looking. Role labels must not matter. */
    powerfulSystem: "cert_ac_powerful_system",
    /** fin.adjust only — used to pre-load a target so overlap can be measured. */
    finOnly: "cert_ac_fin_only",
    /** The role that supplies the actor fin.adjust, so it can be taken away again. */
    actorFin: "cert_ac_actor_fin",
} as const;

describeLive("W-18 role-assignment ceiling — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let actor = "";
    let target = "";
    let second = "";

    /** The capability union a principal actually resolves to, read from the database. */
    async function effective(userId: string, org = ORG): Promise<string[]> {
        const { data } = await supabase.rpc("effective_capability_keys", { p_org_id: org, p_user_id: userId });
        return [...((data as string[]) ?? [])].sort();
    }

    async function heldRoles(userId: string, org = ORG): Promise<string[]> {
        const { data } = await supabase.from("user_roles").select("role").eq("org_id", org).eq("user_id", userId);
        return ((data ?? []) as { role: string }[]).map((r) => r.role).sort();
    }

    async function assign(roleKey: string, userId = target, actorId = actor, org = ORG) {
        return supabase.rpc("assign_member_role_audited", {
            p_org_id: org, p_user_id: userId, p_role_key: roleKey,
            p_actor_user_id: actorId, p_origin: "operator",
            p_correlation_id: `ac-${roleKey}-${crypto.randomUUID()}`,
        });
    }

    beforeAll(async () => {
        const { data: users } = await supabase.auth.admin.listUsers();
        const ids = (users?.users ?? []).map((u) => u.id);
        [actor, target, second] = [ids[0]!, ids[1]!, ids[2]!];

        for (const org of [ORG, OTHER_ORG]) {
            await supabase.from("user_roles").delete().eq("org_id", org);
            await supabase.from("role_permission_grants").delete().eq("org_id", org);
            await supabase.from("role_definitions").delete().eq("org_id", org);
            await supabase.from("orgs").delete().eq("id", org);
            await supabase.from("orgs").insert({
                id: org, name: `Assignment Ceiling ${org.slice(-4)}`,
                slug: `assignment-ceiling-${org.slice(-4)}`, status: "active",
            });
            // The seed trigger fires on insert; this file wants only its own roles.
            await supabase.from("role_permission_grants").delete().eq("org_id", org);
            await supabase.from("role_definitions").delete().eq("org_id", org);
        }

        const defs = Object.values(ROLE).map((role_key) => ({
            org_id: ORG, role_key, role_label: role_key, is_system: role_key === ROLE.powerfulSystem, is_active: true,
        }));
        await supabase.from("role_definitions").insert(defs);
        await supabase.from("role_permission_grants").insert([
            { org_id: ORG, role_key: ROLE.userAdmin, permission_key: "admin.users.write", allowed: true },
            { org_id: ORG, role_key: ROLE.userAdmin, permission_key: "reports.read", allowed: true },
            { org_id: ORG, role_key: ROLE.harmless, permission_key: "reports.read", allowed: true },
            { org_id: ORG, role_key: ROLE.powerful, permission_key: "fin.adjust", allowed: true },
            { org_id: ORG, role_key: ROLE.powerful, permission_key: "reports.read", allowed: true },
            { org_id: ORG, role_key: ROLE.powerfulSystem, permission_key: "fin.adjust", allowed: true },
            { org_id: ORG, role_key: ROLE.powerfulSystem, permission_key: "reports.read", allowed: true },
            { org_id: ORG, role_key: ROLE.finOnly, permission_key: "fin.adjust", allowed: true },
            { org_id: ORG, role_key: ROLE.actorFin, permission_key: "fin.adjust", allowed: true },
        ]);
        /*
         * The other tenant defines the SAME role key with its own grants. Both halves matter: a key
         * that exists in both places proves there is no collision, and grants on it are what give the
         * ceiling something to measure — an empty role confers nothing, so it would be permitted for
         * the right reason and prove nothing about tenancy.
         */
        await supabase.from("role_definitions").insert({
            org_id: OTHER_ORG, role_key: ROLE.powerful, role_label: ROLE.powerful, is_system: false, is_active: true,
        });
        await supabase.from("role_permission_grants").insert({
            org_id: OTHER_ORG, role_key: ROLE.powerful, permission_key: "fin.adjust", allowed: true,
        });

        await supabase.from("user_roles").insert({ org_id: ORG, user_id: actor, role: ROLE.userAdmin });
    }, 120_000);

    afterAll(async () => {
        for (const org of [ORG, OTHER_ORG]) {
            await supabase.from("user_roles").delete().eq("org_id", org);
            await supabase.from("role_permission_grants").delete().eq("org_id", org);
            await supabase.from("role_definitions").delete().eq("org_id", org);
            await supabase.from("orgs").delete().eq("id", org);
        }
    }, 120_000);

    it("the delegating administrator is genuinely narrow", async () => {
        // Non-vacuity. If the actor held everything, every ALLOW below would pass for the wrong reason.
        expect(await effective(actor)).toEqual(["admin.users.write", "reports.read"]);
    });

    it("A — assigns a role whose gained authority the actor holds", async () => {
        const { error } = await assign(ROLE.harmless);
        expect(error, error?.message).toBeNull();
        expect(await heldRoles(target)).toContain(ROLE.harmless);
        expect(await effective(target)).toEqual(["reports.read"]);
    });

    it("B — refuses a role carrying authority the actor does not hold, and writes nothing", async () => {
        const before = await heldRoles(target);
        const { error } = await assign(ROLE.powerful);
        expect(error?.message).toBe("assignment_ceiling:fin.adjust");
        // The refusal is atomic: no membership row, no partial state.
        expect(await heldRoles(target)).toEqual(before);
        expect(await effective(target)).not.toContain("fin.adjust");
    });

    it("C/D — a role gains nothing when the target already holds it, so the actor's gaps are irrelevant", async () => {
        /*
         * THE CASE A PACKAGE RULE GETS WRONG. `finOnly` puts `fin.adjust` on the target by a path the
         * actor is not using. Assigning `powerful` afterwards confers NOTHING new — the target already
         * has both its keys — so refusing it because the actor lacks `fin.adjust` would be a false
         * denial, and the delta rule exists precisely to avoid it.
         */
        await supabase.from("user_roles").insert({ org_id: ORG, user_id: target, role: ROLE.finOnly });
        expect(await effective(target)).toContain("fin.adjust");

        const { error } = await assign(ROLE.powerful);
        expect(error, `a role conferring nothing new was refused: ${error?.message}`).toBeNull();
        expect(await heldRoles(target)).toContain(ROLE.powerful);
    });

    it("E — removal is never blocked by authority the actor lacks", async () => {
        // Reduction is not delegation. An administrator must be able to take away a role richer than
        // their own, or every over-provisioned user becomes permanent.
        const { error } = await supabase.rpc("remove_member_role_audited", {
            p_org_id: ORG, p_user_id: target, p_role_key: ROLE.powerful,
            p_actor_user_id: actor, p_origin: "operator", p_correlation_id: `ac-rm-${crypto.randomUUID()}`,
        });
        expect(error, error?.message).toBeNull();
        expect(await heldRoles(target)).not.toContain(ROLE.powerful);
    });

    it("F/G — replacement is bounded when it raises authority and free when it lowers it", async () => {
        // G: collapsing the target down to a harmless role removes authority and is permitted.
        const reduce = await supabase.rpc("replace_membership_with_access_profile", {
            p_user_id: target, p_org_id: ORG, p_role: ROLE.harmless,
            p_actor_user_id: actor, p_origin: "operator", p_correlation_id: `ac-red-${crypto.randomUUID()}`,
        });
        expect(reduce.error, reduce.error?.message).toBeNull();
        expect(await effective(target)).toEqual(["reports.read"]);

        // F: raising them past the actor is refused, atomically — the old set survives the refusal.
        const raise = await supabase.rpc("replace_membership_with_access_profile", {
            p_user_id: target, p_org_id: ORG, p_role: ROLE.powerful,
            p_actor_user_id: actor, p_origin: "operator", p_correlation_id: `ac-raise-${crypto.randomUUID()}`,
        });
        expect(raise.error?.message).toBe("assignment_ceiling:fin.adjust");
        expect(await heldRoles(target)).toEqual([ROLE.harmless]);
    });

    it("J — a system role and a custom role with identical grants get identical answers", async () => {
        // W-13 removed role-name authority. The ceiling must not quietly restore it.
        const custom = await assign(ROLE.powerful, second);
        const system = await assign(ROLE.powerfulSystem, second);
        expect(custom.error?.message).toBe("assignment_ceiling:fin.adjust");
        expect(system.error?.message).toBe(custom.error?.message);
        expect(await heldRoles(second)).toEqual([]);
    });

    it("K/L — the actor's ceiling is their union, and it shrinks the moment a source role is removed", async () => {
        // K: a second role supplies `fin.adjust`, so the same assignment now succeeds.
        await supabase.from("user_roles").insert({ org_id: ORG, user_id: actor, role: ROLE.actorFin });
        expect(await effective(actor)).toContain("fin.adjust");
        const allowed = await assign(ROLE.powerful, second);
        expect(allowed.error, allowed.error?.message).toBeNull();

        // L: take the supplying role away and the next attempt is refused immediately — no TTL,
        // because the ceiling reads the database rather than a cached bundle.
        await supabase.from("user_roles").delete().eq("org_id", ORG).eq("user_id", actor).eq("role", ROLE.actorFin);
        await supabase.from("user_roles").delete().eq("org_id", ORG).eq("user_id", second);
        const denied = await assign(ROLE.powerful, second);
        expect(denied.error?.message).toBe("assignment_ceiling:fin.adjust");
    });

    it("I — the ceiling is resolved per tenant: the same key, a different answer", async () => {
        /*
         * `cert_ac_powerful` exists in BOTH tenants. Authority is never global: the actor's ceiling
         * and the role's package are both resolved inside the organization named by the write, so a
         * key that is harmless in one tenant is not thereby assignable in another.
         *
         * The actor has no membership in OTHER_ORG at all, so its ceiling there is empty and the
         * role's `fin.adjust` is entirely gained — refused. A success would mean authority had been
         * read from the wrong tenant.
         */
        expect(await effective(actor, OTHER_ORG)).toEqual([]);

        const { error } = await supabase.rpc("assign_member_role_audited", {
            p_org_id: OTHER_ORG, p_user_id: target, p_role_key: ROLE.powerful,
            p_actor_user_id: actor, p_origin: "operator", p_correlation_id: `ac-x-${crypto.randomUUID()}`,
        });
        expect(error?.message, "a cross-tenant assignment succeeded").toBe("assignment_ceiling:fin.adjust");
        expect(await heldRoles(target, OTHER_ORG)).toEqual([]);

        // And the organization a write lands in is never the caller's to choose: the route resolves
        // it from the authenticated session, which is why the parameter above is unreachable in the
        // product even though the RPC accepts one.
        const route = readFileSync(resolve(__dirname, "../../../app/api/admin/users/[userId]/roles/route.ts"), "utf8");
        expect(route).toContain("orgId: access.orgId");
    });

    it("M/N — creating a member carries the same ceiling as assigning to one", async () => {
        const fresh = second;
        await supabase.from("user_roles").delete().eq("org_id", ORG).eq("user_id", fresh);

        // N: the bypass this closes — create a user holding a role the actor could never grant.
        const excessive = await supabase.rpc("create_membership_with_access_profile", {
            p_user_id: fresh, p_org_id: ORG, p_role: ROLE.powerful, p_actor_user_id: actor,
        });
        expect(excessive.error?.message).toBe("assignment_ceiling:fin.adjust");
        expect(await heldRoles(fresh)).toEqual([]);

        // M: and creation within the actor's authority still works.
        const permitted = await supabase.rpc("create_membership_with_access_profile", {
            p_user_id: fresh, p_org_id: ORG, p_role: ROLE.harmless, p_actor_user_id: actor,
        });
        expect(permitted.error, permitted.error?.message).toBeNull();
        expect(await heldRoles(fresh)).toEqual([ROLE.harmless]);
    });

    it("an unattributed creation is refused once the organization has a member", async () => {
        // Bootstrap is recognised structurally, never on the caller's word: the exemption is false
        // for everyone the moment one membership exists, so it cannot be selected into.
        const { error } = await supabase.rpc("create_membership_with_access_profile", {
            p_user_id: target, p_org_id: ORG, p_role: ROLE.powerful, p_actor_user_id: null,
        });
        expect(error?.message).toMatch(/audit_actor_required/);
    });

    it("scope is not widened by an assignment — the split's separation holds", async () => {
        /*
         * `admin.users.write` and `admin.access_scope.write` were separated deliberately. If assigning
         * a role reset or widened the access profile, the user-admin key would smuggle scope changes.
         */
        await supabase.from("user_access_profiles").upsert(
            { user_id: target, org_id: ORG, department_scope: "restricted", site_scope: "restricted" },
            { onConflict: "user_id,org_id" }
        );
        await assign(ROLE.harmless);
        const { data } = await supabase.from("user_access_profiles")
            .select("department_scope, site_scope").eq("org_id", ORG).eq("user_id", target).maybeSingle();
        expect(data).toMatchObject({ department_scope: "restricted", site_scope: "restricted" });
    });
});
