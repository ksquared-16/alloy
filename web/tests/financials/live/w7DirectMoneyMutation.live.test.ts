/**
 * W7-F010 — A SIGNED-IN SESSION CANNOT MUTATE MONEY TABLES DIRECTLY, LIVE, THROUGH REAL POSTGREST.
 *
 * A disposable certification principal is created, linked to a named Person (W7-F002 requires it for a
 * money-capable role), given `ops` — a money-capable role on the certification tenant — and signs in
 * with a password. With ITS OWN session it then tries what the rolled-back proof showed a single-org
 * deployment allowed before 20261122160000: insert a charge (draft and already posted), flip a draft to
 * posted, edit a draft's amount, write `payments` and `resolved_obligations`, and call the two definer
 * functions that had no caller check. Every attempt must be refused by the database, and nothing may
 * change. Reads still work. Everything created is removed in afterAll.
 */
import { randomUUID } from "node:crypto";
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
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const RUN = randomUUID().slice(0, 8);
const EMAIL = `f010-${RUN}@cert.invalid`;
const PASSWORD = `f010-${RUN}-Aa1!`;

const DENIED = /permission denied|row-level security/i;

describeLive("W7-F010 — direct session writes to money tables are refused, live", () => {
    let admin: SupabaseClient;
    let session: SupabaseClient;
    let userId = "";
    let personId = "";
    let draftId = "";

    beforeAll(async () => {
        admin = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const created = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
        expect(created.error, created.error?.message).toBeNull();
        userId = created.data.user!.id;
        personId = randomUUID();
        expect((await admin.from("persons").insert({ id: personId, org_id: ORG, first_name: "Session", last_name: `Probe ${RUN}` })).error).toBeNull();
        expect((await admin.from("user_person_links").insert({ org_id: ORG, user_id: userId, person_id: personId, status: "active", note: "W7-F010 live probe" })).error).toBeNull();
        const role = await admin.from("user_roles").insert({ org_id: ORG, user_id: userId, role: "ops" });
        expect(role.error, role.error?.message).toBeNull();

        const { data: draft } = await admin.from("charges").select("id")
            .eq("org_id", ORG).eq("status", "draft").gt("amount_cents", 0).limit(1).maybeSingle();
        draftId = (draft as { id: string } | null)?.id ?? "";

        session = createClient(env!.url, env!.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const signedIn = await session.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
        expect(signedIn.error, signedIn.error?.message).toBeNull();
    }, 120_000);

    afterAll(async () => {
        if (!admin) return;
        await admin.from("user_roles").delete().eq("org_id", ORG).eq("user_id", userId);
        await admin.from("user_person_links").delete().eq("user_id", userId);
        await admin.from("persons").delete().eq("id", personId);
        if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    });

    it("refuses inserting a charge, draft or already posted", async () => {
        for (const status of ["draft", "posted"]) {
            const r = await session.from("charges").insert({
                org_id: ORG, status, amount_cents: 4000, currency_code: "USD", charge_type: "fee", charge_category: "fee",
                billable_source_type: "customer", billable_source_id: randomUUID(), service_date: "2026-10-09",
                posted_at: status === "posted" ? new Date().toISOString() : null,
            });
            expect(r.error?.message ?? "", `insert ${status}`).toMatch(DENIED);
        }
    });

    it("refuses flipping a charge to posted, or editing its amount", async () => {
        /*
         * Aimed at an id that does not exist: a privilege refusal fires before any row is matched, so
         * the assertion is the same, and a run against a database still missing the repair cannot
         * change a real row. The real draft is checked only to show nothing moved.
         */
        const ghost = randomUUID();
        const post = await session.from("charges").update({ status: "posted", posted_at: new Date().toISOString() }).eq("id", ghost);
        expect(post.error?.message ?? "").toMatch(DENIED);
        const amount = await session.from("charges").update({ amount_cents: 1 }).eq("id", ghost);
        expect(amount.error?.message ?? "").toMatch(DENIED);
        if (draftId) {
            const { count } = await admin.from("financial_journal_entries").select("id", { count: "exact", head: true })
                .eq("source_type", "charge").eq("source_id", draftId);
            expect(count ?? 0).toBe(0);
        }
    });

    it("refuses payments and resolved-obligation writes, and the two caller-less definer functions", async () => {
        expect((await session.from("payments").insert({ org_id: ORG, amount_cents: 100 })).error?.message ?? "").toMatch(DENIED);
        expect((await session.from("resolved_obligations").update({ status: "posted" }).eq("id", randomUUID())).error?.message ?? "").toMatch(DENIED);
        expect((await session.rpc("post_ledger_transaction", { p_ledger_tx_id: randomUUID() })).error?.message ?? "").toMatch(DENIED);
        expect((await session.rpc("stamp_payment_posted_to_ledger_at", { payment_id: randomUUID() })).error?.message ?? "").toMatch(DENIED);
    });

    it("still lets the session READ charges through RLS (reads were not the problem)", async () => {
        const r = await session.from("charges").select("id").limit(1);
        expect(r.error).toBeNull();
    });
});
