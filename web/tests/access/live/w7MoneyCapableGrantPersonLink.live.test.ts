/**
 * W7-F002 — FINANCIAL CAPABILITY IS GRANTED ONLY TO A LOGIN LINKED TO A NAMED PERSON, LIVE.
 *
 * Against the certification database with migration 20261122140000 applied: the assignment ceiling
 * refuses newly conferring a money-capable capability on an unlinked user and accepts it once the user
 * is linked; re-saving an already-allowed money grant passes; newly allowing one on a role with an
 * unlinked holder is refused; and a money-capable user's link cannot be revoked. Every change made
 * here is undone in afterAll.
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
const env = certEnv();
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000002"; // admin: holds every capability it might confer
const TARGET = "c0000000-0000-4000-8000-00000000d0c4"; // holds no money capability
const UNLINKED_HOLDER_ROLE = "mcert_ax_auditor"; // held by an unlinked user, allows no fin.* key

describeLive("W7-F002 — money-capable grants require a named person, live", () => {
    let db: SupabaseClient;
    let personId: string;

    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const { data } = await db.from("persons").select("id, full_name, first_name").eq("org_id", ORG).is("archived_at", null).limit(50);
        const linked = new Set(((await db.from("user_person_links").select("person_id").eq("org_id", ORG).eq("status", "active")).data ?? []).map((r: { person_id: string }) => r.person_id));
        personId = ((data ?? []) as Array<{ id: string; full_name: string | null; first_name: string | null }>)
            .find((p) => (p.full_name || p.first_name) && !linked.has(p.id))!.id;
        await db.from("user_person_links").delete().eq("org_id", ORG).eq("user_id", TARGET);
    });

    afterAll(async () => {
        await db.from("user_roles").delete().eq("org_id", ORG).eq("user_id", TARGET).eq("role", "ops");
        await db.from("user_person_links").delete().eq("org_id", ORG).eq("user_id", TARGET);
    });

    it("refuses to confer money capability on an unlinked login, and confers it once linked", async () => {
        const refused = await db.rpc("assert_assignment_delegation_ceiling", {
            p_org_id: ORG, p_actor_user_id: ACTOR, p_target_user_id: TARGET, p_next_role_keys: ["ops"],
        });
        expect(refused.error?.message ?? "").toMatch(/money_capable_grant_requires_person_link:/);

        const link = await db.from("user_person_links").insert({ org_id: ORG, user_id: TARGET, person_id: personId, status: "active", note: "W7-F002 live" });
        expect(link.error).toBeNull();
        const allowed = await db.rpc("assert_assignment_delegation_ceiling", {
            p_org_id: ORG, p_actor_user_id: ACTOR, p_target_user_id: TARGET, p_next_role_keys: ["ops"],
        });
        expect(allowed.error).toBeNull();
    });

    it("refuses to revoke the link of a login that can move money; replace is the path", async () => {
        await db.from("user_roles").upsert({ org_id: ORG, user_id: TARGET, role: "ops" });
        const revoke = await db.rpc("revoke_user_person_link", { p_org_id: ORG, p_user_id: TARGET, p_actor_user_id: ACTOR, p_note: "W7-F002 live revoke" });
        expect(revoke.error?.message ?? "").toMatch(/person_link_required_for_money_capability/);
        const { data } = await db.from("user_person_links").select("status").eq("org_id", ORG).eq("user_id", TARGET).eq("status", "active");
        expect(data).toHaveLength(1);
    });

    it("judges only a NEW money grant on a role: re-saving an allowed one passes, a new one with unlinked holders is refused", async () => {
        const resave = await db.from("role_permission_grants")
            .upsert({ org_id: ORG, role_key: "admin", permission_key: "fin.write", allowed: true }, { onConflict: "org_id,role_key,permission_key" });
        expect(resave.error).toBeNull();
        const fresh = await db.from("role_permission_grants")
            .insert({ org_id: ORG, role_key: UNLINKED_HOLDER_ROLE, permission_key: "fin.write", allowed: true });
        expect(fresh.error?.message ?? "").toMatch(/money_capable_grant_requires_person_link:fin\.write/);
    });
});
