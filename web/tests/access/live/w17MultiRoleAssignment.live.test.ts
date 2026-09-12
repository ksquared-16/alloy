/**
 * W-17 — ROLE ASSIGNMENT IS ADDITIVE, AGAINST REAL POSTGRES.
 *
 * The unit locks prove the routes reach an audited owner and that the surface no longer replaces a
 * set. What they cannot prove is the part that made additive operations necessary in the first
 * place: that two administrators acting at the same moment do not erase each other. A lost update
 * is a property of concurrent transactions, and no amount of scanning source finds one.
 *
 * So this file drives the transaction owners directly — the same RPCs the routes call — and fires
 * genuinely concurrent requests at a real database.
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

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "aaaa1111-0000-4000-8000-000000000001";
const SUBJECT = "w1700000-0000-4000-8000-00000000w170".replace(/w/g, "7");
const ACTOR = "w17-live-actor";

/** This file's own roles, so a stray row is identifiable as this file's. */
const ROLE = { a: "cert_w17_a", b: "cert_w17_b", c: "cert_w17_c", other: "cert_w17_foreign" } as const;

describeLive("W-17 — additive role assignment, live", () => {
    let sb: SupabaseClient;

    const held = async (): Promise<string[]> => {
        const { data } = await sb.from("user_roles").select("role").eq("org_id", ORG).eq("user_id", SUBJECT);
        return ((data ?? []) as { role: string }[]).map((r) => r.role).sort();
    };
    const assign = (role: string, actor: string | null = ACTOR) =>
        sb.rpc("assign_member_role_audited", {
            p_org_id: ORG, p_user_id: SUBJECT, p_role_key: role,
            p_actor_user_id: actor, p_origin: "system", p_correlation_id: null,
        });
    const remove = (role: string, actor: string | null = ACTOR) =>
        sb.rpc("remove_member_role_audited", {
            p_org_id: ORG, p_user_id: SUBJECT, p_role_key: role,
            p_actor_user_id: actor, p_origin: "system", p_correlation_id: null,
        });
    const eventsFor = async (command: string): Promise<number> => {
        const { data } = await sb.from("mutation_events").select("id")
            .eq("org_id", ORG).eq("subject_id", SUBJECT).eq("command_key", command);
        return (data ?? []).length;
    };
    const resetTo = async (roles: string[]) => {
        await sb.from("user_roles").delete().eq("org_id", ORG).eq("user_id", SUBJECT);
        if (roles.length) {
            await sb.from("user_roles").insert(roles.map((role) => ({ org_id: ORG, user_id: SUBJECT, role })));
        }
    };

    beforeAll(async () => {
        sb = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await sb.auth.admin.deleteUser(SUBJECT).catch(() => undefined);
        await sb.auth.admin.createUser({ id: SUBJECT, email: "cert.w17@northwind.invalid", password: "alloy-local-cert", email_confirm: true });
        for (const [org, keys] of [[ORG, [ROLE.a, ROLE.b, ROLE.c]], [OTHER_ORG, [ROLE.other]]] as const) {
            for (const key of keys) {
                await sb.from("role_definitions").upsert(
                    { org_id: org, role_key: key, role_label: key, is_active: true },
                    { onConflict: "org_id,role_key" },
                );
            }
        }
        await sb.from("user_access_profiles").upsert(
            { user_id: SUBJECT, org_id: ORG, department_scope: "restricted", site_scope: "restricted" },
            { onConflict: "user_id,org_id" },
        );
        await resetTo([ROLE.a]);
    });

    afterAll(async () => {
        // The role rows go; the `mutation_events` rows stay, because they are truthful records of
        // access changes that really happened and the append-only trigger is the point.
        await sb.from("user_roles").delete().eq("org_id", ORG).eq("user_id", SUBJECT);
        await sb.from("user_access_profiles").delete().eq("org_id", ORG).eq("user_id", SUBJECT);
        await sb.auth.admin.deleteUser(SUBJECT).catch(() => undefined);
    });

    it("adds a role without discarding the one already held", async () => {
        await resetTo([ROLE.a]);
        await assign(ROLE.b);
        expect(await held()).toEqual([ROLE.a, ROLE.b].sort());
    });

    it("composes a third without disturbing the first two", async () => {
        await assign(ROLE.c);
        expect(await held()).toEqual([ROLE.a, ROLE.b, ROLE.c].sort());
    });

    it("removes exactly the named role and leaves the rest", async () => {
        await remove(ROLE.b);
        expect(await held()).toEqual([ROLE.a, ROLE.c].sort());
    });

    it("treats assigning a held role as a no-op, with no duplicate and no history", async () => {
        const before = await eventsFor("access.user.role_assigned");
        const { data } = await assign(ROLE.a);
        expect((data as { changed: boolean }[])[0]?.changed).toBe(false);
        expect(await held()).toEqual([ROLE.a, ROLE.c].sort());
        expect(await eventsFor("access.user.role_assigned")).toBe(before);
    });

    it("treats removing an unheld role as a no-op, with no history", async () => {
        const before = await eventsFor("access.user.role_removed");
        const { data } = await remove(ROLE.b);
        expect((data as { changed: boolean }[])[0]?.changed).toBe(false);
        expect(await eventsFor("access.user.role_removed")).toBe(before);
    });

    it("refuses a change that names no actor", async () => {
        const { error } = await assign(ROLE.b, null);
        expect(error?.message ?? "").toMatch(/audit_actor_required/);
        expect(await held()).not.toContain(ROLE.b);
    });

    it("leaves the membership and its configured scope behind when the last role goes", async () => {
        await resetTo([ROLE.a]);
        await remove(ROLE.a);
        expect(await held()).toEqual([]);
        const { data } = await sb.from("user_access_profiles")
            .select("department_scope, site_scope").eq("org_id", ORG).eq("user_id", SUBJECT).maybeSingle();
        expect(data, "removing the final role must not remove the membership").toBeTruthy();
        expect(data).toMatchObject({ department_scope: "restricted", site_scope: "restricted" });
    });

    it("never widens scope by assigning a role", async () => {
        await assign(ROLE.a);
        await assign(ROLE.b);
        const { data } = await sb.from("user_access_profiles")
            .select("department_scope, site_scope").eq("org_id", ORG).eq("user_id", SUBJECT).maybeSingle();
        expect(data).toMatchObject({ department_scope: "restricted", site_scope: "restricted" });
    });

    it("cannot be given a role belonging to another organization", async () => {
        const { error } = await assign(ROLE.other);
        expect(error?.message ?? "").toMatch(/unknown_role_key/);
        expect(await held()).not.toContain(ROLE.other);
    });

    it("refuses to delete a role while it is still assigned", async () => {
        await resetTo([ROLE.a]);
        const { error } = await sb.from("role_definitions").delete().eq("org_id", ORG).eq("role_key", ROLE.a);
        expect(error, "ON DELETE RESTRICT must refuse a role someone still holds").toBeTruthy();
    });

    /* ─────────────────────────── concurrency ─────────────────────────── */

    it("does not lose an assignment when two administrators add different roles at once", async () => {
        await resetTo([]);
        // The reason this slice exists: read-modify-write of the whole set would let one of these
        // two compute a set that never contained the other's addition.
        await Promise.all([assign(ROLE.a), assign(ROLE.b)]);
        expect(await held()).toEqual([ROLE.a, ROLE.b].sort());
    });

    it("collapses two concurrent assignments of the SAME role into one", async () => {
        await resetTo([]);
        const before = await eventsFor("access.user.role_assigned");
        const results = await Promise.all([assign(ROLE.c), assign(ROLE.c)]);
        expect(await held()).toEqual([ROLE.c]);
        // The primary key arbitrates: exactly one of them changed anything, and only that one wrote
        // history. Two events here would claim the role was added twice.
        const changed = results.filter((r) => (r.data as { changed: boolean }[] | null)?.[0]?.changed).length;
        expect(changed).toBe(1);
        expect(await eventsFor("access.user.role_assigned")).toBe(before + 1);
    });

    it("applies a concurrent assign and remove to their own targets", async () => {
        await resetTo([ROLE.a, ROLE.b]);
        await Promise.all([assign(ROLE.c), remove(ROLE.b)]);
        expect(await held()).toEqual([ROLE.a, ROLE.c].sort());
    });
});
