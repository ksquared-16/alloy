/**
 * W7-F002 (corrected) — FINANCIAL CAPABILITY IS GRANTED ONLY TO A NAMED OPERATOR, LIVE.
 *
 * Against the certification database with migration 20261122180000 applied: the assignment ceiling
 * refuses newly conferring a money-capable capability on an UNNAMED login, and accepts a login with an
 * account name (no Person link needed) or one linked to a named Person; re-saving an already-allowed
 * money grant passes; newly allowing one on a role with an unnamed holder is refused; and a Person link
 * can be removed unless that would leave a money-capable login unnamed. Every change made here is
 * undone in afterAll.
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
const ACTOR = "00000000-0000-4000-8000-000000000002"; // admin: holds every capability it might confer
/*
 * Self-contained: the suite owns its principals, its probe role and its person, so no other fixture's
 * state (the access personas are linked, and may hold roles) can decide its outcome, and it never
 * edits a shared principal. TARGET holds nothing; HOLDER is an unlinked holder of PROBE_ROLE.
 */
const RUN = Math.random().toString(36).slice(2, 10);
let TARGET = "";
let HOLDER = "";
const UNLINKED_HOLDER_ROLE = `w7_f002_probe_${RUN}`; // allows no fin.* key; held by an unlinked user

describeLive("W7-F002 — money-capable grants require a named operator, live", () => {
    let db: SupabaseClient;
    let personId: string;

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const mk = async (tag: string) => {
            const r = await db.auth.admin.createUser({ email: `w7-f002-${tag}-${RUN}@cert.invalid`, password: `w7-${RUN}-Aa1!`, email_confirm: true });
            expect(r.error, r.error?.message).toBeNull();
            return r.data.user!.id;
        };
        TARGET = await mk("target");
        HOLDER = await mk("holder");
        const person = await db.from("persons").insert({ org_id: ORG, first_name: "F002", last_name: `Probe ${RUN}`, full_name: `F002 Probe ${RUN}` }).select("id").single();
        expect(person.error, person.error?.message).toBeNull();
        personId = (person.data as { id: string }).id;
        expect((await db.from("role_definitions").insert({ org_id: ORG, role_key: UNLINKED_HOLDER_ROLE, role_label: "F002 probe", is_system: false, is_active: true })).error).toBeNull();
        expect((await db.from("role_permission_grants").insert({ org_id: ORG, role_key: UNLINKED_HOLDER_ROLE, permission_key: "reports.read", allowed: true })).error).toBeNull();
        expect((await db.from("user_roles").insert({ org_id: ORG, user_id: HOLDER, role: UNLINKED_HOLDER_ROLE })).error).toBeNull();
    }, 120_000);

    afterAll(async () => {
        await db.from("user_roles").delete().in("user_id", [TARGET, HOLDER].filter(Boolean));
        await db.from("user_person_links").delete().in("user_id", [TARGET, HOLDER].filter(Boolean));
        await db.from("role_permission_grants").delete().eq("org_id", ORG).eq("role_key", UNLINKED_HOLDER_ROLE);
        await db.from("role_definitions").delete().eq("org_id", ORG).eq("role_key", UNLINKED_HOLDER_ROLE);
        if (personId) await db.from("persons").delete().eq("id", personId);
        for (const id of [TARGET, HOLDER].filter(Boolean)) await db.auth.admin.deleteUser(id).catch(() => undefined);
    }, 120_000);

    const nameAccount = async (userId: string, fullName: string | null) => {
        const r = await db.auth.admin.updateUserById(userId, { user_metadata: fullName === null ? { full_name: "" } : { full_name: fullName } });
        expect(r.error, r.error?.message).toBeNull();
    };

    it("refuses an UNNAMED login; a named login needs no Person link; a linked login is accepted too", async () => {
        const ceiling = () => db.rpc("assert_assignment_delegation_ceiling", {
            p_org_id: ORG, p_actor_user_id: ACTOR, p_target_user_id: TARGET, p_next_role_keys: ["ops"],
        });
        expect((await ceiling()).error?.message ?? "").toMatch(/money_capable_grant_requires_named_operator:/);

        await nameAccount(TARGET, `F002 Account ${RUN}`);
        expect((await ceiling()).error, "named but unlinked is a valid operator").toBeNull();

        await nameAccount(TARGET, null);
        const link = await db.from("user_person_links").insert({ org_id: ORG, user_id: TARGET, person_id: personId, status: "active", note: "W7-F002 live" });
        expect(link.error).toBeNull();
        expect((await ceiling()).error, "linked to a named Person").toBeNull();
    });

    it("refuses to unlink a money-capable login only while it has no account name", async () => {
        await db.from("user_roles").upsert({ org_id: ORG, user_id: TARGET, role: "ops" });
        const revoke = () => db.rpc("revoke_user_person_link", { p_org_id: ORG, p_user_id: TARGET, p_actor_user_id: ACTOR, p_note: "W7-F002 live revoke" });
        expect((await revoke()).error?.message ?? "").toMatch(/account_name_required_for_money_capability/);
        const { data } = await db.from("user_person_links").select("status").eq("org_id", ORG).eq("user_id", TARGET).eq("status", "active");
        expect(data).toHaveLength(1);

        await nameAccount(TARGET, `F002 Account ${RUN}`);
        expect((await revoke()).error, "a named account may drop its optional Person link").toBeNull();
        await nameAccount(TARGET, null);
    });

    it("judges only a NEW money grant on a role: re-saving an allowed one passes, a new one with UNNAMED holders is refused", async () => {
        const resave = await db.from("role_permission_grants")
            .upsert({ org_id: ORG, role_key: "admin", permission_key: "fin.write", allowed: true }, { onConflict: "org_id,role_key,permission_key" });
        expect(resave.error).toBeNull();
        const fresh = await db.from("role_permission_grants")
            .insert({ org_id: ORG, role_key: UNLINKED_HOLDER_ROLE, permission_key: "fin.write", allowed: true });
        expect(fresh.error?.message ?? "").toMatch(/money_capable_grant_requires_named_operator:fin\.write/);
    });

    /* 20261122150000 — the invariant lives where a user acquires a role. */
    describe("user_roles invariant (20261122150000)", () => {
        const UNLINKED_ADMIN = "72f10cc6-fbd2-4b3c-a107-8a5c196da384"; // an existing unlinked admin: must never be stranded

        it("refuses a direct money-role write for an unnamed user, and allows a non-money one", async () => {
            await db.from("user_person_links").delete().eq("org_id", ORG).eq("user_id", TARGET);
            await db.from("user_roles").delete().eq("org_id", ORG).eq("user_id", TARGET).eq("role", "admin");
            const money = await db.from("user_roles").insert({ org_id: ORG, user_id: TARGET, role: "admin" });
            expect(money.error?.message ?? "").toMatch(/money_capable_grant_requires_named_operator:/);
            const plain = await db.from("user_roles").upsert({ org_id: ORG, user_id: TARGET, role: UNLINKED_HOLDER_ROLE });
            expect(plain.error).toBeNull();
        });

        it("refuses an UNATTRIBUTED assignment of a money role (formerly a bypass)", async () => {
            const r = await db.rpc("assign_member_role_audited", {
                p_org_id: ORG, p_user_id: TARGET, p_role_key: "admin", p_actor_user_id: null, p_origin: "operator", p_correlation_id: `w7-f002-${Date.now()}`,
            });
            expect(r.error?.message ?? "").toMatch(/money_capable_grant_requires_named_operator:/);
        });

        it("does not strand an existing unlinked holder when the governed replace re-saves the same role", async () => {
            const r = await db.rpc("replace_membership_with_access_profile", {
                p_user_id: UNLINKED_ADMIN, p_org_id: ORG, p_role: "admin", p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: `w7-f002-replace-${Date.now()}`,
            });
            expect(r.error).toBeNull();
            const { data } = await db.from("user_roles").select("role").eq("org_id", ORG).eq("user_id", UNLINKED_ADMIN);
            expect(((data ?? []) as Array<{ role: string }>).map((x) => x.role)).toContain("admin");
        });
    });
});

