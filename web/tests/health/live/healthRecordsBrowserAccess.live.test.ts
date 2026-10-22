/**
 * FI-01 — a signed-in browser session cannot read a child's medical records from the database.
 *
 * Route authorization is not a database boundary: an operator's browser holds a real Supabase
 * session and can call PostgREST directly. `person_health_facts` used to grant SELECT to
 * `authenticated` under `org_id = current_org_id()`, which in a single-org deployment matched every
 * signed-in user — including one with no role and an operator without `health.view`.
 *
 * This suite signs in as a disposable user with NO role and asserts a PRIVILEGE refusal (42501),
 * not an empty result: an empty result depends on how many orgs the database holds, a refusal does
 * not. The server (service role, behind `assertHealthAccess`) still reads.
 *
 * Skipped unless the cert stack is configured (alloy-stack use) with migration 20261203090000.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function certEnv(): { url: string; serviceKey: string; anonKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        const anonKey = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
        return url && serviceKey && anonKey ? { url, serviceKey, anonKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const EMAIL = `zz-fi01-${Date.now()}@cert.alloy.invalid`;
const PASSWORD = `Fi01-${Math.random().toString(36).slice(2)}-Aa1!`;
const MEDICAL_TABLES = ["person_health_facts", "person_medical_consents"] as const;

let service: SupabaseClient;
let browser: SupabaseClient;
let userId = "";

describe.skipIf(!env)("medical records are not reachable from a browser session (cert DB)", () => {
    beforeAll(async () => {
        service = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const created = await service.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
        if (created.error || !created.data.user) throw new Error(created.error?.message ?? "user not created");
        userId = created.data.user.id;
        browser = createClient(env!.url, env!.anonKey, { auth: { persistSession: false } });
        const signedIn = await browser.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
        if (signedIn.error || !signedIn.data.session) throw new Error(signedIn.error?.message ?? "no session");
    });

    afterAll(async () => {
        if (userId) await service.auth.admin.deleteUser(userId);
    });

    it.each(MEDICAL_TABLES)("a signed-in user with no role is REFUSED %s by privilege, not merely filtered", async (table) => {
        const { data, error } = await browser.from(table).select("id").limit(1);
        expect(data).toBeNull();
        expect(error?.code).toBe("42501");
    });

    it.each(MEDICAL_TABLES)("a signed-in user cannot write %s either", async (table) => {
        const { error } = await browser.from(table).delete().eq("id", "00000000-0000-0000-0000-000000000000");
        expect(error?.code).toBe("42501");
    });

    it("the server still reads health facts (the application's only path, behind health.view)", async () => {
        const { error } = await service.from("person_health_facts").select("id").limit(1);
        expect(error).toBeNull();
    });
});
